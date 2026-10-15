import {drawPixelMascot} from './pixel-mascot.js';
import {drawSourceFurniture,drawSourceInteriorSurfaces,isExactSourceInterior,drawExactSourceInterior,drawExactSourceInteriorMiniMap,sourceInteriorExactObjects} from './source-interiors.js';
import {drawDesignAsset,resolveDesignAsset,designDestination} from './design-assets.js';
// Every public prop and its physical footprint come from the shared room plan.
import {drawRoomProps} from './interior-props.js';
import {drawFacingFurniture} from './furniture-views.js';
import {nearestFreeCityPoint,moveBetweenObstacles,playerBodyRadius} from './city-collision.js';
const ink='#141414',paper='#faf8f2';
const themes={station:['#a1b3bd','#e3e3db','#edf0eb'],clanhall:['#a3b8ad','#deded3','#edf0e7'],quizfoyer:['#c4bd93','#d3d6d2','#eef0e9'],wardrobe:['#afa8ba','#e5e0df','#f1efef'],gallery:['#abbcc3','#e3e4df','#ffffff'],cafe:['#bda797','#d8cebb','#f3eee3'],terrace:['#a9b4a0','#e0d6c0','#f2eee3'],'food-store':['#acb89b','#e0dccb','#f1eee3'],'clothing-store':['#b5acbd','#e3dfde','#f1efef'],'furniture-store':['#b8a68e','#ded4c3','#f0ece2'],casino:['#c2b58a','#c7d0c9','#e6e9e2']};
function r(c,x,y,w,h,color=ink){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function text(c,t,x,y,size=12,color=ink){c.font=`bold ${size}px monospace`;c.textAlign='center';c.fillStyle=color;c.fillText(t,x,y);}
function poly(c,p,color){c.fillStyle=color;c.beginPath();c.moveTo(...p[0]);for(const a of p.slice(1))c.lineTo(...a);c.closePath();c.fill();}
function shade(hex,n){return /^#[0-9a-f]{6}$/i.test(hex)?'#'+hex.slice(1).match(/../g).map(v=>Math.max(0,Math.min(255,parseInt(v,16)+n)).toString(16).padStart(2,'0')).join(''):hex;}

const grainSeed=(x,y)=>Math.abs(Math.imul(Math.round(x),31)^Math.imul(Math.round(y),17));
function woodGrain(c,x,y,w,h,color){for(let row=5;row<h-2;row+=7){const n=grainSeed(x,y+row),start=3+n%8,length=Math.min(w-start-3,9+n%19);if(length>0)r(c,x+start,y+row,length,1,shade(color,-12));if(w>34)r(c,x+w-20-(n%9),y+row+2,9,1,shade(color,10));}}
function fabric(c,x,y,w,h,color){for(let yy=3;yy<h-2;yy+=6)for(let xx=3+(yy%4);xx<w-2;xx+=8){r(c,x+xx,y+yy,2,1,shade(color,10));if((xx+yy)%3)r(c,x+xx+1,y+yy+1,1,2,shade(color,-11));}}
export function drawFloorMaterial(c,b,color,kind='wood'){
 const right=b.x+b.width,bottom=b.y+b.height;
 const fill=(x,y,w,h,tone)=>{const left=Math.max(b.x,Math.round(x)),top=Math.max(b.y,Math.round(y)),end=Math.min(right,Math.round(x+w)),down=Math.min(bottom,Math.round(y+h));if(end>left&&down>top)r(c,left,top,end-left,down-top,tone);};
 fill(b.x,b.y,b.width,b.height,color);
 const plank=kind==='wood',rowHeight=plank?20:30,colWidth=plank?82:42;
 for(let yy=Math.floor(b.y/rowHeight)*rowHeight;yy<bottom;yy+=rowHeight)for(let xx=Math.floor(b.x/colWidth)*colWidth-(Math.floor(yy/rowHeight)%2?colWidth/2:0);xx<right;xx+=colWidth){const n=grainSeed(xx,yy),base=shade(color,(n%5)-2);
  fill(xx+1,yy+1,colWidth-1,rowHeight-1,base);fill(xx,yy,colWidth,1,shade(color,-15));fill(xx,yy,1,rowHeight,shade(color,-13));fill(xx+1,yy+1,colWidth-3,1,shade(color,9));
  if(plank){for(let j=0;j<3;j++){const gx=xx+8+(n+j*19)%(colWidth-27),gy=yy+5+j*4;fill(gx,gy,9+(n%13),1,shade(color,j===0?9:-8));}if(n%4===0){fill(xx+30,yy+9,5,2,shade(color,-11));fill(xx+31,yy+9,3,1,shade(color,4));}}
  else{fill(xx+7+n%12,yy+8+n%7,2,1,shade(color,8));fill(xx+19,yy+19,3,1,shade(color,-8));}
 }
}

export function interiorBlock(c,x,y,w,d,z,color=paper){
 r(c,x+5,y+d-1,w+5,8,'#00000020');poly(c,[[x+w,y-z],[x+w+6,y-z+4],[x+w+6,y+d+4],[x+w,y+d]],shade(color,-43));
 r(c,x,y+d-z,w,z,shade(color,-24));r(c,x,y-z,w,d,shade(color,8));r(c,x,y-z,w,2,shade(color,28));r(c,x,y-z,2,d,shade(color,24));r(c,x,y+d-z,w,2,shade(color,-42));
}
export function moveInteriorPosition(room,p,dx,dy){
 const b=room?.bounds||{left:28,right:872,top:78,bottom:652},solids=room?.solids||[];
 const point=nearestFreeCityPoint(p,solids,b,playerBodyRadius);
 return moveBetweenObstacles(point,dx,dy,solids,b,playerBodyRadius);
}
export function nearestInteriorAction(room,x,y,snapshot={},selfId=null){
 if(!room)return null;const claimed=new Set((snapshot?.players||[]).filter(p=>p.id!==selfId).map(p=>p.bench_id));
 const radius=Number.isFinite(room.interaction_radius)&&room.interaction_radius>0?room.interaction_radius:null;
 const choices=(room.seats||[]).filter(s=>!claimed.has(s.id)).map(s=>({kind:'bench',id:s.id,...s.seat,facing:s.facing||'down',radius:radius||65}));
 choices.push({kind:'exit',id:'exit',...room.exit,radius:radius||75},{kind:'counter',...room.action,radius:radius||room.action.radius||80});
 return choices.filter(a=>Math.hypot(a.x-x,a.y-y)<=a.radius).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0]||null;
}
export function interiorSeatFacing(room,benchId){
 const seat=room?.seats?.find(s=>s.id===benchId);return seat?(['up','down','left','right'].includes(seat.facing)?seat.facing:'down'):null;
}
export function interiorSeatedActor(room,player){
 const facing=interiorSeatFacing(room,player.bench_id);
 return facing&&['sit','phone'].includes(player.pose)?{...player,pose:'sit',facing,phone_open:!!player.phone_open||player.pose==='phone'}:player;
}
function plant(c,x,y,accent){
 interiorBlock(c,x-11,y-7,22,14,16,accent);r(c,x-10,y-22,21,4,'#536146');r(c,x-9,y-22,18,1,'#c1c7ab');r(c,x-8,y-17,3,12,shade(accent,27));r(c,x+7,y-16,2,11,shade(accent,-18));
 r(c,x-2,y-54,4,33,'#697e50');for(const [dx,dy,w,h] of [[-20,-46,17,9],[-14,-58,14,10],[2,-50,18,9],[3,-35,15,8],[-5,-64,10,15]]){r(c,x+dx+2,y+dy,w-4,h,'#7e9967');r(c,x+dx,y+dy+2,w,h-4,'#5d7f51');r(c,x+dx+3,y+dy+1,w-7,3,'#a3b57e');r(c,x+dx+5,y+dy+4,w-8,1,'#465f42');}r(c,x-8,y-15,16,2,shade(accent,28));
}
function sofa(c,x,y,w=120,color='#adb8a0',vertical=false){
 if(vertical){interiorBlock(c,x+4,y+8,w-11,100,12,color);r(c,x+w-23,y-12,21,115,shade(color,-27));for(let yy=y+12;yy<y+90;yy+=39){r(c,x+8,yy,w-34,32,shade(color,11));r(c,x+10,yy+1,w-38,3,shade(color,30));fabric(c,x+10,yy+5,w-38,23,color);r(c,x+11,yy+28,w-40,1,shade(color,-17));}return;}
 r(c,x+7,y+30,w-10,7,'#0002');r(c,x+8,y+28,4,10,'#414e43');r(c,x+w-14,y+28,4,10,'#414e43');
 r(c,x+5,y-21,w-10,40,shade(color,-24));r(c,x+2,y-16,w-4,37,shade(color,-18));r(c,x+8,y-19,w-16,5,shade(color,19));fabric(c,x+10,y-12,w-20,22,color);for(let xx=x+34;xx<x+w-20;xx+=35){r(c,xx,y-8,2,2,shade(color,-23));r(c,xx+1,y-9,1,1,shade(color,20));}
 interiorBlock(c,x+4,y+11,w-8,18,11,color);for(let xx=x+12;xx<x+w-13;xx+=Math.max(30,(w-24)/3)){const cw=Math.min((w-24)/3-3,x+w-xx-11);r(c,xx,y+9,cw,14,shade(color,13));r(c,xx+2,y+10,cw-4,2,shade(color,30));r(c,xx+cw-1,y+11,1,11,shade(color,-28));fabric(c,xx+2,y+12,cw-4,9,color);r(c,xx+3,y+23,cw-6,1,shade(color,-12));}
 r(c,x,y-7,10,31,shade(color,-19));r(c,x+w-10,y-7,10,31,shade(color,-32));r(c,x+2,y-7,6,3,shade(color,28));r(c,x+w-8,y-7,6,3,shade(color,20));r(c,x+2,y-3,2,22,shade(color,-6));r(c,x+w-3,y-3,1,20,shade(color,-45));
}
function chair(c,x,y,color){r(c,x+6,y+17,3,14,'#404e46');r(c,x+31,y+17,3,14,'#404e46');r(c,x+5,y-25,30,28,shade(color,-20));r(c,x+8,y-24,24,4,shade(color,22));interiorBlock(c,x+3,y-2,35,20,8,color);r(c,x+8,y+2,25,2,shade(color,28));fabric(c,x+8,y-17,23,16,color);fabric(c,x+7,y+4,27,8,color);r(c,x+11,y-6,18,1,shade(color,-12));}
function table(c,x,y,w,d,color=paper){
 for(const xx of [x+8,x+w-13]){r(c,xx,y+4,4,d+17,'#566258');r(c,xx,y+d+2,3,20,'#3b4a42');}
 interiorBlock(c,x,y,w,d,5,color);r(c,x+4,y-3,w-8,2,shade(color,23));woodGrain(c,x+3,y-1,w-6,d-4,color);r(c,x+4,y+d-5,w-8,1,shade(color,17));r(c,x+4,y+d,w-8,1,shade(color,-26));for(const xx of [x+9,x+w-13])r(c,xx,y+d+3,1,15,'#99a08a');
}
function shelf(c,x,y,w,accent,title){
 const wood='#b6a98e',groceries=['ПРОДУКТЫ','ПОДАРКИ'].includes(title);interiorBlock(c,x,y,w,27,83,paper);r(c,x+4,y-78,w-8,79,'#526052');r(c,x+5,y-76,w-10,76,'#746f5b');
 r(c,x+3,y-81,w-6,4,'#d2c7ae');r(c,x+4,y-77,3,78,'#c8bfa6');r(c,x+w-7,y-77,3,78,'#827e68');
 for(let row=0;row<3;row++){const yy=y-70+row*25;r(c,x+6,yy-1,w-12,20,'#596550');
  for(let i=0;i<Math.floor((w-16)/15);i++){const col=[accent,'#c9bd9b','#9bac89','#93a3af','#dedccf'][i%5],xx=x+9+i*15,height=15+(i+row)%4;
   if(groceries&&i%3===0){r(c,xx+2,yy+4,8,14,col);r(c,xx+3,yy+1,6,4,'#c0c7af');r(c,xx+3,yy+8,6,5,'#ede8d4');r(c,xx+4,yy+9,4,1,shade(col,-16));}
   else{r(c,xx,yy+18-height,9+(i%2)*2,height,col);r(c,xx+1,yy+19-height,2,height-2,shade(col,22));r(c,xx+4,yy+22-height,3,1,shade(col,-25));r(c,xx+4,yy+29-height,3,1,'#e9e4d5');r(c,xx+8,yy+20-height,1,height-3,shade(col,-22));}
  }
  r(c,x+4,y-48+row*25,w-8,4,wood);r(c,x+5,y-48+row*25,w-10,1,'#d3c9b0');woodGrain(c,x+7,y-47+row*25,w-14,3,wood);
 }
 r(c,x+4,y+5,w-8,16,'#bfbca9');r(c,x+5,y+5,w-10,2,'#dedbcc');r(c,x+w/2,y+7,1,13,'#939e87');for(const xx of [x+w/4,x+3*w/4]){r(c,xx-4,y+11,8,2,'#697d6c');r(c,xx-3,y+11,6,1,'#d0d7bb');}woodGrain(c,x+7,y+8,w-14,10,'#bfbca9');
 if(title)text(c,title,x+w/2,y-94,10);
}
function lamp(c,x,y){r(c,x-12,y+3,24,4,'#0002');r(c,x-1,y-64,3,66,'#606d64');r(c,x-13,y-66,26,5,'#f5f0dc');r(c,x-10,y-74,20,9,'#e1ddc9');r(c,x-7,y-76,14,3,'#faf7e9');r(c,x-9,y,18,4,'#6d796d');r(c,x-7,y,14,1,'#bac2ab');r(c,x-2,y-61,1,59,'#a7b19d');r(c,x-11,y-67,22,1,'#fff9db');r(c,x+8,y-74,2,8,'#b8b89e');}
function wallFrame(c,x,y,w,h,accent,title){r(c,x+3,y+3,w,h,'#0002');r(c,x,y,w,h,'#546059');r(c,x+3,y+3,w-6,h-6,paper);r(c,x+8,y+9,w-16,h-28,accent);for(let i=0;i<3;i++)r(c,x+12,y+15+i*7,Math.max(10,w-30-i*8),2,shade(accent,28));text(c,title,x+w/2,y+h-8,9);}
const mascot=drawPixelMascot;

export function drawInteriorGround(c,room){
 if(isExactSourceInterior(room)){drawExactSourceInterior(c,room);return;}
 if(drawSourceInteriorSurfaces(c,room))return;
 const [accent,floor,wall]=themes[room.kind]||themes.cafe,w=room.width,h=room.height,b=room.bounds;
 r(c,0,0,w,h,ink);
 const woodFloors={clanhall:'#d5cdc0',wardrobe:'#ded7ce',gallery:'#e0d8cb',cafe:'#d6c9b7',terrace:'#d1c9b9','furniture-store':'#d8cebe'};
 drawFloorMaterial(c,{x:b.left,y:b.top,width:b.right-b.left,height:b.bottom-b.top},woodFloors[room.kind]||shade(floor,12),woodFloors[room.kind]?'wood':'stone');
 // Functional floor zones are planes, never foreground obstacles.
 for(const z of room.zones||[]){
  const x=Math.max(b.left,z.x),y=Math.max(b.top,z.y),right=Math.min(b.right,z.x+z.width),bottom=Math.min(b.bottom,z.y+z.height);if(right<=x||bottom<=y)continue;
  const color=z.color||({carpet:shade(accent,10),wood:'#cec4b3',tile:'#e5e3dc',felt:'#b4c0b3',stone:'#deded7'}[z.material]||'#e8e5df');
  const plane={x,y,width:right-x,height:bottom-y};
  if(z.material==='wood'||z.material==='tile'||z.material==='stone')drawFloorMaterial(c,plane,color,z.material==='wood'?'wood':'stone');
  else{r(c,x,y,right-x,bottom-y,color);r(c,x+3,y+3,right-x-6,1,shade(color,20));r(c,x+3,bottom-4,right-x-6,1,shade(color,-15));if(z.material==='carpet'||z.material==='rug')fabric(c,x+5,y+5,right-x-10,bottom-y-10,color);}
  r(c,x,y,right-x,1,shade(color,-19));r(c,x,bottom-1,right-x,1,shade(color,-19));r(c,x,y,1,bottom-y,shade(color,-19));r(c,right-1,y,1,bottom-y,shade(color,-19));
 }
 // Modern painted wall and skirting, with a consistent shallow roof cutaway.
 r(c,b.left,6,b.right-b.left,70,wall);r(c,b.left,6,b.right-b.left,5,shade(wall,20));
 for(let xx=b.left+24;xx<b.right-24;xx+=90){r(c,xx,12,1,50,shade(wall,-6));r(c,xx+1,12,1,50,shade(wall,6));}
 r(c,b.left,65,b.right-b.left,10,shade(wall,-14));r(c,b.left,74,b.right-b.left,5,'#69756e');r(c,b.left,78,b.right-b.left,2,'#fff8');r(c,b.left,80,b.right-b.left,5,'#26372e15');
 r(c,b.left-10,6,10,b.bottom-6,shade(wall,-45));r(c,b.right,6,10,b.bottom-6,shade(wall,-65));r(c,b.left,b.bottom,b.right-b.left,8,'#626c66');
 const titleWidth=Math.min(b.right-b.left-250,Math.max(210,room.label.length*9+36));r(c,w/2-titleWidth/2,15,titleWidth,28,ink);r(c,w/2-titleWidth/2+2,17,titleWidth-4,2,accent);text(c,room.label,w/2,34,15,paper);
 for(const x of [70,w-176]){r(c,x,16,106,31,'#586d69');r(c,x+3,19,100,25,'#a1bcc0');r(c,x+5,19,44,3,'#dce7e3');r(c,x+51,18,3,27,'#637a71');r(c,x-2,47,111,5,'#eeeee2');r(c,x+5,24,44,2,'#d2dfd8');r(c,x+6,28,38,1,'#b7cfc8');r(c,x+57,33,36,2,'#c5d9d2');r(c,x-1,51,109,2,'#8b9e8a');poly(c,[[x+7,83],[x+88,83],[x+151,191],[x+17,191]],'#fff7d91c');}
 for(const cut of room.cutouts||[]){r(c,cut.x,cut.y,cut.width,cut.height,ink);r(c,cut.x+cut.width-7,cut.y,7,cut.height,'#879780');r(c,cut.x,cut.y+cut.height-7,cut.width,7,'#aab7a1');}
 const ex=room.exit.x,ey=room.exit.y;
 // Small entry mat stays at the actual doorway and leaves the aisle free.
 r(c,ex-44,ey-23,88,33,'#b7bcb7');r(c,ex-41,ey-20,82,27,'#89958b');for(let yy=ey-16;yy<ey+5;yy+=5)r(c,ex-37,yy,74,1,'#aab3aa');
 r(c,ex-35,b.bottom-11,70,20,'#e9e8df');r(c,ex-32,b.bottom-11,64,3,'#fff');text(c,'В ГОРОД ↓',ex,ey+14,10,'#46584b');
}
export function interiorObjects(room){
 if(isExactSourceInterior(room))return sourceInteriorExactObjects(room);
 const nodes=drawRoomProps(room);
 const staff=room.staff;
 if(room.modular_source&&staff?.source_asset&&staff.visual){
  const v=staff.visual,direction=staff.source_direction||'front',bounds=designDestination(resolveDesignAsset(staff.source_asset,direction),v.x,v.y,v.width,v.height,v);
  if(bounds)nodes.push({id:`${room.id}:mascot`,depth:staff.depth??staff.y,bounds,draw:c=>drawDesignAsset(c,staff.source_asset,v.x,v.y,v.width,v.height,{...v,direction})});
  return nodes;
 }
 if(staff)nodes.push({id:`${room.id}:mascot`,depth:staff.y,bounds:{x:staff.x-22,y:staff.y-75,width:50,height:82},draw:c=>{if(!drawDesignAsset(c,`mascot-location-${({railway:'railway',clans:'clan',arena:'mall',profile:'clothing',results:'mall',messages:'bar',terrace:'clan','shop-food':'food','shop-clothes':'clothing','shop-furniture':'furniture',casino:'casino'})[room.id]||'clan'}`,staff.x,staff.y,52,85))mascot(c,staff.x,staff.y);}});
 return nodes;
}
export function drawInteriorMiniMap(c,room,position,players=[]){
 const width=c.canvas?.width||192,height=c.canvas?.height||119,exact=isExactSourceInterior(room),fit=Math.min(width/room.width,height/room.height),sx=exact?fit:width/room.width,sy=exact?fit:height/room.height,ox=(width-room.width*sx)/2,oy=(height-room.height*sy)/2;
 c.clearRect(0,0,width,height);r(c,0,0,width,height,'#353d39');c.save();
 if(exact)drawExactSourceInteriorMiniMap(c,room,{width,height});
 else{c.scale(sx,sy);const b=room.bounds;r(c,b.left,b.top,b.right-b.left,b.bottom-b.top,'#edece5');
 for(const zone of room.zones||[])r(c,zone.x,zone.y,zone.width,zone.height,zone.color||'#d2d7cd');
 for(const solid of room.solids||[])r(c,solid.x,solid.y,solid.width,solid.height,'#6c7870');
 r(c,room.exit.x-26,room.exit.y-8,52,20,'#62cdb9');}c.restore();
 const marker=(p,radius,color)=>{if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))return;c.fillStyle=paper;c.beginPath();c.arc(ox+p.x*sx,oy+p.y*sy,radius+1,0,Math.PI*2);c.fill();c.fillStyle=color;c.beginPath();c.arc(ox+p.x*sx,oy+p.y*sy,radius,0,Math.PI*2);c.fill();};
 for(const p of players)marker(p,1.7,'#7d9de6');marker(position,2.5,ink);
}
export function drawFurnitureVolume(c,item,type,x,y,width,height,color=paper,selected=false){
 if(drawSourceFurniture(c,{...item,type,color},item.source_theme||'modern',{x,y,width,height,selected}))return;
 if(Object.hasOwn(item,'rotation'))return drawFacingFurniture(c,item,type,x,y,width,height,color,selected);
 if(selected){r(c,x,y,width-2,height-2,'#a0b7c044');r(c,x,y,width-2,2,'#749dac');}const premium=item.variant==='premium',mid=x+width/2;
 if(type==='rug'){r(c,x+3,y+3,width-8,height-8,shade(color,-20));r(c,x+7,y+7,width-16,height-16,color);for(let yy=y+13;yy<y+height-8;yy+=17)r(c,x+12,yy,width-24,1,shade(color,-12));return;}
 if(type==='sofa'||type==='armchair'){if(item.rotation===90&&type==='sofa')sofa(c,x+3,y+8,width-10,color,true);else sofa(c,x+3,y+height-31,width-10,color);}
 else if(type==='chair')chair(c,mid-20,y+height-27,color);
 else if(type==='plant')plant(c,mid,y+height-9,color);
 else if(type==='desk'||type==='dining-table'){table(c,x+5,y+height-31,width-14,25,color);if(type==='desk'){r(c,mid-20,y+height-64,39,26,'#45564a');r(c,mid-17,y+height-61,33,19,premium?'#9bacbb':'#adbbb0');r(c,mid-2,y+height-38,4,9,'#526456');r(c,mid-25,y+height-30,47,5,'#a3b4a2');}}
 else if(['bookcase','shelf'].includes(type))shelf(c,x+5,y+height-29,width-14,color,'');
 else if(type==='bed'){interiorBlock(c,x+5,y+15,width-14,height-24,17,'#8f9a88');r(c,x+9,y+8,width-22,26,paper);r(c,x+12,y+10,width-28,3,'#e2e3d7');r(c,x+9,y+37,width-22,height-49,color);fabric(c,x+13,y+44,width-30,height-60,color);r(c,x+11,y+28,width-26,1,'#d4d6c6');r(c,x+15,y+13,(width-32)/2,12,'#f3f1e3');r(c,mid+3,y+13,(width-32)/2,12,'#e4e5d8');r(c,x+13,y+41,width-30,3,shade(color,22));r(c,mid,y+41,1,height-56,shade(color,-12));}
 else if(type==='lamp')lamp(c,mid,y+height-8);
 else if(type==='board'){r(c,x+8,y+height-20,4,18,'#455d4a');r(c,x+width-17,y+height-20,4,18,'#455d4a');wallFrame(c,x+5,y+height-83,width-14,60,color,'');}
 else if(type==='tv'){interiorBlock(c,x+5,y+height-23,width-14,19,21,color);r(c,x+14,y+height-73,width-33,43,'#233c2b');r(c,x+18,y+height-69,width-41,33,'#889f91');r(c,x+22,y+height-66,width-49,3,'#bdc7b7');r(c,mid-4,y+height-30,8,10,'#344d3b');}
 else{interiorBlock(c,x+5,y+height-35,width-14,30,39,color);r(c,x+13,y+height-22,width-30,1,shade(color,-23));woodGrain(c,x+10,y+height-31,width-24,25,color);r(c,mid-2,y+height-19,4,3,'#627d65');}
 if(premium){r(c,x+width-14,y+4,6,5,'#c8bc8f');r(c,x+width-13,y+4,4,1,'#e1d8b7');}
}
