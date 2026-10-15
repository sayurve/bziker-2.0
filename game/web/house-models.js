import {drawSourceBuilding,sourceClanAssetId,sourceBuildingLayout} from './source-city.js';
import {resolveDesignAsset} from './design-assets.js';
import {drawSourceHouseMaterial,sourceHouseMaterial} from './source-house-materials.js';
/** One drawing source serves world houses and pre-construction architectural previews. */
async function readCatalog(){
 const url=new URL('./house-catalog.json',import.meta.url);
 if(typeof process!=='undefined'&&process.versions?.node){const {readFile}=await import('node:fs/promises');return JSON.parse(await readFile(url,'utf8'));}
 const response=await fetch(url);if(!response.ok)throw new Error('Не удалось загрузить каталог домов');return response.json();
}
export const houseCatalog=Object.freeze(await readCatalog());
const ink='#263436',paper='#faf8f2',glass='#9fbfc6';
const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
// Existing houses may carry an earlier palette; rendering preserves safe saved hex colours.
const colour=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:paper;
const shade=(hex,ratio)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*ratio).toString(16).padStart(2,'0')).join('');
const tint=(hex,ratio)=>'#'+[1,3,5].map(i=>Math.round(255-(255-parseInt(hex.slice(i,i+2),16))*ratio).toString(16).padStart(2,'0')).join('');
function rect(c,x,y,w,h,fill=ink){c.fillStyle=fill;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function poly(c,points,fill){c.fillStyle=fill;c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.closePath();c.fill();}
function pane(c,x,y,w,h){
 rect(c,x,y,w,h,ink);rect(c,x+3,y+3,w-6,h-6,glass);rect(c,x+5,y+5,w-10,3,'#d9e7e4');rect(c,x+5,y+8,4,h-15,'#bcd3d2');rect(c,x+w/2-1,y+3,2,h-6,'#526b70');rect(c,x+3,y+h/2,w-6,2,'#526b70');rect(c,x-3,y+h,w+6,5,'#ccd2c9');rect(c,x-3,y+h, w+6,1,paper);
 // Small stepped reflections and recessed edges keep glass distinct from walls.
 for(let i=0;i<Math.min(6,Math.floor((h-14)/4));i++)rect(c,x+10+i*2,y+11+i*3,4,2,'#dbe8e1');
 rect(c,x+3,y+3,w-6,1,'#63858a');rect(c,x+3,y+4,1,h-9,'#63858a');rect(c,x-1,y+h+5,w+3,3,'#26343638');rect(c,x+w/2+1,y+4,1,h-8,'#d0dfd7');
}
function frame(c,x,y,w,h,fill){rect(c,x,y,w,h,ink);rect(c,x+3,y+3,w-6,h-6,fill);rect(c,x+3,y+3,w-6,3,'#ffffff50');rect(c,x+w-7,y+7,3,h-11,'#00000022');}
function roofPlane(c,x,y,w,depth,paint){
 poly(c,[[x-6,y],[x+14,y-depth],[x+w+13,y-depth],[x+w+22,y]],'#344849');rect(c,x-6,y,w+28,7,'#495e5f');rect(c,x-5,y,w+26,2,paint);poly(c,[[x-2,y-3],[x+15,y-depth+3],[x+w+10,y-depth+3],[x+w+17,y-3]],'#ccd3ca');rect(c,x+17,y-depth+3,w-7,2,paper);
 for(let yy=y-depth+8;yy<y-7;yy+=6){const t=(yy-(y-depth))/(depth||1),left=x+18-16*t,right=x+w+7+9*t;for(let xx=left+3;xx<right-3;xx+=11){rect(c,xx,yy,2,1,Math.floor(xx+yy)%3?'#b8c3b8':'#e0e5d8');}}
 rect(c,x-4,y+3,w+25,2,'#344849');for(let xx=x+12;xx<x+w+12;xx+=24)rect(c,xx,y+4,2,2,'#9aaea5');
}
function rails(c,x,y,w){for(let xx=x;xx<=x+w;xx+=13)rect(c,xx,y,2,24,'#445b5b');rect(c,x-2,y,w+6,3,'#6f8683');rect(c,x-2,y+20,w+6,3,'#445b5b');}
function planter(c,x,y,w=38){rect(c,x,y,w,12,'#6a7667');rect(c,x+2,y+1,w-4,3,'#a0a996');for(let i=0;i<w-4;i+=7){rect(c,x+i,y-9-i%3,8,13,i%2?'#91a584':'#6f8b6c');rect(c,x+i+2,y-11-i%3,4,3,'#b3bfa3');}}
function entrance(c,doorX){
 frame(c,doorX-22,127,44,53,'#334a50');rect(c,doorX-16,133,31,31,'#a6c9ce');rect(c,doorX-14,135,27,3,'#e0ebdf');rect(c,doorX+13,159,4,4,'#f2ce61');rect(c,doorX-27,180,54,7,paper);rect(c,doorX-33,187,66,7,'#aeb8b1');rect(c,doorX-33,187,66,2,'#e5e6da');
 rect(c,doorX-18,168,35,2,'#587175');rect(c,doorX+14,162,2,9,'#c6bc9e');rect(c,doorX-26,124,52,3,'#647a75');
 for(const side of [-1,1]){rect(c,doorX+side*32-3,138,6,12,'#334a50');rect(c,doorX+side*32-2,141,4,5,'#efdc9e');rect(c,doorX+side*32-1,146,2,2,'#9aab94');}
}
function shell(c,wall){
 poly(c,[[220,0],[239,-18],[239,192],[220,180]],shade(wall,.55));rect(c,222,5,3,175,tint(wall,.8));for(let yy=19;yy<180;yy+=23)rect(c,225,yy,12,1,'#00000020');frame(c,0,0,220,180,wall);rect(c,7,168,206,9,'#8b9c92');rect(c,7,168,206,2,'#bac7bb');
 for(let yy=12;yy<163;yy+=12)for(let xx=10+(yy%24?0:5);xx<209;xx+=17){const n=(xx*13+yy*7)%19;rect(c,xx,yy,n%3===0?5:2,1,n%2?shade(wall,.91):tint(wall,.8));if(n%5===0)rect(c,xx+6,yy+4,1,2,shade(wall,.93));}
 rect(c,4,7,2,155,tint(wall,.58));rect(c,216,6,1,158,shade(wall,.74));for(let yy=7;yy<166;yy+=16){rect(c,227,yy,8,1,shade(wall,.5));rect(c,227,yy+1,2,3,tint(wall,.7));}
}
function architecture(c,style,wall){
 if(style===0){
  roofPlane(c,0,0,220,63,wall);rect(c,11,16,198,7,wall);rect(c,15,24,190,3,'#ffffff80');
  for(const x of [21,146])pane(c,x,55,53,58);rect(c,12,35,6,116,shade(wall,.68));rect(c,202,35,6,116,shade(wall,.68));rect(c,21,120,54,12,tint(wall,.65));rect(c,146,120,53,12,tint(wall,.65));
  frame(c,135,-44,46,22,'#9faeac');for(let i=0;i<5;i++)rect(c,141+i*7,-39,3,11,'#566c6c');frame(c,34,-33,30,15,'#829ba0');rect(c,39,-29,19,3,'#c7dddb');
 }else if(style===1){
  poly(c,[[-9,1],[14,-74],[206,-74],[229,1]],'#3f4d57');rect(c,14,-74,192,5,'#89989c');rect(c,-9,0,238,6,'#24373b');for(let xx=21;xx<213;xx+=19)poly(c,[[xx,-65],[xx+3,-65],[xx-6,-5],[xx-9,-5]],'#6b7c81');
  frame(c,43,-48,58,32,'#85a6b4');rect(c,71,-45,3,25,'#d5e0db');frame(c,165,-57,25,37,'#8d7770');rect(c,162,-60,31,6,'#434e52');
  for(let yy=17;yy<165;yy+=15)for(let xx=8+(yy%30?0:13);xx<215;xx+=29){rect(c,xx,yy,25,2,shade(wall,.74));rect(c,xx+25,yy-10,2,10,shade(wall,.82));}
  for(const x of [21,143])pane(c,x,48,56,68);rect(c,13,22,194,4,wall);
 }else if(style===2){
  roofPlane(c,0,-5,220,56,wall);rect(c,-6,-5,238,11,wall);planter(c,16,-29,65);planter(c,143,-30,59);
  frame(c,16,27,188,92,'#526d72');for(let i=0;i<5;i++){rect(c,22+i*36,33,31,79,i%2?'#b9d1ce':'#91b5bd');rect(c,25+i*36,35,27,4,'#d9e5dd');rect(c,25+i*36,45,4,60,'#c2d8d4');}rect(c,19,71,181,4,'#496368');rect(c,14,118,193,7,wall);rect(c,10,12,7,153,wall);rect(c,204,12,7,153,wall);rect(c,24,136,47,21,tint(wall,.66));rect(c,150,136,47,21,tint(wall,.66));
 }else if(style===3){
  poly(c,[[-12,-57],[109,-105],[110,-37],[-12,6]],'#5d7580');poly(c,[[109,-105],[232,-57],[232,6],[110,-37]],'#344c57');poly(c,[[-10,6],[110,-36],[230,6]],wall);rect(c,-12,3,244,6,'#314a53');
  for(let i=1;i<8;i++){poly(c,[[-10+i*17,-58-i*6],[-7+i*17,-58-i*6],[-7+i*17,4-i*6],[-10+i*17,4-i*6]],'#8fa1a4');poly(c,[[110+i*17,-104+i*7],[113+i*17,-104+i*7],[113+i*17,-39+i*7],[110+i*17,-39+i*7]],'#627c85');}
  for(let xx=10;xx<214;xx+=12){rect(c,xx,18,2,143,shade(wall,.7));rect(c,xx+2,18,2,143,tint(wall,.75));}pane(c,25,53,42,65);pane(c,153,53,42,65);pane(c,94,-28,31,25);
 }else if(style===4){
  roofPlane(c,0,-3,220,33,wall);frame(c,12,-48,113,93,wall);roofPlane(c,12,-48,110,35,wall);pane(c,30,-28,68,40);rect(c,13,44,115,8,shade(wall,.68));
  frame(c,129,1,75,52,tint(wall,.74));rails(c,135,-6,62);planter(c,146,23,44);rect(c,128,49,79,8,shade(wall,.7));rect(c,132,56,7,103,shade(wall,.8));rect(c,198,56,7,103,shade(wall,.8));pane(c,22,75,55,43);pane(c,151,75,39,43);
  rect(c,11,58,105,6,tint(wall,.8));rect(c,11,58,105,2,paper);
 }else{
  // Two different-height blocks share a recessed central entrance.
  roofPlane(c,0,-32,82,36,wall);roofPlane(c,134,-52,86,41,wall);frame(c,3,-28,80,142,wall);frame(c,137,-48,80,162,wall);
  for(const [x,top] of [[20,-11],[154,-31]]){pane(c,x,top,43,42);pane(c,x,top+65,43,45);}frame(c,72,37,80,64,'#5b7475');rect(c,79,43,66,51,'#b4cdcb');rect(c,80,45,63,3,'#e1ece1');rect(c,109,43,3,51,'#556f72');rails(c,78,101,68);rect(c,78,119,68,6,wall);rect(c,16,126,52,28,tint(wall,.76));rect(c,153,126,49,28,tint(wall,.76));
  rect(c,4,11,5,155,shade(wall,.65));rect(c,212,0,5,166,shade(wall,.65));
 }
}
export function drawHouseCanvas(c,house,occupant={}){
 if(house?.design?.baked_scene){
  if(occupant?.name){c.save();c.font='bold 12px monospace';c.textAlign='center';c.fillStyle=ink;c.fillText(String(occupant.name).slice(0,24),house.door.x,house.y+house.height-16);c.restore();}
  return;
 }
 const style=houseCatalog.styles.some(s=>s.id===occupant.exterior_style)?occupant.exterior_style:0,wall=colour(occupant.exterior_color);
 if(drawSourceHouseMaterial(c,sourceBuildingLayout(house,occupant),wall)||drawSourceBuilding(c,house,occupant)){
  const base=house.y+house.height;
  c.save();c.textAlign='center';
  if(occupant.color){const flag=/^#[0-9a-f]{6}$/i.test(occupant.color)?occupant.color:ink;rect(c,house.x+12,base-59,3,51,ink);rect(c,house.x+15,base-58,32,20,flag);if(occupant.flag){c.fillStyle=ink;c.font='bold 11px monospace';c.fillText(String(occupant.flag).slice(0,4),house.x+31,base-44);}}
  if(occupant.name){const name=String(occupant.name).slice(0,24),width=Math.min(house.width-70,name.length*8+18),x=house.door?.x??house.x+house.width/2;rect(c,x-width/2,base-72,width,21,ink);c.font='bold 12px monospace';c.fillStyle=paper;c.fillText(name,x,base-57,width-10);}
  c.font='bold 10px monospace';c.fillStyle=ink;c.fillText(String(house.number||house.id?.split('-')[1]||1).padStart(2,'0'),house.x+house.width-18,base+11);
  c.restore();
  return;
 }
 const sx=house.width/220,sy=house.height/180;c.save();c.translate(house.x,house.y);c.scale(sx,sy);
 poly(c,[[12,174],[247,191],[249,202],[20,192]],'#233d3226');shell(c,wall);architecture(c,style,wall);entrance(c,(house.door?.x-house.x)/sx||110);
 rect(c,185,17,25,21,'#faf8f2e6');c.font='bold 11px monospace';c.textAlign='center';c.fillStyle=ink;c.fillText(String(house.number||house.id?.split('-')[1]||1).padStart(2,'0'),197,32);
 if(occupant.color){const flag=houseCatalog.palette.includes(occupant.color)?occupant.color:/^#[0-9a-f]{6}$/i.test(occupant.color)?occupant.color:ink;rect(c,15,21,3,37,ink);rect(c,18,22,26,17,flag);c.fillStyle=paper;c.font='bold 9px monospace';c.fillText(String(occupant.flag||'').slice(0,4),31,34);}
 if(occupant.name){c.font='bold 12px monospace';c.fillStyle=ink;c.fillText(String(occupant.name).slice(0,24),110,224);}c.restore();
}
export function drawConstructionPlot(c,house){
 if(house?.design?.baked_scene)return;
 const {x,y,width:w,height:h}=house;
 if(drawSourceBuilding(c,{...house,design:{...house.design,assetId:'construction-site-compact',x:house.door?.x??x+w/2,y:y+h+15,width:w,height:h+20}})){c.font='bold 10px monospace';c.fillStyle=ink;c.textAlign='center';c.fillText(String(house.id?.split('-')[1]||1).padStart(2,'0'),x+w-18,y+h+11);return;}
 c.save();c.translate(x,y);rect(c,0,0,w,h,'#b9c2ad');rect(c,7,7,w-14,h-14,'#d1d2c2');
 for(let yy=15;yy<h-5;yy+=22)for(let xx=15;xx<w-7;xx+=26){rect(c,xx,yy,5,2,'#b3bca9');rect(c,xx+8,yy+6,3,2,'#e5e4d2');}
 for(const [xx,yy] of [[12,14],[w-28,14],[12,h-24],[w-28,h-24]]){frame(c,xx,yy,18,13,'#d7d9ca');rect(c,xx+3,yy+4,12,3,paper);}
 for(const xx of [0,w]){rect(c,xx,-12,4,h+13,'#68796b');rect(c,xx+1,-11,1,h+11,'#afbaa4');}rect(c,0,-12,w,4,'#68796b');
 for(let xx=6;xx<w;xx+=20){rect(c,xx,-21,3,21,'#748170');rect(c,xx,-21,3,3,'#cbd1bb');}
 for(const [left,span] of [[0,w/2-33],[w/2+33,w/2-33]]){rect(c,left,h-14,span,5,'#576b5d');for(let xx=left+8;xx<left+span;xx+=18){rect(c,xx,h-24,4,38,'#788675');rect(c,xx,h-24,4,3,'#c2cbb3');}}
 frame(c,w-39,h-43,30,22,paper);c.font='bold 11px monospace';c.textAlign='center';c.fillStyle=ink;c.fillText(String(house.id?.split('-')[1]||1).padStart(2,'0'),w-24,h-27);rect(c,w-26,h-20,3,25,'#657767');
 c.font='bold 10px monospace';c.fillStyle='#5b6d5c';c.fillText('УЧАСТОК',w/2,h/2+3);c.restore();
}
/** The source preview embeds the very same cached material bitmap as the city. */
export function housePreviewSVG(style=0,color=paper){
 const chosen=houseCatalog.styles.some(s=>s.id===Number(style))?Number(style):0,asset=resolveDesignAsset(sourceClanAssetId(chosen));
 if(asset?.url){const title=houseCatalog.styles.find(s=>s.id===chosen)?.label||'Модерн',wall=colour(color),assetId=sourceClanAssetId(chosen),material=sourceHouseMaterial(assetId,wall);return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 292 270" shape-rendering="crispEdges" role="img" aria-label="${escape(title)}"><image href="${escape(material?.url||asset.url)}" data-source-house-asset="${escape(assetId)}" data-source-house-color="${escape(wall)}" x="8" y="8" width="276" height="238" preserveAspectRatio="xMidYMax meet"/><text x="146" y="267" text-anchor="middle" font-size="10" fill="${ink}">${escape(title)}</text></svg>`;}
 const parts=[];let fill=ink,font='11px monospace',align='center',points=[];
 const c={save(){},restore(){},translate(){},scale(){},set fillStyle(v){fill=v;},get fillStyle(){return fill;},set font(v){font=v;},set textAlign(v){align=v;},fillRect(x,y,w,h){parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${escape(fill)}"/>`);},beginPath(){points=[];},moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);},closePath(){},fill(){parts.push(`<polygon points="${points.map(p=>p.join(',')).join(' ')}" fill="${escape(fill)}"/>`);},fillText(text,x,y){parts.push(`<text x="${x}" y="${y}" font-family="monospace" font-weight="700" font-size="${parseInt(font.replace('bold ',''),10)||11}" text-anchor="${align==='center'?'middle':'start'}" fill="${escape(fill)}">${escape(text)}</text>`);}};
 drawHouseCanvas(c,{x:0,y:0,width:220,height:180,door:{x:110,y:195},number:1},{exterior_style:Number(style),exterior_color:colour(color)});
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-24 -112 292 340" shape-rendering="crispEdges" role="img" aria-label="${escape(houseCatalog.styles.find(s=>s.id===Number(style))?.label||'Модерн')}">${parts.join('')}</svg>`;
}
