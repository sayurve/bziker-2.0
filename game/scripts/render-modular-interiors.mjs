import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {drawInteriorGround,interiorObjects} from '../web/interiors.js';
import {preloadSourceInteriorRoom,sourceInteriorDetailLayout,drawSourceInteriorDetail} from '../web/source-interiors.js';
import {sourceActorFrame} from '../web/source-actors.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const root=new URL('../',import.meta.url),map=JSON.parse(await readFile(new URL('web/interiors-map.json',root),'utf8'));
const load=url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root)));
const frame=sourceActorFrame({gender:0},{walking:false,facing:'down'}),human=await load(frame.atlas);
const drawRoom=room=>{
 const canvas=createCanvas(room.width,room.height),c=canvas.getContext('2d');c.imageSmoothingEnabled=false;drawInteriorGround(c,room);
 const details=sourceInteriorDetailLayout(room);for(const d of details.filter(d=>d.layer==='background'))drawSourceInteriorDetail(c,d);
 const actor={depth:room.spawn.y,draw:()=>{const r=frame.rect;c.drawImage(human,r.x,r.y,r.w,r.h,room.spawn.x-30,room.spawn.y-79,60,80);}};
 const nodes=[...interiorObjects(room),...details.filter(d=>d.layer==='object').map(d=>({...d,draw:c=>drawSourceInteriorDetail(c,d)})),actor];for(const n of nodes.sort((a,b)=>a.depth-b.depth))n.draw(c);
 for(const d of details.filter(d=>d.layer==='foreground'))drawSourceInteriorDetail(c,d);return canvas;
};
const width=1920,cellWidth=640,cellHeight=530,montage=createCanvas(width,4*cellHeight),m=montage.getContext('2d');m.fillStyle='#ece9e1';m.fillRect(0,0,montage.width,montage.height);
for(let i=0;i<map.rooms.length;i++){
 const room=map.rooms[i];await preloadSourceInteriorRoom(room,load);const canvas=drawRoom(room),x=i%3*cellWidth,y=Math.floor(i/3)*cellHeight;
 const scale=Math.min((cellWidth-24)/room.width,450/room.height);m.imageSmoothingEnabled=false;m.drawImage(canvas,x+(cellWidth-room.width*scale)/2,y+48,room.width*scale,room.height*scale);
 m.fillStyle='#202629';m.font='bold 17px sans-serif';m.fillText(room.label,x+14,y+26);m.font='13px sans-serif';m.fillText(`${room.width}×${room.height}; ${room.props.length} предметов; ${room.seats.length} мест`,x+14,y+cellHeight-17);
 if(room.id==='casino'){const close=createCanvas(1440,720),c=close.getContext('2d'),b=room.bounds,scale=1440/(b.right-b.left+160);c.fillStyle='#171a1c';c.fillRect(0,0,1440,720);c.imageSmoothingEnabled=false;c.drawImage(canvas,(b.left-80)*scale*-1,(b.top-160)*scale*-1,room.width*scale,room.height*scale);await mkdir(new URL('docs/source-design-v20/',root),{recursive:true});await writeFile(new URL('docs/source-design-v20/casino-modular.png',root),close.toBuffer('image/png'));}
}
await mkdir(new URL('docs/source-design-v20/',root),{recursive:true});await writeFile(new URL('docs/source-design-v20/interiors-modular.png',root),montage.toBuffer('image/png'));console.log('docs/source-design-v20/interiors-modular.png');
