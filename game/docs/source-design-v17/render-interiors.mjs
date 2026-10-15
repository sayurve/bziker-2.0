import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {preloadSourceInteriorRoom,isExactSourceInterior,drawExactSourceInterior,drawSourceInteriorSurfaces,drawSourceInteriorProp,sourceInteriorPropLayout,drawSourceFurniture,sourceInteriorDetailLayout,drawSourceInteriorDetail} from '../../web/source-interiors.js';
import {drawRoomProps} from '../../web/interior-props.js';
const require=createRequire(process.execPath),{createCanvas,loadImage}=require('@napi-rs/canvas'),root=new URL('../../',import.meta.url),{rooms}=JSON.parse(await readFile(new URL('../../web/interiors-map.json',import.meta.url),'utf8'));
globalThis.OffscreenCanvas=class {constructor(w,h){return createCanvas(w,h);}};
const privateBase={id:'clans',width:1200,height:900,bounds:{left:28,right:1172,top:78,bottom:872},props:[{id:'preview-sofa',type:'sofa',x:100,y:200,width:140,height:58}],exit:null};
await Promise.all([...rooms,privateBase].map(room=>preloadSourceInteriorRoom(room,url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root))))));
const grid=createCanvas(1500,840),preview=grid.getContext('2d');preview.fillStyle='#121518';preview.fillRect(0,0,1500,840);
function paintRoom(c,room){
 if(isExactSourceInterior(room)){drawExactSourceInterior(c,room);return;}
 drawSourceInteriorSurfaces(c,room);
 const legacy=new Map(drawRoomProps(room).map(p=>[p.id,p])),details=sourceInteriorDetailLayout(room);
 for(const d of details.filter(d=>d.layer==='background'))drawSourceInteriorDetail(c,d);
 const nodes=[...room.props.map(p=>({depth:p.y+p.height,draw:()=>{if(!drawSourceInteriorProp(c,p,room))legacy.get(`${room.id}:${p.id}`)?.draw(c);}})),...details.filter(d=>d.layer==='object').map(d=>({depth:d.depth,draw:()=>drawSourceInteriorDetail(c,d)}))];
 for(const node of nodes.sort((a,b)=>a.depth-b.depth))node.draw();
 for(const d of details.filter(d=>d.layer==='foreground'))drawSourceInteriorDetail(c,d);
}
for(const [index,room] of rooms.entries()){const canvas=createCanvas(room.width*2,room.height*2),c=canvas.getContext('2d');c.scale(2,2);paintRoom(c,room);const x=(index%4)*375,y=Math.floor(index/4)*280;preview.drawImage(canvas,x,y+20,375,250);preview.fillStyle='#ffffff';preview.font='18px monospace';preview.fillText(room.id+(room.source_scene?.reused?' [source reuse]':''),x+10,y+18);if(['casino','railway','arena','profile','messages'].includes(room.id))await writeFile(fileURLToPath(new URL(`./${room.id}.png`,import.meta.url)),canvas.toBuffer('image/png'));}
await writeFile(fileURLToPath(new URL('./interior-overview.png',import.meta.url)),grid.toBuffer('image/png'));

const palette=createCanvas(1500,500),p=palette.getContext('2d'),clan=privateBase;p.fillStyle='#121518';p.fillRect(0,0,palette.width,palette.height);
for(const [index,color] of ['#edb845','#63b895','#5283dd','#de6184','#000000'].entries()){
 const sample=createCanvas(clan.width,clan.height),c=sample.getContext('2d');drawSourceInteriorSurfaces(c,{...clan,floor_color:color,wall_color:color});p.drawImage(sample,index*300,20,300,227);p.fillStyle='white';p.font='16px monospace';p.fillText(color,index*300+10,17);drawSourceFurniture(p,{type:'sofa',rotation:0,color},'modern',{x:index*300+40,y:330,width:220,height:100});
}
await writeFile(fileURLToPath(new URL('./interior-palette.png',import.meta.url)),palette.toBuffer('image/png'));
