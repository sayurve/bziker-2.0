import {petEffectState} from './water.js';
import {drawSourceAnimalCanvas} from './source-actors.js';
import {drawSourceDock,drawSourceBoat} from './source-water.js';
const ink='#344840';
function rect(c,x,y,w,h,fill=ink){c.fillStyle=fill;c.fillRect(Math.round(x),Math.round(y),w,h);}
export function nearestBoatAction(boats,x,y,selfId){
 const boat=(boats||[]).filter(b=>!b.occupant_id||b.occupant_id===selfId).filter(b=>b.boarding&&Math.hypot(b.boarding.x-x,b.boarding.y-y)<=b.boarding.radius).sort((a,b)=>Math.hypot(a.boarding.x-x,a.boarding.y-y)-Math.hypot(b.boarding.x-x,b.boarding.y-y))[0];
 return boat?{id:boat.id,kind:'boat',x:boat.boarding.x,y:boat.boarding.y,radius:boat.boarding.radius,label:'Сесть в лодку'}:null;
}
export function drawDock(c,b){
 if(drawSourceDock(c,b))return;
 const x=b.boarding.x,y=b.boarding.y,dy=b.dock.y-y+12;rect(c,x-34,y-13,68,dy,'#6c6658');rect(c,x-30,y-10,60,dy-5,'#b8ac8e');
 for(let yy=y-8;yy<y+dy-4;yy+=13){rect(c,x-30,yy,60,2,'#ddd1ad');rect(c,x-30,yy+10,60,2,'#837b67');for(const xx of [x-25,x+22])rect(c,xx,yy+3,2,2,'#656659');}
 for(const yy of [y-5,y+dy-15])for(const xx of [x-39,x+31]){rect(c,xx,yy-5,8,25,'#5f6b5d');rect(c,xx+1,yy-5,6,3,'#b6b9a0');}
 rect(c,x+40,y-23,2,29,'#576c59');rect(c,x+36,y-35,36,20,'#faf8f2');c.fillStyle=ink;c.font='bold 9px monospace';c.textAlign='center';c.fillText(`Л${String(b.id).split('-').at(-1)}`,x+54,y-21);
}
export function drawBoat(c,b,time=0,front=false,reducedMotion=false){
 if(drawSourceBoat(c,b,time,front,reducedMotion))return;
 const x=b.x,y=b.y,bob=reducedMotion?0:b.occupant_id?Math.sin(time/500)*1.5:Math.sin(time/900+b.x)*.7;
 if(front){rect(c,x-35,y+12+bob,70,6,'#73664b');rect(c,x-27,y+18+bob,54,4,'#4d594e');rect(c,x-33,y+13+bob,66,2,'#d4c39b');return;}
 rect(c,x-48,y+10,96,8,'#536f7833');rect(c,x-32,y-24+bob,64,43,'#394e48');rect(c,x-43,y-16+bob,86,26,'#394e48');rect(c,x-47,y-6+bob,94,8,'#394e48');rect(c,x-28,y-20+bob,56,35,'#ad9871');rect(c,x-38,y-12+bob,76,20,'#c1ad84');rect(c,x-41,y-5+bob,82,7,'#c1ad84');
 for(let i=0;i<6;i++){rect(c,x-27+i*10,y-17+bob,2,28,'#8c7b5e');rect(c,x-24+i*10,y-18+bob,3,27,'#d4c19a');}
 rect(c,x-33,y-14+bob,66,6,'#705e46');rect(c,x-32,y-14+bob,64,2,'#ead8ac');rect(c,x-33,y+2+bob,66,6,'#7a664a');rect(c,x-31,y+2+bob,62,2,'#ddc799');
 const phase=b.moving&&!reducedMotion?Math.sin(time/180)*6:0;for(const side of [-1,1]){rect(c,x+side*37-2,y-7+phase,4,27,'#88775a');rect(c,x+side*37-5,y+15+phase,10,16,'#c8b38a');rect(c,x+side*37-5,y+15+phase,2,16,'#ece0b3');}
}
export function drawAnimal(c,p,effect=null,reducedMotion=false,now=Date.now()/1000){
 const active=petEffectState(effect,now),x=Math.round(p.x),y=Math.round(p.y);
 const drawReaction=()=>{if(active){const yy=y-45-(reducedMotion?0:active.progress*22);for(const [dx,dy] of [[-7,0],[11,-11]]){rect(c,x+dx,yy+dy,4,4,'#e88d78');rect(c,x+dx+6,yy+dy,4,4,'#e88d78');rect(c,x+dx-1,yy+dy+4,12,3,'#e88d78');rect(c,x+dx+2,yy+dy+7,6,3,'#e88d78');rect(c,x+dx+4,yy+dy+10,2,2,'#e88d78');}}};
 if(drawSourceAnimalCanvas(c,p,effect,reducedMotion,now)){drawReaction();return;}
 const facing=['up','down','left','right'].includes(p.facing)?p.facing:'left',side=facing==='left'||facing==='right',flip=facing==='right',walking=!!p.walking&&!active&&!reducedMotion,paw=walking?[0,2,0,-2][((p.walk_frame||0)%4+4)%4]:0;
 const reaction=!!active,tailFrame=reducedMotion?0:reaction?Math.floor((now-active.started_at)*8)%4:walking?Math.abs(p.walk_frame||0)%4:Math.floor(now*2)%4,tail=[0,2,0,-2][tailFrame];
 const box=(dx,dy,w,h,color)=>rect(c,x+(flip?-dx-w:dx),y+dy,w,h,color),outline='#445048',dark=p.kind==='dog'?'#80715f':'#78877b',body=p.kind==='dog'?(p.owned?'#cabf9f':'#b5a17d'):'#aebcad',light=p.kind==='dog'?'#e4d7b7':'#d6dfcf';
 rect(c,x-(side?21:14),y+5,side?42:28,6,'#0002');
 if(side){
  // Opposite pairs of paws step alternately; the face stays fixed to its head.
  for(const [dx,offset] of [[-10,paw],[7,-paw]]){box(dx+offset,0,5,9,dark);box(dx+offset-1,7,7,3,outline);}
  box(-16,-17,33,19,outline);box(-15,-17,31,17,body);box(-10,-16,24,4,light);box(-13,-3,5,10,body);box(9,-3,5,10,body);
  if(p.kind==='dog'){
   box(-24,-31,24,21,outline);box(-23,-30,22,19,body);box(-20,-29,15,4,light);box(-25,reaction?-32:-30,7,reaction?14:16,dark);box(-29,-17,11,7,outline);box(-27,-17,10,5,light);box(-29,-17,4,3,outline);box(-17,-24,3,3,outline);box(-15,-23,1,1,'#fff');
   if(reaction){box(-26,-12,6,2,outline);box(-24,-10,3,3,'#c99087');box(-17,-26,4,1,light);}
   box(14,-19,10,6,body);box(21,-22+tail,7,5,body);box(26,-26+tail,4,8,body);box(26,-26+tail,3,2,light);box(-6,-19,3,16,'#6b9e96');
  }else{
   box(-22,-27,22,19,outline);box(-21,-26,20,17,body);box(-22,reaction?-34:-32,6,reaction?12:10,outline);box(-21,-29,4,7,light);box(-7,reaction?-34:-32,6,reaction?12:10,outline);box(-6,-29,4,7,light);box(-20,reaction?-18:-19,3,reaction?1:3,outline);box(-9,reaction?-18:-19,3,reaction?1:3,outline);box(-16,-15,3,2,'#b98e85');box(-24,-15,9,1,light);box(-13,-15,9,1,light);
   box(13,-16,10,5,dark);box(21,-29+tail,5,17-tail,dark);box(24,-31+tail,5,5,dark);box(27,-28+tail,3,4,dark);box(23,-29+tail,2,4,light);box(-3,-16,2,11,light);box(4,-14,2,11,dark);
  }
 }else{
  for(const [dx,offset] of [[-9,paw],[5,-paw]]){box(dx,offset,5,9,dark);box(dx-1,7+offset,7,3,outline);}
  box(-13,-21,26,24,outline);box(-12,-21,24,22,body);box(-9,-19,18,5,light);
  if(facing==='up'){
   box(-11,-34,22,20,outline);box(-10,-33,20,18,body);box(-8,-31,16,4,light);box(-15,-30,6,13,dark);box(9,-30,6,13,dark);
   if(p.kind==='cat'){box(-11,reaction?-41:-39,6,reaction?12:10,outline);box(5,reaction?-41:-39,6,reaction?12:10,outline);box(-1+tail,-15,3,15,dark);box(-2+tail,-12,5,7,light);}
   else{box(-2+tail,0,5,11,body);box(-3,-15,6,3,'#6b9e96');if(reaction){box(-16,-32,6,6,dark);box(10,-32,6,6,dark);}}
  }else{
   box(-12,-34,24,22,outline);box(-11,-33,22,20,body);box(-7,-32,14,4,light);box(-15,-31,6,14,dark);box(9,-31,6,14,dark);
   if(p.kind==='cat'){box(-12,-39,6,10,outline);box(6,-39,6,10,outline);box(-11,-36,4,7,light);box(7,-36,4,7,light);}
   box(-7,reaction&&p.kind==='cat'?-24:-25,3,reaction&&p.kind==='cat'?1:3,outline);box(4,reaction&&p.kind==='cat'?-24:-25,3,reaction&&p.kind==='cat'?1:3,outline);box(-5,-20,10,6,light);box(-2,-20,4,3,p.kind==='dog'?outline:'#b98e85');box(-4,-13,8,2,p.kind==='dog'?'#6b9e96':light);
   if(p.kind==='dog'&&reaction){box(-3,-16,6,2,outline);box(-1,-15,3,3,'#c99087');}
   box(11+tail,-14,4,9,p.kind==='cat'?dark:body);box(13+tail,-17,5,4,p.kind==='cat'?dark:body);
  }
 }
 drawReaction();
}
