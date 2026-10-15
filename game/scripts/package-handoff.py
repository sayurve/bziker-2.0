#!/usr/bin/env python3
"""Export a standalone Bziker directory/archive, without private local state."""
import argparse
import hashlib
import json
import shutil
import subprocess
import zipfile
import os
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MAX_FILE=100*1024*1024
ROOT_FILES={'.env.example','.gitignore','.gitattributes','README.md','HANDOFF.md','DEPLOYMENT.md',
            'package.json','package-lock.json','requirements-dev.txt','requirements.json',
            'game-design.txt','sources.txt','question-bank.demo.json','verification.json'}
FOLDERS={'assets','web','tests','scripts','docs','deploy','curator','source-reference'}
EXCLUDED_ASSETS={'avatar-builder-desktop.png','game-splash-desktop.png'}
PRIVATE_PARTS={'data','.git','node_modules','__pycache__','.cache','.pytest_cache','.playwright-cli','.impeccable'}
DOC_SUFFIXES={'.md','.txt','.log','.json','.yaml','.yml','.csv'}
TEXT_SUFFIXES={'.py','.mjs','.js','.json','.html','.css','.md','.txt','.log','.yaml','.yml','.csv'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_archive(archive,files):
    archive=Path(archive).expanduser().resolve()
    if archive.exists():raise FileExistsError('Archive already exists')
    archive.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as zipped:
        for relative,data in sorted(files.items()):
            info=zipfile.ZipInfo('bziker/'+relative.as_posix(),date_time=(1980,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o100644<<16
            zipped.writestr(info,data,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)


def finalize(output,archive,verification_report=None):
    """Archive an unchanged, verified export after tests, never Git/dependencies."""
    output=Path(output).expanduser().resolve(strict=True)
    archive=Path(archive).expanduser().resolve()
    if archive.exists() or archive.is_relative_to(output):
        raise ValueError('Archive must be a new file outside the export')
    manifest_path=output/'handoff-manifest.json'
    manifest=json.loads(manifest_path.read_text())
    files={}
    for record in manifest['files']:
        relative=safe_relative(record['path']);file=output/relative
        if file.is_symlink() or not file.resolve().is_relative_to(output):
            raise ValueError('Export path points outside the project')
        data=file.read_bytes()
        if len(data)!=record['bytes'] or sha(data)!=record['sha256']:
            raise ValueError(f'Export changed after snapshot: {relative}')
        files[relative]=data
    if verification_report:
        report_data=Path(verification_report).read_bytes()
        report=json.loads(report_data)
        if report.get('passed') is not True or report.get('live_database_included') is not False:
            raise ValueError('Final verification must pass and exclude live data')
        relative=Path('HANDOFF-VERIFICATION.json')
        if (output/relative).exists():raise FileExistsError('Final verification already exists')
        files[relative]=report_data
        manifest['files'].append({'path':relative.as_posix(),'bytes':len(report_data),'sha256':sha(report_data)})
        manifest['files'].sort(key=lambda record:record['path'])
        manifest['file_count']=len(manifest['files'])
        manifest['total_bytes']=sum(record['bytes'] for record in manifest['files'])
        manifest['verified']=True
        (output/relative).write_bytes(report_data)
    files[Path('handoff-manifest.json')]=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
    manifest_path.write_bytes(files[Path('handoff-manifest.json')])
    write_archive(archive,files)
    summary={'file_count':manifest['file_count'],'total_bytes':manifest['total_bytes'],
             'archive_bytes':archive.stat().st_size,'archive_sha256':sha(archive.read_bytes()),
             'manifest_sha256':sha(manifest_path.read_bytes()),'publication_performed':False}
    print(json.dumps(summary,ensure_ascii=False))
    return summary


def portable_text(relative,data):
    """Only export-time path adaptation; no gameplay changes to original files."""
    original=data
    text=data.decode('utf-8')
    if relative=='README.md':
        text=text.replace('cd output/bziker\n','')
        if not text.startswith('> Автономный пакет:'):
            text='> Автономный пакет: выполняйте команды из корня репозитория. Инструкции передачи и размещения: [HANDOFF.md](HANDOFF.md), [DEPLOYMENT.md](DEPLOYMENT.md). Ниже сохранено описание действующей игры и исторических проверок.\n\n'+text
    if relative=='tests/exact-city-scene-v19.test.mjs':
        text=text.replace("const original='source-reference/01_Окружение/Карта_города/Квадраты_карты/Карта_исходная.png';",
                          "const original=fileURLToPath(new URL('../source-reference/01_Окружение/Карта_города/Квадраты_карты/Карта_исходная.png',import.meta.url));")
    for name,variable in [('tests/source-surface-textures-v17.test.mjs','sourceRoot'),
                          ('tests/source-exact-interiors-v19.test.mjs','originalRoot')]:
        if relative==name:
            text=text.replace(f"{variable}='source-reference/'",
                              f"{variable}=fileURLToPath(new URL('../source-reference/',import.meta.url))")
    if relative.startswith('scripts/') and relative.endswith('.py') and 'source-reference' in text:
        # Importers still require the full optional design pack. The copied
        # source-reference directory is sufficient only for regression tests.
        if '\nimport os\n' not in text:
            text=text.replace('from pathlib import Path','import os\nfrom pathlib import Path',1)
        base="Path(os.environ.get('BZIKER_SOURCE_DIR',str(Path(__file__).resolve().parents[1]/'source-reference')))"
        text=text.replace("Path(os.environ.get('BZIKER_SOURCE_DIR',str(Path(__file__).resolve().parents[1]/'source-reference'))) / '09_Интерфейс_игры'",base+" / '09_Интерфейс_игры'")
        text=text.replace("Path(os.environ.get('BZIKER_SOURCE_DIR',str(Path(__file__).resolve().parents[1]/'source-reference')))",base)
    # Historical documentation can contain paths to the author's workspace.
    # Preserve the text while removing machine-specific location prefixes.
    replacements=[(str(ROOT),'.'),('source-reference','source-reference'),
                  ('.','.'),
                  ('$LOCAL_WORKSPACE/','$LOCAL_WORKSPACE/')]
    for source,target in replacements:
        text=text.replace(source,target)
    adapted=text.encode('utf-8')
    return adapted,adapted!=original


def include_file(relative,include_proof):
    parts=relative.parts
    if any(part in PRIVATE_PARTS for part in parts):return False,'private state or dependency/cache'
    if relative.name.startswith('.env') and relative.name!='.env.example':return False,'private environment'
    if relative.suffix.lower() in {'.db','.sqlite','.sqlite3','.pyc','.pyo','.zip','.tar','.gz'}:
        return False,'database/cache/archive'
    if relative.name in {'.DS_Store','handoff-manifest.json'}:return False,'local metadata or regenerated manifest'
    if len(parts)==1:
        return (relative.name in ROOT_FILES or relative.suffix=='.py'),'root file outside app export'
    if parts[0]=='screenshots':return include_proof,'optional historical screenshot'
    if parts[0] not in FOLDERS:return False,'outside standalone app export'
    if parts[0]=='assets' and relative.name in EXCLUDED_ASSETS:return False,'unrelated untracked preview'
    if parts[0]=='docs' and relative.suffix.lower() not in DOC_SUFFIXES:
        return include_proof,'optional historical binary proof'
    return True,''


def safe_relative(name):
    relative=Path(name)
    if relative.is_absolute() or '..' in relative.parts:raise ValueError('Reference path must be relative')
    return relative


def reference_files(source_art=None):
    manifest=json.loads((ROOT/'docs/design-source-v17.json').read_text())
    assets=manifest['assets']
    records=[assets['city-source-map']]
    records.extend(assets['clan-surface-'+suffix+'-texture'] for suffix in [
        'floor-board','floor-parquet','floor-concrete','floor-tile','floor-stone','floor-metal',
        'wall-plaster','wall-brick','wall-concrete','wall-wood','wall-stone','wall-metal'])
    rooms=json.loads((ROOT/'web/interiors-map-v19.json').read_text())['rooms']
    for scene in {room['source_scene']['asset_id']:room['source_scene'] for room in rooms}.values():
        records.append({'source':scene['source_file'],'url':scene['url'],'source_sha256':scene['sha256']})
    result={}
    for record in records:
        source=safe_relative(record['source'])
        runtime=safe_relative(record['url'].lstrip('/'))
        candidates=[ROOT/'source-reference'/source]
        if source_art:candidates.append(Path(source_art)/source)
        candidates.append(ROOT/runtime)
        data=None
        for candidate in candidates:
            if candidate.is_file():
                candidate_data=candidate.read_bytes()
                if sha(candidate_data)==record['source_sha256']:
                    data=candidate_data;break
        if data is None:
            raise ValueError(f'Original reference required; pass --source-art with the original Bziker folder: {source}')
        result[Path('source-reference')/source]=data
    return result


def build(output,archive=None,include_proof=False,init_git=False,source_art=None):
    output=Path(output).expanduser().resolve()
    if output==ROOT.resolve() or output.is_relative_to(ROOT.resolve()):raise ValueError('Output must be outside the source application')
    if output.exists():raise FileExistsError('Output directory already exists')
    archive=Path(archive).expanduser().resolve() if archive else None
    if archive and (archive.exists() or archive.is_relative_to(ROOT.resolve()) or archive.is_relative_to(output)):
        raise ValueError('Archive must be a new file outside source/output directories')
    files={};excluded=[];transformed=[]
    for source in sorted(ROOT.rglob('*')):
        if not source.is_file():continue
        relative=source.relative_to(ROOT)
        selected,reason=include_file(relative,include_proof)
        if not selected:
            # Do not expose private local filenames even in the manifest.
            if not any(part in PRIVATE_PARTS for part in relative.parts):
                excluded.append({'path':relative.as_posix(),'reason':reason})
            continue
        if source.is_symlink():raise ValueError(f'Symlink is not exported: {relative}')
        if source.stat().st_size>=MAX_FILE:raise ValueError(f'File is at least 100 MiB: {relative}')
        data=source.read_bytes()
        if source.suffix.lower() in TEXT_SUFFIXES or source.name in {'.gitignore','.env.example','.gitattributes'}:
            data,changed=portable_text(relative.as_posix(),data)
            if changed:transformed.append(relative.as_posix())
        files[relative]=data
    native_references=reference_files(source_art)
    files.update(native_references)
    workflow=Path('deploy/github-check.yml')
    if workflow in files:files[Path('.github/workflows/check.yml')]=files[workflow]
    ignore=files[Path('.gitignore')].decode()
    for entry in ['node_modules/','dist/','*.zip']:
        if entry not in ignore.splitlines():ignore=ignore.rstrip()+'\n'+entry+'\n'
    files[Path('.gitignore')]=ignore.encode()
    for path,data in files.items():
        if len(data)>=MAX_FILE:raise ValueError(f'File is at least 100 MiB: {path}')
    records=[{'path':p.as_posix(),'bytes':len(data),'sha256':sha(data)} for p,data in sorted(files.items())]
    manifest={'format_version':1,'project':'Бзикер','mode':'full-proof' if include_proof else 'source-and-text-reports',
              'files':records,'file_count':len(records),'total_bytes':sum(r['bytes'] for r in records),
              'largest_file_bytes':max(r['bytes'] for r in records),'files_at_least_100_mib':[],
              'native_reference_count':len(native_references),'export_only_path_adaptations':transformed,
              'excluded':excluded,'private_directories_omitted':sorted(PRIVATE_PARTS),
              'runtime_dependencies':'Python 3.10+ standard library only',
              'publication_performed':False,'live_database_included':False}
    files[Path('handoff-manifest.json')]=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
    output.mkdir(parents=True)
    try:
        for relative,data in sorted(files.items()):
            target=output/relative
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(data)
        if archive:
            write_archive(archive,files)
        if init_git:
            subprocess.run(['git','init','-b','main',str(output)],check=True,capture_output=True,text=True)
    except BaseException:
        shutil.rmtree(output)
        if archive:archive.unlink(missing_ok=True)
        raise
    summary={key:manifest[key] for key in ('file_count','total_bytes','largest_file_bytes','native_reference_count','publication_performed','live_database_included')}
    if archive:summary['archive_bytes']=archive.stat().st_size
    print(json.dumps(summary,ensure_ascii=False))
    return manifest


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',required=True)
    parser.add_argument('--archive')
    parser.add_argument('--include-proof',action='store_true')
    parser.add_argument('--source-art',help='Optional path to the supplied original Bziker art pack; not stored in export')
    parser.add_argument('--init-git',action='store_true',help='Initialize only a local repo; no commit, remote or upload')
    parser.add_argument('--finalize',action='store_true',help='Archive a previously built export after verifying its file hashes')
    parser.add_argument('--verification-report',help='Passed JSON report to include when finalizing')
    args=parser.parse_args()
    if args.finalize:
        if not args.archive:parser.error('--finalize requires --archive')
        finalize(args.output,args.archive,args.verification_report)
    else:
        if args.verification_report:parser.error('--verification-report requires --finalize')
        build(args.output,args.archive,args.include_proof,args.init_git,args.source_art)
