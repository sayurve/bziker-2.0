// Actual room painters and camera; this offline proof is separate from browser QA.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {drawInteriorGround,interiorObjects} from '../game/web/interiors.js';
import {preloadSourceInteriorRoom,sourceInteriorDetailLayout,drawSourceInteriorDetail,sourceInteriorPropLayout} from '../game/web/source-interiors.js';
import {defaultAvatar,drawAvatarCanvas} from '../game/web/avatar.js';
import {actorGeometry} from '../game/web/actor-sprite.js';
import {loadSourceActor} from '../game/web/source-actors.js';
import {worldCamera,interiorCameraBounds} from '../game/web/world-camera.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const root=new URL('../game/',import.meta.url),out=new URL('./',import.meta.url);
const load=url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root)));
globalThis.OffscreenCanvas=class{constructor(w,h){return createCanvas(w,h);}};
await loadSourceActor('human-male',{createCanvas,loadImage:load});
const metrics=[];
for(const [stage,path] of [['before','shop-plans-before.json'],['after',process.argv[2]||'shop-plans-preview.json']]){
 const all=JSON.parse(await readFile(new URL(path,out),'utf8')).rooms;
 const rooms=all.filter(r=>['profile','shop-clothes','shop-food','shop-furniture'].includes(r.id));
 for(const room of rooms){
  await preloadSourceInteriorRoom(room,load);
  const canvas=createCanvas(room.width,room.height),c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
  drawInteriorGround(c,room);
  const details=sourceInteriorDetailLayout(room);
  for(const d of details.filter(d=>d.layer==='background'))drawSourceInteriorDetail(c,d);
  const human={depth:room.spawn.y,draw:c=>drawAvatarCanvas(c,defaultAvatar,room.spawn.x-actorGeometry.anchorX*1.25,room.spawn.y-actorGeometry.anchorY*1.25,{scale:1.25,facing:'down'})};
  const nodes=[...interiorObjects(room),...details.filter(d=>d.layer==='object').map(d=>({depth:d.depth,draw:c=>drawSourceInteriorDetail(c,d)})),human];
  for(const n of nodes.sort((a,b)=>a.depth-b.depth))n.draw(c);
  for(const d of details.filter(d=>d.layer==='foreground'))drawSourceInteriorDetail(c,d);
  await writeFile(new URL(`shop-${room.id}-${stage}-full.png`,out),canvas.toBuffer('image/png'));
  for(const viewport of [{width:1204,height:880,dpr:2},{width:390,height:800,dpr:2}]){
   const view=worldCamera({...viewport,zoom:1.25,sceneWidth:room.width,sceneHeight:room.height,position:room.spawn,sceneBounds:interiorCameraBounds(room)});
   const framed=createCanvas(viewport.width,viewport.height),v=framed.getContext('2d');v.fillStyle='#171a1c';v.fillRect(0,0,framed.width,framed.height);v.imageSmoothingEnabled=false;v.drawImage(canvas,-view.x*view.scale,-view.y*view.scale,room.width*view.scale,room.height*view.scale);
   await writeFile(new URL(`shop-${room.id}-${stage}-${viewport.width}.png`,out),framed.toBuffer('image/png'));
   const visible=room.props.filter(p=>{const b=sourceInteriorPropLayout(p,room).bounds;return Math.min(b.x+b.width,view.x+view.width)-Math.max(b.x,view.x)>16/view.scale&&Math.min(b.y+b.height,view.y+view.height)-Math.max(b.y,view.y)>16/view.scale;}).map(p=>p.id);
   metrics.push({stage,id:room.id,viewport,view,visible,props:room.props.length,seats:room.seats.length,playable:[room.bounds.right-room.bounds.left,room.bounds.bottom-room.bounds.top]});
  }
 }
}
await writeFile(new URL('shop-render-metrics.json',out),JSON.stringify(metrics,null,2)+'\n');
console.log(JSON.stringify(metrics.map(m=>({stage:m.stage,id:m.id,viewport:m.viewport.width,visible:m.visible.length,seats:m.seats})),null,2));
