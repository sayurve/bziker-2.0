import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire}from'node:module';import{resolve}from'node:path';
import {parts,defaultAvatar}from'../../../game/web/avatar.js';
import {loadSourceActor,sourceActorFrame}from'../../../game/web/source-actors.js';
import{pathToFileURL}from'node:url';
const {customizeSourceGrid}=await import(process.env.BZIKER_SKIRT_CANDIDATE?pathToFileURL(resolve(process.env.BZIKER_SKIRT_CANDIDATE)).href:'../../../game/web/actor-sprite.js');
const{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
// fileURLToPath preserves non-ASCII project paths.
import{fileURLToPath}from'node:url';
const nativeLoad=p=>loadImage(resolve(fileURLToPath(new URL('../../../game/',import.meta.url)),p.replace(/^\//,'')));
for(const id of['human-male','human-female'])await loadSourceActor(id,{createCanvas,loadImage:nativeLoad});
const sources=[];
for(const gender of[0,1])for(const facing of['down','right','up','left'])for(const phase of[-1,0,1,2,3]){
 const a={...defaultAvatar,gender},options=phase<0?{facing}:{facing,walking:true,walkFrame:phase*2},frame=sourceActorFrame(a,options),r=frame.rect,c=createCanvas(r.w,r.h).getContext('2d');c.drawImage(await nativeLoad(frame.atlas),r.x,r.y,r.w,r.h,0,0,r.w,r.h);const px=c.getImageData(0,0,r.w,r.h).data;const grid=Array.from({length:r.w*r.h},(_,n)=>px[n*4+3]>127?'#'+[0,1,2].map(k=>px[n*4+k].toString(16).padStart(2,'0')).join(''):null);sources.push({gender,facing,phase,frame,grid});
}
const channels=c=>[1,3,5].map(n=>parseInt(c.slice(n,n+2),16));
test('native skirt has a continuous central cloth panel in idle and all walking phases',()=>{
 const failures=[];for(const s of sources){const a={...defaultAvatar,gender:s.gender,pantsStyle:2},g=customizeSourceGrid(s.grid,a,parts,{facing:s.facing,head:s.frame.head});for(let y=46;y<54;y++)for(let x=22;x<=26;x++)if(!g[y*48+x])failures.push(`${s.gender}/${s.facing}/${s.phase} hole${x},${y}`);}
 assert.deepEqual(failures,[]);
});
test('skirt preserves native shirt, face, feet and visible hands',()=>{
 for(const s of sources){const a={...defaultAvatar,gender:s.gender},options={facing:s.facing,head:s.frame.head},plain=customizeSourceGrid(s.grid,a,parts,options),skirt=customizeSourceGrid(s.grid,{...a,pantsStyle:2},parts,options);
  for(let y=0;y<64;y++)for(let x=0;x<48;x++){const n=y*48+x,c=s.grid[n];if(y<44||y>=59)assert.equal(skirt[n],plain[n],`${s.gender}/${s.facing}/${s.phase} unchanged region${x},${y}`);if(y>=44&&y<54&&c){const[r,g,b]=channels(c);if(r>160&&r-g>26&&g-b>13)assert.equal(skirt[n],plain[n],`hand${x},${y}`);}}
 }
});
test('black skirt panel does not sample bright shirt rows into horizontal stripes',()=>{
 for(const s of sources){const a={...defaultAvatar,gender:s.gender,pantsStyle:2},g=customizeSourceGrid(s.grid,a,parts,{facing:s.facing,head:s.frame.head});for(let y=46;y<54;y++)for(let x=22;x<=26;x++){const c=g[y*48+x];if(!c)continue;const[r,v,b]=channels(c);if(r>160&&r-v>26&&v-b>13)continue;assert.ok(Math.max(r,v,b)<130,`${s.gender}/${s.facing}/${s.phase} bright garment pixel${x},${y}:${c}`);}}
});
