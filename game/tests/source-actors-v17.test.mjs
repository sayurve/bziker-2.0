import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const moduleUrl=new URL('../web/source-actors.js',import.meta.url);
const dataUrl=new URL('../web/source-actors-data.js',import.meta.url);
const api=async()=>{assert.ok(existsSync(moduleUrl),'The saved Bziker sprites must have a runtime player');return import(moduleUrl);};
const manifest=async()=>{assert.ok(existsSync(dataUrl),'All source animation keys need an imported manifest');return (await import(dataUrl)).sourceActorsData;};

test('the imported actor catalog retains all 22 entities and 374 original base actions',async()=>{
 const d=await manifest();assert.equal(Object.keys(d.actors).length,22);assert.equal(Object.values(d.actors).reduce((n,a)=>n+Object.keys(a.actions).length,0),374);
 assert.equal(d.rootMotion,false);assert.equal(d.coverage.source_motion_revision,3);
 for(const actor of Object.values(d.actors))for(const action of Object.values(actor.actions)){
  assert.equal(action.frames.length,4);assert.ok(action.timeline.length>0);assert.ok(action.sourceKey);assert.ok(action.frames.every(f=>f.w>0&&f.h>0));
  assert.ok(action.frames.every(f=>Number.isFinite(f.sourceScale)));assert.equal(new Set(action.frames.map(f=>f.sourceScale)).size,1,'one cycle cannot rescale the actor between its four phases');
 }
 assert.equal(Object.keys(d.daily).length,168);assert.equal(Object.keys(d.scenarios).length,532);assert.equal(Object.keys(d.gestures).length,160);
 for(const row of d.coverage.requested)assert.ok(row.sourceKeys.length>0,`${row.action} was silently dropped`);
});

test('whole walking frames advance by discrete source order without moving the feet anchor',async()=>{
 const a=await api(),frames=Array.from({length:8},(_,walkFrame)=>a.sourceActorFrame({gender:0},{walking:true,walkFrame,facing:'left'}));
 assert.equal(new Set(frames.map(f=>f.frameIndex)).size,4);
 for(let n=0;n<8;n+=2){assert.equal(frames[n].frameIndex,frames[n+1].frameIndex);assert.deepEqual(frames[n].anchor,[24,63]);assert.deepEqual(frames[n].offset,[0,0]);}
 const L=(await import('../web/locomotion-actors-data.js')).locomotionActorsData;
 for(const facing of ['down','right','up','left']){const walk=a.sourceActorFrame({}, {walking:true,facing}),run=a.sourceActorFrame({}, {walking:true,running:true,facing}),reviewed=L.actors['human-male']?.run?.[facing];if(reviewed){assert.equal(walk.sequence,reviewed);assert.equal(run.sequence,reviewed,'both ordinary speeds preserve the same approved whole-person identity')}else{assert.match(walk.sourceKey,/Ходьба/);assert.match(run.sourceKey,/Бег/)}}
 const originalWalk=Object.values((await manifest()).actors['human-male'].actions).find(s=>s.name.includes('Ходьба')&&s.name.includes('Слева'));assert.equal(a.sourceActorFrame({}, {animationId:originalWalk.sourceKey,facing:'left'}).id,originalWalk.name,'original walking art stays explicitly addressable in archive');
});

test('phone and food select seated source cycles without dropping the sitting context',async()=>{
 const a=await api();
 for(const gender of [0,1])for(const facing of ['down','right','up','left']){
  const phone=a.sourceActorFrame({gender},{pose:'sit',phoneOpen:true,facing});assert.match(phone.id,/-seated-/);assert.equal(phone.prop,'phone');assert.equal(phone.frameIndex,a.sourceActorFrame({gender},{pose:'sit',facing}).frameIndex);assert.ok(phone.pelvis);assert.equal(phone.context,'seated');assert.deepEqual(phone.offset,[0,0]);
  for(const action of ['eat','drink','smoke']){const f=a.sourceActorFrame({gender},{pose:'sit',action,facing,actionProgress:.5});assert.equal(f.context,'seated');assert.ok(f.hand||f.embeddedProps);}
  for(const action of ['eat','drink','smoke'])assert.equal(a.sourceActorFrame({gender},{pose:'sit',action,facing,phoneOpen:true,actionProgress:.5}).prop,'phone');
 }
 for(const action of ['pick-litter','throw-litter','pet','fish','boat'])assert.ok(a.sourceActorFrame({}, {action,actionProgress:.5}),action);
});

test('animals use deterministic actual breeds and source gait frames at the existing world coordinate',async()=>{
 const a=await api(),d=await manifest();
 for(const kind of ['cat','dog'])for(const id of ['park-'+kind,'owned-'+kind,'plaza-'+kind]){
  const p={kind,id,x:30,y:40,facing:'right',walking:true,walk_frame:2},f=a.sourceAnimalFrame(p,null,false,10);assert.equal(d.actors[f.actorId].kind,kind);assert.equal(a.sourceAnimalFrame(p,null,false,999).actorId,f.actorId);assert.deepEqual(f.offset,[0,0]);
  assert.equal(a.sourceAnimalFrame(p,null,true,10).frameIndex,a.sourceAnimalFrame({...p,walk_frame:3},null,true,11).frameIndex);
 }
});

test('canonical water keeps the reviewed body identity and never stands a seated boat occupant up; original source clips remain explicit archives',async()=>{
 const a=await api();for(const gender of[0,1]){
  for(const action of['fishing','fish-catch'])for(const progress of[0,.25,.5,.9]){const shore=a.sourceActorFrame({gender},{action,actionProgress:progress,facing:'left'}),boat=a.sourceActorFrame({gender},{action,actionProgress:progress,boat:true});assert.equal(shore.poseFamily,'water');assert.equal(shore.facing,'right');assert.equal(shore.context,'standing');assert.equal(boat.context,'seated');assert.equal(boat.frameIndex,3);assert.deepEqual(boat.offset,[0,0]);assert.ok(boat.pelvis&&boat.water.rodHand)}
  const idle=a.sourceActorFrame({gender},{boat:true}),phone=a.sourceActorFrame({gender},{phoneOpen:true,boat:true,facing:'right'});assert.equal(phone.id,idle.id);assert.deepEqual(phone.rect,idle.rect);assert.equal(phone.prop,'phone');assert.equal(phone.context,'seated');assert.deepEqual(phone.pelvis,idle.pelvis);assert.deepEqual(a.sourceActorFrame({gender},{boat:true,walking:true}).rect,idle.rect,'only one actual seated rowing keypose exists, no fake frame loop');
  const archived=a.sourceActorFrame({gender},{animationId:gender?'female-water':'male-fish-pocket',sourceProgress:.5});assert.equal(archived.id,gender?'female-water':'male-fish-pocket');assert.equal(archived.poseFamily,undefined);
 }
});

test('every supplied scenario and every animal action is addressable instead of silently becoming idle',async()=>{
 const a=await api(),d=await manifest();
 for(const scene of Object.values(d.scenarios)){
  const f=a.sourceActorFrame({gender:scene.actor==='female'?1:0},{animationId:scene.id,actionProgress:.5,facing:'right'});
  assert.ok(f?.sourceKey,scene.id);assert.equal(f.scenarioId,scene.id);assert.ok(f.rect.w>0&&f.rect.h>0);
 }
 for(const actor of Object.values(d.actors).filter(a=>a.kind!=='human'))for(const key of Object.keys(actor.actions)){
  const f=a.sourceAnimalFrame({kind:actor.kind,id:'explicit',breed:actor.id,animationId:key,actionProgress:.5},null,false,5);
  assert.equal(f.id,key,actor.id+' / '+key);
 }
 for(const kind of ['cat','dog']){
  const p={kind,id:'reaction',facing:'left'};
  const normal=a.sourceAnimalFrame(p,null,false,3),reaction=a.sourceAnimalFrame(p,{kind,started_at:2,duration:3},false,3);
  assert.notEqual(reaction.id,normal.id);assert.equal(a.sourceAnimalFrame(p,{kind,started_at:2,duration:3},false,6).id,normal.id);
 }
});

test('untrusted animation identifiers cannot select inherited object properties',async()=>{
 const a=await api();
 for(const id of ['constructor','toString','__proto__',null,{},17]){
  assert.doesNotThrow(()=>a.sourceActorFrame({}, {animationId:id}));
  assert.doesNotThrow(()=>a.sourceAnimalFrame({kind:'cat',id:'safe',animationId:id},null,false,0));
  assert.equal(await a.loadSourceSequence(id),null);
 }
});

test('source pages are compact PNG atlases with normalized transparent cell bounds',async()=>{
 const d=await manifest();let canvas;
 try{canvas=createRequire(import.meta.url)('@napi-rs/canvas');}catch{canvas=createRequire(process.execPath)('@napi-rs/canvas');}
 for(const id of ['human-male','human-female','cat-british-blue','dog-corgi-red-white']){
  const actor=d.actors[id],image=await canvas.loadImage(fileURLToPath(new URL('../'+actor.atlas,import.meta.url)));assert.equal(image.width,actor.size[0]);assert.equal(image.height,actor.size[1]);assert.ok(image.width<=512&&image.height<=2048);
  const c=canvas.createCanvas(image.width,image.height).getContext('2d');c.drawImage(image,0,0);const px=c.getImageData(0,0,image.width,image.height).data;assert.ok(px.some((v,n)=>n%4===3&&v===0));assert.ok(px.some((v,n)=>n%4===3&&v>0));
 }
});

test('canvas source rendering retains custom hair, skin, clothes and costume identity',async()=>{
 const a=await api();let canvas;
 try{canvas=createRequire(import.meta.url)('@napi-rs/canvas');}catch{canvas=createRequire(process.execPath)('@napi-rs/canvas');}
 const d=await manifest();for(const actor of ['human-male','human-female'])await a.loadSourceActor(actor,{createCanvas:canvas.createCanvas,loadImage:path=>canvas.loadImage(fileURLToPath(new URL('../'+path,import.meta.url)))});
 const {drawAvatarCanvas,defaultAvatar}=await import('../web/avatar.js');
 const render=(avatar,options={})=>{const c=canvas.createCanvas(80,80).getContext('2d');assert.equal(drawAvatarCanvas(c,avatar,5,5,{scale:1,...options}),true);return Buffer.from(c.getImageData(0,0,80,80).data).toString('base64');};
 const base=render(defaultAvatar);for(const key of ['skin','hairColor','hairStyle','shirtColor','shirtStyle','pantsColor','pantsStyle','shoesColor','headwear','outfit','accessory'])assert.notEqual(render({...defaultAvatar,[key]:defaultAvatar[key]===1?2:1}),base,key+' customization was lost');
 const fixed=render(defaultAvatar,{walking:true,walkFrame:2});assert.equal(fixed,render(defaultAvatar,{walking:true,walkFrame:3}));assert.notEqual(fixed,render(defaultAvatar,{walking:true,walkFrame:4}));
 assert.notEqual(render({...defaultAvatar,gender:1}),base);
});
