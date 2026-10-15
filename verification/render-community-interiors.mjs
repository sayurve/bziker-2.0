import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {drawInteriorGround,interiorObjects,interiorSeatedActor} from '../game/web/interiors.js';
import {preloadSourceInteriorRoom,sourceInteriorDetailLayout,drawSourceInteriorDetail} from '../game/web/source-interiors.js';
import {loadSourceActor} from '../game/web/source-actors.js';
import {drawAvatar} from '../game/web/world.js';
import {defaultAvatar} from '../game/web/avatar.js';
import {worldCamera,interiorCameraBounds} from '../game/web/world-camera.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),root=new URL('../game/',import.meta.url),candidate=process.argv.includes('--candidate'),prefix=candidate?'community-interiors-candidate':'community-interiors-integrated',out=new URL(prefix+'/',import.meta.url);
const source=candidate?new URL('community-room-candidate.json',import.meta.url):new URL('web/interiors-map.json',root),rooms=JSON.parse(await readFile(source,'utf8')).rooms.filter(r=>['arena','results','clans','terrace'].includes(r.id));
const load=path=>loadImage(fileURLToPath(new URL(path.replace(/^\//,''),root)));
globalThis.OffscreenCanvas=class {constructor(w,h){return createCanvas(w,h);}};
await loadSourceActor('human-male',{createCanvas,loadImage:load});await mkdir(out,{recursive:true});
const sheet=createCanvas(1800,1440),sc=sheet.getContext('2d'),metrics=[];sc.fillStyle='#17222b';sc.fillRect(0,0,1800,1440);
for(let i=0;i<rooms.length;i++){
 const room=rooms[i],b=room.bounds;await preloadSourceInteriorRoom(room,load);
 const canvas=createCanvas(room.width,room.height),c=canvas.getContext('2d');c.imageSmoothingEnabled=false;drawInteriorGround(c,room);
 const details=sourceInteriorDetailLayout(room);for(const d of details.filter(d=>d.layer==='background'))drawSourceInteriorDetail(c,d);
 const standing=[{...room.spawn},{x:room.action.x,y:room.action.y}],seated=room.seats.slice(0,2).map((s,n)=>interiorSeatedActor(room,{...s.seat,bench_id:s.id,pose:'sit',phone_open:n===1})),actors=[...standing,...seated].map((p,n)=>({...p,avatar:defaultAvatar,facing:p.facing||'down',walking:false,name:'',id:'proof-'+n}));
 const nodes=[...interiorObjects(room),...details.filter(d=>d.layer==='object').map(d=>({depth:d.depth,draw:c=>drawSourceInteriorDetail(c,d)})),...actors.map(p=>({depth:p.y,draw:c=>drawAvatar(c,p,0,false,false,false,0,[],false)}))];
 for(const n of nodes.sort((a,b)=>a.depth-b.depth))n.draw(c);
 for(const d of details.filter(d=>d.layer==='foreground'))drawSourceInteriorDetail(c,d);
 const sx=b.left-140,sy=b.top-205,width=b.right-b.left+280,height=b.bottom-b.top+320,crop=createCanvas(Math.ceil(width),Math.ceil(height)),cc=crop.getContext('2d');cc.imageSmoothingEnabled=false;cc.drawImage(canvas,sx,sy,width,height,0,0,width,height);
 await writeFile(new URL(room.id+'.png',out),crop.toBuffer('image/png'));
 const cx=i%2*900,cy=Math.floor(i/2)*720,k=Math.min(870/width,630/height);sc.imageSmoothingEnabled=false;sc.drawImage(crop,cx+(900-width*k)/2,cy+48,width*k,height*k);sc.fillStyle='#f5f2e7';sc.font='bold 20px sans-serif';sc.fillText(room.label,cx+20,cy+28);sc.font='14px sans-serif';sc.fillText(`actor canvas80 | ${room.props.length} objects | ${room.seats.length} seats | clear aisle120`,cx+20,cy+698);
 const cameras=[];
 for(const [width,height]of[[390,798],[1204,880]]){
  const view=worldCamera({width,height,dpr:1,zoom:1.25,sceneWidth:room.width,sceneHeight:room.height,position:room.spawn,sceneBounds:interiorCameraBounds(room)}),viewport=createCanvas(width,height),vc=viewport.getContext('2d');vc.fillStyle='#171a1c';vc.fillRect(0,0,width,height);vc.imageSmoothingEnabled=false;vc.drawImage(canvas,-view.x*view.scale,-view.y*view.scale,room.width*view.scale,room.height*view.scale);
  // QA projection only: mark the actual reserved controls height, not mock UI.
  vc.fillStyle='#17222bdd';vc.fillRect(0,height-114,width,114);vc.fillStyle='#d7dadd';vc.font='13px sans-serif';vc.fillText('QA: controls reserve114; Canvas projection',12,height-82);
  await writeFile(new URL(room.id+'-spawn-'+width+'.png',out),viewport.toBuffer('image/png'));cameras.push({canvas:[width,height],dpr:1,view});
 }
 metrics.push({room:room.id,source:candidate?'candidate actual Room API':'integrated interiors-map.json',bounds:b,props:room.props.length,seats:room.seats.length,action:room.action,actors,cameras});
}
await writeFile(new URL('contact.png',out),sheet.toBuffer('image/png'));await writeFile(new URL('metrics.json',out),JSON.stringify(metrics,null,2));console.log(fileURLToPath(out));
