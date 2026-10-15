import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {preloadExactSourceCity,drawExactSourceCity,sourceCityExactObjects} from '../web/source-city.js';
import {loadSourceActor} from '../web/source-actors.js';
import {drawAvatar} from '../web/world.js';
import {cityPhysicalObstacles,nearestFreeCityPoint} from '../web/city-collision.js';
import {defaultAvatar} from '../web/avatar.js';

const require=createRequire(process.execPath),{createCanvas,loadImage}=require('@napi-rs/canvas');
const map=JSON.parse(await readFile(new URL('../web/world-layout-v19.json',import.meta.url),'utf8'));
const physical=cityPhysicalObstacles(map,JSON.parse(await readFile(new URL('../web/prop-collisions.json',import.meta.url),'utf8')));
const clampPosition=(x,y)=>nearestFreeCityPoint({x,y},physical,{left:18,right:map.width-18,top:18,bottom:map.height-18});
await preloadExactSourceCity(url=>loadImage(fileURLToPath(new URL(`..${url}`,import.meta.url))),{createCanvas});
await loadSourceActor('human-male',{createCanvas,loadImage:path=>loadImage(fileURLToPath(new URL(`../${path}`,import.meta.url)))});
const foreground=sourceCityExactObjects(map).sort((a,b)=>a.depth-b.depth);
const render=(point=null,{propsOnly=false}={})=>{
 const canvas=createCanvas(1536,1024),ctx=canvas.getContext('2d');ctx.scale(.2,.2);drawExactSourceCity(ctx,map);
 if(point)drawAvatar(ctx,{...point,avatar:defaultAvatar,facing:'down',pose:'idle',walking:false},0,false,false,true,0,[],false);
 const actorPixels=ctx.getImageData(0,0,1536,1024).data;
 for(const node of foreground)if((!propsOnly||node.id.startsWith('native-prop-'))&&(!point||node.depth>=point.y))node.draw(ctx);
 return {pixels:ctx.getImageData(0,0,1536,1024).data,actorPixels};
};
const pixel=(data,x,y)=>Array.from(data.subarray((y*1536+x)*4,(y*1536+x)*4+4));
const source=render().pixels;

test('the native lamp head and pole stay in front of a legal player standing behind their ground base',()=>{
 const point={x:1095,y:285};assert.deepEqual(clampPosition(point.x,point.y),point);
 const {pixels,actorPixels}=render(point);
 for(const [x,y]of [[218,48],[219,49],[219,50]]){
  assert.notDeepEqual(pixel(actorPixels,x,y),pixel(source,x,y),'the source actor must actually overlap the lamp');
  assert.deepEqual(pixel(pixels,x,y),pixel(source,x,y),`lamp foreground pixel ${x},${y} must come from the original PNG`);
 }
});

test('the same lamp stays behind a player standing in front of its physical base',()=>{
 const point={x:1095,y:360};assert.deepEqual(clampPosition(point.x,point.y),point);
 const {pixels,actorPixels}=render(point,{propsOnly:true});
 const visible=[218,63];assert.notDeepEqual(pixel(actorPixels,...visible),pixel(source,...visible));
 assert.deepEqual(pixel(pixels,...visible),pixel(actorPixels,...visible));
});

test('lamp silhouettes do not erase the player standing on adjacent visible pavement',()=>{
 const point={x:1120,y:290};assert.deepEqual(clampPosition(point.x,point.y),point);
 const {pixels,actorPixels}=render(point,{propsOnly:true});
 // This authored pavement notch is inside the lamp's rectangular crop but
 // outside its actual silhouette. Canonical idle is narrower at the shins:
 // select real overlapping actor pixels, rather than two old empty pixels.
 const lamp=foreground.find(node=>node.id==='native-prop-native-lamp-north-1');
 assert.ok(lamp&&lamp.depth>=point.y,'the real lamp foreground must be active');
 const mask=createCanvas(1536,1024),maskCtx=mask.getContext('2d');maskCtx.scale(.2,.2);lamp.draw(maskCtx);
 const maskPixels=maskCtx.getImageData(0,0,1536,1024).data,witnesses=[];
 for(let y=54;y<=56;y++)for(let x=222;x<=223;x++){
  // These rows are above the foot shadow; differences come from the body.
  if(pixel(actorPixels,x,y).every((v,i)=>v===pixel(source,x,y)[i]))continue;
  witnesses.push([x,y]);
  assert.ok(x>=lamp.bounds.x/5&&x<(lamp.bounds.x+lamp.bounds.width)/5&&y>=lamp.bounds.y/5&&y<(lamp.bounds.y+lamp.bounds.height)/5,'the actor must overlap the crop that a rectangle would wrongly erase');
  assert.equal(pixel(maskPixels,x,y)[3],0,'the authored lamp silhouette leaves this pavement visible');
  assert.notDeepEqual(pixel(actorPixels,x,y),pixel(source,x,y),'observe a real overlapping actor pixel');
  assert.deepEqual(pixel(pixels,x,y),pixel(actorPixels,x,y),'a crop rectangle would incorrectly replace the player with pavement');
 }
 assert.ok(witnesses.length>=3,'inspect actual actor coverage in the transparent lamp notch');
});

test('the parked native car covers the player shadow behind its body and stays behind a player in front',()=>{
 const behind={x:500,y:310},front={x:500,y:425};
 for(const p of [behind,front])assert.deepEqual(clampPosition(p.x,p.y),p);
 const back=render(behind),ahead=render(front);
 assert.notDeepEqual(pixel(back.actorPixels,100,62),pixel(source,100,62));
 assert.deepEqual(pixel(back.pixels,100,62),pixel(source,100,62));
 assert.notDeepEqual(pixel(ahead.actorPixels,100,74),pixel(source,100,74));
 assert.deepEqual(pixel(ahead.pixels,100,74),pixel(ahead.actorPixels,100,74));
});

test('the actual freestanding sign frame occludes the body of a player behind its feet',()=>{
 const point={x:4900,y:4585};assert.deepEqual(clampPosition(point.x,point.y),point);
 const {pixels,actorPixels}=render(point);
 for(const xy of [[980,910],[980,912]]){
  assert.notDeepEqual(pixel(actorPixels,...xy),pixel(source,...xy));
  assert.deepEqual(pixel(pixels,...xy),pixel(source,...xy));
 }
});

test('each visible native train body covers a player behind its local diagonal ground edge',()=>{
 const cases=[
  {point:{x:5625,y:925},pixels:[[1125,178],[1125,180]]},
  {point:{x:6025,y:985},pixels:[[1205,191],[1204,193]]},
  {point:{x:6350,y:1090},pixels:[[1270,212],[1269,214]]},
  {point:{x:6900,y:1260},pixels:[[1380,244],[1380,246]]},
 ];
 for(const {point,pixels:overlap}of cases){
  assert.deepEqual(clampPosition(point.x,point.y),point);
  const {pixels,actorPixels}=render(point,{propsOnly:true});
  for(const xy of overlap){
   assert.notDeepEqual(pixel(actorPixels,...xy),pixel(source,...xy),`the actual actor at ${point.x},${point.y} must overlap native train pixel ${xy}`);
   assert.deepEqual(pixel(pixels,...xy),pixel(source,...xy),'train body must retain its source pixels in front of the actor');
  }
 }
});

test('diagonal coaches use their local ground edge rather than the farthest carriage corner',()=>{
 // The right end of coach 1 is at y211; its body at x1125 ends near y201.
 // A single y211 foreground depth would wrongly hide this actor in front.
 const point={x:5625,y:1030};assert.deepEqual(clampPosition(point.x,point.y),point);
 const {pixels,actorPixels}=render(point,{propsOnly:true});
 for(const xy of [[1125,194],[1125,197]]){
  assert.notDeepEqual(pixel(actorPixels,...xy),pixel(source,...xy));
  assert.deepEqual(pixel(pixels,...xy),pixel(actorPixels,...xy));
 }
});

test('actual platform canopies and vertical panels occlude players while their open front floor remains usable',()=>{
 const cases=[
  {behind:{x:4080,y:400},front:{x:4080,y:545},overlap:[816,75]},
  {behind:{x:4300,y:780},front:{x:4300,y:935},overlap:[860,150]},
  {behind:{x:5725,y:1125},front:{x:5725,y:1320},overlap:[1145,220]},
 ];
 for(const {behind,front,overlap}of cases){
  for(const point of [behind,front])assert.deepEqual(clampPosition(point.x,point.y),point,'open platform floor must remain walkable');
  const back=render(behind,{propsOnly:true});
  assert.notDeepEqual(pixel(back.actorPixels,...overlap),pixel(source,...overlap),`the actual actor at ${behind.x},${behind.y} must overlap platform pixel ${overlap}`);
  assert.deepEqual(pixel(back.pixels,...overlap),pixel(source,...overlap));
  const ahead=render(front,{propsOnly:true}),floor=[Math.round(front.x/5),Math.round(front.y/5)-8];
  assert.notDeepEqual(pixel(ahead.actorPixels,...floor),pixel(source,...floor));
  assert.deepEqual(pixel(ahead.pixels,...floor),pixel(ahead.actorPixels,...floor));
 }
});

test('the two narrow railway bridge posts cover actors behind them without masking the open gap',()=>{
 for(const {point,overlap}of [
  {point:{x:5970,y:1150},overlap:[1194,224]},
  {point:{x:6095,y:1170},overlap:[1219,228]},
 ]){
  assert.deepEqual(clampPosition(point.x,point.y),point);
  const {pixels,actorPixels}=render(point,{propsOnly:true});
  assert.notDeepEqual(pixel(actorPixels,...overlap),pixel(source,...overlap));
  assert.deepEqual(pixel(pixels,...overlap),pixel(source,...overlap));
 }
 const point={x:6025,y:1205};assert.deepEqual(clampPosition(point.x,point.y),point);
 const {pixels,actorPixels}=render(point,{propsOnly:true});
 for(const xy of [[1205,233],[1204,235]]){
  assert.notDeepEqual(pixel(actorPixels,...xy),pixel(source,...xy));
  assert.deepEqual(pixel(pixels,...xy),pixel(actorPixels,...xy),'the bridge opening remains transparent to the actor');
 }
});
