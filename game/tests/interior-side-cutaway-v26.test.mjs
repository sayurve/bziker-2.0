import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {preloadSourceInteriorRoom,drawSourceInteriorSurfaces} from '../web/source-interiors.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),root=new URL('../',import.meta.url),rooms=JSON.parse(readFileSync(new URL('web/interiors-map.json',root))).rooms;
globalThis.OffscreenCanvas=class{constructor(w,h){return createCanvas(w,h);}};
const samples=new Map(),background=[23,26,28,255];
async function rendered(room){
 if(samples.has(room.id))return samples.get(room.id);
 await preloadSourceInteriorRoom(room,path=>loadImage(fileURLToPath(new URL(path.replace(/^\//,''),root))));
 const ctx=createCanvas(room.width,room.height).getContext('2d');assert.equal(drawSourceInteriorSurfaces(ctx,room),true);const pixels=ctx.getImageData(0,0,room.width,room.height).data;samples.set(room.id,pixels);return pixels;
}
const native=(pixels,width,x,y)=>[...pixels.subarray((Math.floor(y)*width+Math.floor(x))*4,(Math.floor(y)*width+Math.floor(x))*4+4)];
const isBackground=rgba=>rgba.every((v,i)=>v===background[i]);
test('actual room surfaces never paint detached perspective wings outside the physical wall envelope',async()=>{
 for(const room of rooms){
  const pixels=await rendered(room),b=room.bounds;
  // The allowed upright is the 176-high rear wall. Along the rectangular
  // floor sides only an18-wide cutaway is spatially consistent. One pixel
  // around the envelope accounts for fractional native clipping at L/R.
  const inside=(x,y,l,t,r,bot)=>x>=l-1&&x<=r+1&&y>=t-1&&y<=bot+1;
  let escaped=0;
  for(let y=Math.max(0,Math.floor(b.top-400));y<=Math.min(room.height-1,Math.ceil(b.bottom+24));y++)for(let x=Math.max(0,Math.floor(b.left-360));x<=Math.min(room.width-1,Math.ceil(b.right+360));x++){
   if(inside(x+.5,y+.5,b.left,b.top-174,b.right,b.top+2)||inside(x+.5,y+.5,b.left,b.top,b.right,b.bottom)||inside(x+.5,y+.5,b.left-18,b.top,b.left,b.bottom+20)||inside(x+.5,y+.5,b.right,b.top,b.right+18,b.bottom+20)||inside(x+.5,y+.5,b.left,b.bottom,b.right,b.bottom+20))continue;
   const k=(y*room.width+x)*4;if(background.some((v,i)=>v!==pixels[k+i]))escaped++;
  }
  assert.equal(escaped,0,`${room.id}: native pixels outside actual rear/side/front planes form detached panels`);
 }
});
test('actual rear corners and both side cutaways meet the floor continuously at the collision boundary',async()=>{
 for(const room of rooms){const p=await rendered(room),b=room.bounds;
  for(let y=b.top+3;y<b.bottom-3;y+=19)for(const x of[b.left-8,b.left+8,b.right-8,b.right+8])assert.equal(isBackground(native(p,room.width,x,y)),false,`${room.id}: real boundary/floor gap at${x},${y}`);
  for(const x of[b.left-8,b.left+8,b.right-8,b.right+8])assert.equal(isBackground(native(p,room.width,x,b.top+3)),false,`${room.id}: side does not meet the rear ground corner`);
  for(const x of[b.left-22,b.right+22])assert.equal(isBackground(native(p,room.width,x,(b.top+b.bottom)/2)),true,`${room.id}: the side plane extends beyond its physical cutaway`);
 }
});
