from pathlib import Path,PurePosixPath
import argparse,hashlib,json,tarfile,gzip,os,io,tempfile

class SplitWriter:
    def __init__(self,dest,limit):
        self.dest=Path(dest);self.dest.mkdir(parents=True,exist_ok=False)
        self.limit=limit;self.total=0;self.part=None;self.size=0;self.sha=None;self.parts=[]
    def write(self,data):
        view=memoryview(data);written=len(view)
        while view:
            if self.part is None:
                self.name=f'bziker-2.0-materials.tar.gz.part-{len(self.parts)+1:03d}'
                self.part=(self.dest/self.name).open('xb');self.size=0;self.sha=hashlib.sha256()
            n=min(len(view),self.limit-self.size);block=view[:n]
            self.part.write(block);self.sha.update(block);self.size+=n;self.total+=n;view=view[n:]
            if self.size==self.limit:self.finish_part()
        return written
    def tell(self):return self.total
    def flush(self):
        if self.part:self.part.flush()
    def finish_part(self):
        if self.part:
            self.part.close();self.parts.append({'name':self.name,'bytes':self.size,'sha256':self.sha.hexdigest()});self.part=None
    def close(self):self.finish_part()

class CheckedReader:
    def __init__(self,stream):self.stream=stream;self.sha=hashlib.sha256()
    def read(self,n=-1):
        b=self.stream.read(n);self.sha.update(b);return b

def safe_path(root,name):
    p=PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts:raise ValueError('Unsafe archive relative path')
    file=root.joinpath(*p.parts)
    if file.is_symlink() or not file.resolve().is_relative_to(root.resolve()):raise ValueError('Unsafe source path')
    return file

def build(root,dest,part_bytes):
    root=Path(root);manifest=root/'verification/materials-manifest.json'
    meta=json.loads(manifest.read_text());rows=meta['files'];assert meta['file_count']==len(rows)
    writer=SplitWriter(dest,part_bytes);seen={};payload=0;aliases=0
    with gzip.GzipFile(filename='',mode='wb',fileobj=writer,compresslevel=1,mtime=0) as compressed:
        with tarfile.open(fileobj=compressed,mode='w|',format=tarfile.PAX_FORMAT) as archive:
            for count,row in enumerate(rows,1):
                path=safe_path(root/'materials/Bziker',row['path']);stat=path.stat()
                if stat.st_size!=row['bytes']:raise ValueError('Material changed before packaging')
                mode=stat.st_mode&0o777;key=(row['sha256'],mode)
                name='materials/Bziker/'+row['path'];info=tarfile.TarInfo(name);info.mode=mode;info.mtime=0;info.uid=info.gid=0
                if key in seen:
                    info.type=tarfile.LNKTYPE;info.linkname=seen[key];archive.addfile(info);aliases+=1
                else:
                    info.size=row['bytes']
                    with path.open('rb') as raw:
                        reader=CheckedReader(raw);archive.addfile(info,reader)
                        if reader.sha.hexdigest()!=row['sha256']:raise ValueError('Material SHA changed while packaging')
                    seen[key]=name;payload+=row['bytes']
                if count%25000==0:print(json.dumps({'files':count,'total':len(rows),'uniqueFiles':len(seen),'compressedBytes':writer.total}),flush=True)
            data=manifest.read_bytes();info=tarfile.TarInfo('verification/materials-manifest.json');info.mode=0o644;info.size=len(data);info.mtime=0
            archive.addfile(info,io.BytesIO(data))
    writer.close()
    result={'format':'gzip PAX tar, split binary parts, same-SHA hardlink aliases','fileCount':len(rows),'originalBytes':sum(r['bytes'] for r in rows),'uniquePayloadBytes':payload,'uniqueFiles':len(seen),'hardlinkAliases':aliases,'manifestSHA256':hashlib.sha256(manifest.read_bytes()).hexdigest(),'compressedBytes':writer.total,'parts':writer.parts,'sourceWritesPerformed':False}
    (Path(dest)/'materials-release.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    (Path(dest)/'materials-SHA256SUMS.txt').write_text(''.join(p['sha256']+'  '+p['name']+'\n' for p in writer.parts))
    return result

def self_test():
    with tempfile.TemporaryDirectory() as d:
        root=Path(d)/'source';(root/'verification').mkdir(parents=True);(root/'materials/Bziker/unicode').mkdir(parents=True)
        rows=[]
        for name,data in [('first.txt',b'hello'*40),('unicode/копия.txt',b'hello'*40),('third.bin',bytes(range(256))*5)]:
            p=root/'materials/Bziker'/name;p.write_bytes(data);rows.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
        (root/'verification/materials-manifest.json').write_text(json.dumps({'files':rows,'file_count':3}))
        result=build(root,Path(d)/'output',97);assert result['hardlinkAliases']==1 and result['uniqueFiles']==2
        combined=b''.join((Path(d)/'output'/r['name']).read_bytes() for r in result['parts']);assert all(r['bytes']<=97 for r in result['parts'])
        for p in result['parts']:assert hashlib.sha256((Path(d)/'output'/p['name']).read_bytes()).hexdigest()==p['sha256']
        with tarfile.open(fileobj=io.BytesIO(combined),mode='r:gz') as archive:
            for row in rows:assert archive.extractfile('materials/Bziker/'+row['path']).read()==(root/'materials/Bziker'/row['path']).read_bytes()
            assert archive.extractfile('verification/materials-manifest.json').read()==(root/'verification/materials-manifest.json').read_bytes()
        for bad in ['../escape','/absolute']:
            try:safe_path(root,bad)
            except ValueError:pass
            else:raise AssertionError('Unsafe path accepted')
        print('Archive self-test PASS: exact parts/bytes, Unicode paths, hardlink aliases, manifest and traversal rejection.',flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source-root',type=Path);p.add_argument('--dest',type=Path);p.add_argument('--part-bytes',type=int,default=1024**3);p.add_argument('--self-test',action='store_true');args=p.parse_args()
    if args.self_test:self_test()
    else:
        if not args.source_root or not args.dest or args.part_bytes<=0:p.error('Source, new destination and positive part size required')
        print(json.dumps(build(args.source_root,args.dest,args.part_bytes),ensure_ascii=False),flush=True)
