import {sourceInteriorPropLayout,drawSourceInteriorProp,isExactSourceInterior} from './source-interiors.js';
// Each object owns a physical floor footprint; its front edge supplies draw order.
// Public room collisions and seats are described in interiors-map.json, never here.
const ink='#25292a', paper='#f5f5ee', steel='#9ca4a4', sage='#91aa93';
const goods=['#b6bea0','#b7a6ba','#99b3bd','#d3bd93','#c6a39a'];
export const supportedInteriorPropTypes=Object.freeze(['cashier','shelf','gondola','fridge','produce','rack','fitting','mirror','sofa','chair','table','desk','bookcase','board','slot','poker-table','plant','lamp','bin','poster','kiosk','bar','queue','display-bed','display-desk','trophy','bench','luggage','lockers','workbench','kitchen','display-case','stock-cart']);
const supported=new Set(supportedInteriorPropTypes);
const elevations={cashier:51,shelf:110,gondola:56,fridge:116,produce:32,rack:87,fitting:118,mirror:116,sofa:50,chair:52,table:27,desk:79,bookcase:126,board:108,slot:116,'poker-table':36,plant:87,lamp:108,bin:45,poster:90,kiosk:116,bar:75,queue:46,'display-bed':43,'display-desk':79,trophy:95,bench:43,luggage:42,lockers:122,workbench:48,kitchen:116,'display-case':74,'stock-cart':66};
function r(c,x,y,w,h,color=ink){x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);if(w<=0||h<=0)return;c.fillStyle=color;c.fillRect(x,y,w,h);}
function poly(c,points,color){c.fillStyle=color;c.beginPath();c.moveTo(Math.round(points[0][0]),Math.round(points[0][1]));for(const point of points.slice(1))c.lineTo(Math.round(point[0]),Math.round(point[1]));c.closePath();c.fill();}
function shade(color,delta){return '#'+color.slice(1).match(/../g).map(v=>Math.max(0,Math.min(255,parseInt(v,16)+delta)).toString(16).padStart(2,'0')).join('');}
function label(c,value,x,y,width,color=ink){if(!value||width<42)return;c.fillStyle=color;c.font='bold 8px monospace';c.textAlign='center';c.fillText(String(value).toUpperCase(),Math.round(x),Math.round(y),Math.round(width));}
function panelText(c,value,x,y,width,size=8,color=ink){if(width<18)return;c.fillStyle=color;c.font=`bold ${size}px monospace`;c.textAlign='center';c.fillText(value,Math.round(x),Math.round(y),Math.round(width));}
function shadow(c,p){r(c,p.x+4,p.y+p.height-2,p.width,7,'#25292a22');}
function stitches(c,x,y,w,h,color){for(let yy=y+4;yy<y+h-3;yy+=7)for(let xx=x+4;xx<x+w-3;xx+=9){r(c,xx,yy,2,1,shade(color,11));r(c,xx+1,yy+1,1,2,shade(color,-9));}}
function box(c,p,z,color,depth=Math.min(p.height,17)){
  const bottom=p.y+p.height,top=bottom-z;
  shadow(c,p);poly(c,[[p.x+p.width,top-depth],[p.x+p.width+5,top-depth+4],[p.x+p.width+5,bottom],[p.x+p.width,bottom]],shade(color,-37));
  r(c,p.x,top,p.width,z,shade(color,-18));r(c,p.x,top-depth,p.width,depth,color);r(c,p.x,top-depth,p.width,2,shade(color,26));r(c,p.x,top,p.width,2,ink);r(c,p.x,top,2,z,shade(color,17));r(c,p.x,bottom-3,p.width,3,shade(color,-37));
  return {bottom,top,back:top-depth};
}
function packet(c,x,y,w,h,color,kind='food',index=0){
  if(kind==='drinks'||(kind==='food'&&index%4===0)){
    r(c,x+2,y+4,w-4,h-4,color);r(c,x+3,y,w-6,5,shade(color,-30));r(c,x+2,y+5,w-4,2,shade(color,22));r(c,x+3,y+Math.max(8,h/2),w-6,4,paper);r(c,x+4,y+5,1,h-7,shade(color,28));
  }else if(kind==='books'){
    r(c,x,y,w,h,color);r(c,x+1,y+1,2,h-2,shade(color,23));r(c,x+w-2,y+1,1,h-2,shade(color,-30));r(c,x+4,y+3,Math.max(1,w-7),1,paper);r(c,x+3,y+h-4,Math.max(1,w-6),1,shade(color,-23));
  }else{
    r(c,x,y,w,h,shade(color,-26));r(c,x+1,y+1,w-2,h-2,color);r(c,x+2,y+2,w-4,2,shade(color,25));r(c,x+3,y+5,w-6,4,paper);r(c,x+4,y+7,w-8,1,shade(color,-23));r(c,x+2,y+h-4,w-4,1,shade(color,-15));
  }
}
function packages(c,x,y,w,h,category,color,row=0,compact=false){
  const gap=compact?3:4,itemWidth=category==='books'?9:compact?12:15,n=Math.max(1,Math.floor((w+gap)/(itemWidth+gap)));
  for(let i=0;i<n;i++){const iw=Math.min(itemWidth,w-i*(itemWidth+gap)),ih=Math.min(h,13+(i+row)%5),col=(i+row)%5===0?color:goods[(i+row)%goods.length];packet(c,x+i*(itemWidth+gap),y+h-ih,iw,ih,col,category,i+row);}
}
function shelf(c,p,books=false){
  const color=p.color,{top,bottom}=box(c,p,books?105:91,color,8);
  r(c,p.x+5,top+4,p.width-10,bottom-top-10,'#525a5c');
  const rowHeight=books?24:25;
  for(let row=0;row<3;row++){const yy=top+10+row*rowHeight;packages(c,p.x+10,yy,p.width-20,rowHeight-5,books?'books':p.category||'food',color,row);r(c,p.x+5,yy+rowHeight-4,p.width-10,4,shade(color,12));r(c,p.x+5,yy+rowHeight-4,p.width-10,1,paper);for(let tag=p.x+12;tag<p.x+p.width-12;tag+=26)r(c,tag,yy+rowHeight-3,11,2,'#e5e9e1');}
  r(c,p.x+5,bottom-14,p.width-10,9,shade(color,-8));r(c,p.x+7,bottom-13,p.width-14,1,shade(color,18));label(c,p.label,p.x+p.width/2,top-12,p.width-9);
}
function cashier(c,p){
  const {top,bottom}=box(c,p,30,p.color,p.height), belt=Math.max(25,p.width*.46);
  r(c,p.x+6,top-p.height+6,belt,p.height-12,'#535b5b');r(c,p.x+8,top-p.height+8,belt-4,p.height-16,'#717b7b');
  for(let yy=top-p.height+12;yy<top-5;yy+=8)r(c,p.x+9,yy,belt-6,1,'#535c5e');
  const registerX=p.x+p.width-50;
  r(c,registerX,top-p.height-21,35,24,ink);r(c,registerX+3,top-p.height-18,29,17,'#b0c1bf');r(c,registerX+5,top-p.height-16,23,2,'#e8efeb');r(c,registerX+14,top-p.height+3,5,10,steel);r(c,registerX-2,top-p.height+12,39,7,'#ced3ce');
  for(let i=0;i<6;i++)r(c,registerX+2+i*5,top-p.height+13,3,2,'#858e8c');
  r(c,registerX-27,top-p.height+13,14,20,'#3e4c4c');r(c,registerX-25,top-p.height+15,10,9,'#b1c5b8');r(c,registerX-23,top-p.height+28,6,2,paper);
  r(c,p.x+12,bottom-21,p.width-24,1,shade(p.color,-28));label(c,p.label||'КАССА',p.x+p.width/2,bottom-10,p.width-20);
}
function gondola(c,p){
  const {top}=box(c,p,24,p.color,p.height),w=p.width,h=p.height;
  r(c,p.x+w/2-3,top-h+4,6,h-9,'#606969');r(c,p.x+w/2-1,top-h+4,2,h-9,paper);
  for(let row=0,yy=top-h+8;yy<top-8;row++,yy+=27){
    for(const xx of [p.x+7,p.x+w/2+6]){const available=w/2-13;r(c,xx-2,yy-2,available+3,23,shade(p.color,-31));packages(c,xx,yy,available,19,p.category||'food',p.color,row,true);r(c,xx-2,yy+20,available+3,3,paper);for(let tag=xx;tag<xx+available-7;tag+=20)r(c,tag,yy+21,7,1,'#b2bcb6');}
  }
  r(c,p.x+4,top-4,w-8,3,shade(p.color,23));label(c,p.label,p.x+w/2,top+15,w-12);
}
function fridge(c,p){
  const {top,bottom}=box(c,p,94,p.color,12),n=Math.max(1,Math.floor(p.width/54)),doorWidth=(p.width-10)/n;
  for(let i=0;i<n;i++){
    const xx=p.x+5+i*doorWidth;r(c,xx,top+5,doorWidth-3,75,'#424d50');r(c,xx+3,top+8,doorWidth-9,69,'#a8bcbc');
    for(let row=0;row<3;row++){packages(c,xx+6,top+15+row*20,doorWidth-16,14,p.category==='frozen'?'food':p.category||'drinks',p.color,i+row);r(c,xx+4,top+30+row*20,doorWidth-12,2,'#e1e7df');}
    poly(c,[[xx+5,top+9],[xx+11,top+9],[xx+doorWidth-11,top+75],[xx+doorWidth-17,top+75]],'#e9f4ed65');r(c,xx+doorWidth-9,top+38,3,24,'#5f6f6f');r(c,xx+doorWidth-8,top+39,1,21,'#edf0e8');
  }
  r(c,p.x+1,top,2,bottom-top,'#667373');r(c,p.x+p.width-3,top,2,bottom-top,'#586968');r(c,p.x+4,bottom-16,p.width-8,1,'#546562');for(let xx=p.x+9;xx<p.x+p.width-8;xx+=7)r(c,xx,bottom-10,3,4,'#707e7a');label(c,p.label,p.x+p.width/2,top-17,p.width-10);
}
function produce(c,p){
  const {top}=box(c,p,23,p.color,p.height),cols=Math.max(1,Math.floor(p.width/46));
  for(let col=0;col<cols;col++){
    const xx=p.x+5+col*(p.width-10)/cols,w=(p.width-10)/cols-4;r(c,xx,top-p.height+5,w,p.height-11,'#646c58');r(c,xx+2,top-p.height+7,w-4,p.height-15,'#d8d4bc');
    for(let row=0;row<Math.max(1,Math.floor((p.height-12)/10));row++)for(let fruit=0;fruit<Math.max(1,Math.floor((w-6)/11));fruit++){
      const fx=xx+4+fruit*11,fy=top-p.height+9+row*10,colr=[sage,'#cbaa8f','#c5ba91'][col%3];r(c,fx+1,fy,7,8,colr);r(c,fx,fy+2,9,5,colr);r(c,fx+2,fy+1,3,2,shade(colr,22));r(c,fx+4,fy-1,1,2,'#617659');
    }
    r(c,xx+3,top-10,w-6,2,'#949b81');
  }
  label(c,p.label,p.x+p.width/2,top+15,p.width-12);
}
function garment(c,x,y,w,h,color){
  const mid=x+w/2;poly(c,[[mid-4,y],[mid+4,y],[x+w-2,y+7],[x+w,y+17],[x+w-6,y+20],[x+w-8,y+13],[x+w-8,y+h],[x+8,y+h],[x+8,y+13],[x+6,y+20],[x,y+17],[x+2,y+7]],shade(color,-30));
  poly(c,[[mid-4,y+2],[mid+4,y+2],[x+w-3,y+9],[x+w-1,y+15],[x+w-6,y+17],[x+w-9,y+12],[x+w-9,y+h-2],[x+9,y+h-2],[x+9,y+12],[x+6,y+17],[x+2,y+15],[x+4,y+9]],color);
  r(c,mid-3,y+2,6,3,shade(color,-32));r(c,x+10,y+10,2,h-15,shade(color,23));r(c,x+11,y+h-5,w-23,1,shade(color,-13));
}
function rack(c,p){
  shadow(c,p);const bottom=p.y+p.height,rod=bottom-68;
  for(const xx of [p.x+5,p.x+p.width-9]){r(c,xx,rod+1,4,65,'#565f61');r(c,xx+1,rod+2,1,60,'#d3dbd5');r(c,xx-5,bottom-5,14,5,'#737d7b');}
  r(c,p.x+6,rod,p.width-13,4,'#454f51');r(c,p.x+7,rod,p.width-15,1,'#c9d1cb');
  const count=Math.max(1,Math.floor((p.width-15)/27));
  for(let i=0;i<count;i++){const xx=p.x+10+i*(p.width-18)/count,cw=Math.min(30,(p.width-18)/count),color=i===0?p.color:goods[i%goods.length];poly(c,[[xx+cw/2,rod+3],[xx+cw/2-8,rod+12],[xx+cw/2+8,rod+12]],'#7d8984');garment(c,xx,rod+11,cw,43,color);}
  label(c,p.label,p.x+p.width/2,rod-8,p.width-10);
}
function fitting(c,p){
  const {top,bottom}=box(c,p,97,p.color,12);r(c,p.x+6,top+5,p.width-12,87,'#606d6b');
  const curtainWidth=p.width-18;r(c,p.x+9,top+10,curtainWidth,74,shade(p.color,14));
  for(let xx=p.x+13;xx<p.x+p.width-12;xx+=10){r(c,xx,top+10,3,72,shade(p.color,-15));r(c,xx+3,top+11,2,70,shade(p.color,29));}
  r(c,p.x+7,top+5,p.width-14,4,'#434e50');for(let xx=p.x+11;xx<p.x+p.width-12;xx+=12)r(c,xx,top+6,2,6,'#bbc5c1');r(c,p.x+9,bottom-13,curtainWidth,2,shade(p.color,-25));label(c,p.label||'ПРИМЕРОЧНАЯ',p.x+p.width/2,top-17,p.width-14);
}
function mirror(c,p){
  const {top}=box(c,p,95,p.color,6);r(c,p.x+5,top+5,p.width-10,78,'#677777');r(c,p.x+8,top+8,p.width-16,72,'#b3c8c7');
  poly(c,[[p.x+10,top+10],[p.x+18,top+10],[p.x+p.width-13,top+77],[p.x+p.width-22,top+77]],'#e8eeea');poly(c,[[p.x+28,top+10],[p.x+33,top+10],[p.x+p.width-10,top+43],[p.x+p.width-10,top+50]],'#d5e5df');r(c,p.x+8,top+82,p.width-16,2,'#687d79');
}
function sofa(c,p){
  const b=p.y+p.height,w=p.width,color=p.color;shadow(c,p);
  r(c,p.x+7,b-8,5,8,'#455051');r(c,p.x+w-12,b-8,5,8,'#455051');r(c,p.x+3,b-47,w-6,39,shade(color,-28));r(c,p.x+6,b-46,w-12,5,shade(color,18));
  r(c,p.x+9,b-40,w-18,20,color);stitches(c,p.x+10,b-40,w-20,18,color);
  const seats=Math.max(1,Math.floor(w/48)),sw=(w-24)/seats;
  for(let i=0;i<seats;i++){const xx=p.x+12+i*sw;r(c,xx,b-22,sw-3,14,shade(color,13));r(c,xx+2,b-21,sw-7,2,shade(color,29));r(c,xx+2,b-10,sw-7,1,shade(color,-13));stitches(c,xx+2,b-18,sw-7,7,color);}
  r(c,p.x,b-33,10,25,shade(color,-9));r(c,p.x+w-10,b-33,10,25,shade(color,-32));r(c,p.x+2,b-34,6,4,shade(color,31));r(c,p.x+w-8,b-34,6,4,shade(color,20));r(c,p.x+11,b-8,w-22,3,shade(color,-42));r(c,p.x+3,b-47,w-6,1,'#6a7872');r(c,p.x,b-30,1,23,'#67746e');r(c,p.x+w-1,b-30,1,23,'#53635f');for(let i=1;i<seats;i++)r(c,p.x+12+i*sw-2,b-20,1,10,'#687a70');
}
function chair(c,p){
  const b=p.y+p.height,x=p.x,w=p.width,color=p.color;shadow(c,p);r(c,x+5,b-11,4,11,'#4c595a');r(c,x+w-9,b-11,4,11,'#4c595a');
  if(p.facing==='up'){
    r(c,x+2,b-34,w-4,17,shade(color,7));r(c,x+4,b-33,w-8,2,shade(color,25));stitches(c,x+5,b-29,w-10,9,color);r(c,x+3,b-28,w-6,23,shade(color,-27));r(c,x+5,b-27,w-10,3,shade(color,17));r(c,x+7,b-22,w-14,10,color);stitches(c,x+8,b-21,w-16,8,color);r(c,x+5,b-7,w-10,1,shade(color,-20));return;
  }
  r(c,x+4,b-49,w-8,30,shade(color,-29));r(c,x+6,b-47,w-12,22,color);r(c,x+7,b-46,w-14,3,shade(color,28));stitches(c,x+8,b-41,w-16,12,color);
  r(c,x+1,b-24,w-2,17,shade(color,-20));r(c,x+3,b-24,w-6,12,shade(color,10));r(c,x+5,b-23,w-10,2,shade(color,26));r(c,x+5,b-13,w-10,1,shade(color,-12));
}
function tabletop(c,p,mid,yy){
  const theme=p.tabletop||'living-display';
  if(theme==='clan-map'){
    r(c,mid-30,yy-11,60,23,'#607f73');r(c,mid-27,yy-9,54,19,'#d4dec8');poly(c,[[mid-24,yy+5],[mid-13,yy-5],[mid-2,yy+2],[mid+9,yy-6],[mid+25,yy-1]],'#93ab92');r(c,mid-1,yy-7,2,16,'#829eae');r(c,mid-23,yy-1,43,2,'#b5a98a');for(const [dx,dy]of[[-18,-3],[6,4],[18,-4]]){r(c,mid+dx,yy+dy,4,4,'#b3918e');r(c,mid+dx+1,yy+dy,2,2,paper);}
  }else if(theme==='cafe-service'){
    for(const dx of[-22,12]){r(c,mid+dx-3,yy-6,21,13,'#bcc5b6');r(c,mid+dx-1,yy-8,16,11,paper);r(c,mid+dx+2,yy-9,10,7,'#deded0');r(c,mid+dx+4,yy-8,6,3,'#9b8068');r(c,mid+dx+11,yy-7,4,4,'#eeefe1');}r(c,mid-2,yy+2,9,10,'#cbba94');r(c,mid,yy+3,5,2,'#e4d1a6');r(c,mid-4,yy-12,12,8,'#7c9785');r(c,mid-2,yy-11,8,5,paper);
  }else if(theme==='studio-materials'){
    r(c,mid-27,yy-11,27,22,'#5f727c');r(c,mid-24,yy-8,21,16,'#c3d4cf');r(c,mid-22,yy-6,17,4,'#91aaa7');for(let i=0;i<5;i++)r(c,mid+5+i*5,yy-7,5,14,goods[i]);r(c,mid+5,yy+6,25,2,ink);r(c,mid+8,yy-12,17,2,'#acb1a0');
  }else if(theme==='creative-work'){
    r(c,mid-29,yy-12,33,24,'#697e76');r(c,mid-26,yy-9,27,18,'#e8e8da');r(c,mid-23,yy-7,21,2,'#9da98e');poly(c,[[mid-23,yy+6],[mid-15,yy-3],[mid-9,yy+3],[mid-2,yy-4],[mid-2,yy+6]],'#acb9a6');r(c,mid+12,yy-8,16,17,'#bdb7a0');for(let i=0;i<3;i++)r(c,mid+14+i*4,yy-14,2,20,goods[i]);r(c,mid+7,yy+9,23,2,ink);
  }else if(theme==='living-display'){
    r(c,mid-28,yy-5,25,13,'#8eaa9f');r(c,mid-27,yy-7,23,3,paper);r(c,mid-26,yy-4,21,1,'#c5d2c2');r(c,mid-25,yy+5,19,1,'#627d72');r(c,mid+10,yy-10,14,18,'#a5b69e');r(c,mid+8,yy-14,18,6,'#cbd4bb');r(c,mid+13,yy-20,2,7,'#6f8c69');r(c,mid+8,yy-21,8,4,'#90ac7e');r(c,mid+14,yy-25,9,4,'#6e8d6e');
  }
}
function table(c,p,decor=true){
  const bottom=p.y+p.height,top=bottom-26;shadow(c,p);
  for(const xx of [p.x+8,p.x+p.width-12]){r(c,xx,top+4,4,22,'#566261');r(c,xx+1,top+5,1,19,'#afb8b0');}
  poly(c,[[p.x+p.width,top-p.height],[p.x+p.width+5,top-p.height+3],[p.x+p.width+5,top+6],[p.x+p.width,top+3]],shade(p.color,-38));r(c,p.x,top-p.height,p.width,p.height,p.color);r(c,p.x,top,p.width,5,shade(p.color,-26));r(c,p.x,top-p.height,p.width,2,shade(p.color,24));
  r(c,p.x+4,top-p.height+4,p.width-8,1,shade(p.color,24));r(c,p.x+4,top-4,p.width-8,1,shade(p.color,-14));
  if(decor&&p.width>=65)tabletop(c,p,p.x+p.width/2,top-p.height/2);
  r(c,p.x+2,bottom-1,p.width-4,1,shade(p.color,-32));
}
function desk(c,p){
  table(c,p,false);const b=p.y+p.height,x=p.x+p.width/2-24,top=b-26-p.height;
  r(c,x,top-44,48,31,ink);r(c,x+3,top-41,42,24,'#aabbb8');r(c,x+6,top-38,35,3,'#edf0e6');for(let i=0;i<3;i++)r(c,x+7,top-31+i*4,23-i*3,1,'#819995');r(c,x+20,top-13,8,12,'#778581');r(c,x+13,top-3,23,3,'#acb6ad');
  r(c,x-4,top+12,48,13,'#bdc6bd');for(let row=0;row<3;row++)for(let col=0;col<9;col++)r(c,x-1+col*5,top+14+row*3,3,1,'#6f7d78');r(c,x+52,top+13,7,10,paper);r(c,p.x+8,top+8,15,19,'#646b6c');r(c,p.x+10,top+10,11,15,'#e4e4d8');r(c,p.x+12,top+12,7,1,'#99a99e');
  if(p.type==='display-desk'){r(c,p.x+p.width-34,b-9,26,8,paper);r(c,p.x+p.width-32,b-7,13,1,'#819383');r(c,p.x+p.width-15,b-7,5,3,p.color);}
  if(p.tabletop&&p.width>=140)tabletop(c,p,p.x+p.width-39,top+p.height/2);
}
function board(c,p){
  const b=p.y+p.height,top=b-90;
  if(p.solid!==false){shadow(c,p);r(c,p.x+8,b-19,4,19,'#5a6466');r(c,p.x+p.width-12,b-19,4,19,'#5a6466');}
  r(c,p.x,top,p.width,72,p.color);r(c,p.x+3,top+3,p.width-6,66,'#d9dfd5');r(c,p.x+7,top+7,p.width-14,2,'#f7f9ef');r(c,p.x+p.width-3,top+3,2,66,shade(p.color,-29));
  if(p.solid===false){for(const xx of [p.x+6,p.x+p.width-12]){r(c,xx,top+1,6,3,'#6d7c77');r(c,xx+2,top+1,2,1,'#c9d4c7');}}
  if(p.category==='timetable'){
    r(c,p.x+7,top+12,p.width-14,38,'#344a4a');for(let i=0;i<4;i++){const yy=top+18+i*8;panelText(c,['09:40  ЦЕНТР','10:15  КЛАНЫ','10:50  ОЗЕРО','11:20  БЗИКЕР'][i],p.x+p.width/2,yy,p.width-22,p.width<100?5:8,'#d7dfc5');r(c,p.x+9,yy+2,p.width-18,1,'#526b61');}
  }else if(p.category==='menu'){
    for(let i=0;i<3;i++){const yy=top+21+i*12;panelText(c,['КОФЕ · ЧАЙ','ВЫПЕЧКА','ДЕСЕРТЫ'][i],p.x+p.width/2,yy,p.width-22,8,'#69796c');r(c,p.x+11,yy+4,p.width-22,1,'#b5c1ad');}
  }else if(['questions','cards'].includes(p.category)){
    panelText(c,p.category==='questions'?'?':'♠ ♥ ♣ ♦',p.x+p.width/2,top+43,p.width-20,p.category==='questions'?31:19,'#788d81');r(c,p.x+9,top+48,p.width-18,2,'#a4b6a4');
  }else if(p.category==='results'){
    for(let i=0;i<3;i++){r(c,p.x+10,top+16+i*12,(p.width-24)*(1-i*.2),7,goods[i]);r(c,p.x+12,top+18+i*12,4,3,paper);}
  }else if(p.category==='clans'){
    r(c,p.x+9,top+12,p.width-18,35,'#b7c8ad');for(let i=0;i<3;i++){const xx=p.x+15+i*(p.width-38)/3;r(c,xx,top+17+i*6,13,9,goods[i]);r(c,xx+5,top+27+i*6,2,10,'#5d7967');}r(c,p.x+12,top+35,p.width-24,2,'#91a298');
  }else for(let i=0;i<3;i++){const xx=p.x+10+i*(p.width-25)/3;r(c,xx,top+15,(p.width-35)/3,26,goods[i]);r(c,xx+3,top+19,(p.width-47)/3,2,'#eff1e4');r(c,xx+3,top+25,(p.width-50)/3,1,'#71857b');r(c,xx+4,top+44,Math.max(3,(p.width-52)/3),2,'#7d9289');}label(c,p.label,p.x+p.width/2,top+59,p.width-16);
}
function slot(c,p){
  const {top,bottom}=box(c,p,99,p.color,12);r(c,p.x+5,top+6,p.width-10,12,'#ebdd9f');label(c,'БЗИКЕР',p.x+p.width/2,top+15,p.width-13,'#484f49');r(c,p.x+5,top+23,p.width-10,40,ink);r(c,p.x+8,top+26,p.width-16,34,'#d7ddce');
  const reels=(p.width-20)/3;for(let i=0;i<3;i++){const xx=p.x+10+i*reels;r(c,xx,top+29,reels-2,26,paper);label(c,['7','♦','7'][i],xx+(reels-2)/2,top+46,Math.max(42,reels-3),'#8c8771');r(c,xx+1,top+30,reels-4,2,'#cbd3c6');}
  r(c,p.x+7,top+68,p.width-14,11,shade(p.color,21));r(c,p.x+11,top+71,13,5,'#b3bb96');r(c,p.x+p.width-23,top+71,11,5,'#b3a8ba');r(c,p.x+p.width/2-10,bottom-12,20,3,ink);r(c,p.x+4,bottom-5,p.width-8,2,shade(p.color,23));
}
function poker(c,p){
  const {top}=box(c,p,15,p.color,p.height),octagon=(inset,cut)=>[[p.x+inset+cut,top-p.height+inset],[p.x+p.width-inset-cut,top-p.height+inset],[p.x+p.width-inset,top-p.height+inset+cut],[p.x+p.width-inset,top-inset-cut],[p.x+p.width-inset-cut,top-inset],[p.x+inset+cut,top-inset],[p.x+inset,top-inset-cut],[p.x+inset,top-p.height+inset+cut]];
  poly(c,octagon(1,9),'#354a47');poly(c,octagon(4,8),'#a7ad8e');poly(c,octagon(7,7),'#48675d');poly(c,octagon(10,6),'#7e9d91');
  r(c,p.x+17,top-p.height+11,p.width-34,1,'#b7c2a4');r(c,p.x+17,top-11,p.width-34,1,'#4a685e');r(c,p.x+18,top+8,7,7,'#526662');r(c,p.x+p.width-25,top+8,7,7,'#526662');const mid=p.x+p.width/2,yy=top-p.height/2;
  for(let i=0;i<3;i++){r(c,mid-28+i*19,yy-8,15,23,'#3a5450');r(c,mid-27+i*19,yy-10,14,21,paper);label(c,['♠','♥','♣'][i],mid-20+i*19,yy+4,42,i===1?'#9c7d72':ink);r(c,mid-25+i*19,yy-7,3,2,ink);}
  for(let i=0;i<3;i++){const xx=p.x+18+i*12;r(c,xx,top-18,9,5,goods[i]);r(c,xx+1,top-18,7,1,paper);r(c,xx+3,top-16,3,1,'#56645d');}label(c,p.label,p.x+p.width/2,top+11,p.width-20);
}
function plant(c,p){
  const x=p.x+p.width/2,b=p.y+p.height,color=p.color;shadow(c,p);r(c,x-13,b-22,26,17,shade(color,-24));r(c,x-10,b-23,20,18,color);r(c,x-14,b-25,28,5,shade(color,17));r(c,x-11,b-25,22,2,'#56675c');r(c,x-8,b-21,3,14,shade(color,29));r(c,x-8,b-7,17,1,shade(color,-16));
  r(c,x-2,b-65,4,40,'#657c60');for(const [dx,dy,w,h]of [[-23,-60,20,11],[-19,-77,17,10],[1,-65,22,10],[4,-44,19,10],[-5,-86,12,18]]){r(c,x+dx+2,b+dy,w-4,h,sage);r(c,x+dx,b+dy+2,w,h-4,'#6f916f');r(c,x+dx+3,b+dy+2,w-7,2,'#adc2a3');r(c,x+dx+6,b+dy+5,w-10,1,'#5a795e');}
}
function lamp(c,p){
  const x=p.x+p.width/2,b=p.y+p.height,color=p.color;shadow(c,p);r(c,x-2,b-89,4,83,'#5b6968');r(c,x-1,b-88,1,80,'#c2cdc3');r(c,x-14,b-7,28,5,shade(color,-26));r(c,x-12,b-8,24,2,color);
  r(c,x-18,b-90,36,7,shade(color,-18));r(c,x-14,b-103,28,16,color);r(c,x-11,b-104,22,3,shade(color,25));r(c,x-12,b-98,24,1,'#f3efdc');r(c,x-14,b-88,28,2,'#fff3cf');r(c,x+11,b-100,2,10,shade(color,-22));
}
function bin(c,p){
  const {top,bottom}=box(c,p,34,p.color,8);r(c,p.x+4,top-2,p.width-8,6,'#5a6967');r(c,p.x+7,top-1,p.width-14,2,ink);r(c,p.x+4,top+8,2,bottom-top-12,shade(p.color,26));r(c,p.x+p.width-7,top+7,2,bottom-top-11,shade(p.color,-30));r(c,p.x+8,top+12,p.width-16,7,'#dde3d7');label(c,'↻',p.x+p.width/2,top+19,42,'#6c8575');
}
function poster(c,p){
  const b=p.y+p.height,top=b-80;shadow(c,p);r(c,p.x,top,p.width,76,p.color);r(c,p.x+3,top+3,p.width-6,70,paper);r(c,p.x+8,top+8,p.width-16,34,shade(p.color,24));
  poly(c,[[p.x+10,top+38],[p.x+p.width/3,top+22],[p.x+p.width/2,top+30],[p.x+p.width-10,top+16],[p.x+p.width-10,top+38]],shade(p.color,-10));r(c,p.x+11,top+48,p.width-22,2,'#65767b');r(c,p.x+15,top+53,p.width-30,1,'#9aa9a1');r(c,p.x+17,top+57,p.width-34,1,'#b5bfb5');for(const xx of [p.x+1,p.x+p.width-3]){r(c,xx,top+1,2,2,shade(p.color,-25));r(c,xx,top+73,2,2,shade(p.color,-25));}label(c,p.label,p.x+p.width/2,top+65,p.width-14);
}
function kiosk(c,p){
  const {top,bottom}=box(c,p,96,p.color,11);r(c,p.x+5,top+7,p.width-10,47,ink);r(c,p.x+8,top+10,p.width-16,40,'#a4bbb4');for(let i=0;i<4;i++){r(c,p.x+12,top+16+i*7,p.width-24,4,i===0?'#edf1e3':'#c5d3c6');r(c,p.x+16,top+18+i*7,p.width-34,1,'#6e8b80');}r(c,p.x+9,top+61,p.width-18,5,'#485b5a');r(c,p.x+p.width/2-10,top+62,20,1,'#afbcb0');r(c,p.x+8,bottom-13,p.width-16,3,shade(p.color,21));label(c,p.label,p.x+p.width/2,top-14,p.width-8);
}
function bar(c,p){
  const {top,bottom}=box(c,p,31,p.color,p.height),x=p.x+12,back=top-p.height;
  r(c,x,back-39,47,39,'#424d50');r(c,x+4,back-35,39,18,steel);r(c,x+7,back-32,31,3,'#dce5d8');r(c,x+14,back-16,3,13,'#b7c8ba');r(c,x+30,back-16,3,13,'#b7c8ba');r(c,x+7,back-3,32,3,'#697676');
  for(let i=0;i<Math.min(4,Math.floor((p.width-75)/26));i++){const xx=p.x+75+i*26;r(c,xx,back+13,16,12,paper);r(c,xx+3,back+12,10,3,'#8b7e6d');r(c,xx+15,back+15,3,5,'#dae0d6');r(c,xx+2,back+15,2,7,'#fffdf2');}
  for(let xx=p.x+10;xx<p.x+p.width-8;xx+=24)r(c,xx,bottom-23,1,14,shade(p.color,-20));label(c,p.label||'КОФЕ',p.x+p.width/2,bottom-10,p.width-16);
}
function queue(c,p){
  shadow(c,p);const b=p.y+p.height;for(const xx of [p.x+5,p.x+p.width-10]){r(c,xx,b-40,5,34,'#85948e');r(c,xx+1,b-39,1,30,'#dce2d5');r(c,xx-4,b-7,13,5,p.color);r(c,xx-1,b-43,7,5,'#65756e');}r(c,p.x+8,b-36,p.width-15,4,p.color);r(c,p.x+10,b-36,p.width-19,1,shade(p.color,19));
}
function bed(c,p){
  const b=p.y+p.height,w=p.width,color=p.color;box(c,p,16,color,p.height);r(c,p.x+3,p.y-23,w-6,20,shade(color,-27));r(c,p.x+6,p.y-21,w-12,3,shade(color,23));r(c,p.x+5,p.y-10,w-10,p.height-10,'#e6e8dd');
  const pillowWidth=(w-20)/2;for(const xx of [p.x+8,p.x+w/2+3]){r(c,xx,p.y-6,pillowWidth,20,paper);r(c,xx+2,p.y-5,pillowWidth-4,2,'#fffef7');r(c,xx+3,p.y+10,pillowWidth-6,1,'#c7d0c3');}
  r(c,p.x+5,p.y+19,w-10,p.height-31,color);r(c,p.x+7,p.y+20,w-14,4,shade(color,23));stitches(c,p.x+9,p.y+26,w-18,p.height-42,color);r(c,p.x+8,b-11,w-16,2,shade(color,-20));r(c,p.x+w/2,p.y+24,1,p.height-37,shade(color,-13));r(c,p.x+6,b-9,w-12,5,shade(color,-34));
}
function trophy(c,p){
  const {top}=box(c,p,21,p.color,Math.min(p.height,25)),mid=p.x+p.width/2,y=top-4;
  r(c,mid-19,y-51,38,8,'#d4c58e');r(c,mid-15,y-43,30,25,'#b7a877');r(c,mid-12,y-43,7,22,'#e2d7a3');r(c,mid-24,y-42,7,16,'#baac7c');r(c,mid+17,y-42,7,16,'#a2956c');r(c,mid-22,y-27,9,4,'#baac7c');r(c,mid+13,y-27,9,4,'#a2956c');r(c,mid-4,y-18,8,13,'#a8996d');r(c,mid-17,y-5,34,5,'#d4c58e');r(c,mid-12,y+1,24,3,'#4f5e57');label(c,p.label,p.x+p.width/2,top+14,p.width-10);
}
function bench(c,p){
  const b=p.y+p.height,color=p.color;shadow(c,p);for(const xx of [p.x+9,p.x+p.width-15]){r(c,xx,b-39,4,39,'#506060');r(c,xx+1,b-36,1,34,'#a4b2a6');}
  for(let i=0;i<3;i++){r(c,p.x+2,b-39+i*8,p.width-4,6,color);r(c,p.x+3,b-39+i*8,p.width-6,1,shade(color,22));r(c,p.x+4,b-34+i*8,p.width-8,1,shade(color,-21));}r(c,p.x,b-14,p.width,9,shade(color,-24));r(c,p.x+2,b-16,p.width-4,8,color);for(let xx=p.x+7;xx<p.x+p.width-5;xx+=25)r(c,xx,b-38,2,2,'#5b6d65');
}
function luggage(c,p){
  const {top,bottom}=box(c,p,30,p.color,Math.min(p.height,15));r(c,p.x+p.width/2-9,top-9,18,6,ink);r(c,p.x+p.width/2-6,top-7,12,3,paper);r(c,p.x+6,top+2,3,bottom-top-5,shade(p.color,28));r(c,p.x+p.width-10,top+3,2,bottom-top-5,shade(p.color,-28));r(c,p.x+4,bottom-4,5,4,'#445454');r(c,p.x+p.width-10,bottom-4,5,4,'#445454');r(c,p.x+p.width/2-9,top+9,18,10,'#d9dacf');r(c,p.x+p.width/2-6,top+11,11,2,'#a1b0a5');
}
function lockers(c,p){
  const {top,bottom}=box(c,p,105,p.color,9),cols=Math.max(1,Math.floor(p.width/35)),cw=(p.width-8)/cols;
  for(let row=0;row<3;row++)for(let col=0;col<cols;col++){const x=p.x+4+col*cw,y=top+5+row*31;r(c,x,y,cw-2,29,'#566969');r(c,x+2,y+2,cw-6,25,shade(p.color,row%2?12:3));r(c,x+3,y+3,cw-8,2,shade(p.color,27));r(c,x+cw-9,y+13,2,6,ink);r(c,x+cw-12,y+12,2,2,'#d9dfd4');for(let i=0;i<3;i++)r(c,x+4+i*4,y+21,2,1,'#6d807a');panelText(c,String(row*cols+col+1).padStart(2,'0'),x+cw/2,y+10,cw-7,6,ink);}
  r(c,p.x+4,bottom-7,p.width-8,3,'#637671');label(c,p.label||'КАМЕРЫ ХРАНЕНИЯ',p.x+p.width/2,top-15,p.width-8);
}
function workbench(c,p){
  table(c,p,false);const yy=p.y+p.height-26-p.height/2;
  r(c,p.x+5,yy-12,p.width-10,25,'#728c7e');for(let xx=p.x+10;xx<p.x+p.width-8;xx+=13)r(c,xx,yy-10,1,21,'#9aafa0');for(let y=yy-7;y<yy+11;y+=7)r(c,p.x+7,y,p.width-14,1,'#9aafa0');
  if(p.width>=65){tabletop(c,{...p,tabletop:p.tabletop||'creative-work'},p.x+p.width/2,yy);r(c,p.x+7,yy+3,23,5,'#bfae8e');r(c,p.x+9,yy+4,19,1,paper);r(c,p.x+p.width-23,yy-14,14,9,'#566d75');r(c,p.x+p.width-21,yy-13,10,3,'#a9bfc1');}label(c,p.label||'МАСТЕРСКАЯ',p.x+p.width/2,p.y+p.height-9,p.width-10);
}
function kitchen(c,p){
  const {top,bottom}=box(c,p,46,p.color,Math.min(p.height,32)),back=top-Math.min(p.height,32),hood=Math.min(72,p.width-8);r(c,p.x+4,back-57,hood,14,'#667976');r(c,p.x+6,back-56,hood-4,3,'#c1cfc4');r(c,p.x+8,back-42,hood-8,4,'#e7e3c4');
  r(c,p.x+5,back+5,p.width-10,Math.min(21,p.height-10),'#435a5a');for(let i=0;i<Math.max(1,Math.floor((p.width-12)/35));i++){const x=p.x+9+i*35;r(c,x,back+8,17,10,'#7f928c');r(c,x+3,back+10,11,6,ink);r(c,x+5,back+11,7,2,'#abbba9');}for(let x=p.x+8;x<p.x+p.width-14;x+=37){r(c,x,top+6,27,31,'#aab7ab');r(c,x+2,top+8,23,2,'#d7ddce');r(c,x+19,top+13,5,2,ink);}r(c,p.x+4,bottom-6,p.width-8,3,'#5c7069');label(c,p.label||'КУХНЯ',p.x+p.width/2,back-60,p.width-8);
}
function displayCase(c,p){
  const {top}=box(c,p,28,p.color,p.height);r(c,p.x+3,top-p.height-31,p.width-6,p.height+29,'#c1d3cf');r(c,p.x+3,top-p.height-31,p.width-6,3,'#617e7d');r(c,p.x+3,top-3,p.width-6,3,'#627b74');
  for(let row=0;row<2;row++){const yy=top-p.height-20+row*20;r(c,p.x+5,yy+13,p.width-10,2,paper);for(let xx=p.x+8;xx<p.x+p.width-14;xx+=24){r(c,xx,yy+5,16,7,'#bc9f7e');r(c,xx+2,yy+2,12,5,'#d8c8a5');r(c,xx+3,yy+3,5,2,'#f0e4be');r(c,xx+1,yy+12,18,2,'#e6eadb');}}poly(c,[[p.x+7,top-p.height-25],[p.x+11,top-p.height-25],[p.x+p.width-9,top-7],[p.x+p.width-13,top-7]],'#e8f0e56a');label(c,p.label||'ВЫПЕЧКА',p.x+p.width/2,top+19,p.width-8);
}
function stockCart(c,p){
  const {top,bottom}=box(c,p,18,p.color,Math.min(p.height,25));for(const dx of[4,p.width-11]){r(c,p.x+dx,bottom-2,7,5,ink);r(c,p.x+dx+2,bottom-1,3,2,'#9cada0');}r(c,p.x+3,top-34,4,36,'#6c8077');r(c,p.x+3,top-34,Math.min(24,p.width-6),3,'#b3c5b7');
  r(c,p.x+10,top-29,p.width-17,24,'#a9a18c');r(c,p.x+12,top-27,p.width-21,2,'#ded7bc');r(c,p.x+p.width/2-2,top-29,4,24,'#e3dcc2');r(c,p.x+14,top-19,Math.min(19,p.width-24),6,paper);r(c,p.x+15,top-18,Math.min(15,p.width-26),1,'#8f9f8f');label(c,p.label||'СКЛАД',p.x+p.width/2,bottom-5,p.width-8);
}
const painters={cashier,shelf,gondola,fridge,produce,rack,fitting,mirror,sofa,chair,table,desk,bookcase:(c,p)=>shelf(c,p,true),board,slot,'poker-table':poker,plant,lamp,bin,poster,kiosk,bar,queue,'display-bed':bed,'display-desk':desk,trophy,bench,luggage,lockers,workbench,kitchen,'display-case':displayCase,'stock-cart':stockCart};
export function drawRoomProps(room){
 if(isExactSourceInterior(room))return [];
 if(room?.modular_source)return (room.props||[]).flatMap(prop=>{
  const native=sourceInteriorPropLayout(prop,room);if(!native)return [];
  return [{id:`${room.id}:${prop.id}`,depth:native.depth,bounds:native.bounds,footprint:native.footprint,draw:c=>drawSourceInteriorProp(c,prop,room)}];
 });
  return (room?.props||[]).filter(p=>p&&supported.has(p.type)&&[p.x,p.y,p.width,p.height].every(Number.isFinite)&&p.width>0&&p.height>0).map(source=>{
    const p={...source,color:/^#[0-9a-f]{6}$/i.test(source.color||'')?source.color:paper},elevation=elevations[p.type];
    const side=p.type==='cashier'?Math.max(16,86-p.width):['desk','display-desk'].includes(p.type)?Math.max(16,72-p.width):p.type==='poker-table'?Math.max(16,64-p.width):p.type==='bar'?Math.max(16,76-p.width):16;
    const native=sourceInteriorPropLayout(p,room),legacy={x:p.x-side,y:p.y-elevation-10,width:p.width+side*2,height:p.height+elevation+20};const bounds=native?{x:Math.min(native.bounds.x,legacy.x),y:Math.min(native.bounds.y,legacy.y),width:Math.max(native.bounds.x+native.bounds.width,legacy.x+legacy.width)-Math.min(native.bounds.x,legacy.x),height:Math.max(native.bounds.y+native.bounds.height,legacy.y+legacy.height)-Math.min(native.bounds.y,legacy.y)}:legacy;
    return {id:`${room.id}:${p.id}`,depth:p.y+p.height,bounds,draw:c=>{if(!drawSourceInteriorProp(c,p,room))painters[p.type](c,p);}};
  });
}
