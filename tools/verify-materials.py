#!/usr/bin/env python3
"""Verify every copied material byte and source provenance; no art approval."""
import argparse
import importlib.util
from pathlib import Path
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

SPEC=importlib.util.spec_from_file_location('materials_import',Path(__file__).with_name('import-materials.py'))
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)


def verify(source,dest,workers=8):
    if source is not None:
        source,dest=M.require_roots(source,dest)
    else:
        if dest.is_symlink(): raise ValueError('Root symlinks are not allowed')
        dest=dest.resolve(strict=True)
        if not dest.is_dir(): raise ValueError('Destination must be a directory')
    manifest=json.loads(M.safe_path(dest,'verification/materials-manifest.json').read_text(encoding='utf-8'))
    files=manifest['files']; library=M.safe_path(dest,'materials/Bziker')
    # Validate the entire manifest before reading any file referenced in it.
    seen=set()
    for r in files:
        if source is not None: M.safe_path(source,r['path'])
        M.safe_path(library,r['path'])
        if r['path'] in seen or M.excluded(Path(r['path'])): raise ValueError('Invalid/duplicate manifest path: '+r['path'])
        seen.add(r['path'])
    for rel in manifest['draft_files']: M.safe_path(dest/'art/drafts/redrawn-frames-v1',rel)
    if manifest['file_count']!=len(files) or manifest['total_bytes']!=sum(r['bytes'] for r in files): raise ValueError('Manifest totals are inconsistent')
    start=time.monotonic(); errors=[]
    def check(row):
        rel=row['path']; dst=M.safe_path(library,rel)
        try:
            d=dst.stat()
            if d.st_size!=row['bytes']: return 'copied',rel+': copied byte size mismatch'
            if M.sha256(dst)!=row['sha256']: return 'copied',rel+': copied SHA-256 mismatch'
            if source is not None:
                src=M.safe_path(source,rel)
                try:
                    st=src.stat()
                    if (st.st_dev,st.st_ino)==(d.st_dev,d.st_ino): return 'copied',rel+': source hardlink'
                    if st.st_size!=row['bytes'] or st.st_mtime_ns!=row['source_mtime_ns']: return 'source',rel+': source metadata changed'
                    if M.sha256(src)!=row['sha256']: return 'source',rel+': source SHA-256 mismatch'
                except (OSError,ValueError) as e: return 'source',rel+': '+str(e)
        except (OSError,ValueError) as e: return 'copied',rel+': '+str(e)
        return None
    source_errors=[]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for n,error in enumerate(pool.map(check,files),1):
            if error:
                kind,message=error;errors.append(message)
                if kind=='source':source_errors.append(message)
            if n%25000==0: print(f'Verified bytes: {n}/{len(files)}',flush=True)
    actual=set()
    for current,ds,fs in os.walk(library,followlinks=False):
        for name in [*ds,*fs]:
            p=Path(current)/name
            if p.is_symlink(): errors.append(str(p.relative_to(library))+': unexpected symlink')
        actual.update((Path(current)/f).relative_to(library).as_posix() for f in fs)
    if actual!=seen:errors.append(f'Copied inventory differs: missing={len(seen-actual)}, extra={len(actual-seen)}')
    if source is not None:
        current_files,current_omitted=M.inventory(source)
        if {r['path'] for r in current_files}!=seen:
            message='Source eligible inventory changed after import';errors.append(message);source_errors.append(message)
    by_path={r['path']:r for r in files}
    for rel in manifest['draft_files']:
        p=M.safe_path(dest/'art/drafts/redrawn-frames-v1',rel)
        if not p.is_file() or M.sha256(p)!=by_path['Phaser/redrawn-frames-v1/'+rel]['sha256']: errors.append('Draft hash mismatch: '+rel)
    draft_root=dest/'art/drafts/redrawn-frames-v1'
    actual_drafts=set()
    if draft_root.exists():
        for current,ds,fs in os.walk(draft_root,followlinks=False):
            for name in [*ds,*fs]:
                p=Path(current)/name
                if p.is_symlink(): errors.append('Draft unexpected symlink: '+str(p.relative_to(draft_root)))
            actual_drafts.update((Path(current)/f).relative_to(draft_root).as_posix() for f in fs)
    if actual_drafts!=set(manifest['draft_files']): errors.append('Draft inventory differs from copied source')
    report={'passed':not errors,'scope':'File inventory, actual SHA-256 bytes, provenance and independent files only','file_count':len(files),'total_bytes':manifest['total_bytes'],'draft_file_count':len(manifest['draft_files']),'source_unchanged':not source_errors if source is not None else None,'source_comparison_performed':source is not None,'source_writes_performed':False,'art_approved':False,'visual_quality_checked':False,'physical_phone_checked':False,'errors':errors,'elapsed_seconds':round(time.monotonic()-start,2)}
    M.write_json(M.safe_path(dest,'verification/materials-verification.json'),report)
    print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,help='Optional original tree for source comparison; omit for standalone verification')
    p.add_argument('--dest',type=Path,required=True)
    p.add_argument('--workers',type=int,default=8)
    args=p.parse_args()
    try:
        if not 1<=args.workers<=64:raise ValueError('workers must be 1..64')
        report=verify(args.source,args.dest,args.workers)
        sys.exit(0 if report['passed'] else 1)
    except (OSError,ValueError,KeyError,TypeError) as e:
        print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)
