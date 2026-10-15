import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {drawInteriorGround,interiorObjects} from '../web/interiors.js';
import {preloadSourceInteriorRoom,sourceInteriorDetailLayout,drawSourceInteriorDetail} from '../web/source-interiors.js';
import {defaultAvatar,drawAvatarCanvas} from '../web/avatar.js';
import {actorGeometry} from '../web/actor-sprite.js';
import {loadSourceActor} from '../web/source-actors.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const root=new URL('../',import.meta.url),out=new URL('docs/bugfix-v25/',root),rooms=JSON.parse(await readFile(new URL('web/interiors-map.json',root),'utf8')).rooms;
const load=url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root)));
globalThis.OffscreenCanvas=class{constructor(w,h){return createCanvas(w,h);}};
await loadSourceActor('human-male',{createCanvas,loadImage:load});await mkdir(out,{recursive:true});
const sheet=createCanvas(1800,1560),proof=sheet.getContext('2d'),metrics=[];proof.fillStyle='#f4f1e9';proof.fillRect(0,0,sheet.width,sheet.height);
for(let i=0;i<rooms.length;i++){
 const room=rooms[i];await preloadSourceInteriorRoom(room,load);const canvas=createCanvas(room.width,room.height),c=canvas.getContext('2d');drawInteriorGround(c,room);
 const details=sourceInteriorDetailLayout(room);for(const d of details.filter(d=>d.layer==='background'))drawSourceInteriorDetail(c,d);
 const people=[room.spawn,{x:room.bounds.left+20,y:room.bounds.top+220}];
 const nodes=[...interiorObjects(room),...details.filter(d=>d.layer==='object').map(d=>({depth:d.depth,draw:c=>drawSourceInteriorDetail(c,d)})),...people.map(p=>({depth:p.y,draw:c=>drawAvatarCanvas(c,defaultAvatar,p.x-actorGeometry.anchorX*1.25,p.y-actorGeometry.anchorY*1.25,{scale:1.25,facing:'down'})}))];
 for(const n of nodes.sort((a,b)=>a.depth-b.depth))n.draw(c);for(const d of details.filter(d=>d.layer==='foreground'))drawSourceInteriorDetail(c,d);
 await writeFile(new URL(`${room.id}-interior-after.png`,out),canvas.toBuffer('image/png'));
 const b=room.bounds,x=i%3*600,y=Math.floor(i/3)*390,sx=b.left-110,sy=b.top-220,w=b.right-b.left+220,h=b.bottom-b.top+260,k=Math.min(580/w,340/h);
 proof.imageSmoothingEnabled=false;proof.drawImage(canvas,sx,sy,w,h,x+(600-w*k)/2,y+36,w*k,h*k);proof.fillStyle='#171a1c';proof.font='bold 17px sans-serif';proof.fillText(room.label,x+12,y+24);
 metrics.push({id:room.id,actorHeight:80,wallBodyHeight:room.wall_body_height,backWallHeights:room.surfaces.filter(s=>s.id.startsWith('back-wall')).map(s=>s.visual.height),sidePanelHeights:room.surfaces.filter(s=>s.id==='left-wall'||s.id==='right-wall').map(s=>s.visual.height),bounds:room.bounds,mountedDetails:details.filter(d=>d.mounting).map(d=>({id:d.id,mounting:d.mounting,bounds:d.bounds})),people});
}
await writeFile(new URL('all-interiors-after.png',out),sheet.toBuffer('image/png'));await writeFile(new URL('interior-measurements.json',out),JSON.stringify(metrics,null,2)+'\n');console.log(JSON.stringify({rooms:rooms.length,output:fileURLToPath(out)}));
