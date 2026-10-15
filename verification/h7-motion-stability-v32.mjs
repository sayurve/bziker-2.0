import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {locomotionActorsData as L} from '../game/web/locomotion-actors-data.js';
import {canonicalActorsData as C} from '../game/web/canonical-actors-data.js';
import {sourcePortraitMask} from '../game/web/actor-sprite.js';
import {avatarRaster,parts,profileAvatar} from '../game/web/avatar.js';
import {createCanvas,pngGrid,render} from '../game/tests/helpers/character-core-native-fixture-v30.mjs';
const avatar=profileAvatar({gender:0,hairStyle:7,hairColor:6,skin:3,shirtColor:8,outfit:0,headwear:0}),rows=[];
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function bbox(points){return points.length?{left:Math.min(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),right:Math.max(...points.map(p=>p[0])),bottom:Math.max(...points.map(p=>p[1]))}:null}
for(const facing of ['left','right','down','up']){
 for(let phase=0;phase<4;phase++){
  const f=L.actors['human-male'].run[facing].frames[phase],raw=await pngGrid(f.detail.path,f.detail),raster=avatarRaster(avatar,{walking:true,running:true,facing,walkFrame:phase*2}),mask=sourcePortraitMask(raw,96,128,avatar,parts,{head:f.head,facing,pelvis:f.pelvis});
  const head=[],hair=[],headPixels=[],hairPixels=[],origin=f.head.eyeAnchor.map(v=>Math.round(v*2));
  for(let n=0;n<raw.length;n++){const x=n%96,y=Math.floor(n/96),color=raster.grid[n];if(!color)continue;if(mask.head[n]){head.push([x,y]);headPixels.push([x-origin[0],y-origin[1],color]);}if(mask.head[n]&&!mask.face[n]){hair.push([x,y]);hairPixels.push([x-origin[0],y-origin[1],color]);}}
  rows.push({facing,phase,eyeFine:f.head.eyeAnchor.map(v=>v*2),neckFine:f.head.neckAnchor.map(v=>v*2),pelvis:f.pelvis,headBounds:bbox(head),hairBounds:bbox(hair),headPixels:head.length,hairPixels:hair.length,registeredHeadHash:hash(headPixels),registeredHairHash:hash(hairPixels),headPixelMap:headPixels,hairPixelMap:hairPixels});
 }
}
const diff=(a,b)=>{const x=new Map(a.map(([x,y,c])=>[`${x},${y}`,c])),y=new Map(b.map(([x,y,c])=>[`${x},${y}`,c]));return [...new Set([...x.keys(),...y.keys()])].filter(k=>x.get(k)!==y.get(k)).length};
for(const row of rows){const base=rows.find(a=>a.facing===row.facing&&a.phase===0);row.registeredHeadDifferences=diff(base.headPixelMap,row.headPixelMap);row.registeredHairDifferences=diff(base.hairPixelMap,row.hairPixelMap);}
for(const row of rows){delete row.headPixelMap;delete row.hairPixelMap;}
const contact=createCanvas(5*310,2*440),q=contact.getContext('2d');q.fillStyle='#dbe3e1';q.fillRect(0,0,contact.width,contact.height);q.font='18px sans-serif';q.imageSmoothingEnabled=false;
for(const [row,facing] of ['left','right'].entries())for(let phase=-1;phase<4;phase++){const r=render(avatar,phase<0?{facing}:{facing,walking:true,running:true,walkFrame:phase*2}),frame=phase<0?C.actors['human-male'].idle[facing].frames[0]:L.actors['human-male'].run[facing].frames[phase],x=(phase+1)*310+8,y=row*440+42;q.fillStyle='#29383d';q.fillText(`${facing} ${phase<0?'idle':'phase '+phase}`,x,y-16);q.drawImage(r.canvas,x,y,288,384);q.strokeStyle='#ed6547';q.beginPath();q.moveTo(x,y+frame.head.neckAnchor[1]*6);q.lineTo(x+288,y+frame.head.neckAnchor[1]*6);q.stroke();q.fillStyle='#29383d';q.fillText(`neck ${frame.head.neckAnchor.join(',')}`,x,y+409)}
const result={input:avatar,method:'Actual native fine avatar raster; head-only material mask from raw source with selected hair; aligned by authored eyeAnchor (integer fine translation only). No image changes.',rows,sourceHashes:Object.fromEntries(['source-actors.js','actor-sprite.js','locomotion-actors-data.js'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(fileURLToPath(new URL('../game/web/'+p,import.meta.url)))).digest('hex')]))};
fs.writeFileSync(new URL('./h7-motion-stability-v32.json',import.meta.url),JSON.stringify(result,null,2));fs.writeFileSync(new URL('./h7-motion-stability-v32.png',import.meta.url),contact.toBuffer('image/png'));
console.log(JSON.stringify(rows,null,2));
