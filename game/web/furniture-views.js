// A facing changes the visible furniture planes; the upright pixel art is never
// rotated on the canvas. Coordinates are local so moving a prop preserves its art.
const paper='#faf8f2',wood='#827567';
const shade=(hex,n)=>/^#[0-9a-f]{6}$/i.test(hex)?'#'+hex.slice(1).match(/../g).map(v=>Math.max(0,Math.min(255,parseInt(v,16)+n)).toString(16).padStart(2,'0')).join(''):hex;

export function drawFacingFurniture(c,item,type,originX,originY,width,height,color=paper,selected=false){
 const rotation=[0,90,180,270].includes(item.rotation)?item.rotation:0;
 const facing=rotation/90,side=facing%2===1,w=width,h=height,mid=w/2,premium=item.variant==='premium';
 const r=(x,y,ww,hh,tone=color)=>{const rw=Math.round(ww),rh=Math.round(hh);if(rw<=0||rh<=0)return;c.fillStyle=tone;c.fillRect(Math.round(originX+x),Math.round(originY+y),rw,rh);};
 const plane=(points,tone)=>{c.fillStyle=tone;c.beginPath();c.moveTo(Math.round(originX+points[0][0]),Math.round(originY+points[0][1]));for(const [xx,yy]of points.slice(1))c.lineTo(Math.round(originX+xx),Math.round(originY+yy));c.closePath();c.fill();};
 const grain=(x,y,ww,hh,tone=color)=>{for(let yy=4;yy<hh-2;yy+=7){const offset=(yy*3)%9;r(x+3+offset,y+yy,Math.min(ww-8-offset,15+yy%11),1,shade(tone,-14));if(ww>38)r(x+ww-22,y+yy+2,12,1,shade(tone,13));}};
 const fabric=(x,y,ww,hh)=>{for(let yy=3;yy<hh-2;yy+=6)for(let xx=3+yy%4;xx<ww-3;xx+=8){r(x+xx,y+yy,2,1,shade(color,13));r(x+xx+1,y+yy+1,1,1,shade(color,-17));}};
 const block=(x,y,ww,dd,z,tone=color)=>{r(x,y-z,ww,dd,shade(tone,10));r(x,y+dd-z,ww,z,tone);plane([[x+ww,y-z],[x+ww+4,y-z+3],[x+ww+4,y+dd],[x+ww,y+dd]],shade(tone,-30));r(x+1,y-z,ww-2,2,shade(tone,30));r(x,y+dd-z,ww,1,shade(tone,-33));};
 const shadow=()=>{r(7,h-9,w-12,7,'#0000001d');r(11,h-3,w-18,3,'#00000010');};
 const feet=(x,y,ww,dd)=>{for(const xx of [x+4,x+ww-7]){r(xx,y+dd-2,4,9,'#45463f');r(xx,y+dd-2,1,7,'#7b7e72');}};
 const badge=()=>{if(premium){r(w-16,7,8,6,'#c8bc8f');r(w-15,7,6,1,'#f0e1b0');r(w-13,9,2,3,'#9b8353');}};
 const backPanel=(x,y,ww,hh)=>{r(x,y,ww,hh,shade(color,-24));r(x+3,y+2,ww-6,hh-4,color);r(x+3,y+2,ww-6,2,shade(color,27));fabric(x+5,y+6,ww-10,hh-11);r(x+ww/2,y+8,1,hh-14,shade(color,-18));r(x+3,y+hh-3,ww-6,1,shade(color,-38));};
 if(selected){r(1,1,w-2,h-2,'#a0b7c044');r(1,1,w-2,2,'#749dac');}
 if(type==='rug'){
  r(4,4,w-8,h-8,shade(color,-22));r(7,7,w-14,h-14,color);r(11,11,w-22,h-22,shade(color,13));r(14,14,w-28,h-28,color);
  for(let yy=21;yy<h-17;yy+=12)for(let xx=21;xx<w-17;xx+=16){r(xx,yy,4,1,shade(color,-17));r(xx+1,yy-1,2,3,shade(color,-17));}
  if(side){const fringeX=facing===1?5:w-7;for(let yy=12;yy<h-10;yy+=6)r(fringeX,yy,2,3,shade(color,25));r(facing===1?14:w-20,h/2-6,5,12,shade(color,-27));}
  else{const fringeY=facing===0?h-7:5;for(let xx=12;xx<w-10;xx+=6)r(xx,fringeY,3,2,shade(color,25));r(w/2-6,facing===0?h-21:14,12,5,shade(color,-27));}
  badge();return;
 }
 shadow();
 if(type==='sofa'||type==='armchair'){
  const count=type==='sofa'?2:1;
  if(!side){
   const bx=7,by=h-28,bw=w-18;
   feet(bx,by,bw,21);block(bx,by,bw,22,12);
   if(facing===0)backPanel(8,by-32,w-20,31);
   const seatW=(bw-16)/count;
   for(let i=0;i<count;i++){r(bx+7+i*seatW,by-8,seatW-3,17,color);r(bx+8+i*seatW,by-8,seatW-5,2,shade(color,28));fabric(bx+8+i*seatW,by-4,seatW-5,10);r(bx+8+i*seatW,by+7,seatW-6,1,shade(color,-23));}
   r(4,by-17,10,34,shade(color,-22));r(w-17,by-17,10,34,shade(color,-31));r(5,by-17,8,3,shade(color,29));r(w-16,by-17,8,3,shade(color,20));
   if(facing===2){backPanel(7,by-10,w-18,30);r(8,by-10,w-20,3,shade(color,18));}
  }else{
   const rightBack=facing===1,backX=rightBack?w-23:6,seatX=rightBack?7:24,bw=w-35,depth=h-17;
   feet(7,7,w-20,depth);block(7,8,w-19,depth,12);
   if(!rightBack)backPanel(backX,-13,17,depth+15);
   for(let i=0;i<count;i++){const yy=11+i*(depth-8)/count;r(seatX,yy-9,bw,(depth-8)/count-3,color);r(seatX+1,yy-9,bw-2,2,shade(color,30));fabric(seatX+2,yy-5,bw-4,(depth-8)/count-10);r(seatX+1,yy+(depth-8)/count-13,bw-2,1,shade(color,-24));}
   r(5,-5,w-17,10,shade(color,-18));r(6,-5,w-19,2,shade(color,24));r(5,h-26,w-17,12,shade(color,-25));r(6,h-26,w-19,2,shade(color,20));
   if(rightBack)backPanel(backX,-13,17,depth+15);
  }
 }else if(type==='chair'){
  const sx=side?(facing===1?7:23):15,sy=side?19:h-24,sw=side?35:w-31,sd=side?h-32:18;
  feet(sx,sy,sw,sd);block(sx,sy,sw,sd,8);fabric(sx+3,sy-4,sw-6,sd-3);
  if(!side){const by=facing===0?sy-33:sy-10;backPanel(sx+1,by,sw-2,27);if(facing===0){r(sx+6,by+6,sw-12,2,shade(color,-37));r(sx+6,by+11,sw-12,2,shade(color,-37));}else{r(sx+5,by+4,sw-10,2,shade(color,18));r(sx+sw/2,by+8,1,15,shade(color,-27));}}
  else{const backX=facing===1?sx+sw-5:sx;backPanel(backX,sy-28,7,sd+27);r(backX+2,sy-24,2,sd+17,shade(color,28));}
 }else if(type==='plant'){
  block(mid-12,h-22,24,16,17);r(mid-10,h-39,20,4,'#536146');r(mid-9,h-39,18,1,'#b9c7a7');r(mid-2,h-70,4,32,'#667e51');
  const offsets=[[-19,-63,16,9],[-10,-77,13,13],[3,-66,17,9],[3,-51,14,8],[-4,-86,10,16]];
  for(const [xx,yy,ww,hh]of offsets){const dx=facing===1?-xx-ww:facing===3?xx+4:xx;r(mid+dx,h+yy,ww,hh,'#608653');r(mid+dx+2,h+yy,ww-4,2,'#a5b783');r(mid+dx+2,h+yy+hh-3,ww-4,2,'#476a45');}
  const stripeX=[mid-8,mid+6,mid+1,mid-3][facing];r(stripeX,h-29,3,13,shade(color,24));r(mid-8,h-13,16,1,shade(color,-21));
 }else if(type==='desk'||type==='dining-table'){
  const fullDepth=side||type==='dining-table',tx=6,ty=fullDepth?17:h-35,tw=w-18,td=fullDepth?h-30:25;
  feet(tx,ty,tw,td+4);block(tx,ty,tw,td,8);grain(tx+3,ty-5,tw-6,td-3);
  if(type==='desk'){
   const mx=side?(facing===1?w-23:12):mid-21,my=side?26:h-48;
   if(side){r(mx,my-33,8,34,'#33433e');r(mx+(facing===1?0:4),my-30,3,27,facing===1?'#b4c6c0':'#4b5952');r(mx-1,my+1,10,3,'#65776a');r(mx+3,my,3,8,'#46584c');r(facing===1?14:28,my-4,18,19,'#bdc2b7');r(facing===1?16:30,my-3,14,2,paper);for(let yy=0;yy<3;yy++)r(facing===1?18:32,my+2+yy*4,10,1,'#798b7e');}
   else{r(mx,my-24,42,28,'#33433e');if(facing===0){r(mx+3,my-21,36,20,premium?'#91adc2':'#aac2b8');r(mx+6,my-19,28,2,'#dce8df');r(mx+6,my-14,18,2,'#829d93');}else{r(mx+3,my-21,36,20,'#586b62');r(mx+8,my-17,24,1,'#2e4135');r(mx+8,my-13,24,1,'#2e4135');r(mx+20,my-9,4,4,'#879d88');}r(mid-2,my+4,4,10,'#5e7566');r(mid-10,my+12,20,3,'#788f7a');r(mid-25,facing===0?ty+9:ty-5,49,6,'#bdc2b7');for(let xx=0;xx<6;xx++)r(mid-22+xx*7,facing===0?ty+11:ty-3,4,1,'#718173');}
  }else{
   const plateX=[mid-8,20,mid-8,w-30][facing],plateY=[ty+5,td/2,ty-1,td/2][facing];r(plateX,plateY,17,11,paper);r(plateX+3,plateY+2,11,7,'#d4d5c6');r(plateX+7,plateY+4,4,3,'#90a286');r(facing===1?w-25:12,ty+3,8,9,'#dcbd93');r(facing===1?w-24:13,ty+3,6,2,'#f0d7b1');
  }
 }else if(type==='bookcase'||type==='shelf'){
  const hh=type==='bookcase'?78:55,baseY=h-17;
  if(!side){
   block(6,h-30,w-18,22,hh);r(9,baseY-hh,w-24,hh-4,shade(color,-27));
   if(facing===0){
    const rows=type==='bookcase'?3:2,rowH=(hh-9)/rows;
    for(let row=0;row<rows;row++){const yy=baseY-hh+5+row*rowH;r(11,yy,w-28,rowH-5,'#4e5549');for(let i=0;i<Math.floor((w-31)/12);i++){const tone=[color,'#b8c49d','#90a3b7','#d0b99b'][i%4],bh=12+(i+row)%5;r(14+i*12,yy+rowH-5-bh,8+(i%2),bh,tone);r(15+i*12,yy+rowH-4-bh,1,bh-2,shade(tone,25));r(18+i*12,yy+rowH-1-bh,3,1,paper);}r(10,yy+rowH-4,w-26,3,shade(color,13));r(11,yy+rowH-4,w-28,1,shade(color,33));}
   }else{r(12,baseY-hh+3,w-30,hh-10,color);grain(13,baseY-hh+4,w-32,hh-13);r(mid,baseY-hh+5,2,hh-13,shade(color,-28));for(const yy of [baseY-hh+9,baseY-16]){r(15,yy,4,2,shade(color,-42));r(w-24,yy,4,2,shade(color,-42));}}
   r(9,h-21,w-24,8,color);r(10,h-21,w-26,1,shade(color,29));
  }else{
   const yy=8-hh,ww=w-21,dd=h-18;block(6,8,ww,dd,hh);r(facing===1?10:w-20,yy+4,8,dd-2,shade(color,-38));r(10,yy+4,ww-8,dd-6,color);grain(12,yy+6,ww-12,dd-11);r(facing===1?11:w-23,yy+8,2,dd-14,shade(color,-32));r(facing===1?15:w-19,yy+5,1,dd-9,shade(color,24));r(10,h-22,ww-8,6,shade(color,-16));
  }
 }else if(type==='bed'){
  const bx=6,by=13,bw=w-18,bd=h-24;feet(bx,by,bw,bd);block(bx,by,bw,bd,16,'#9d9483');
  r(bx+4,by-12,bw-8,bd-4,color);r(bx+6,by-12,bw-12,3,shade(color,27));fabric(bx+8,by-7,bw-16,bd-13);
  const pillow=(px,py,pw,ph)=>{r(px,py,pw,ph,paper);r(px+2,py+2,pw-4,2,'#e2e0d2');r(px+2,py+ph-3,pw-4,1,'#c8c8b9');};
  if(!side){const py=facing===0?by-9:h-38;pillow(bx+10,py,(bw-24)/2,17);pillow(mid+2,py,(bw-24)/2,17);const hy=facing===0?by-32:h-36;r(bx,hy,bw,25,wood);r(bx+3,hy+2,bw-6,3,'#b5a98b');grain(bx+4,hy+6,bw-8,14,wood);r(mid,by+17,1,bd-24,shade(color,-20));}
  else{const px=facing===1?w-37:bx+5;pillow(px,by+9,19,(bd-22)/2);pillow(px,h/2+2,19,(bd-22)/2);const hx=facing===1?w-27:bx;r(hx,by-25,15,bd+8,wood);r(hx+2,by-24,3,bd+5,'#b5a98b');grain(hx+5,by-20,8,bd-5,wood);r(bx+26,h/2,Math.max(6,bw-43),1,shade(color,-20));}
 }else if(type==='lamp'){
  r(mid-12,h-10,24,5,'#5a6158');r(mid-10,h-10,20,1,'#abb4a1');r(mid-1,h-80,3,69,'#626c61');r(mid,h-77,1,64,'#a8b39b');
  r(mid-15,h-85,30,9,color);r(mid-11,h-96,22,12,color);r(mid-7,h-100,14,5,shade(color,23));r(mid-13,h-85,26,2,'#efe9c9');r(mid+10,h-96,2,11,shade(color,-25));
  const switchX=[mid+4,mid+8,mid-4,mid-8][facing];r(switchX,h-73,2,11,'#838d75');r(switchX-1,h-63,4,4,'#c5c6a9');r(mid-4,h-13,8,2,'#808a78');
 }else if(type==='board'||type==='tv'){
  const z=type==='tv'?52:67,by=h-19;
  if(type==='tv'){block(6,side?13:h-29,w-18,side?h-24:21,22);grain(11,side?-5:h-42,w-29,side?h-31:13);r(mid-3,h-33,6,9,'#536057');}
  else{if(side){const legX=facing===1?w-21:18;r(legX,8,4,11,wood);r(legX,h-19,4,18,wood);r(legX+1,h-19,1,16,'#b9ad90');}else{r(12,by-7,4,20,wood);r(w-21,by-7,4,20,wood);r(13,by-7,1,18,'#b9ad90');r(w-20,by-7,1,18,'#b9ad90');}}
  if(!side){r(8,by-z,w-23,z-10,'#47584c');r(11,by-z+3,w-29,z-16,facing===0?(type==='tv'?'#819a92':paper):shade(color,-29));
   if(facing===0){if(type==='tv'){r(15,by-z+7,w-38,z-28,'#9ab0a4');r(18,by-z+10,w-45,2,'#d0dcd0');r(mid-10,by-z+16,27,2,'#6f928a');}else{for(let i=0;i<3;i++)r(17,by-z+11+i*10,w-43-i*10,2,color);r(w-33,by-z+7,8,7,'#f2ce61');}}
   else{r(12,by-z+4,w-31,2,color);grain(15,by-z+6,w-37,z-25);r(mid-13,by-z+13,26,2,'#303e33');r(mid-13,by-z+18,26,2,'#303e33');r(mid-5,by-z+28,10,6,shade(color,10));r(mid+2,by-9,2,7,'#526555');}
  }else{const xx=facing===1?w-25:14,screenH=h+z-(type==='tv'?39:25),screenBottom=6-z+screenH;r(xx,6-z,11,screenH,'#394b41');r(xx+2,8-z,7,screenH-4,facing===1?shade(color,-20):color);r(xx+(facing===1?0:8),10-z,2,screenH-8,facing===1?'#a9b8ac':'#27392d');r(xx+2,11-z,1,screenH-12,color);r(xx+2,screenBottom-3,7,2,'#788b79');if(type==='tv')r(xx+4,screenBottom,3,15,'#526555');}
 }else if(type==='counter'||type==='cabinet'){
  const by=side?13:h-35,dd=side?h-24:29,bw=w-19;block(6,by,bw,dd,35);grain(10,by-31,bw-8,dd-4);r(9,by-33,bw-6,3,shade(color,26));
  if(!side&&facing===0){for(let row=0;row<2;row++){r(11,by+dd-30+row*13,bw-10,11,color);r(12,by+dd-30+row*13,bw-12,1,shade(color,23));r(mid-4,by+dd-26+row*13,8,2,'#6a7967');}r(mid,by+dd-29,1,25,shade(color,-26));}
  else if(!side){r(12,by+dd-28,bw-12,23,color);grain(14,by+dd-27,bw-16,20);r(mid,by+dd-27,1,21,shade(color,-21));}
  else{r(facing===1?w-18:10,by-29,3,dd-5,shade(color,-25));r(facing===1?w-22:14,by-29,1,dd-7,shade(color,22));}
  if(type==='counter'){const registerX=side?(facing===1?13:w-35):facing===0?w-40:15,registerY=side?19:by-39;r(registerX,registerY,21,13,'#526357');r(registerX+3,registerY+2,15,6,facing===2?'#798379':'#b6c8b8');r(registerX+2,registerY+9,17,2,'#8e9c88');}
 }
 badge();
}

// Server seat points are floor/collision coordinates. A rear-facing seat has
// its feet on the far edge; the compressed seated sprite still hangs its calves
// down the screen. This local render offset aligns its hips with the cushion
// without moving the authoritative player or interaction point.
export function furnitureSeatVisualOffset(item){
 if(!['sofa','armchair','chair'].includes(item?.type))return {x:0,y:0};
 return ({90:{x:14,y:0},180:{x:0,y:36},270:{x:-6,y:0}})[item.rotation]||{x:0,y:0};
}

// Occupied seats are drawn between the furniture body and this near-facing
// layer. Only the armrest/backrest/apron is foreground, so heads and torsos
// cannot disappear behind an entire opaque furniture picture.
export function drawFacingFurnitureForeground(c,item,type,originX,originY,width,height,color=paper){
 if(!['sofa','armchair','chair'].includes(type))return;
 const facing=([0,90,180,270].includes(item.rotation)?item.rotation:0)/90,side=facing%2===1,w=width,h=height;
 const r=(x,y,ww,hh,tone=color)=>{const rw=Math.round(ww),top=Math.round(y),bottom=Math.round(y+hh),visibleTop=type==='chair'&&side?Math.max(23,top):top,rh=bottom-visibleTop;if(rw<=0||rh<=0)return;c.fillStyle=tone;c.fillRect(Math.round(originX+x),Math.round(originY+visibleTop),rw,rh);};
 const fabric=(x,y,ww,hh)=>{for(let yy=3;yy<hh-2;yy+=6)for(let xx=3+yy%4;xx<ww-3;xx+=8){r(x+xx,y+yy,2,1,shade(color,13));r(x+xx+1,y+yy+1,1,1,shade(color,-17));}};
 const backPanel=(x,y,ww,hh)=>{r(x,y,ww,hh,shade(color,-24));r(x+3,y+2,ww-6,hh-4,color);r(x+3,y+2,ww-6,2,shade(color,27));fabric(x+5,y+6,ww-10,hh-11);r(x+ww/2,y+8,1,hh-14,shade(color,-18));r(x+3,y+hh-3,ww-6,1,shade(color,-38));};
 if(type==='sofa'||type==='armchair'){
  if(!side){const by=h-28;if(facing===2){backPanel(7,by-10,w-18,30);r(8,by-10,w-20,3,shade(color,18));}else{r(4,by-17,10,34,shade(color,-22));r(w-17,by-17,10,34,shade(color,-31));r(5,by-17,8,3,shade(color,29));r(w-16,by-17,8,3,shade(color,20));r(7,h-9,w-18,3,shade(color,-17));}}
  else{const backX=facing===1?w-23:6,depth=h-17;backPanel(backX,-13,17,depth+15);r(5,h-26,w-17,12,shade(color,-25));r(6,h-26,w-19,2,shade(color,20));}
 }else{
  const sx=side?(facing===1?7:23):15,sy=side?19:h-24,sw=side?35:w-31,sd=side?h-32:18;
  if(facing===2){const by=sy-10;backPanel(sx+1,by,sw-2,27);r(sx+5,by+4,sw-10,2,shade(color,18));r(sx+sw/2,by+8,1,15,shade(color,-27));}
  else if(side){const backX=facing===1?sx+sw-5:sx;backPanel(backX,sy-28,7,sd+27);r(backX+2,sy-24,2,sd+17,shade(color,28));}
  else r(sx,sy+sd-2,sw,2,shade(color,-20));
 }
}
