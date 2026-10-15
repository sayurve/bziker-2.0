import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {drawInteriorGround,interiorObjects} from '../web/interiors.js';
import {preloadSourceInteriorRoom,sourceInteriorDetailLayout,drawSourceInteriorDetail} from '../web/source-interiors.js';
import {sourceActorFrame} from '../web/source-actors.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const root=new URL('../',import.meta.url),out=new URL('../../verification/casino-bar/',import.meta.url);
const load=url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root)));
globalThis.OffscreenCanvas=class{constructor(w,h){return createCanvas(w,h);}};
const frame=sourceActorFrame({gender:0},{walking:false,facing:'down'}),human=await load(frame.atlas),measurements=[];
for(const version of ['before','after']){
 const {rooms}=JSON.parse(await readFile(new URL(`${version}-rooms.json`,out),'utf8'));
 for(const room of rooms){
  await preloadSourceInteriorRoom(room,load);
  const canvas=createCanvas(room.width,room.height),c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
  drawInteriorGround(c,room);
  const details=sourceInteriorDetailLayout(room);
  for(const d of details.filter(d=>d.layer==='background'))drawSourceInteriorDetail(c,d);
  const actor={depth:room.spawn.y,draw:c=>{const r=frame.rect;c.drawImage(human,r.x,r.y,r.w,r.h,room.spawn.x-30,room.spawn.y-79,60,80);}};
  const nodes=[...interiorObjects(room),...details.filter(d=>d.layer==='object').map(d=>({...d,draw:c=>drawSourceInteriorDetail(c,d)})),actor];
  for(const n of nodes.sort((a,b)=>a.depth-b.depth))n.draw(c);
  for(const d of details.filter(d=>d.layer==='foreground'))drawSourceInteriorDetail(c,d);
  await writeFile(new URL(`${room.id}-${version}.png`,out),canvas.toBuffer('image/png'));
  const overlaps=[];
  for(let i=0;i<details.length;i++)for(const z of details.slice(i+1)){
   const a=details[i];if(a.layer!=='background'||z.layer!=='background')continue;
   const w=Math.min(a.bounds.x+a.bounds.width,z.bounds.x+z.bounds.width)-Math.max(a.bounds.x,z.bounds.x),h=Math.min(a.bounds.y+a.bounds.height,z.bounds.y+z.bounds.height)-Math.max(a.bounds.y,z.bounds.y);
   if(w>0&&h>0)overlaps.push({ids:[a.id,z.id],bboxArea:w*h});
  }
  measurements.push({room:room.id,version,nativeRenderer:true,backgroundDetailBBoxOverlaps:overlaps});
 }
}
await writeFile(new URL('render-metrics.json',out),JSON.stringify(measurements,null,2)+'\n');
console.log(JSON.stringify(measurements));
