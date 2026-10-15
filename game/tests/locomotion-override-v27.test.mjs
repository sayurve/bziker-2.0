import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {sourceActorsData as D} from '../web/source-actors-data.js';
import {advanceWalkCycle} from '../web/walk-cycle.js';
import {sourceActorFrame,loadSourceActor,drawSourceAvatarCanvas} from '../web/source-actors.js';
import {defaultAvatar,parts} from '../web/avatar.js';

const moduleUrl=new URL('../web/locomotion-actors-data.js',import.meta.url);
const manifest=async()=>{assert.ok(existsSync(moduleUrl),'the opt-in locomotion manifest must exist independently of legacy source data');return(await import(moduleUrl)).locomotionActorsData;};
const baseRun=(id,direction='Справа')=>Object.values(D.actors[id].actions).find(s=>s.name.includes('Бег')&&s.name.includes(direction));
function fixture(id='human-male'){
 const actor=D.actors[id],sequence=baseRun(id);
 return{status:'approved',artReview:{checked:true,evidence:['test fixture only; no production artwork approval']},images:actor.images,detail_images:actor.detail_images,
  run:{right:{...sequence,id:'fixture-reviewed-run-'+id+'-right',sourceKey:'fixture://locomotion/run/right',images:actor.images,detail_images:actor.detail_images,frames:structuredClone(sequence.frames),sprite_size:[48,64],anchor:[24,63]}}};
}
async function withActor(id,value,run){const data=await manifest(),previous=data.actors[id];data.actors[id]=value;try{return await run(data);}finally{if(previous===undefined)delete data.actors[id];else data.actors[id]=previous;}}

test('empty, draft and unreviewed locomotion leave normal source run selection unchanged',async()=>{
 const data=await manifest();assert.equal(data.version,1);
 const id='human-male',baseline=baseRun(id).name;
 const incomplete=fixture();incomplete.run.right.frames.pop();
 const malformed=fixture();malformed.run.right.frames[2]={};
 for(const value of[undefined,{}, {...fixture(),status:'draft'}, {...fixture(),artReview:{checked:false,evidence:['x']}}, {...fixture(),artReview:{checked:true,evidence:[]}}, {...fixture(),artReview:{checked:true,evidence:[' ']}},incomplete,malformed])await withActor(id,value,()=>{
  assert.equal(sourceActorFrame({}, {walking:true,running:true,facing:'right',walkFrame:4,allowDraft:true}).id,baseline,'allowDraft cannot activate runtime art');
 });
});

test('approved whole poses keep all four native phases, logical canvas and feet anchor',async()=>{
 for(const [id,gender]of[['human-male',0],['human-female',1]])await withActor(id,fixture(id),()=>{
  const frames=Array.from({length:8},(_,walkFrame)=>sourceActorFrame({gender},{walking:true,running:true,facing:'right',walkFrame}));
  assert.deepEqual(frames.map(f=>f.frameIndex),[0,0,1,1,2,2,3,3]);
  for(const f of frames){assert.match(f.id,/^fixture-reviewed-run-/);assert.deepEqual(f.spriteSize,[48,64]);assert.deepEqual(f.anchor,[24,63]);assert.deepEqual(f.offset,[0,0]);assert.deepEqual([f.rect.w,f.rect.h],[48,64]);assert.deepEqual([f.rect.detail.w,f.rect.detail.h,f.rect.detail.factor],[96,128,2]);assert.equal(f.facing,'right');}
  assert.match(sourceActorFrame({gender},{action:'run',facing:'right',walkFrame:6}).id,/^fixture-reviewed-run-/);
 });
});

test('ordinary walk shares approved gait while missing directions and explicit archives retain safe adapters',async()=>{
 await withActor('human-male',fixture(),()=>{
  assert.equal(sourceActorFrame({}, {walking:true,running:true,facing:'left'}).id,baseRun('human-male','Слева').name);
  assert.equal(sourceActorFrame({}, {walking:true,facing:'right'}).id,'fixture-reviewed-run-human-male-right');
  assert.match(sourceActorFrame({}, {walking:true,facing:'left'}).id,/Ходьба/,'missing reviewed direction retains actual legacy walk fallback');
  assert.equal(sourceActorFrame({}, {animationId:baseRun('human-male').name,facing:'right',sourceTime:.2}).id,baseRun('human-male').name);
  assert.doesNotMatch(sourceActorFrame({}, {facing:'right'}).id,/fixture/);
  assert.match(sourceActorFrame({}, {pose:'sit',facing:'right'}).id,/seated/);
  const phone=sourceActorFrame({}, {pose:'sit',phoneOpen:true,facing:'right'}),seated=sourceActorFrame({}, {pose:'sit',facing:'right'});assert.equal(phone.id,seated.id);assert.equal(phone.context,'seated');assert.equal(phone.prop,'phone');assert.deepEqual(phone.pelvis,seated.pelvis);
 });
});

test('approved locomotion uses the same accepted-distance clock and resets only at stop or scene transfer',async()=>{
 await withActor('human-male',fixture(),()=>{
  for(const fps of[60,120,240]){let state;const observed=new Set();
   for(let i=0;i<=fps*2;i++){state=advanceWalkCycle(state,{x:200+i*172/fps,y:300,walking:true,scene:'city'});const f=sourceActorFrame({}, {walking:true,running:true,facing:'right',walkFrame:state.frame});observed.add(f.frameIndex);assert.match(f.id,/^fixture-reviewed-run-/);}
   assert.deepEqual([...observed].sort(),[0,1,2,3]);
   assert.equal(advanceWalkCycle(state,{...state,walking:false,scene:'city'}).frame,0);
   assert.equal(advanceWalkCycle(state,{...state,walking:true,scene:'interior',interior_id:'railway'}).frame,0);
  }
 });
});

test('actor preload ignores draft motion PNGs and decodes all approved coarse and detail pages',async()=>{
 const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),requests=[];
 const actor=fixture(),coarse=Array.from({length:4},(_,i)=>({path:`fixture-motion-approved-${i}-coarse`,width:48,height:64})),fine=Array.from({length:4},(_,i)=>({path:`fixture-motion-approved-${i}-fine`,width:96,height:128}));
 actor.images=coarse;actor.detail_images=fine;
 const environment={createCanvas,loadImage:async p=>{requests.push(p);return p.startsWith('fixture-motion-')?createCanvas(p.endsWith('fine')?96:48,p.endsWith('fine')?128:64):loadImage(fileURLToPath(new URL('../'+p,import.meta.url)));}};
 await withActor('human-male',{...actor,status:'draft'},async()=>{await loadSourceActor('human-male',environment);assert.ok(!requests.some(p=>p.startsWith('fixture-motion-')));});
 await withActor('human-male',actor,async()=>{await loadSourceActor('human-male',environment);for(const p of[...coarse,...fine])assert.ok(requests.includes(p.path),p.path);});
});

test('customization and fine native rendering retain their pixels and geometry under a reviewed motion override',async()=>{
 const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
 await loadSourceActor('human-male',{createCanvas,loadImage:p=>loadImage(fileURLToPath(new URL('../'+p,import.meta.url)))});
 const render=(avatar,walkFrame)=>{const c=createCanvas(96,128).getContext('2d');assert.equal(drawSourceAvatarCanvas(c,avatar,parts,0,0,{walking:true,running:true,facing:'right',walkFrame,scale:2}),true);return c.getImageData(0,0,96,128).data;};
 const baseline=await withActor('human-male',undefined,()=>Array.from({length:4},(_,i)=>render(defaultAvatar,i*2)));
 await withActor('human-male',fixture(),()=>{
  for(let i=0;i<4;i++){const native=render(defaultAvatar,i*2);assert.deepEqual(native,baseline[i],'an override must not invent a fit or warp');assert.deepEqual(render(defaultAvatar,i*2+1),native,'two clock samples share the same whole pose');assert.notDeepEqual(render({...defaultAvatar,shirtColor:2},i*2),native,'wardrobe recolor survives');}
 });
});
