import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loadSourceActor,drawSourceAvatarCanvas} from '../web/source-actors.js';
import {defaultAvatar,parts} from '../web/avatar.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
await loadSourceActor('human-male',{createCanvas,loadImage:p=>loadImage(fileURLToPath(new URL('../'+p,import.meta.url)))});
const avatar={...defaultAvatar,gender:0,hairStyle:7,hairColor:6,skin:3,shirtColor:8,outfit:0,headwear:0};
function render(o,a=avatar){const c=createCanvas(96,128);assert.ok(drawSourceAvatarCanvas(c.getContext('2d'),a,parts,0,0,{facing:'left',...o,scale:2}));return c.getContext('2d').getImageData(0,0,96,128).data;}
function components(p){const unseen=new Set(Array.from({length:96*128},(_,n)=>n).filter(n=>p[n*4+3]>127)),cc=[];while(unseen.size){const start=unseen.values().next().value,q=[start],ps=[];unseen.delete(start);while(q.length){const n=q.pop(),x=n%96,y=Math.floor(n/96);ps.push([x,y]);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<96&&yy>=0&&yy<128&&unseen.delete(yy*96+xx))q.push(yy*96+xx);}}cc.push(ps);}return cc;}
test('actual selected male H7 white LEFT has no orphan retained scalp dust in idle, run, phone and action bodies',()=>{
 const cases=[{}, {phoneOpen:true}, ...Array.from({length:4},(_,n)=>({walking:true,running:true,walkFrame:n*2})), ...['eat','drink','smoke','pick-litter','throw-litter','pet'].flatMap(action=>[0,.2,.5,.9].map(actionProgress=>({action,actionProgress}))), ...[0,.2,.5,.9].map(actionProgress=>({pose:'sit',action:'drink',actionProgress}))];
 for(const o of cases){const p=render(o),dust=components(p).filter(c=>c.length<=2&&c.every(([,y])=>y<65));assert.equal(dust.length,0,`${JSON.stringify(o)} actual detached scalp ${JSON.stringify(dust)}`);const natural=render(o,{...avatar,hairStyle:0});for(let y=110;y<128;y++)for(let x=0;x<96;x++){const k=(y*96+x)*4;assert.deepEqual([...p.slice(k,k+4)],[...natural.slice(k,k+4)],'hair cleanup cannot modify lower body/hand alpha or RGBA');}}
});
test('H7 LEFT exact before/after native raster differs only at the five confirmed orphan scalp pixels',async()=>{
 const before=await loadImage(fileURLToPath(new URL('../../verification/hair-tint-v30/h7-left-islands-before.png',import.meta.url))),c=createCanvas(576,768),q=c.getContext('2d');q.drawImage(before,0,0);const raw=q.getImageData(0,0,576,768).data,p=render({}),dust=new Set(['46,15','28,18','28,19','67,41','64,49']);let removed=0;
 for(let y=0;y<128;y++)for(let x=0;x<96;x++){const b=((y*6+3)*576+x*6+3)*4,n=(y*96+x)*4,bg=raw[b]===197&&raw[b+1]===205&&raw[b+2]===208,expected=bg?[0,0,0,0]:[...raw.slice(b,b+3),255];if(dust.has(`${x},${y}`)){assert.deepEqual(expected,[49,48,48,255],'literal visible frozen native dust');assert.equal(p[n+3],0);removed++;}else assert.deepEqual([...p.slice(n,n+4)],expected,`all other original face/body/strands unchanged at ${x},${y}`);}
 assert.equal(removed,5);
});
