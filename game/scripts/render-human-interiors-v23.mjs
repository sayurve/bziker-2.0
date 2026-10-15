import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {drawInteriorGround,interiorObjects} from '../web/interiors.js';
import {preloadSourceInteriorRoom,sourceInteriorDetailLayout,drawSourceInteriorDetail} from '../web/source-interiors.js';
import {defaultAvatar,drawAvatarCanvas} from '../web/avatar.js';
import {actorGeometry} from '../web/actor-sprite.js';
import {loadSourceActor} from '../web/source-actors.js';

const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const root=new URL('../',import.meta.url),out=new URL('../docs/interiors-human-v23/',import.meta.url);
const rooms=JSON.parse(await readFile(new URL('web/interiors-map.json',root),'utf8')).rooms;
const load=url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root)));
globalThis.OffscreenCanvas=class{constructor(w,h){return createCanvas(w,h);}};
await loadSourceActor('human-male',{createCanvas,loadImage:load});
await mkdir(out,{recursive:true});
const clear=(room,p)=>p.x>room.bounds.left+14&&p.x<room.bounds.right-14&&p.y>room.bounds.top+14&&p.y<room.bounds.bottom-14&&!room.solids.some(s=>p.x>s.x-14&&p.x<s.x+s.width+14&&p.y>s.y-14&&p.y<s.y+s.height+14);
const human=(c,p)=>{const g=actorGeometry,scale=1.25;drawAvatarCanvas(c,defaultAvatar,p.x-g.anchorX*scale,p.y-g.anchorY*scale,{scale,facing:'down',anchorX:g.anchorX,anchorY:g.anchorY});};
const all=[];
for(const room of rooms){
 await preloadSourceInteriorRoom(room,load);
 const canvas=createCanvas(room.width,room.height),c=canvas.getContext('2d');c.imageSmoothingEnabled=false;drawInteriorGround(c,room);
 const details=sourceInteriorDetailLayout(room);for(const d of details.filter(d=>d.layer==='background'))drawSourceInteriorDetail(c,d);
 const focus=room.props.find(p=>['bench','rack','food-display','sofa','poker-table','table','board'].includes(p.type));
 let comparison=null;if(focus)for(const dx of [focus.width+65,-65,focus.width/2]){const p={x:focus.x+dx,y:focus.y+focus.height+35};if(clear(room,p)){comparison=p;break;}}
 if(!comparison)throw new Error(room.id+': no clear comparison position beside the furnishings');
 const humans=[room.spawn,...(comparison?[comparison]:[])];
 const nodes=[...interiorObjects(room),...details.filter(d=>d.layer==='object').map(d=>({depth:d.depth,draw:c=>drawSourceInteriorDetail(c,d)})),...humans.map(p=>({depth:p.y,draw:c=>human(c,p)}))];
 for(const n of nodes.sort((a,b)=>a.depth-b.depth))n.draw(c);
 for(const d of details.filter(d=>d.layer==='foreground'))drawSourceInteriorDetail(c,d);
 await writeFile(new URL('interior-'+room.id+'.png',out),canvas.toBuffer('image/png'));all.push({room,canvas,humans});
}
const sheet=createCanvas(1800,1800),c=sheet.getContext('2d');c.fillStyle='#f5f3ed';c.fillRect(0,0,sheet.width,sheet.height);
all.forEach(({room,canvas},i)=>{const x=i%3*600,y=Math.floor(i/3)*450,scale=Math.min(580/room.width,375/room.height);c.imageSmoothingEnabled=false;c.drawImage(canvas,x+(600-room.width*scale)/2,y+35,room.width*scale,room.height*scale);c.fillStyle='#171a1c';c.font='bold 17px sans-serif';c.fillText(room.label,x+12,y+25);c.font='13px sans-serif';c.fillText('Человек 80 • '+room.props.length+' предметов',x+12,y+435);});
await writeFile(new URL('all-rooms-with-people.png',out),sheet.toBuffer('image/png'));
await writeFile(new URL('render-manifest.json',out),JSON.stringify({actorHeight:80,rooms:all.map(({room,humans})=>({id:room.id,size:[room.width,room.height],humans,props:room.props.map(p=>({id:p.id,height:p.visual.height,footprint:{x:p.x,y:p.y,width:p.width,height:p.height}}))}))},null,2)+'\n');
console.log(JSON.stringify({rooms:rooms.length,humansPerRoom:all.map(({humans})=>humans.length),output:fileURLToPath(out)}));
