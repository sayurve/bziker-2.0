import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceActorsData as D} from '../web/source-actors-data.js';
import {sourceActorFrame,sourceAnimalFrame} from '../web/source-actors.js';
import {ambientAnimals,animalPosition} from '../web/ambient-animals.js';
import {petFollower} from '../web/world.js';
import {advancePetMotion} from '../web/walk-cycle.js';

test('world interaction IDs never freeze the authored gait of any ambient animal',()=>{
 for(const animal of ambientAnimals){let moving;for(let time=0;time<300;time+=.2){const candidate=animalPosition(animal,time);if(candidate.walking){moving=candidate;break;}}assert.ok(moving,animal.id);assert.deepEqual([0,1,2,3].map(walk_frame=>sourceAnimalFrame({...moving,walk_frame}).frameIndex),[0,1,2,3],`${animal.id}/${moving.action}`);}
});
test('interaction IDs also leave the animal reaction clock available',()=>{
 const pet={id:'park-cat',kind:'cat',action:'pet-cat',facing:'left'},effect={started_at:10,duration:3};assert.equal(sourceAnimalFrame(pet,effect,false,10.3).frameIndex,1);
});
test('explicit looping human and animal clips wrap elapsed time after any whole cycles',()=>{
 for(const actorId of ['human-male','human-female','cat-british-black','dog-corgi-red-white']){
  const actor=D.actors[actorId],clip=actor.actions['02_Ходьба_Спереди'],sample=time=>actor.kind==='human'?sourceActorFrame({gender:actorId==='human-female'?1:0},{animationId:clip.name,sourceTime:time}):sourceAnimalFrame({kind:actor.kind,breed:actorId,animationId:clip.name,sourceElapsed:time});
  assert.equal(clip.loop,true);for(const t of[.01,.3,.6,.9])for(const cycles of[1,3,10])assert.equal(sample(t).frameIndex,sample(t+cycles*clip.duration).frameIndex,`${actorId}/${t}/${cycles}`);
 }
});
test('explicit progress one and finite one-shots still hold their ending pose',()=>{
 const actor=D.actors['human-male'],loop=actor.actions['02_Ходьба_Спереди'],oneShot=Object.values(actor.actions).find(clip=>!clip.loop);assert.ok(oneShot);assert.equal(sourceActorFrame({}, {animationId:loop.name,actionProgress:1}).frameIndex,loop.timeline.at(-1));assert.equal(sourceActorFrame({}, {animationId:oneShot.name,sourceTime:oneShot.duration*10}).frameIndex,oneShot.timeline.at(-1));
});
test('following pet snaps into the new room instead of interpolating from the old room',()=>{
 const owner={id:'o',x:100,y:100,scene:'city',facing:'right',pet:{id:'p',kind:'cat'}},previous=advancePetMotion(null,{...petFollower(owner,null,.04),scene:'city'},.04),moved={...owner,scene:'interior',interior_id:'cafe',x:500,y:500};
 const pet=petFollower(moved,previous,.04);assert.equal(pet.x,459);assert.equal(pet.y,515);const motion=advancePetMotion(previous,{...pet,scene:moved.scene,interior_id:moved.interior_id},.04);assert.equal(motion.walk_frame,0);assert.equal(motion.walking,false);
});
test('following pet still eases ordinary travel and snaps owner teleport or changed pet identity',()=>{
 const owner={id:'o',x:300,y:200,scene:'interior',interior_id:'cafe',facing:'right',pet:{id:'p',kind:'dog'}},first=petFollower(owner,null,.04),next=petFollower({...owner,x:320},first,.04);assert.ok(next.x>first.x&&next.x<279);const transfer=petFollower({...owner,x:800},next,.04);assert.equal(transfer.x,759);assert.equal(transfer.y,215);const replacement=petFollower({...owner,pet:{id:'other',kind:'cat'}},next,.04);assert.equal(replacement.x,259);assert.equal(replacement.id,'other');
});
