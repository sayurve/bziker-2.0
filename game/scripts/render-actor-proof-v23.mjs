import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {defaultAvatar,drawAvatarCanvas} from '../web/avatar.js';
import {loadSourceActor,sourceActorFrame} from '../web/source-actors.js';

// Run with Node that can resolve @napi-rs/canvas. All actor pixels come from
// the same engine/assets as the game; the legacy comparison bypasses only
// the current renderer and directly crops the original 48×64 source atlas.
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const output=new URL('../docs/bugfix-v23/',import.meta.url);
const scale=2.5,spriteW=48*scale,spriteH=64*scale;
const cellW=160,cellH=220,margin=20,header=90,footer=38;
const directions=[['down','Спереди'],['right','Справа'],['up','Сзади'],['left','Слева']];
const modes=[{label:'Покой'},...Array.from({length:4},(_,n)=>({label:`Бег ${n+1}`,walking:true,running:true,walkFrame:n*2}))];
const images=new Map();
const sourceImage=async path=>{
 if(!images.has(path))images.set(path,await loadImage(fileURLToPath(new URL('../'+path,import.meta.url))));
 return images.get(path);
};
const environment={createCanvas,loadImage:sourceImage};
await Promise.all(['human-male','human-female'].map(id=>loadSourceActor(id,environment)));
fs.mkdirSync(output,{recursive:true});

function sheet(columns,rows,title,subtitle){
 const canvas=createCanvas(margin*2+columns*cellW,header+rows*cellH+footer),ctx=canvas.getContext('2d');
 ctx.fillStyle='#f6f5f1';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.imageSmoothingEnabled=false;
 ctx.fillStyle='#252833';ctx.font='bold 22px sans-serif';ctx.fillText(title,margin,32);
 ctx.font='13px sans-serif';ctx.fillText(subtitle,margin,56);
 ctx.fillStyle='#67707b';ctx.font='12px sans-serif';
 ctx.fillText('Общий масштаб 2.5 · без сглаживания · линия опоры одинакова',margin,canvas.height-15);
 return {canvas,ctx};
}
function tile(ctx,column,row,label){
 const x=margin+column*cellW,y=header+row*cellH;
 ctx.fillStyle='#ffffff';ctx.fillRect(x+4,y+4,cellW-8,cellH-8);
 ctx.fillStyle='#3b424c';ctx.font='13px sans-serif';ctx.fillText(label,x+11,y+22);
 const spriteX=x+(cellW-spriteW)/2,spriteY=y+39;
 ctx.fillStyle='#d8dde2';ctx.fillRect(x+11,Math.round(spriteY+63*scale),cellW-22,1);
 return {x:spriteX,y:spriteY};
}
function after(ctx,avatar,options,x,y){
 const frame=sourceActorFrame(avatar,options),detail=frame.rect.detail;
 assert.ok(detail,'The current source frame must have its fine atlas.');
 assert.deepEqual([detail.w,detail.h,detail.factor],[96,128,2]);
 assert.equal(drawAvatarCanvas(ctx,avatar,x,y,{...options,scale}),true,'Proof must use the source canvas renderer.');
}
async function before(ctx,avatar,options,x,y){
 const frame=sourceActorFrame(avatar,options),rect=frame.rect;
 assert.deepEqual([rect.w,rect.h],[48,64]);
 const image=await sourceImage(frame.atlas);
 ctx.save();ctx.imageSmoothingEnabled=false;
 ctx.drawImage(image,rect.x,rect.y,rect.w,rect.h,x,y,spriteW,spriteH);
 ctx.restore();
}
function save(canvas,name){
 fs.writeFileSync(new URL(name,output),canvas.toBuffer('image/png'));
 console.log(`${name}: ${canvas.width}×${canvas.height}`);
}

for(const gender of [0,1]){
 const avatar={...defaultAvatar,gender};
 const {canvas,ctx}=sheet(5,4,`${gender?'Женский':'Мужской'} персонаж · текущий рендер`,
  'drawAvatarCanvas · fine atlas 96×128 → logical 48×64 · стандартный персонаж');
 for(let row=0;row<directions.length;row++){
  const [facing,direction]=directions[row];
  for(let column=0;column<modes.length;column++){
   const {label,...mode}=modes[column],{x,y}=tile(ctx,column,row,`${direction} · ${label}`);
   after(ctx,avatar,{...mode,facing},x,y);
  }
 }
 save(canvas,gender?'female-after-contact.png':'avatar-after-contact.png');
}

const comparison=sheet(6,2,'Фронтальный покой: до / после / бег',
 'До: прямой crop legacy atlas 48×64. После и бег: настоящий drawAvatarCanvas, fine 96×128.');
for(const gender of [0,1]){
 const avatar={...defaultAvatar,gender},sex=gender?'Ж':'М';
 let position=tile(comparison.ctx,0,gender,`${sex} · До · покой 48×64`);
 await before(comparison.ctx,avatar,{facing:'down'},position.x,position.y);
 position=tile(comparison.ctx,1,gender,`${sex} · После · покой`);
 after(comparison.ctx,avatar,{facing:'down'},position.x,position.y);
 for(let frame=0;frame<4;frame++){
  position=tile(comparison.ctx,frame+2,gender,`${sex} · После · бег ${frame+1}`);
  after(comparison.ctx,avatar,{facing:'down',walking:true,running:true,walkFrame:frame*2},position.x,position.y);
 }
}
save(comparison.canvas,'before-after-front.png');

// Report geometry from the actual current renderer at one native fine pixel
// per output pixel. These measurements are auxiliary evidence, not drawings.
function bounds(data,predicate=()=>true){
 let left=96,top=128,right=-1,bottom=-1;
 for(let y=0;y<128;y++)for(let x=0;x<96;x++){
  const n=(y*96+x)*4;
  if(data[n+3]&&predicate(data,n,x,y)){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
 }
 return {left,top,right,bottom,width:right-left+1,height:bottom-top+1};
}
const warmHead=(pixels,n,x,y)=>y<64&&pixels[n]>pixels[n+1]*1.15&&pixels[n+1]>pixels[n+2]*1.06&&pixels[n]-pixels[n+1]<75;
for(const gender of [0,1]){
 const avatar={...defaultAvatar,gender},measure={};
 for(const [name,options] of [['idle',{facing:'down'}],['run',{facing:'down',walking:true,running:true,walkFrame:0}]]){
  const ctx=createCanvas(96,128).getContext('2d');
  assert.equal(drawAvatarCanvas(ctx,avatar,0,0,{...options,scale:2}),true);
  const data=ctx.getImageData(0,0,96,128).data;
  measure[name]={body:bounds(data),warmHead:bounds(data,warmHead)};
 }
 console.log(JSON.stringify({gender,measure}));
}
