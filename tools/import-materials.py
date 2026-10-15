#!/usr/bin/env python3
"""Import a standalone, byte-preserving Bziker reference library.

Usage: python3 tools/import-materials.py --source /path/Bziker --dest /path/project
Never writes to source. Existing nonempty owned output trees are refused. APFS
copy-on-write clones are independent files; other systems use ordinary copies.
Reference AGENTS.md files are historical material, not active project policy.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import time

PHASER_ALLOWED = {'README.md','archive-resources','docs','gait.mjs','generated','index.html','loader.mjs','preview.mjs','redrawn-frames-v1','runtime-gait.mjs','scripts','separate-frames.mjs','serve.py','tests','vendor','verification'}
EXCLUDED_NAMES = {'__pycache__','cache','node_modules','qa-users.json','credentials.json','secrets.json'}
EXCLUDED_SUFFIXES = {'.db','.sqlite','.sqlite3','.log','.pyc','.pem','.key'}


def excluded(rel):
    parts=rel.parts
    if any(p.startswith('.') or p in EXCLUDED_NAMES for p in parts): return True
    if rel.suffix.lower() in EXCLUDED_SUFFIXES or any(x in rel.name.lower() for x in ('credentials','qa-users','secret-token')): return True
    if parts[0]=='Phaser':
        if len(parts)<2: return False
        if parts[1] not in PHASER_ALLOWED: return True
        if parts[1]=='verification' and (len(parts)!=3 or rel.suffix.lower() not in {'.json','.md'}): return True
    return False


def require_roots(source, dest):
    if source.is_symlink() or dest.is_symlink(): raise ValueError('Root symlinks are not allowed')
    source=source.resolve(strict=True); dest=dest.resolve(strict=True)
    if not source.is_dir() or not dest.is_dir(): raise ValueError('Source and destination must be directories')
    if source==dest or source in dest.parents or dest in source.parents: raise ValueError('Source and destination must be disjoint trees')
    return source,dest


def safe_path(root, rel):
    p=PurePosixPath(rel)
    if not rel or p.is_absolute() or '..' in p.parts or str(p)!=rel: raise ValueError('Unsafe manifest path: '+str(rel))
    target=root.joinpath(*p.parts)
    for parent in [target,*target.parents]:
        if parent==root.parent: break
        if parent.is_symlink(): raise ValueError('Symlink in output path: '+str(parent))
    return target


def inventory(source):
    files=[]; omitted=[]
    def walk(current):
        for e in sorted(os.scandir(current),key=lambda x:x.name):
            p=Path(e.path); rel=p.relative_to(source)
            if excluded(rel): omitted.append(rel.as_posix()); continue
            if e.is_symlink(): raise ValueError('Source symlink is not portable: '+str(rel))
            if e.is_dir(follow_symlinks=False): walk(p)
            elif e.is_file(follow_symlinks=False):
                s=e.stat(follow_symlinks=False)
                files.append({'path':rel.as_posix(),'bytes':s.st_size,'source_mtime_ns':s.st_mtime_ns})
            else: raise ValueError('Unsupported special file: '+str(rel))
    walk(source)
    return files,omitted


def sha256(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
    return h.hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def clone_tree(src, dst):
    if sys.platform=='darwin':
        subprocess.run(['/bin/cp','-cR',str(src),str(dst)],check=True)
    elif src.is_dir(): shutil.copytree(src,dst,symlinks=False)
    else: shutil.copy2(src,dst)


def import_materials(source,dest,workers=8):
    source,dest=require_roots(source,dest)
    library=safe_path(dest,'materials/Bziker'); drafts=safe_path(dest,'art/drafts/redrawn-frames-v1')
    manifest=safe_path(dest,'verification/materials-manifest.json')
    status=safe_path(dest,'art/drafts/materials-draft-status.json')
    for p in (library,drafts):
        if p.exists() and (not p.is_dir() or any(p.iterdir())): raise ValueError('Refusing existing content: '+str(p))
    for p in (manifest,status):
        if p.exists(): raise ValueError('Refusing to overwrite: '+str(p))
    start=time.monotonic(); files,omitted=inventory(source)
    print(f'Inventory: {len(files)} files, {sum(r["bytes"] for r in files)} bytes',flush=True)
    library.mkdir(parents=True,exist_ok=True)
    # Copy only selected roots. Pruning below touches only our fresh copied tree.
    for child in sorted(source.iterdir()):
        rel=child.relative_to(source)
        if excluded(rel): continue
        if child.name=='Phaser':
            (library/'Phaser').mkdir()
            for entry in sorted(child.iterdir()):
                if not excluded(entry.relative_to(source)): clone_tree(entry,library/'Phaser'/entry.name)
        else: clone_tree(child,library/child.name)
    for rel in sorted(omitted,key=lambda s:s.count('/'),reverse=True):
        p=library/rel
        if p.is_symlink() or p.is_file(): p.unlink()
        elif p.exists(): shutil.rmtree(p)
    draft_source=library/'Phaser/redrawn-frames-v1'
    draft_files=[]
    if draft_source.is_dir():
        drafts.parent.mkdir(parents=True,exist_ok=True)
        if drafts.exists(): drafts.rmdir()
        clone_tree(draft_source,drafts)
        draft_files=[r['path'].removeprefix('Phaser/redrawn-frames-v1/') for r in files if r['path'].startswith('Phaser/redrawn-frames-v1/')]
    def hash_source(row):
        p=source/row['path']; s=p.stat()
        if s.st_size!=row['bytes'] or s.st_mtime_ns!=row['source_mtime_ns']: raise ValueError('Source changed during import: '+row['path'])
        row['sha256']=sha256(p)
        after=p.stat()
        if (after.st_size,after.st_mtime_ns)!=(s.st_size,s.st_mtime_ns): raise ValueError('Source changed during hashing: '+row['path'])
        return row
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for n,row in enumerate(pool.map(hash_source,files),1):
            if n%25000==0: print(f'Source hashes: {n}/{len(files)}',flush=True)
    result={'schema':1,'created_utc':datetime.now(timezone.utc).isoformat(),'source_root':str(source),'destination_root':str(dest),'copy_method':'APFS clone (independent inode)' if sys.platform=='darwin' else 'ordinary byte copy','scope':'Historical reference library; no production approval implied','files':files,'excluded_paths':omitted,'draft_files':draft_files,'file_count':len(files),'total_bytes':sum(r['bytes'] for r in files),'elapsed_import_seconds':round(time.monotonic()-start,2)}
    write_json(manifest,result)
    write_json(status,{'art_approved':False,'status':'DRAFT — NOT APPROVED','source':'materials/Bziker/Phaser/redrawn-frames-v1','file_count':len(draft_files),'all_files_are_drafts':True,'missing_prompts':'Only source prompt files are preserved; none are invented.','production_use':False})
    print(f'Imported {len(files)} files. Run tools/verify-materials.py for byte verification.',flush=True)
    return result


def parser(description):
    p=argparse.ArgumentParser(description=description)
    p.add_argument('--source',required=True,type=Path);p.add_argument('--dest',required=True,type=Path)
    p.add_argument('--workers',type=int,default=8)
    return p

if __name__=='__main__':
    args=parser(__doc__).parse_args()
    try:
        if not 1<=args.workers<=64: raise ValueError('workers must be 1..64')
        import_materials(args.source,args.dest,args.workers)
    except (OSError,ValueError,subprocess.CalledProcessError) as e:
        print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)
