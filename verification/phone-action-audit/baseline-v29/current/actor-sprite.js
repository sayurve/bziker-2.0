import {actorAtlasData as reference} from './actor-atlas-data.js';
import {actorCustomData as custom} from './actor-custom-data.js';
import {actorHairData as hairstyles} from './actor-hair-data.js';
import {actionPoseState} from './action-effects.js';

// Every visible material starts with a sampled pixel of the approved artwork.
// The original face is never reconstructed from geometric drawing primitives.
export const actorGeometry=Object.freeze({width:48,height:64,anchorX:24,anchorY:63,walkFrames:8});
// Catalog and action coordinates retain their original40px design space.
// Four transparent pixels on each side make room for the complete wide stride.
const W=48,H=64,PAD=4,X0=-PAD,X1=W-PAD,index=(x,y)=>y*W+x+PAD;
const cache=new Map(),rgbCache=new Map(),tintCache=new Map();
const rgb=c=>{if(!rgbCache.has(c))rgbCache.set(c,[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)));return rgbCache.get(c);};
const hex=v=>'#'+v.map(n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0')).join('');
const hair=c=>{const [r,g,b]=rgb(c);return r>g*1.15&&g>b*1.06;};
const skin=c=>{const [r,g,b]=rgb(c);return r>100&&r-g>26&&g-b>13;};
const gray=c=>{const v=rgb(c);return Math.max(...v)-Math.min(...v)<22;};
function shade(c,target,kind){
 const key=c+target+kind;if(tintCache.has(key))return tintCache.get(key);
 const v=rgb(c),t=rgb(target),l=v[0]*.26+v[1]*.57+v[2]*.17;
 const base=kind==='skin'?170:kind==='hair'?63:kind==='shoes'?38:kind==='pants'?36:80;
 const ratio=Math.max(.20,l/base),light=Math.max(0,ratio-1)*22;
 const out=hex(t.map(n=>n*Math.min(1.5,ratio)+light));tintCache.set(key,out);return out;
}
const decode=(frame,palette)=>{
 const pixels=frame.normalizedPixels,width=pixels.length/H,g=Array(W*H).fill(null),pad=(W-width)/2;
 for(let y=0;y<H;y++)for(let x=0;x<width;x++){const i=pixels[y*width+x];if(i)g[y*W+x+pad]=palette[i];}
 return g;
};
const at=(g,x,y)=>x>=X0&&y>=0&&x<X1&&y<H?g[index(x,y)]:null;
const set=(g,x,y,c)=>{if(x>=X0&&y>=0&&x<X1&&y<H)g[index(x,y)]=c;};
function patch(g,source,sx,sy,sw,sh,dx,dy,dw=sw,dh=sh){
 for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){const c=at(source,sx+Math.floor(x*sw/dw),sy+Math.floor(y*sh/dh));if(c)set(g,dx+x,dy+y,c);}
}
function transformRows(g,from,to,scale=1,shift=0){
 const copy=[...g];for(let y=from;y<to;y++)for(let x=X0;x<X1;x++)set(g,x,y,null);
 for(let y=from;y<to;y++)for(let x=X0;x<X1;x++){const c=at(copy,Math.round(20+(x-20)/scale),y);if(c)set(g,x,y+shift,c);}
}
function faceMask(g,a,facing){
 const mask=Array(W*H).fill(false),offset=a.gender===1?5:0;
 for(let y=9+offset;y<22+offset;y++){
  const xs=[];for(let x=X0;x<X1;x++){const c=at(g,x,y);if(c){const [r,green,b]=rgb(c);if(r>180&&r-green>30&&green-b>15)xs.push(x);}}
  if(facing==='up'){for(const x of xs)for(let xx=x-1;xx<=x+1;xx++)if(xx>=X0&&xx<X1)mask[index(xx,y)]=true;}
  else if(xs.length)for(let x=Math.max(X0,Math.min(...xs)-1);x<=Math.min(X1-1,Math.max(...xs)+1);x++)mask[index(x,y)]=true;
 }
 return mask;
}
function hairstyle(g,a,facing){
 const face=faceMask(g,a,facing),original=[...g],mask=Array(W*H).fill(false),offset=a.gender===1?5:0;
 if(a.hairStyle===0){
  for(let y=0;y<22+offset;y++)for(let x=X0;x<X1;x++){const c=at(g,x,y);if(c&&!face[index(x,y)]&&(y<9+offset||hair(c)))mask[index(x,y)]=true;}
  return mask;
 }
 const style=['short','bob','curly','bun','crew','part','long','tail','pixie','mohawk','twobuns','wavy'][a.hairStyle],frame=hairstyles.frames[style][facing];
 // Preserve the complete face and shoulders. Replace only the old hair silhouette.
 for(let y=0;y<22+offset;y++)for(let x=X0;x<X1;x++){
  const c=at(original,x,y);if(!face[index(x,y)]&&c&&(y<9+offset||hair(c)))set(g,x,y,null);
 }
 for(let y=0;y<40;y++)for(let x=0;x<40;x++){
  const i=frame.hairPixels[y*40+x],dy=y+offset;if(i&&dy<H){set(g,x,dy,hairstyles.palette[i]);mask[index(x,dy)]=true;}
 }
 for(let y=0;y<22+offset;y++)for(let x=X0;x<X1;x++)if(face[index(x,y)]){set(g,x,y,at(original,x,y));mask[index(x,y)]=false;}
 return mask;
}
// Hair and headwear were authored in the idle portrait's coordinate space.
// Transfer only their changed pixels onto the complete running head. The
// supplied running face, torso, hands and legs themselves stay untouched.
function inRunHeadSpace(g,layout,draw){
 const proxy=Array(W*H).fill(null),before=[...g];
 const sourceX=x=>Math.round(20+(x-20)*layout.x),sourceY=y=>Math.round(layout.top+(y-layout.idleTop)*layout.y);
 for(let y=0;y<H;y++)for(let x=X0;x<X1;x++)set(proxy,x,y,at(before,sourceX(x),sourceY(y)));
 const initial=[...proxy],mask=draw(proxy)||[],mapped=Array(W*H).fill(false);
 for(let y=0;y<H;y++)for(let x=X0;x<X1;x++){
  const px=Math.round(20+(x-20)/layout.x),py=Math.round(layout.idleTop+(y-layout.top)/layout.y),k=index(px,py);
  if(px<X0||px>=X1||py<0||py>=H)continue;
  if(proxy[k]!==initial[k])set(g,x,y,proxy[k]);
  if(mask[k])mapped[index(x,y)]=true;
 }
 return mapped;
}
function shortenRun(g,amount){
 const before=[...g],scale=(62-amount)/62;
 for(let y=0;y<H;y++)for(let x=X0;x<X1;x++)set(g,x,y,at(before,x,Math.floor(63+(y-63)/scale)));
}
function customize(g,a,catalog,generic,hairMask=[],bodyTop=25,faceMaterial=[],nativeHead=false){
 const originals=[...g];for(let y=0;y<H;y++)for(let x=X0;x<X1;x++){
  const c=at(g,x,y);if(!c)continue;let kind=null,value=null;
  if(hairMask[index(x,y)]){kind='hair';value=a.hairColor===0?null:catalog.hairColor.colors[a.hairColor];}
  else if(skin(c)){kind='skin';value=a.skin===0?null:catalog.skin.colors[a.skin];}
  else if(faceMaterial[index(x,y)]&&hair(c)){kind=null;}
  else if(!nativeHead&&hair(c)&&y<36){kind='hair';value=a.hairColor===0?null:catalog.hairColor.colors[a.hairColor];}
  else if(y>=bodyTop&&y<44){kind='cloth';value=a.shirtColor===6?null:catalog.shirtColor.colors[a.shirtColor];if(gray(c)&&rgb(c)[0]>145&&x>=17&&x<=23&&a.shirtStyle===2&&a.outfit===0)value=null;}
  else if(y>=44&&y<59){kind='pants';value=a.pantsColor===1?null:catalog.pantsColor.colors[a.pantsColor];}
  else if(y>=59){kind='shoes';value=a.shoesColor===0?null:catalog.shoesColor.colors[a.shoesColor];}
  if(generic){const [r,green,b]=rgb(c),n=Math.round(r*.26+green*.57+b*.17);set(g,x,y,hex([n,n+3,n+5]));}
  else if(kind&&value)set(g,x,y,shade(c,value,kind));
 }
 if(generic)return;
 if(a.shirtStyle!==2){
  for(let y=Math.max(27,bodyTop);y<43;y++)for(let x=14;x<27;x++)if(at(g,x,y)&&gray(at(originals,x,y)))set(g,x,y,shade(at(originals,x,y),catalog.shirtColor.colors[a.shirtColor],'cloth'));
  if(a.shirtStyle===0)for(let y=34;y<43;y++)for(let x=X0;x<X1;x++){const c=at(originals,x,y);if(c&&!hairMask[index(x,y)]&&(x<13||x>27))set(g,x,y,shade(c,catalog.skin.colors[a.skin],'skin'));}
  if(a.shirtStyle===1)for(const x of [17,24])for(let y=Math.max(29,bodyTop);y<35;y++)if(at(g,x,y))set(g,x,y,'#e2dfd4');
  if(a.shirtStyle===3)for(let y=Math.max(30,bodyTop);y<42;y+=3)if(at(g,20,y))set(g,20,y,'#e9e6da');
 }
 if(a.pantsStyle===1||a.pantsStyle===2){for(let y=a.pantsStyle===1?52:54;y<59;y++)for(let x=X0;x<X1;x++){const c=at(g,x,y);if(c)set(g,x,y,shade(c,catalog.skin.colors[a.skin],'skin'));}}
 if(a.pantsStyle===2){
  // Keep the skirt panel continuous; repeated source rows contain alpha gaps.
  const cloth=[],waist=[];
  for(let y=44;y<54;y++)for(let x=12;x<=27;x++){
   const c=at(originals,x,y);if(!c||skin(c)||Math.max(...rgb(c))>=115)continue;
   cloth.push({x,y,c});if(y<47)waist.push(x);
  }
  if(cloth.length){
   const left=waist.length?Math.min(...waist):14,right=waist.length?Math.max(...waist):25;
   for(let y=44;y<54;y++)for(let x=left-((y-44)>>2);x<=right+((y-44)>>2);x++){
    const c=at(originals,x,y);
    if(c&&(skin(c)||faceMaterial[index(x,y)]||hairMask[index(x,y)]))continue;
    let nearest=cloth[0],distance=Infinity;
    for(const sample of cloth){const d=Math.abs(sample.x-x)+Math.abs(sample.y-y);if(d<distance){nearest=sample;distance=d;}}
    set(g,x,y,shade(nearest.c,catalog.pantsColor.colors[a.pantsColor],'pants'));
   }
  }
 }
 if(a.pantsStyle===3)transformRows(g,46,59,1.15);
 if(a.outfit){
  const targets={1:'#9bafba',2:catalog.shirtColor.colors[a.shirtColor],3:catalog.shirtColor.colors[a.shirtColor],4:catalog.shirtColor.colors[a.shirtColor],5:'#aa7a4d',6:'#d6b841'};
  for(let y=bodyTop;y<(a.outfit===3?50:44);y++)for(let x=X0;x<X1;x++){const c=at(g,x,y)||!nativeHead&&a.outfit===3&&at(originals,x,39+(y-44)%4);if(c&&!hairMask[index(x,y)]&&!skin(c))set(g,x,y,shade(c,targets[a.outfit],'cloth'));}
  if(a.outfit===2)for(let y=Math.max(28,bodyTop);y<42;y++)if(at(g,20,y))set(g,20,y,'#83dccd');
  if(a.outfit===4)for(let y=44;y<59;y++)for(const x of [14,25])if(at(g,x,y))set(g,x,y,'#eeeade');
  if(a.outfit===5&&!nativeHead){patch(g,g,14,6,5,5,9,1);patch(g,g,14,6,5,5,27,1);}
  if(a.outfit===6)for(let y=nativeHead?Math.max(29,bodyTop):29;y<49;y++)if(at(g,20,y)&&(!nativeHead||gray(at(originals,20,y)||'#000000')))set(g,20,y,'#6b6854');
 }
}
function hat(g,a,headOnly=false){
 const type=a.headwear||(a.accessory===3?1:0);if(!type)return;
 const source=[...g],colour=type===1?'#7190b7':type===2?'#627d70':type===3?'#c8bba0':'#924d53';
 for(let y=type===2?0:3;y<10;y++)for(let x=10+(y<4?3:0);x<30-(y<4?3:0);x++){
  const c=at(source,x,Math.max(4,y));if(c)set(g,x,y,shade(c,colour,'hair'));
 }
 if(type===1||type===3){const start=type===3?7:17,end=type===3?33:31;for(let x=start;x<end;x++)set(g,x,9,shade(at(source,16+x%8,6)||'#68412d',colour,'hair'));}
 if(type===4)patch(g,source,13,5,12,3,10,2,14,3);
 if(headOnly)for(let y=13;y<40;y++)for(let x=X0;x<X1;x++){const c=at(g,x,y);if(c&&!hair(c))set(g,x,y,null);}
}
function accessory(g,a){
 if(a.accessory===1)for(let x=12;x<=27;x++)if(at(g,x,17))set(g,x,17,'#25252d');
 if(a.accessory===2){set(g,26,32,'#dfbd51');set(g,26,33,'#ffe1a0');}
 if(a.accessory===4){for(const x of [10,29])for(let y=14;y<21;y++)if(at(g,x,y))set(g,x,y,y===16?'#b2c5c8':'#43484e');}
 if(a.accessory===5){const src=[...g];patch(g,src,14,35,5,8,27,36,6,10);for(let y=27;y<40;y++)if(at(g,24,y))set(g,24,y,'#b4a68e');}
}
function sit(g,a={},options={}){
 const original=[...g],profile=options.facing==='left'||options.facing==='right',provenance=options.poseSource||original;
 // The boots keep their original ground contact. The upper body lowers onto
 // the seat; source pant pixels form a horizontal thigh and a short calf.
 for(let y=0;y<59;y++)for(let x=X0;x<X1;x++)set(g,x,y,null);
 patch(g,original,0,0,W,44,0,8);
 // Hanging fingertips below the seated waist are removed before thighs are
 // built. This applies to every seated pose, so the phone never changes legs.
 const pending=new Map();for(let y=37;y<51;y++)for(let x=X0;x<X1;x++){const c=at(provenance,x,y);if(c&&skin(c))pending.set(y*W+x,[x,y]);}
 while(pending.size){const first=pending.values().next().value,queue=[first],cluster=[];pending.delete(first[1]*W+first[0]);while(queue.length){const p=queue.pop();cluster.push(p);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const k=(p[1]+dy)*W+p[0]+dx;if(pending.has(k)){queue.push(pending.get(k));pending.delete(k);}}}if(cluster.length>=3){const xs=cluster.map(p=>p[0]),ys=cluster.map(p=>p[1]);for(let y=Math.max(50,Math.min(...ys)+7);y<=Math.max(...ys)+9;y++)for(let x=Math.min(...xs)-1;x<=Math.max(...xs)+1;x++)set(g,x,y,null);}}
 const legStrip=(sx,sy,sw,sh,dx,dy,dw,dh)=>{
  for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
   const yy=sy+Math.floor(y*sh/dh),xx=sx+Math.floor(x*sw/dw);
   const usable=(x,y)=>{const raw=at(provenance,x,y);return raw&&!skin(raw)?at(original,x,y):null;};
   let c=usable(xx,yy);
   if(!c){for(let distance=1;distance<12&&!c;distance++)c=usable(xx-distance,yy)||usable(xx+distance,yy);}
   if(c)set(g,dx+x,dy+y,c);
  }
 };
 if(profile){
  if(options.facing==='left'){
   legStrip(16,49,9,5,14,50,11,5);
   legStrip(16,51,6,8,14,54,6,5);
  }else{
   legStrip(17,49,8,5,16,50,12,5);
   legStrip(19,51,6,8,22,54,6,5);
  }
 }else{
  legStrip(13,44,14,6,10,50,20,5);
  legStrip(13,50,6,9,12,55,6,4);
  legStrip(22,50,6,9,23,55,6,4);
 }
}
function gesture(g,a,options){
 const phone=options.phoneOpen||options.pose==='phone',kinds=['eat','drink','pick-litter','throw-litter','pet','smoke'];
 const type=kinds.includes(options.action)?options.action:kinds.includes(options.pose)?options.pose:null;
 if(!phone&&!type&&options.holding!=='litter')return;
 const raw=options.actionFrame??options.poseFrame??0,state=actionPoseState(type,options.actionProgress),stage=state?.poseFrame??(Number.isFinite(raw)?Math.max(0,Math.min(type==='smoke'?7:3,Math.floor(raw))):0);
 const detailed=!!state,facing=options.facing||'down',left=facing==='left',profile=left||facing==='right',seated=options.pose==='sit';
 const bend=!seated&&!phone&&type==='pick-litter'&&detailed&&[1,2].includes(stage)?stage===1?2:3:0,offset=seated?8:bend,source=[...g],provenance=options.poseSource||source;
 const configs={down:{active:[28,29],support:[11,29]},up:{active:[28,29],support:[11,29]},left:{active:[23,29],support:[17,29]},right:{active:[17,29],support:[23,29]}},config=configs[facing]||configs.down;
 // Locate flesh in the unchanged source, before any user skin/cloth tint. A
 // profile's visible hanging hand sits inside the torso columns, unlike the
 // front view; clearing a fixed outer column would leave a third hand.
 const sourceWalking=Number.isInteger(options.walkFrame)&&options.walkFrame>=0,handFrom=sourceWalking?options.bodyTop:37;
 const points=[];for(let y=handFrom;y<51;y++)for(let x=X0;x<X1;x++){const c=at(provenance,x,y);if(c&&skin(c))points.push([x,y]);}
 const pending=new Map(points.map(p=>[p[1]*W+p[0],p])),hands=[];
 while(pending.size){const start=pending.values().next().value,queue=[start],cluster=[];pending.delete(start[1]*W+start[0]);while(queue.length){const p=queue.pop();cluster.push(p);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const k=(p[1]+dy)*W+p[0]+dx;if(pending.has(k)){queue.push(pending.get(k));pending.delete(k);}}}if(cluster.length>=3){const xs=cluster.map(p=>p[0]),ys=cluster.map(p=>p[1]);hands.push({points:cluster,x:Math.min(...xs),y:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys),cx:xs.reduce((n,v)=>n+v,0)/xs.length});}}
 // Walking hands may be raised to rows29–35. Reject the central neck cluster
 // while retaining authored hands on either side of the torso.
 if(sourceWalking)for(let i=hands.length-1;i>=0;i--)if(hands[i].y<32&&Math.abs(hands[i].cx-20)<3)hands.splice(i,1);
 hands.sort((p,q)=>p.cx-q.cx);
 const active=profile?hands[0]:hands.at(-1),support=profile?null:hands[0];
 const selected=phone?hands:type&&active?[active]:[];
 const write=(x,y,c)=>{if(!seated||y<50)set(g,x,y,c);};
 for(const hand of selected){
  for(let y=34+offset;y<=hand.bottom+offset+1;y++)for(let x=hand.x-3;x<=hand.right+3;x++){
   if(seated&&y>=50)continue;
   // Preserve the jacket behind the lifted profile forearm with adjacent
   // source jacket pixels. Only the hand itself becomes transparent.
   if(profile){const core=left?x<=24:x>=16,cloth=at(source,left?17:24,y);write(x,y,core?cloth:null);}
   else write(x,y,null);
  }
 }
 const skinSamples=hands.flatMap(hand=>hand.points.filter(p=>!seated||p[1]+offset<50).map(([x,y])=>at(source,x,y+offset))).filter(Boolean);
 if(!skinSamples.length)for(let y=14;y<26;y++)for(let x=10;x<30;x++){const c=at(provenance,x,y),actual=at(source,x,y+offset);if(c&&skin(c)&&actual)skinSamples.push(actual);}
 const skinColor=skinSamples[Math.floor(skinSamples.length/2)]||'#efa277';
 const pixel=(x,y,c)=>write(x,y+offset,c),rect=(x,y,w,h,c)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)pixel(xx,yy,c);};
 const handAt=(hx,hy)=>{for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)pixel(hx+x,hy+y,skinSamples.length?skinSamples[(x+1+(y+1)*3)%skinSamples.length]:skinColor);};
 const arm=(hx,hy,which='active')=>{
  const [sx,sy]=config[which],raised=hy<37,ex=Math.round((sx+hx)/2),ey=raised?Math.min(36,hy+3):35;
  const texture=(xx,yy)=>at(source,sx+Math.max(-1,Math.min(1,xx)),29+Math.abs(yy)%7+offset)||at(source,20,32+offset)||'#474449';
  const line=(ax,ay,bx,by,r)=>{const steps=Math.max(Math.abs(bx-ax),Math.abs(by-ay),1);for(let n=0;n<=steps;n++){const x=Math.round(ax+(bx-ax)*n/steps),y=Math.round(ay+(by-ay)*n/steps);for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++)pixel(x+xx,y+yy,texture(xx,y-sy+yy));}};
  line(sx,sy,ex,ey,2);line(ex,ey,hx,hy,1);handAt(hx,hy);
 };
 const mirror=x=>left?39-x:x;let actionHand=null;
 const device=()=>{rect(18,27,6,9,'#222c38');rect(19,28,4,6,'#83b9cb');rect(20,29,2,1,'#bededa');rect(20,35,2,1,'#c9d2c9');};
 // A concurrent action owns one arm. The opposite arm supports the phone;
 // the same phone arm is never drawn again under an action arm.
 if(phone){
  if(!type)arm(23,32,'active');
  arm(17,33,'support');device();
  if(!type)handAt(23,32);handAt(17,33);
 }
 if(type){
  let targets;
  if(type==='eat'||type==='drink')targets=detailed?[[29,40],[26,32],[24,24],[24,24],[27,33],[29,41]]:[[29,39],[26,31],[24,24],[27,35]];
  else if(type==='pick-litter')targets=detailed?[[30,43],[32,49],[32,50],[30,44],[29,41],[29,42]]:[[29,42],[31,46],[32,49],[29,40]];
  else if(type==='throw-litter')targets=detailed?[[29,40],[27,32],[33,29],[33,30],[30,38],[29,41]]:[[29,40],[27,33],[32,28],[31,36]];
  else if(type==='pet')targets=detailed?[[30,41],[32,43],[32,47],[33,44],[32,46],[29,39]]:[[30,40],[32,42],[32,46],[33,43]];
  else targets=[[29,40],[26,32],[24,24],[24,24],[27,27],[29,35],[30,39],[29,41]];
  const [targetX,targetY]=targets[Math.min(stage,targets.length-1)],mouthContact=phone&&['eat','drink','smoke'].includes(type)&&targetY===24,mouthY=a.gender===1?25:20;
  const hx=mouthContact?type==='smoke'?24:23:phone&&['eat','drink','smoke'].includes(type)?targetX:mirror(targetX),contactY=mouthContact?mouthY+(type==='smoke'?1:type==='drink'?4:3):targetY,hy=seated?Math.min(40,contactY):contactY;actionHand=[hx,hy];arm(hx,hy);
  if(type==='eat'&&!(detailed&&stage===5)){rect(hx-3,hy-3,5,4,'#b67548');rect(hx-2,hy-2,3,2,'#ead393');pixel(hx,hy-2,'#609858');}
  if(type==='drink'&&!(detailed&&stage===5)){rect(hx-3,hy-4,5,4,'#629d98');rect(hx-2,hy-3,3,3,'#a0d0bf');rect(hx+2,hy-3,2,2,'#40817d');}
  if(type==='smoke'&&stage<7){rect(hx-4,hy-1,5,1,'#f1ede1');pixel(hx-4,hy-1,'#cf8c63');if(stage===4){rect(mirror(25),20,2,1,'#becbc4');rect(mirror(28),16,2,2,'#cdd6ce');rect(mirror(31),12,2,1,'#d7ded6');}if(stage===6)rect(hx-3,hy-4,1,2,'#becbc4');}
  if(type==='pick-litter'&&stage>=2||type==='throw-litter'&&(!detailed||stage<3))paper(hx,hy+2);
 }
 if(options.holding==='litter'&&type!=='throw-litter'){
  const hand=phone?{cx:17,y:34}:type&&!profile?support:active||{cx:config.active[0],y:37};
  if(hand)paper(Math.round(hand.cx),seated?Math.min(40,hand.y+2):hand.y+2);
 }
 // Device sits in front of forearms. Restore only the hands that actually
 // own those arms; an active action must not regain a third neutral hand.
 if(phone){device();handAt(17,33);if(!type)handAt(23,32);else if(actionHand&&actionHand[0]>=17&&actionHand[0]<=24&&actionHand[1]>=26&&actionHand[1]<=36)handAt(...actionHand);}
 function paper(x,y){rect(x-2,y-2,5,3,'#f6f3e7');rect(x-1,y,3,1,'#afbaaa');rect(x+2,y-2,1,2,'#d4dfd0');}
}

export function actorGrid(a,catalog,options={}){
 const generic=!!options.generic,facing=generic?'down':reference.directions.includes(options.facing)?options.facing:'down';
 const action=options.action||['eat','drink','pick-litter','throw-litter','pet','smoke'].includes(options.pose)&&options.pose;
 const phone=!generic&&(options.phoneOpen||options.pose==='phone'),seated=!generic&&options.pose==='sit';
 const phase=Number.isFinite(options.walkFrame)?Math.abs(Math.floor(options.walkFrame))%8:0;
 const walking=!generic&&!seated&&!action&&!phone&&!options.headOnly&&(options.walking===true||options.walking==null&&phase!==0);
 const opts={...options,generic,facing,walkFrame:walking?Math.floor(phase/2):-1,phoneOpen:phone};
 const actionState=actionPoseState(action,options.actionProgress),rawFrame=options.actionFrame??options.poseFrame??0;
 const frameIndex=Number.isFinite(rawFrame)?Math.max(0,Math.min(action==='smoke'?7:3,Math.floor(rawFrame))):0;
 const key=JSON.stringify([a,generic,facing,walking?Math.floor(phase/2):-1,seated,phone,options.face!==false,!!options.headOnly,action||null,actionState?.poseFrame??frameIndex,!!actionState,options.holding==='litter']);
 if(cache.has(key))return cache.get(key);
 const frame=reference.frames.idle[facing],headFacing=phone?'down':facing,head=reference.frames.idle[headFacing],step=walking?reference.frames.walk[facing][Math.floor(phase/2)]:null;
 let g=a.gender===1&&!generic?decode(custom.frames.short[facing],custom.palette):decode(frame,reference.palette);
 if(a.gender===1&&!generic){transformRows(g,32,46,.88);}
 if(step)g=decode(step,reference.palette);
 if(phone){const h=a.gender===1&&!generic?decode(custom.frames.short[headFacing],custom.palette):decode(head,reference.palette);for(let y=0;y<(a.gender===1&&!generic?28:25);y++)for(let x=X0;x<X1;x++)set(g,x,y,at(h,x,y));}
 const poseSource=[...g];
 const headTop=f=>63+(f.headBounds.y-f.sourceAnchor.y)*f.scale.y;
 const layout=step?{top:headTop(step),idleTop:headTop(frame),x:step.headBounds.w*step.scale.x/(frame.headBounds.w*frame.scale.x),y:(step.headBodySplit-headTop(step))/(frame.headBodySplit-headTop(frame))}:null;
 const hairMask=generic?[]:layout?inRunHeadSpace(g,layout,proxy=>hairstyle(proxy,{...a,gender:0},headFacing)):hairstyle(g,a,headFacing);
 customize(g,a,catalog,generic,hairMask,step?.headBodySplit??25);
 if(!generic){
  if(layout){inRunHeadSpace(g,layout,proxy=>{hat(proxy,a);if([1,3,4].includes(a.accessory))accessory(proxy,a);});if(![1,3,4].includes(a.accessory))accessory(g,a);}
  else{hat(g,a);accessory(g,a);}
  if(seated)sit(g,a,{...opts,poseSource});
  const pickup=actionPoseState(action,options.actionProgress);
  if(!options.headOnly&&!seated&&!phone&&action==='pick-litter'&&[1,2].includes(pickup?.poseFrame))transformRows(g,0,54,1,pickup.poseFrame===1?2:3);
  if(!options.headOnly)gesture(g,a,{...opts,bodyTop:step?.headBodySplit,poseSource});
  if(step&&a.gender===1){transformRows(g,Math.max(35,step.headBodySplit+3),46,.88);shortenRun(g,3);}
 }
 if(options.headOnly){const crop=Array(W*40).fill(null);for(let y=0;y<32;y++)for(let x=X0;x<X1;x++)crop[index(x,y+3)]=at(g,x,y);g=crop;}
 if(options.face===false){for(let y=12;y<40;y++)for(let x=X0;x<X1;x++){const c=at(g,x,y);if(c&&(skin(c)||gray(c)))set(g,x,y,null);}}
 const runs=[];for(let y=0;y<(options.headOnly?40:H);y++)for(let x=0;x<W;){const color=g[y*W+x];let end=x+1;while(end<W&&g[y*W+end]===color)end++;if(color)runs.push({x,y,w:end-x,h:1,color});x=end;}
 const result={grid:g,runs,width:W,height:options.headOnly?40:H,key};if(cache.size>=512)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
}

/** Tint complete imported poses without rebuilding their face, torso or gait. */
export function customizeSourceGrid(source,a,catalog,options={}){
 const g=[...source],head=options.head||{top:4,bottom:25,left:12,right:35},facing=options.facing||'down';
 const materials=sourceHairMaterial(source,W,H,head,facing);
 const hairMask=applyNativeHair(g,source,W,H,a,head,facing,materials);
 customize(g,a,catalog,!!options.generic,hairMask,Math.max(24,head.bottom+1,Math.ceil(head.neckAnchor?.[1]||0)),materials.face,true);
 if(!options.generic){
  if(a.accessory===5)accessory(g,a);
  if(options.nativeHeadItems!==false)nativeAdornments(g,source,W,H,a,head,facing,materials);
 }
 return g;
}

// A hairstyle is an independent hair-only raster. Register it directly to
// the native pose, never through a male portrait proxy or a coarse face edit.
const nativeHeadCache=new WeakMap();
function nativeHeadAnatomy(source,width,height,head,facing){
 let cache=nativeHeadCache.get(source);if(!cache){cache=new Map();nativeHeadCache.set(source,cache);}
 const key=JSON.stringify([width,height,head,facing]);if(cache.has(key))return cache.get(key);
 const f=width/W,left=Math.max(0,Math.floor((head.left-3)*f)),right=Math.min(width-1,Math.ceil((head.right+4)*f));
 // Imported head bounds omit a few native outline pixels above the crown.
 // Their removal domain starts at the canvas edge; face protection still
 // comes from the native anatomy, never from a stretched coarse block.
 const top=0,bottom=Math.min(height-1,Math.ceil((head.bottom+6)*f));
 const face=Array(width*height).fill(false),candidates=new Set();
 const colour=n=>source[n]&&rgb(source[n]);
 for(let y=Math.floor((head.top+5)*f);y<=Math.min(height-1,(head.bottom+1)*f);y++)for(let x=left;x<=right;x++){
  const c=colour(y*width+x);if(c&&Math.min(...c)>180&&Math.max(...c)-Math.min(...c)<35)candidates.add(y*width+x);
 }
 const whites=[];
 while(candidates.size){const start=candidates.values().next().value,q=[start],points=[];candidates.delete(start);
  while(q.length){const n=q.pop(),x=n%width;points.push(n);for(const v of [x>0?n-1:-1,x<width-1?n+1:-1,n-width,n+width])if(candidates.delete(v))q.push(v);}
  const xs=points.map(n=>n%width),ys=points.map(n=>Math.floor(n/width)),a={points,left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
  a.x=xs.reduce((n,x)=>n+x,0)/xs.length;a.y=ys.reduce((n,y)=>n+y,0)/ys.length;
  if(points.length>=f&&a.right-a.left<(right-left)*.3&&a.bottom-a.top<(bottom-top)*.4)whites.push(a);
 }
 const expectedY=(head.top+(head.bottom-head.top+1)*.8)*f;
 const expectedX=(facing==='right'?head.left+(head.right-head.left)*.75:facing==='left'?head.left+(head.right-head.left)*.25:(head.left+head.right)/2)*f;
 whites.sort((a,b)=>Math.abs(a.y-expectedY)+Math.abs(a.x-expectedX)*.15-Math.abs(b.y-expectedY)-Math.abs(b.x-expectedX)*.15);
 const eyes=facing==='up'?[]:whites.slice(0,facing==='down'?2:1);
 // The atlas is already normalized to this 48px native design space.
 // A wavy silhouette's full width is not a scalp measurement. One scalar
 // cap is shared by every direction/style/phase; only explicit authored
 // registration may request a smaller hair layer. Never resize the face.
 const scale=Number.isFinite(head.hairScale)?Math.min(1,Math.max(.5,head.hairScale)):1;
 const eyeY=eyes.length?eyes.reduce((n,a)=>n+a.y,0)/eyes.length:(head.bottom-(21-16.5)*scale)*f;
 const explicit=head.eyeAnchor,anchor=Array.isArray(explicit)?{x:explicit[0]*f,y:explicit[1]*f}:{x:eyes.length?eyes.reduce((n,a)=>n+a.x,0)/eyes.length:(head.left+head.right)/2*f,y:eyeY};
 if(Number.isFinite(head.eyeLine))anchor.y=head.eyeLine*f;
 const mark=(x,y,r=f)=>{for(let yy=Math.max(0,Math.floor(y-r));yy<=Math.min(height-1,y+r);yy++)for(let xx=Math.max(0,Math.floor(x-r));xx<=Math.min(width-1,x+r);xx++)face[yy*width+xx]=true;};
 const polygon=(p,x,y)=>{let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
 if(Array.isArray(head.facePolygon)){
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if(polygon(head.facePolygon,x/f,y/f))face[y*width+x]=true;
  // Authored coarse polygons can stop one fine pixel short of genuine skin.
  // Retain that native flesh/contour perimeter, without growing the mask
  // through successive warm hair pixels or changing its source colours.
  const authored=[...face],perimeter=[];
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
   const n=y*width+x,c=colour(n);if(!c||face[n]||c[0]<180||c[0]-c[1]<45||c[1]-c[2]<18)continue;
   if([-width-1,-width,-width+1,-1,1,width-1,width,width+1].some(d=>authored[n+d]))perimeter.push([x,y]);
  }
  for(const [x,y]of perimeter)mark(x,y,Math.max(0,f/2));
 }else if(eyes.length){
  const eyeTop=Math.min(...eyes.map(a=>a.top)),eyeBottom=Math.max(...eyes.map(a=>a.bottom));
  const eyeHeight=Math.max(f,eyeBottom-eyeTop+1),faceTop=Math.max(top,Math.floor(eyeTop-eyeHeight*3.5));
  const minX=facing==='right'?Math.max(left,anchor.x-(right-left)*.27):left;
  const maxX=facing==='left'?Math.min(right,anchor.x+(right-left)*.27):right;
  const warm=new Set();
  for(let y=faceTop;y<=bottom;y++)for(let x=Math.ceil(minX);x<=maxX;x++){const n=y*width+x,c=colour(n);if(c&&c[0]>=130&&c[0]-c[1]>40&&c[1]-c[2]>16)warm.add(n);}
  const retained=[];
  while(warm.size){const start=warm.values().next().value,q=[start],points=[];warm.delete(start);let nearEye=false;
   while(q.length){const n=q.pop(),x=n%width,y=Math.floor(n/width);points.push(n);
    nearEye||=eyes.some(a=>x>=a.left-4*f&&x<=a.right+4*f&&y>=a.top-6*f&&y<=a.bottom+5*f)||
     (facing==='right'&&x>=anchor.x-12*f&&x<=anchor.x-4*f||facing==='left'&&x>=anchor.x+4*f&&x<=anchor.x+12*f)&&y>=anchor.y-4*f&&y<=anchor.y+5*f;
    for(const v of [x>0?n-1:-1,x<width-1?n+1:-1,n-width,n+width])if(warm.delete(v))q.push(v);
   }
   if(nearEye)retained.push(...points);
  }
  // Native face colours and the complete eye/ear outlines are authoritative.
  // Dark-only lip rows are included between the retained skin rows.
  const spans=new Map();for(const n of retained){const x=n%width,y=Math.floor(n/width),span=spans.get(y)||[x,x];span[0]=Math.min(span[0],x);span[1]=Math.max(span[1],x);spans.set(y,span);mark(x,y);}
  for(let y=faceTop;y<=bottom;y++){
   const rows=[...spans].filter(([yy])=>Math.abs(yy-y)<=2*f).map(([,s])=>s);
   if(rows.length)for(let x=Math.max(left,Math.min(...rows.map(s=>s[0]))-f);x<=Math.min(right,Math.max(...rows.map(s=>s[1]))+f);x++)if(source[y*width+x])face[y*width+x]=true;
  }
  for(const eye of eyes)for(const n of eye.points)mark(n%width,Math.floor(n/width),2*f);
 }
 // Ears on the rear view have no eye seeds. Retain the source's bright ear
 // components only at the lateral lower head, together with their contour.
 for(let y=Math.floor((head.top+(head.bottom-head.top)*.5)*f);y<=bottom;y++)for(let x=left;x<=right;x++){
  const c=colour(y*width+x),lateral=x<(head.left+4)*f||x>(head.right-4)*f;
  if(c&&lateral&&c[0]>=185&&c[0]-c[1]>55&&c[1]-c[2]>18)mark(x,y,1.5*f);
 }
 const hairBottom=Number.isFinite(head.neckAnchor?.[1])?Math.min(bottom,head.neckAnchor[1]*f):bottom;
 const hairMask=source.map((c,n)=>!!c&&Math.floor(n/width)>=top&&Math.floor(n/width)<=hairBottom&&n%width>=left&&n%width<=right&&!face[n]&&hair(c));
 const result={face,hair:hairMask,anchor,scale:scale*f,top,bottom,left,right};cache.set(key,result);return result;
}
const hairLayerCache=new WeakMap();
function nativeHairLayer(frame,style,facing){
 if(facing!=='up'||!['long','wavy'].includes(style))return frame.hairPixels;
 if(hairLayerCache.has(frame))return hairLayerCache.get(frame);
 const pixels=[...frame.hairPixels],stretch=style==='long'?1.65:1;
 // The legacy front-face cut was applied to the rear layer as well. Recover
 // its actual brown nape from the retained normalized source, stopping before
 // the gray jacket. Long uses the same authored extension as its side layers.
 for(let y=19;y<=Math.ceil(19+5*stretch)-1;y++)for(let x=0;x<40;x++){
  const sy=19+Math.floor((y-19)/stretch),p=frame.normalizedPixels[sy*40+x],c=hairstyles.palette[p];
  pixels[y*40+x]=p&&hair(c)&&rgb(c)[0]<185?p:0;
 }
 hairLayerCache.set(frame,pixels);return pixels;
}
function applyNativeHair(g,source,width,height,a,head,facing,materials){
 const anatomy=nativeHeadAnatomy(source,width,height,head,facing);
 if(!a.hairStyle)return materials.hair;
 const style=['short','bob','curly','bun','crew','part','long','tail','pixie','mohawk','twobuns','wavy'][a.hairStyle],frame=hairstyles.frames[style]?.[facing];
 if(!frame)return anatomy.hair;
 const eye=frame.targetEyeAnchor||{x:20,y:16.5},pixels=nativeHairLayer(frame,style,facing),selected=Array(width*height).fill(false);
 for(let y=anatomy.top;y<=anatomy.bottom;y++)for(let x=anatomy.left;x<=anatomy.right;x++){
  const n=y*width+x,retainedNape=facing==='up'&&y>=(head.bottom-3)*width/W;
  if(source[n]&&!anatomy.face[n]&&!retainedNape&&(y<anatomy.anchor.y||anatomy.hair[n]))g[n]=null;
 }
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sx=Math.round(eye.x+(x-anatomy.anchor.x)/anatomy.scale),sy=Math.round(eye.y+(y-anatomy.anchor.y)/anatomy.scale),n=y*width+x;
  if(sx<0||sx>=40||sy<0||sy>=40||anatomy.face[n]&&source[n])continue;
  const pixel=pixels[sy*40+sx];if(pixel){g[n]=hairstyles.palette[pixel];selected[n]=true;}
 }
 // A selected wig cannot delete or recolour any authoritative native face.
 for(let n=0;n<g.length;n++)if(anatomy.face[n]&&source[n])g[n]=source[n];
 return selected;
}

// Brown highlights also satisfy the old RGB skin predicate. Identify the
// authored face/ears first so a hair tint retains every native highlight;
// treating those highlights as flesh left brown flecks in white hairstyles.
function sourceHairMaterial(source,width,height,head,facing){
 const factor=width/W,limit=Math.min(height,Math.ceil(Math.max(36,head.bottom+3)*factor)),face=Array(width*height).fill(false);
 const fleshRows=[];
 for(let y=Math.max(0,Math.floor((head.top+6)*factor));y<limit;y++){
  const strong=[];
  for(let x=0;x<width;x++){const c=source[y*width+x];if(!c)continue;const [r,g,b]=rgb(c);if(r>=210&&r-g>75&&g-b>20)strong.push(x);}
  fleshRows[y]=strong;
 }
 for(let y=0;y<limit;y++){
  const strong=fleshRows[y]||[];
  if(facing==='up'){
   for(const x of strong)for(let yy=Math.max(0,y-factor);yy<=Math.min(height-1,y+factor);yy++)for(let xx=Math.max(0,x-factor);xx<=Math.min(width-1,x+factor);xx++)face[yy*width+xx]=true;
  }else{
   // The lower lip/jaw has entire dark-only rows. Retain the face region
   // across those gaps instead of treating each brown shadow as hair.
   const span=fleshRows.slice(Math.max(0,y-2*factor),y+1).flat();
   if(span.length)for(let x=Math.max(0,Math.min(...span)-factor);x<=Math.min(width-1,Math.max(...span)+factor);x++)face[y*width+x]=true;
  }
 }
 // Raised hands can begin with a dark-only row. Preserve complete flesh
 // components outside the crown, not just their bright seed pixels. These
 // are source anatomical regions; their RGB shadows never become hair.
 const pending=new Set();
 for(let n=0;n<source.length;n++){const c=source[n];if(!c)continue;const [r,g,b]=rgb(c);if(r>=70&&r-g>12&&g-b>5)pending.add(n);}
 while(pending.size){
  const start=pending.values().next().value,queue=[start],cluster=[];pending.delete(start);let flesh=false,crown=false;
  while(queue.length){
   const n=queue.pop(),x=n%width,y=Math.floor(n/width),[r,g,b]=rgb(source[n]);cluster.push(n);
   flesh||=r>=210&&r-g>75&&g-b>20;crown||=y<(head.top+6)*factor;
   for(const next of [x>0?n-1:-1,x<width-1?n+1:-1,n-width,n+width])if(pending.delete(next))queue.push(next);
  }
  if(flesh&&!crown)for(const n of cluster){
   const x=n%width,y=Math.floor(n/width);
   // Include the native dark contour around a flesh component, whose
   // darkest pixels deliberately fall below the flesh colour threshold.
   for(let yy=Math.max(0,y-factor);yy<=Math.min(height-1,y+factor);yy++)for(let xx=Math.max(0,x-factor);xx<=Math.min(width-1,x+factor);xx++)face[yy*width+xx]=true;
  }
 }
 const anatomy=nativeHeadAnatomy(source,width,height,head,facing);
 for(let y=anatomy.top;y<=anatomy.bottom;y++)for(let x=anatomy.left;x<=anatomy.right;x++)face[y*width+x]=anatomy.face[y*width+x]||(y>(head.bottom+1)*factor&&face[y*width+x]);
 return {hair:anatomy.hair.map((v,n)=>v&&!face[n]),face};
}

/** Tint each retained fine source pixel; transfer only authored wardrobe edits
 * from the legacy design grid. Faces and cloth grain keep their fine pixels. */
export function customizeSourceDetailGrid(source,width,height,coarse,a,catalog,options={}){
 const factor=width/W,head=options.head||{top:4,bottom:25,left:12,right:35},bodyTop=Math.max(24,head.bottom+1);
 const g=[...source],normal={...a,hairStyle:0,skin:0,hairColor:0,shirtColor:6,pantsColor:1,shoesColor:0};
 const coarseOptions={...options,nativeHeadItems:false};
 const geometry=customizeSourceGrid(coarse,normal,catalog,coarseOptions),custom=customizeSourceGrid(coarse,{...a,hairStyle:0},catalog,coarseOptions);
 const facing=options.facing||'down',materials=sourceHairMaterial(source,width,height,head,facing);
 const selectedHair=applyNativeHair(g,source,width,height,a,head,facing,materials);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const n=y*width+x,c=source[n],cx=Math.floor(x/factor),cy=Math.floor(y/factor),k=cy*W+cx;
  if(geometry[k]!==coarse[k]&&!(materials.face[n]&&source[n])){g[n]=custom[k];continue;}
  if(selectedHair[n]){if(a.hairColor!==0&&g[n])g[n]=shade(g[n],catalog.hairColor.colors[a.hairColor],'hair');continue;}
  if(!c||g[n]!==c)continue;let kind=null,value=null;
  if(materials.hair[n]){kind='hair';value=a.hairColor===0?null:catalog.hairColor.colors[a.hairColor];}
  else if(skin(c)){kind='skin';value=a.skin===0?null:catalog.skin.colors[a.skin];}
  else if(materials.face[n]){kind=null;}
  else if(cy>=bodyTop&&cy<44){kind='cloth';value=a.shirtColor===6?null:catalog.shirtColor.colors[a.shirtColor];if(gray(c)&&rgb(c)[0]>145&&cx-PAD>=17&&cx-PAD<=23&&a.shirtStyle===2&&a.outfit===0)value=null;}
  else if(cy>=44&&cy<59){kind='pants';value=a.pantsColor===1?null:catalog.pantsColor.colors[a.pantsColor];}
  else if(cy>=59){kind='shoes';value=a.shoesColor===0?null:catalog.shoesColor.colors[a.shoesColor];}
  if(kind&&value)g[n]=shade(c,value,kind);
 }
 if(!options.generic)nativeAdornments(g,source,width,height,a,head,facing,materials);
 return g;
}

// Items register in the same native eye space as the independent hair layer.
// The face/head raster is never used as a stretched portrait drawing surface.
function nativeAdornments(g,source,width,height,a,head,facing,materials){
 const f=width/W,anatomy=nativeHeadAnatomy(source,width,height,head,facing),anchor=anatomy.anchor;
 const inside=(x,y)=>x>=0&&x<width&&y>=0&&y<height;
 const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(inside(x,y))g[y*width+x]=c;};
 const rect=(x,y,w,h,c)=>{for(let yy=Math.round(y);yy<Math.round(y+h);yy++)for(let xx=Math.round(x);xx<Math.round(x+w);xx++)put(xx,yy,c);};
 const line=(x1,y1,x2,y2,c)=>{const count=Math.max(Math.abs(x2-x1),Math.abs(y2-y1),1);for(let i=0;i<=count;i++)rect(x1+(x2-x1)*i/count,y1+(y2-y1)*i/count,f,f,c);};
 if(a.outfit===5){
  const crown=[];for(let y=0;y<anchor.y-3*f;y++)for(let x=anatomy.left;x<=anatomy.right;x++)if(g[y*width+x])crown.push(x);
  if(crown.length){const l=Math.min(...crown),r=Math.max(...crown);for(const ratio of[.23,.77]){
   const x=Math.round(l+(r-l)*ratio);let root=null;for(let y=0;y<anchor.y;y++)if(g[y*width+x]){root=y;break;}if(root===null)continue;
   const center=root-1.5*f,radius=2.5*f,grain=source[root*width+x]||'#68412d';
   for(let yy=Math.floor(center-radius);yy<=center+radius;yy++)for(let xx=Math.floor(x-radius);xx<=x+radius;xx++){
    const d=Math.hypot((xx-x)/f,(yy-center)/f);if(d<=2.5)put(xx,yy,d>1.7?'#483325':shade(grain,'#aa7a4d','hair'));
   }
  }}
 }
 const type=a.headwear||(a.accessory===3?1:0);
 if(type){
  const snapshot=[...g],colour={1:'#7190b7',2:'#627d70',3:'#c8bba0',4:'#924d53'}[type],eyeX={down:19,right:23.5,left:15.5,up:20}[facing]??19;
  const grain=(x,y)=>source[y*width+x]&&hair(source[y*width+x])?source[y*width+x]:'#68412d';
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const n=y*width+x,px=eyeX+(x-anchor.x)/f,py=16.5+(y-anchor.y)/f;
   if(materials.face[n]&&source[n])continue;
   const start=type===2?0:3,crown=py>=start&&py<10&&px>=10+(py<4?3:0)&&px<30-(py<4?3:0);
   if(crown){const sy=Math.round(anchor.y+(Math.max(4,py)-16.5)*f);if(snapshot[n]||inside(x,sy)&&snapshot[sy*width+x])g[n]=shade(grain(x,y),colour,'hair');}
   const brim=type===3||type===1&&facing!=='up',left=type===3?7:facing==='left'?8:17,right=type===3?33:facing==='left'?22:31;
   if(brim&&py>=9&&py<10&&px>=left&&px<right)g[n]=shade(grain(x,y),colour,'hair');
  }
 }
 if(a.accessory===1){
  const c='#25252d',rim=(x,y)=>{rect(x-3*f,y-2*f,6*f,f,c);rect(x-3*f,y+3*f,6*f,f,c);rect(x-3*f,y-2*f,f,6*f,c);rect(x+2*f,y-2*f,f,6*f,c);};
  if(facing==='up'){
   // Only the lateral temples can be seen from behind; never a front lens
   // or horizontal bridge through the opaque rear hair.
   for(let y=Math.floor(anchor.y-3*f);y<=Math.min(height-1,(head.bottom+1)*f);y++)for(let x=anatomy.left;x<=anatomy.right;x++){
    const n=y*width+x,c0=source[n],lateral=x<(head.left+4)*f||x>(head.right-4)*f;
    if(lateral&&materials.face[n]&&c0&&skin(c0)&&rgb(c0)[0]>180)rect(x,y-f,f,f,c);
   }
  }else if(facing==='down'){rim(anchor.x-5*f,anchor.y);rim(anchor.x+5*f,anchor.y);rect(anchor.x-2*f,anchor.y-f,4*f,f,c);}
  else{rim(anchor.x,anchor.y);const behind=facing==='right'?-1:1;line(anchor.x+behind*3*f,anchor.y-f,anchor.x+behind*8*f,anchor.y+f,c);}
 }
 if(a.accessory===4){
  const xs=facing==='right'?[anchor.x-8*f]:facing==='left'?[anchor.x+8*f]:[(head.left+2)*f,(head.right-2)*f];
  for(const x of xs){rect(x-f,anchor.y-f,2*f,5*f,'#43484e');rect(x-f,anchor.y+f,2*f,f,'#b2c5c8');}
 }
 if(a.accessory===2&&facing!=='up'){
  const neck=head.neckAnchor||[(head.left+head.right)/2,head.bottom+1],targetX=(neck[0]+(facing==='left'?-3:facing==='right'?3:5))*f,targetY=(neck[1]+5)*f;
  let best=null;for(let y=Math.max(0,Math.floor(targetY-2*f));y<=Math.min(height-1,targetY+3*f);y++)for(let x=Math.max(0,Math.floor(targetX-3*f));x<=Math.min(width-1,targetX+3*f);x++){
   const c=source[y*width+x];if(c&&gray(c)){const d=Math.abs(x-targetX)+Math.abs(y-targetY);if(!best||d<best.d)best={x,y,d};}
  }
  if(best){rect(best.x,best.y,f,f,'#dfbd51');rect(best.x,best.y+f,f,f,'#ffe1a0');}
 }
}
