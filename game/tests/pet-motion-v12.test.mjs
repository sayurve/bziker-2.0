import test from 'node:test';
import assert from 'node:assert/strict';
import * as motion from '../web/walk-cycle.js';
import {drawAnimal} from '../web/waterfront.js';
const pet=(x,y=100,extra={})=>({id:'owned-cat',kind:'cat',scene:'city',x,y,...extra});
const render=(p,effect=null,reduced=false,now=100)=>{const shapes=[];drawAnimal({fillStyle:'',fillRect(x,y,w,h){shapes.push([x,y,w,h,this.fillStyle]);}},p,effect,reduced,now);return shapes;};
test('following pet derives walking and facing from its own coordinates after its owner stops',()=>{
 assert.equal(typeof motion.advancePetMotion,'function');
 let state=motion.advancePetMotion(null,pet(100),.04);
 state=motion.advancePetMotion(state,pet(112,100,{walking:false,facing:'up'}),.04);
 assert.equal(state.walking,true);assert.equal(state.facing,'right');assert.ok(state.walk_frame>0);
 state=motion.advancePetMotion(state,pet(112,108,{walking:false,facing:'right'}),.04);
 assert.equal(state.facing,'down');assert.equal(state.walking,true);
 const stopped=motion.advancePetMotion(state,pet(112,108),.04);
 assert.equal(stopped.walking,false);assert.equal(stopped.facing,'down');assert.equal(stopped.walk_frame,0);
});
test('pet gait resets on transfer, teleport, invalid duration and reduced motion',()=>{
 assert.equal(typeof motion.advancePetMotion,'function');
 const first=motion.advancePetMotion(null,pet(100),.04),moving=motion.advancePetMotion(first,pet(116),.04);
 assert.ok(moving.walk_frame>0);
 for(const [p,dt,reduced] of [[pet(900),.04,false],[pet(118,100,{scene:'interior',interior_id:'cafe'}),.04,false],[pet(118),NaN,false],[pet(118),.04,true]]){
  const next=motion.advancePetMotion(moving,p,dt,reduced);assert.equal(next.walk_frame,0);assert.equal(next.motion_distance,0);
 }
});
test('reduced motion freezes walking paws, tails and reaction decoration while animals remain visible',()=>{
 for(const kind of ['cat','dog'])for(const facing of ['down','up','right','left']){
  const p={...pet(100),kind,facing,walking:true},effect={kind,started_at:99,duration:3};
  assert.deepEqual(render({...p,walk_frame:0},effect,true,100),render({...p,walk_frame:3},effect,true,100.8));
  assert.ok(render(p,null,true).length>10);
 }
});
test('cats and dogs have their own tail and face reactions without lifting grounded paws',()=>{
 for(const kind of ['cat','dog']){
  const p={...pet(100),kind,facing:'right',walking:false},effect={kind,started_at:99,duration:3};
  const plain=render(p,null,false,100),reaction=render(p,effect,false,100);
  assert.notDeepEqual(plain,reaction);
  assert.deepEqual(plain.filter(r=>r[1]>=107&&r[1]<110),reaction.filter(r=>r[1]>=107&&r[1]<110),'Paw ground contacts stay fixed while the animal reacts');
 }
});
