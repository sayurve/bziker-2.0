import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {drawAvatarCanvas,avatarGeometry,defaultAvatar} from '../web/avatar.js';
import {preloadNativeAvatars,readyAvatarRaster} from './helpers/native-avatar-fixture-v30.mjs';
import {sourceActorFrame} from '../web/source-actors.js';
import {drawFurnitureVolume} from '../web/interiors.js';

const sizes={sofa:[2,1],desk:[2,1],plant:[1,1],board:[2,1],chair:[1,1],armchair:[1,1],bookcase:[2,1],bed:[2,2],lamp:[1,1],counter:[2,1],rug:[2,2],'dining-table':[2,2],shelf:[2,1],tv:[2,1],cabinet:[2,1]};
const rotations=[0,90,180,270];
function render(type,rotation,x=0,y=0,variant='standard',color='#7d9de6'){
 const calls=[];
 const context=new Proxy({fillStyle:'',font:'',textAlign:''},{get(target,key){if(key in target)return target[key];return (...args)=>calls.push([key,...args,target.fillStyle]);},set(target,key,value){target[key]=value;return true;}});
 const [columns,rows]=sizes[type],side=rotation%180!==0;
 const width=(side?rows:columns)*70,height=(side?columns:rows)*58;
 drawFurnitureVolume(context,{rotation,variant},type,x,y,width,height,color,false);
 return calls;
}

test('furniture has four independently drawn facing views rather than a turned flat picture',()=>{
 for(const type of Object.keys(sizes)){
  const views=rotations.map(rotation=>JSON.stringify(render(type,rotation)));
  assert.equal(new Set(views).size,4,`${type} must show front, left, back and right`);
  for(const rotation of rotations)assert.ok(!render(type,rotation).some(call=>['rotate','transform','setTransform'].includes(call[0])),`${type} rotates the entire picture instead of changing perspective`);
 }
});

test('all orientation art uses valid pixel rectangles at any world position',()=>{
 for(const type of Object.keys(sizes))for(const rotation of rotations)for(const [x,y] of [[0,0],[660,420],[1450,780]]){
  const calls=render(type,rotation,x,y);
  assert.ok(calls.filter(call=>call[0]==='fillRect').length>=8,`${type} ${rotation} lacks furniture details`);
  for(const call of calls){
   if(call[0]==='fillRect'){assert.ok(call.slice(1,5).every(Number.isInteger),`${type} ${rotation} has noninteger pixels`);assert.ok(call[3]>0&&call[4]>0,`${type} ${rotation} paints an invalid rectangle`);}
   if(['moveTo','lineTo'].includes(call[0]))assert.ok(call.slice(1,3).every(Number.isInteger),`${type} ${rotation} has fractional planes`);
  }
 }
});

test('furniture texture and geometry remain unchanged when moved to another grid cell',()=>{
 const normalize=(calls,x,y)=>calls.map(call=>['fillRect','moveTo','lineTo','fillText'].includes(call[0])?[call[0],...(call[0]==='fillText'?[call[1],call[2]-x,call[3]-y,...call.slice(4)]:[call[1]-x,call[2]-y,...call.slice(3)])]:call);
 for(const type of Object.keys(sizes))for(const rotation of rotations)assert.deepEqual(normalize(render(type,rotation,660,420),660,420),render(type,rotation),`${type} ${rotation} changes materials with its world position`);
});

test('every facing keeps the selected palette and premium distinction',()=>{
 for(const type of Object.keys(sizes))for(const rotation of rotations)for(const color of ['#141414','#faf8f2','#b697d7']){
  const normal=render(type,rotation,0,0,'standard',color),premium=render(type,rotation,0,0,'premium',color);
  assert.ok(normal.some(call=>call.at(-1)===color),`${type} ${rotation} loses custom color`);
  assert.notDeepEqual(normal,premium,`${type} ${rotation} loses its premium finish`);
 }
});

test('sideways screens stay connected to their supports instead of hovering above the floor',()=>{
 for(const type of ['board','tv'])for(const rotation of [90,270]){
  const h=116,screen=render(type,rotation).find(call=>call[0]==='fillRect'&&call.at(-1)==='#394b41');
  assert.ok(screen,`${type} ${rotation} is missing its upright side plane`);
  assert.ok(screen[2]+screen[4]>=h-40,`${type} ${rotation} is detached from the stand`);
 }
});

test('the square dining table keeps the same full-depth tabletop in every facing',()=>{
 for(const rotation of rotations){
  const top=render('dining-table',rotation).filter(call=>call[0]==='fillRect'&&call[3]>=110&&call[4]>=75);
  assert.ok(top.length>0,`dining table ${rotation} collapses its square tabletop into a narrow strip`);
 }
});

test('the seated furniture exports separate foreground art and visual anchors',async()=>{
 const views=await import('../web/furniture-views.js');
 assert.equal(typeof views.drawFacingFurnitureForeground,'function');
 assert.equal(typeof views.furnitureSeatVisualOffset,'function');
 for(const type of ['sofa','armchair','chair']){
  assert.deepEqual(views.furnitureSeatVisualOffset({type,rotation:0}),{x:0,y:0});
  assert.deepEqual(views.furnitureSeatVisualOffset({type,rotation:90}),{x:14,y:0});
  assert.deepEqual(views.furnitureSeatVisualOffset({type,rotation:180}),{x:0,y:36});
  assert.deepEqual(views.furnitureSeatVisualOffset({type,rotation:270}),{x:-6,y:0});
 }
 assert.deepEqual(views.furnitureSeatVisualOffset({type:'bed',rotation:180}),{x:0,y:0});
 assert.deepEqual(views.furnitureSeatVisualOffset({type:'sofa'}),{x:0,y:0});
});


test('the foreground preserves every seated head for male, female and phone poses',async()=>{
 const {drawFacingFurnitureForeground,furnitureSeatVisualOffset}=await import('../web/furniture-views.js');
 await preloadNativeAvatars();
 let createCanvas;try{({createCanvas}=createRequire(import.meta.url)('@napi-rs/canvas'));}catch{({createCanvas}=createRequire(process.execPath)('@napi-rs/canvas'));}
 for(const type of ['sofa','armchair','chair'])for(const rotation of rotations)for(const gender of [0,1])for(const phoneOpen of [false,true]){
  const [columns,rows]=sizes[type],side=rotation%180!==0,w=(side?rows:columns)*70,h=(side?columns:rows)*58,item={type,rotation},offset=furnitureSeatVisualOffset(item),x=100,y=100,source=type==='sofa'?[[35,47],[105,47]]:[[35,47]],canvas=createCanvas(400,400),context=canvas.getContext('2d'),heads=[];
  drawFurnitureVolume(context,item,type,x,y,w,h,'#7d9de6');
  for(const [sx,sy]of source){
   const [px,py]=rotation===0?[sx,sy]:rotation===90?[58-sy,sx]:rotation===180?[columns*70-sx,58-sy]:[sy,columns*70-sx],anchorX=x+px+offset.x,anchorY=y+py+offset.y,scale=1.25,ox=anchorX-avatarGeometry.anchorX*scale,oy=anchorY-avatarGeometry.anchorY*scale,options={scale,anchorX:avatarGeometry.anchorX,anchorY:avatarGeometry.anchorY,facing:({0:'down',90:'left',180:'up',270:'right'})[rotation],pose:'sit',phoneOpen};
   const native=readyAvatarRaster({...defaultAvatar,gender},options),frame=sourceActorFrame({gender},options);assert.equal(frame.poseFamily,'seated');assert.equal(frame.frameIndex,0);assert.equal(native.factor,2);
   const mask=createCanvas(400,400),maskContext=mask.getContext('2d');drawAvatarCanvas(maskContext,{...defaultAvatar,gender},ox,oy,options);heads.push({mask:maskContext.getImageData(0,0,400,400).data,bottom:Math.floor(oy+frame.head.neckAnchor[1]*scale)});
   drawAvatarCanvas(context,{...defaultAvatar,gender},ox,oy,options);
  }
  const before=context.getImageData(0,0,400,400).data;drawFacingFurnitureForeground(context,item,type,x,y,w,h,'#7d9de6');const after=context.getImageData(0,0,400,400).data;
  for(const {mask,bottom}of heads){let visible=0;for(let yy=0;yy<bottom;yy++)for(let xx=0;xx<400;xx++){const index=(yy*400+xx)*4;if(mask[index+3]){assert.deepEqual(after.slice(index,index+4),before.slice(index,index+4),`${type} ${rotation} ${gender?'female':'male'} phone=${phoneOpen} has a hidden head pixel`);visible++;}}assert.ok(visible>50,`${type} ${rotation} has no readable seated head`);}
 }
});
