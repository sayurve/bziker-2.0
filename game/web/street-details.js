import {drawSourceStreet} from './source-city.js';
/** Small authored street furniture. Bounds include the entire painted sprite,
 * including its side plane and shadow; depth follows the ground support. */
const shapes=Object.freeze({
 planter:{x:-33,y:-40,width:78,height:62,footprint:{x:-31,y:4,width:67,height:14},depth:16},
 bollard:{x:-12,y:-33,width:33,height:48,footprint:{x:-9,y:2,width:23,height:8},depth:8},
 guide:{x:-55,y:-66,width:117,height:86,footprint:{x:-8,y:3,width:23,height:10},depth:10},
 bin:{x:-23,y:-59,width:46,height:76,footprint:{x:-16,y:2,width:32,height:15},depth:15},
});
const rect=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
export function streetDetailGeometry(detail){
 const shape=shapes[detail?.kind];if(!shape||!Number.isFinite(detail.x)||!Number.isFinite(detail.y))return null;
 const {x,y}=detail,authored=detail.footprint;
 // Absolute map footprints are shared with the server. Older maps use the
 // identical shape support, so decorative paint and physical geometry agree.
 const footprint=authored&&['x','y','width','height'].every(k=>Number.isFinite(authored[k]))&&authored.width>0&&authored.height>0?{...authored}:{x:x+shape.footprint.x,y:y+shape.footprint.y,width:shape.footprint.width,height:shape.footprint.height};
 return {bounds:{x:x+shape.x,y:y+shape.y,width:shape.width,height:shape.height},footprint,depth:y+shape.depth};
}
function paintPlanter(c,{x,y,flowers=false}){
 if(drawSourceStreet(c,'planter',x,y))return;
 rect(c,x-25,y+14,66,5,'#26362b22');
 rect(c,x-31,y-3,63,20,'#3b4845');rect(c,x-28,y-1,56,15,'#d1d6ca');rect(c,x-28,y-1,3,15,'#f1f0e7');rect(c,x+28,y,6,17,'#86938b');rect(c,x-32,y-6,66,6,'#ecece2');rect(c,x-27,y-4,56,3,'#526353');
 for(const [dx,dy,w,h] of [[-25,-20,19,18],[-14,-30,22,26],[4,-27,20,25],[17,-18,13,17],[-7,-35,12,13]]){rect(c,x+dx,y+dy,w,h,'#506b53');rect(c,x+dx+2,y+dy+2,w-5,Math.max(4,h-7),'#789471');rect(c,x+dx+3,y+dy+2,Math.max(3,w-9),3,'#a0b78d');rect(c,x+dx+2,y+dy+h-4,w-3,3,'#49684d');}
 for(const [dx,dy] of [[-20,-16],[-8,-25],[12,-22],[20,-12]]){rect(c,x+dx,y+dy,3,2,'#bed0a5');if(flowers){rect(c,x+dx+1,y+dy-3,4,4,'#e1c989');rect(c,x+dx+2,y+dy-2,2,2,'#f8efc8');}}
 rect(c,x-20,y+4,41,1,'#b0bab0');rect(c,x-20,y+10,41,1,'#b0bab0');
}
function paintBollard(c,{x,y}){
 rect(c,x-5,y+7,23,4,'#26362b22');rect(c,x-8,y+2,18,7,'#89968d');rect(c,x-6,y-26,12,30,'#293c40');rect(c,x-5,y-25,3,28,'#718783');rect(c,x+3,y-24,3,29,'#1e3135');rect(c,x-7,y-29,14,5,'#485e60');rect(c,x-5,y-30,10,2,'#a9bab0');rect(c,x-6,y-16,12,5,'#d4d9c9');rect(c,x-5,y-16,3,5,'#f2f2df');rect(c,x+3,y-16,3,5,'#a8b5a5');rect(c,x-6,y+2,12,2,'#bdc9b8');
}
function paintGuide(){} // Location names are drawn by the floating interface.
const painters={planter:paintPlanter,bollard:paintBollard,guide:paintGuide,bin:(c,{x,y})=>drawSourceStreet(c,'bin',x,y)};
export function streetDetailObjects(map){
 return (map?.decor?.street_details||[]).flatMap(detail=>{
  const geometry=streetDetailGeometry(detail);return geometry?[{...detail,...geometry,paint(c){painters[detail.kind](c,detail);}}]:[];
 });
}
