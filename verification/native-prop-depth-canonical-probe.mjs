import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {preloadExactSourceCity,drawExactSourceCity,sourceCityExactObjects} from '../game/web/source-city.js';
import {loadSourceActor} from '../game/web/source-actors.js';
import {drawAvatar} from '../game/web/world.js';
import {cityPhysicalObstacles,nearestFreeCityPoint} from '../game/web/city-collision.js';
import {defaultAvatar} from '../game/web/avatar.js';

const require=createRequire(process.execPath),{createCanvas,loadImage}=require('@napi-rs/canvas');
const map=JSON.parse(await readFile(new URL('../game/web/world-layout-v19.json',import.meta.url),'utf8'));
const physical=cityPhysicalObstacles(map,JSON.parse(await readFile(new URL('../game/web/prop-collisions.json',import.meta.url),'utf8')));
const clampPosition=(x,y)=>nearestFreeCityPoint({x,y},physical,{left:18,right:map.width-18,top:18,bottom:map.height-18});
await preloadExactSourceCity(url=>loadImage(fileURLToPath(new URL(`../game${url}`,import.meta.url))),{createCanvas});
await loadSourceActor('human-male',{createCanvas,loadImage:path=>loadImage(fileURLToPath(new URL(`../game/${path}`,import.meta.url)))});
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


const point={x:1120,y:290},r=render(point,{propsOnly:true}),lamp=foreground.find(n=>n.id==='native-prop-native-lamp-north-1'),mask=createCanvas(1536,1024),mc=mask.getContext('2d');mc.scale(.2,.2);lamp.draw(mc);const alpha=mc.getImageData(0,0,1536,1024).data;
console.log('lamp',lamp.id,lamp.bounds,lamp.depth);
for(let y=43;y<=59;y++){let row='';for(let x=215;x<=230;x++){const changed=JSON.stringify(pixel(r.actorPixels,x,y))!==JSON.stringify(pixel(source,x,y)),kept=JSON.stringify(pixel(r.pixels,x,y))===JSON.stringify(pixel(r.actorPixels,x,y)),opaque=alpha[(y*1536+x)*4+3];row+=changed?(kept?(opaque?'k':'A'):(opaque?'L':'X')):(opaque?'l':'.');}console.log(y,row);}
console.log('old samples',[[222,54],[222,56]].map(([x,y])=>({x,y,source:pixel(source,x,y),actor:pixel(r.actorPixels,x,y),final:pixel(r.pixels,x,y)})));

const witnesses=[];for(let y=54;y<=56;y++)for(let x=222;x<=223;x++){const actor=pixel(r.actorPixels,x,y),ground=pixel(source,x,y);if(actor.some((v,i)=>v!==ground[i]))witnesses.push({x,y,ground,actor,final:pixel(r.pixels,x,y),lampAlpha:alpha[(y*1536+x)*4+3]});}console.log('actual witnesses',JSON.stringify(witnesses));

const rectangle=createCanvas(1536,1024),rc=rectangle.getContext('2d'),copy=rc.createImageData(1536,1024);copy.data.set(r.actorPixels);rc.putImageData(copy,0,0);rc.scale(.2,.2);drawExactSourceCity(rc,map,lamp.bounds);const wrong=rc.getImageData(0,0,1536,1024).data;console.log('crop-rectangle mutation erased witness count',witnesses.filter(p=>pixel(wrong,p.x,p.y).some((v,i)=>v!==p.actor[i])).length);
