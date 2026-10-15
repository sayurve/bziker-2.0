import {fixtureRenderer} from './helpers/phaser-renderer-fixture.mjs';
const mountWorld=(container,options)=>nativeMountWorld(container,{...options,rendererFactory:fixtureRenderer});
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {mountWorld as nativeMountWorld} from '../web/world.js';
import {drawSourceAvatarCanvas,loadSourceActor,sourceActorFrame} from '../web/source-actors.js';
import {parts,defaultAvatar} from '../web/avatar.js';
import {sourceActorsData as originalActors} from '../web/source-actors-data.js';
function originalRunOptions(gender,facing,phase=0){const seq=Object.values(originalActors.actors['human-'+(gender?'female':'male')].actions).find(a=>a.name.includes('Бег')&&a.name.includes({down:'Спереди',right:'Справа',up:'Сзади',left:'Слева'}[facing]));return {animationId:seq.sourceKey,sourceTime:phase*2/seq.fps};}
import {motionRuntimeV25} from './helpers/world-motion-runtime-v25.mjs';

const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
await loadSourceActor('human-male',{createCanvas,loadImage:path=>loadImage(fileURLToPath(new URL('../'+path,import.meta.url)))});
await loadSourceActor('human-female');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function inPolygon(p,x,y){if(!p)return false;let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}

const pixels=image=>image.getContext('2d').getImageData(0,0,96,128).data;
const digest=pixels=>createHash('sha256').update(pixels).digest('hex');
function expected(avatar,facing){const c=createCanvas(96,128).getContext('2d');assert.equal(drawSourceAvatarCanvas(c,avatar,parts,0,0,{scale:2,facing,walking:true,running:true,walkFrame:0}),true);return c.getImageData(0,0,96,128).data;}

test('a real collision slide renders the direction actually travelled instead of running sideways into the wall',async()=>{
 const cases=[
  {from:{x:186,y:180},solid:{x:200,y:80,width:30,height:240},input:[.8,.6],facing:'down',axis:'x'},
  {from:{x:244,y:180},solid:{x:200,y:80,width:30,height:240},input:[-.8,-.6],facing:'up',axis:'x'},
  {from:{x:180,y:186},solid:{x:80,y:200,width:240,height:30},input:[.6,.8],facing:'right',axis:'y'},
  {from:{x:180,y:244},solid:{x:80,y:200,width:240,height:30},input:[-.6,-.8],facing:'left',axis:'y'},
 ];
 for(const gender of [0,1])for(const spec of cases){
  const h=motionRuntimeV25(),avatar={...defaultAvatar,gender},room={id:'motion-fixture',label:'Motion fixture',kind:'station',width:400,height:400,bounds:{left:0,right:400,top:0,bottom:400},seats:[],props:[],details:[],zones:[],solids:[spec.solid],spawn:spec.from,exit:{x:350,y:350},action:{x:350,y:50,id:'test-service'},modular_source:true};
  const snapshot={scene:'interior',interior_id:room.id,interior:room,position:spec.from,players:[]};
  const view=mountWorld(h.container,{profile:{id:`slide-${gender}-${spec.facing}`,avatar},settings:{lightingMode:'day',showNicknames:false},api:async()=>snapshot});
  try{
   await settle();h.stick(...spec.input);h.drawImages.length=0;h.frame(30);
   const after=view.getState().position,other=spec.axis==='x'?'y':'x';
   assert.ok(Math.abs(after[spec.axis]-spec.from[spec.axis])<1e-7,'the wall must actually block one component');
   assert.ok(Math.abs(after[other]-spec.from[other])>1,'the character must travel along its free edge');
   const sprite=h.drawImages.find(draw=>draw.image.width===96&&draw.image.height===128&&draw.args.length===4);
   assert.ok(sprite,'observe the loaded native actor bitmap, not a fallback or an empty render');
   assert.equal(digest(pixels(sprite.image)),digest(expected(avatar,spec.facing)),`${gender}/${spec.facing}: the native frame must face the actual slide`);
  }finally{view.destroy();}
 }
});

test('white hair recolours bright brown scalp pixels in every native direction and phase while preserving flesh and eyes',()=>{
 for(const gender of [0,1])for(const facing of ['down','right','up','left'])for(let phase=0;phase<4;phase++){
  const avatar={...defaultAvatar,gender},options={facing,walking:true,running:true,walkFrame:phase*2},frame=sourceActorFrame(avatar,options);
  const render=hairColor=>{const ctx=createCanvas(96,128).getContext('2d');drawSourceAvatarCanvas(ctx,{...avatar,hairColor},parts,0,0,{scale:2,...options});return ctx.getImageData(0,0,96,128).data;};
  const native=render(0),white=render(6);let crownPixels=0,fleshPixels=0,eyePixels=0;
  for(let y=0;y<128;y++)for(let x=0;x<96;x++){
   const k=(y*96+x)*4,r=native[k],g=native[k+1],b=native[k+2];if(!native[k+3])continue;
   const warm=r>g*1.15&&g>b*1.06;
   if(y>=frame.head.top*2&&y<(frame.head.top+6)*2&&warm){
    crownPixels++;assert.ok(Math.max(white[k],white[k+1],white[k+2])-Math.min(white[k],white[k+1],white[k+2])<22,`${gender}/${facing}/${phase}: brown hair highlight at ${x},${y} was treated as skin`);
   }
   // Rear brown highlights are hair, not a face. Real ears are guarded by
   // native anatomical samples in hairstyle-native-v27.
   if(!inPolygon(frame.head.scalpPolygon,(x+.5)/2,(y+.5)/2)&&facing!=='up'&&y>=frame.head.top*2+12&&y<=frame.head.bottom*2+10&&r>=210&&r-g>75&&g-b>20){fleshPixels++;assert.deepEqual([...white.slice(k,k+4)],[...native.slice(k,k+4)],`${gender}/${facing}/${phase}: hair colour changes native flesh at ${x},${y}`);}
   if(!inPolygon(frame.head.scalpPolygon,(x+.5)/2,(y+.5)/2)&&y>=frame.head.top*2+20&&y<=frame.head.bottom*2&&!warm&&Math.max(r,g,b)-Math.min(r,g,b)<15){eyePixels++;assert.deepEqual([...white.slice(k,k+4)],[...native.slice(k,k+4)],'hair colour changes a native eye or outline');}
  }
  assert.ok(crownPixels>20,'observe a real detailed scalp');if(facing!=='up')assert.ok(fleshPixels>0,`${gender}/${facing}/${phase}: observe native flesh`);if(facing!=='up')assert.ok(eyePixels>0,`${gender}/${facing}/${phase}: observe actual native eyes`);
 }
});

test('light hair retains every measured native mouth, chin and neck-outline pixel including dark flesh shadows',()=>{
 const outlines=[{start:60,rows:[[34,63],[36,60],[36,60],[38,58],[38,58],[38,58],[41,54],[41,54],[42,53]]},{start:68,rows:[[38,60],[39,58],[39,57],[40,56],[42,54],[42,53],[42,53],[42,53]]}];
 for(const gender of[0,1]){
  const render=hairColor=>{const ctx=createCanvas(96,128).getContext('2d');drawSourceAvatarCanvas(ctx,{...defaultAvatar,gender,hairColor},parts,0,0,{scale:2,facing:'down',walking:true,running:true,walkFrame:0,...originalRunOptions(gender,'down')});return ctx.getImageData(0,0,96,128).data;};
  const native=render(0),light=render(6),shape=outlines[gender];let shadows=0;
  for(let row=0;row<shape.rows.length;row++)for(let x=shape.rows[row][0];x<=shape.rows[row][1];x++){
   const y=shape.start+row,k=(y*96+x)*4;if(!native[k+3])continue;
   if(native[k]<210&&native[k]>native[k+1]*1.15)shadows++;
   assert.deepEqual([...light.slice(k,k+4)],[...native.slice(k,k+4)],`${gender}: hair tint corrupts native jaw pixel ${x},${y}`);
  }
  assert.ok(shadows>20,'this guard must actually observe dark jaw material');
 }
});

test('changing skin preserves the native dark eyes and neutral face details in both genders',()=>{
 for(const gender of[0,1])for(const skin of[1,2,3,4,5,6,7]){
  const options={scale:2,facing:'down',walking:true,running:true,walkFrame:0},head=sourceActorFrame({...defaultAvatar,gender},options).head;
  const render=value=>{const c=createCanvas(96,128).getContext('2d');drawSourceAvatarCanvas(c,{...defaultAvatar,gender,skin:value},parts,0,0,options);return c.getImageData(0,0,96,128).data;};
  const native=render(0),tinted=render(skin);let dark=0,white=0;
  for(let y=Math.floor(head.eyeAnchor[1]*2-7);y<=Math.ceil(head.eyeAnchor[1]*2+7);y++)for(let x=0;x<96;x++){
   if(!inPolygon(head.facePolygon,(x+.5)/2,(y+.5)/2)||inPolygon(head.scalpPolygon,(x+.5)/2,(y+.5)/2))continue;
   const k=(y*96+x)*4,r=native[k],g=native[k+1],b=native[k+2];if(!native[k+3]||Math.max(r,g,b)-Math.min(r,g,b)>=15)continue;
   if(Math.max(r,g,b)<20)dark++;else if(Math.min(r,g,b)>170)white++;else continue;
   assert.deepEqual([...tinted.slice(k,k+4)],[...native.slice(k,k+4)],`${gender}/${skin}: actual neutral eye pixel ${x},${y} changed`);
  }
  assert.ok(dark>=4&&white>=10,'positive actual dark pupil and white sclera coverage per gender/skin');
 }
});

test('skin edits preserve neutral native eye, sclera and outline colours across all running directions and phases',()=>{
 let neutralPixels=0;
 for(const gender of[0,1])for(const facing of['down','right','up','left'])for(let phase=0;phase<4;phase++){
  const avatar={...defaultAvatar,gender},options={facing,walking:true,running:true,walkFrame:phase*2},head=sourceActorFrame(avatar,options).head;
  const render=skin=>{const c=createCanvas(96,128).getContext('2d');drawSourceAvatarCanvas(c,{...avatar,skin},parts,0,0,{...options,scale:2});return c.getImageData(0,0,96,128).data;};
  const native=render(0);
  for(const skin of[1,2]){
   const tinted=render(skin);
   for(let y=0;y<=head.bottom*2+14;y++)for(let x=0;x<96;x++){
    const k=(y*96+x)*4,r=native[k],g=native[k+1],b=native[k+2];
    if(native[k+3]&&Math.max(r,g,b)-Math.min(r,g,b)<22){neutralPixels++;assert.deepEqual([...tinted.slice(k,k+4)],[...native.slice(k,k+4)],`${gender}/${facing}/${phase}/${skin}: skin colour changes neutral native head pixel ${x},${y}`);}
   }
  }
 }
 assert.ok(neutralPixels>1000,'inspect actual neutral native pixels, including the black eyes and light sclera');
});

test('hair recolouring retains every measured native hand region, including raised dark-only fingertip rows, in all 32 running frames',async()=>{
 const {readFileSync}=await import('node:fs'),regions=JSON.parse(readFileSync(new URL('./helpers/native-hand-regions-v25.json',import.meta.url))).frames;
 assert.equal(regions.length,32);let inspected=0;
 for(const {gender,facing,phase,rects}of regions){
  const options={facing,walking:true,running:true,walkFrame:phase*2,...originalRunOptions(gender,facing,phase)},render=hairColor=>{const c=createCanvas(96,128).getContext('2d');drawSourceAvatarCanvas(c,{...defaultAvatar,gender,hairColor},parts,0,0,{...options,scale:2});return c.getImageData(0,0,96,128).data;},native=render(0),light=render(6);
  assert.ok(rects.length>0,`${gender}/${facing}/${phase}: observe real hand pixels`);
  for(const [x,y,w,h]of rects)for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const k=(yy*96+xx)*4;if(!native[k+3])continue;inspected++;assert.deepEqual([...light.slice(k,k+4)],[...native.slice(k,k+4)],`${gender}/${facing}/${phase}: hair colour changes a native hand/outline pixel at ${xx},${yy}`);}
 }
 assert.ok(inspected>1000,'the guard must inspect full native hand regions');
});
