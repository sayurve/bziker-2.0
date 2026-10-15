import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const results=JSON.parse(await readFile(new URL('results.json',import.meta.url),'utf8'));
const root=new URL('../../',import.meta.url);
for(const r of results){
 const count=Math.round(Number(r.probe.format.duration)*2);
 for(let p=0;p<r.storyboard_pages.length;p++){
  const path=new URL(r.storyboard_pages[p],root),im=await loadImage(fileURLToPath(path)),canvas=createCanvas(im.width,im.height),c=canvas.getContext('2d');c.drawImage(im,0,0);c.font='14px sans-serif';c.fillStyle='#ffffff';
  for(let i=0;i<24&&p*24+i<count;i++){const x=3+(i%4)*323,y=3+Math.floor(i/4)*263;c.fillText(`${r.id}  ${(p*24+i)*.5}s`,x+5,y+254);}
  await writeFile(path,canvas.toBuffer('image/png'));
 }
}
