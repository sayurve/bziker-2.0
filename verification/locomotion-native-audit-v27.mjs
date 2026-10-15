import fs from 'node:fs';import{fileURLToPath}from'node:url';import path from 'node:path';import{createRequire}from'node:module';import{sourceActorsData as D}from'../game/web/source-actors-data.js';import{sourceActorFrame}from'../game/web/source-actors.js';
const{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),out=new URL('./',import.meta.url),cache=new Map(),metrics=[];
const image=async p=>{if(!cache.has(p))cache.set(p,await loadImage(fileURLToPath(new URL('../game/'+p,import.meta.url))));return cache.get(p);};
for(const gender of ['male','female']){
 const actor=D.actors['human-'+gender],seqs=Object.values(actor.actions).filter(s=>/Ходьба|Бег/.test(s.name)),canvas=createCanvas(960,8*290+60),c=canvas.getContext('2d');c.fillStyle='#232b30';c.fillRect(0,0,canvas.width,canvas.height);c.imageSmoothingEnabled=false;c.font='18px sans-serif';c.fillStyle='#fff';c.fillText(gender+' native detail PNG; fixed96x128; cyan=ground126; no transforms',10,25);
 for(const [row,s]of seqs.entries())for(const [n,r]of s.frames.entries()){
  const d=r.detail,im=await image(d.path),cell=createCanvas(d.w,d.h),cc=cell.getContext('2d');cc.drawImage(im,d.x,d.y,d.w,d.h,0,0,d.w,d.h);const px=cc.getImageData(0,0,d.w,d.h).data;
  const pts=[];for(let y=0;y<d.h;y++)for(let x=0;x<d.w;x++)if(px[(y*d.w+x)*4+3]>=128)pts.push([x,y]);
  const bbox=[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))];
  const bottom=y=>{const pts2=pts.filter(p=>p[1]>=y);return {left:Math.min(...pts2.map(p=>p[0])),right:Math.max(...pts2.map(p=>p[0])),centroid:pts2.reduce((a,p)=>a+p[0],0)/pts2.length,count:pts2.length};};
  const foots=[];for(const [label,l,rgt] of [['left',0,48],['right',48,96]]){const p=pts.filter(p=>p[0]>=l&&p[0]<rgt&&p[1]>99);foots.push({label,bottom:Math.max(...p.map(p=>p[1])),cx:p.reduce((a,v)=>a+v[0],0)/p.length,count:p.length});}
  metrics.push({gender,action:s.name,n,head:r.head,bbox,lower:bottom(106),feet:foots,anchor:actor.anchor,sourceScale:r.sourceScale,sourceKey:s.sourceKey});
  const x=n*240,y=60+row*290;c.fillStyle='#fff';c.fillText(s.name+' f'+n,x+4,y-9);c.drawImage(cell,x+24,y,192,256);c.strokeStyle='#37c9d2';c.beginPath();c.moveTo(x+4,y+252.5);c.lineTo(x+236,y+252.5);c.stroke();
 }
 fs.writeFileSync(new URL('locomotion-native-'+gender+'-v27.png',out),canvas.toBuffer('image/png'));
}
const selection=[];for(const gender of [0,1])for(const facing of['down','right','up','left'])selection.push({gender,facing,frames:Array.from({length:8},(_,walkFrame)=>{const f=sourceActorFrame({gender},{walking:true,running:true,facing,walkFrame});return[f.id,f.frameIndex];})});
fs.writeFileSync(new URL('locomotion-native-metrics-v27.json',out),JSON.stringify({metrics,worldSelection:selection},null,2)+'\n');console.log('Wrote two native contacts and metrics.');
