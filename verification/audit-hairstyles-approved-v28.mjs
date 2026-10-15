// Read-only diagnosis of existing raster assets and the actual game painter.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loadSourceActor,drawSourceAvatarCanvas,sourceActorFrame} from '../game/web/source-actors.js';
import {parts,defaultAvatar} from '../game/web/avatar.js';
import {actorHairData} from '../game/web/actor-hair-data.js';

const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const root=new URL('../game/',import.meta.url),out=new URL('./hairstyle-approved-v28/',import.meta.url);
await mkdir(out,{recursive:true});
const files=['web/source-actors.js','web/actor-sprite.js','web/actor-hair-data.js','web/actor-custom-data.js','web/source-actors-data.js','web/canonical-actors-data.js','web/locomotion-actors-data.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await readFile(new URL(p,root))).digest('hex')])));
const before=await hashes();
const load=path=>loadImage(fileURLToPath(new URL(path.replace(/^\//,''),root)));
for(const gender of ['male','female'])await loadSourceActor('human-'+gender,{createCanvas,loadImage:load});
const dirs=['down','right','up','left'],states=['idle','walk','run'],styles=['short','bob','curly','bun','crew','part','long','tail','pixie','mohawk','twobuns','wavy'];
const rgb=(p,n)=>[p[n],p[n+1],p[n+2]],warm=(p,n)=>p[n]>p[n+1]*1.15&&p[n+1]>p[n+2]*1.06;
const strong=(p,n)=>p[n]>=210&&p[n]-p[n+1]>75&&p[n+1]-p[n+2]>20;
const render=(avatar,options)=>{const canvas=createCanvas(96,128),c=canvas.getContext('2d');if(!drawSourceAvatarCanvas(c,avatar,parts,0,0,{scale:2,...options}))throw Error('unloaded source actor');return {canvas,pixels:c.getImageData(0,0,96,128).data};};
function interiorHoles(p){
 const outside=new Set(),queue=[];
 const push=(x,y)=>{const n=y*96+x;if(x>=0&&x<96&&y>=0&&y<128&&!p[n*4+3]&&!outside.has(n)){outside.add(n);queue.push(n);}};
 for(let x=0;x<96;x++){push(x,0);push(x,127);}for(let y=0;y<128;y++){push(0,y);push(95,y);}
 for(let i=0;i<queue.length;i++){const n=queue[i],x=n%96,y=Math.floor(n/96);push(x-1,y);push(x+1,y);push(x,y-1);push(x,y+1);}
 return new Set(Array.from({length:96*128},(_,i)=>i).filter(n=>!p[n*4+3]&&!outside.has(n)));
}
function measure(base,actual,head){
 const p=actual.pixels,b=base.pixels;let lostHead=0,lostStrong=0,changedFlesh=0,residualCrown=0,bodyChanges=0,newHoles=0;
 const samples=[],holes=interiorHoles(p),oldHoles=interiorHoles(b);let l=96,t=128,r=-1,bottom=-1;
 for(let y=0;y<128;y++)for(let x=0;x<96;x++){
  const n=(y*96+x)*4,inside=x>=head.left*2&&x<=(head.right+1)*2&&y>=head.top*2&&y<=(head.bottom+6)*2;
  if(p[n+3]){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);bottom=Math.max(bottom,y);}
  if(inside&&b[n+3]&&!p[n+3]){lostHead++;if(strong(b,n)){lostStrong++;if(samples.length<20)samples.push([x,y,...rgb(b,n)]);}}
  if(inside&&strong(b,n)&&p[n+3]&&rgb(p,n).some((v,k)=>v!==b[n+k]))changedFlesh++;
  if(inside&&y<(head.top+6)*2&&p[n+3]&&warm(p,n))residualCrown++;
  if(inside&&holes.has(y*96+x)&&!oldHoles.has(y*96+x))newHoles++;
  if(y>(head.bottom+6)*2&&p.slice(n,n+4).some((v,k)=>v!==b[n+k]))bodyChanges++;
 }
 return {headOpaqueDeleted:lostHead,strongFleshDeleted:lostStrong,strongFleshChanged:changedFlesh,newInteriorTransparentPixels:newHoles,brownCrownPixels:residualCrown,changesBelowHeadPlus6:bodyChanges,
  firstDeletedStrongPixels:samples,bbox:[l,t,r,bottom],touchesCanvasSide:l===0||r===95,touchesCanvasTop:t===0};
}
function background(c,w,h){c.fillStyle='#edf0ed';c.fillRect(0,0,w,h);for(let y=0;y<h;y+=12)for(let x=0;x<w;x+=12)if((x/12+y/12)%2){c.fillStyle='#dce2df';c.fillRect(x,y,12,12);}}
const rows=[],sheets=[],headSheets=new Map();
for(const gender of [0,1])for(const direction of dirs){
 const canvas=createCanvas(12*196+120,12*184+60),c=canvas.getContext('2d');background(c,canvas.width,canvas.height);c.imageSmoothingEnabled=false;
 c.fillStyle='#101920';c.font='16px sans-serif';c.fillText(`${gender?'female':'male'} ${direction}: actual WHITE hairstyle; idle repeats pose0`,10,20);
 for(let k=0;k<12;k++)c.fillText(`${states[Math.floor(k/4)]}${k%4}`,122+k*196,48);
 headSheets.set(`${gender}:${direction}`,{canvas,c});
}
for(const gender of [0,1])for(const state of states)for(const hairColor of [0,6]){
 const cw=110,ch=154,canvas=createCanvas(16*cw+120,12*ch+56),c=canvas.getContext('2d');background(c,canvas.width,canvas.height);c.imageSmoothingEnabled=false;
 c.fillStyle='#101920';c.font='15px sans-serif';c.fillText(`${gender?'female':'male'} ${state} ${hairColor?'white':'brown'}; cols down/right/up/left × phase0..3`,8,18);
 for(let j=0;j<16;j++)c.fillText(`${dirs[Math.floor(j/4)]}${j%4}`,124+j*cw,46);
 for(let style=0;style<12;style++){
  c.fillStyle='#101920';c.fillText(`${style} ${styles[style]}`,5,70+style*ch);
  for(let d=0;d<4;d++)for(let phase=0;phase<4;phase++){
   const facing=dirs[d],options={facing,walking:state!=='idle',running:state==='run',walkFrame:phase*2};
   const avatar={...defaultAvatar,gender,hairStyle:style,hairColor},frame=sourceActorFrame(avatar,options);
   const base=render({...defaultAvatar,gender},options),actual=render(avatar,options),metrics=measure(base,actual,frame.head);
   c.drawImage(actual.canvas,120+(d*4+phase)*cw,54+style*ch);
   if(hairColor===6){const hs=headSheets.get(`${gender}:${facing}`);hs.c.drawImage(actual.canvas,0,0,96,88,120+(states.indexOf(state)*4+phase)*196,56+style*184,192,176);hs.c.fillStyle='#101920';hs.c.fillText(`${style} ${styles[style]}`,3,76+style*184);}
   const styleFrame=style?actorHairData.frames[styles[style]][facing]:null;
   const layout={x:(frame.head.right-frame.head.left+1)/24,y:(frame.head.bottom-frame.head.top+1)/24,fixedLogicalXCenter:20,fixedNativeCanvasXCenter:24,nativeHeadCenter:(frame.head.left+frame.head.right)/2};
   rows.push({gender,state,hairColor,hairStyle:style,style:styles[style],facing,phase,actualSourceFrame:frame.frameIndex,sourceClip:frame.id,sourceAtlas:frame.atlas,sourceRect:frame.rect,head:frame.head,
    legacyTargetEyeAnchor:styleFrame?.targetEyeAnchor,appliedHairRegistration:{uniformScale:Math.min(1,Math.max(.5,frame.head.hairScale??1)),nativeEyeAnchor:frame.head.eyeAnchor,space:'coarse48; fine factor2'},legacyPortraitLayout:{...layout,anisotropy:layout.x/layout.y,headCenterOffsetFinePixels:(layout.nativeHeadCenter-24)*2},...metrics});
  }
 }
 const path=`${gender?'female':'male'}-${state}-${hairColor?'white':'brown'}-full.png`;await writeFile(new URL(path,out),canvas.toBuffer('image/png'));sheets.push(path);
}
for(const [key,{canvas}]of headSheets){const [g,d]=key.split(':');const path=`${g==='1'?'female':'male'}-${d}-white-heads.png`;await writeFile(new URL(path,out),canvas.toBuffer('image/png'));sheets.push(path);}
const after=await hashes();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Runtime changed during sweep; repeat diagnosis');
const selected=rows.filter(r=>r.hairStyle>0),lost=selected.filter(r=>r.strongFleshDeleted>0),holes=selected.filter(r=>r.newInteriorTransparentPixels>0);
const summary={status:'fine hair fix verification; no artistic approval',cases:rows.length,renderRequests:rows.length,idleNote:'four requested idle phases resolve to one standing pose; not four authored idle frames',matrix:{styles:12,genders:2,directions:4,states:3,phases:4,hairColors:[0,6]},hashes:before,sheets,
 selectedCases:selected.length,selectedCasesDeletingStrongFlesh:lost.length,selectedCasesAddingInteriorTransparency:holes.length,
 worstDeletedStrong:lost.toSorted((a,b)=>b.strongFleshDeleted-a.strongFleshDeleted).slice(0,15).map(({gender,state,hairColor,style,facing,phase,strongFleshDeleted,headOpaqueDeleted,firstDeletedStrongPixels})=>({gender,state,hairColor,style,facing,phase,strongFleshDeleted,headOpaqueDeleted,firstDeletedStrongPixels})),
 notes:['Strong-flesh thresholds are diagnostic candidates, not an authoritative anatomical mask. Contact sheets must be inspected.','Native style0 baseline is included. Brown and white renders use the actual runtime painter.']};
await writeFile(new URL('metrics.json',out),JSON.stringify(rows,null,2)+'\n');await writeFile(new URL('summary.json',out),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({cases:rows.length,selectedCases:selected.length,lostStrongCases:lost.length,newInteriorHoleCases:holes.length,worst:summary.worstDeletedStrong.slice(0,3),output:fileURLToPath(out)},null,2));
