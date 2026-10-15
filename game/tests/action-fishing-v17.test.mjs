import test from 'node:test';
import assert from 'node:assert/strict';
import {actionPoseState,actionEffectState,actionFlight} from '../web/action-effects.js';

test('cast and catch use ordered drawn poses and expire at their authoritative deadline',()=>{
 for(const [type,duration,stages] of [['fishing',2,['retrieve','cast','wait','settle']],['fish-catch',3,['reel','raise','show-catch','stow','finish']]]){
  const effect=Object.freeze({id:type,type,started_at:100,duration,item_id:type==='fishing'?'rod':'fish'}),samples=Array.from({length:100},(_,i)=>actionEffectState(effect,100+i*duration/100));
  assert.ok(samples.every(state=>state&&Number.isInteger(state.poseFrame)));
  assert.deepEqual([...new Set(samples.map(state=>state.stage))],stages);
  assert.equal(actionEffectState(effect,99.999),null);assert.equal(actionEffectState(effect,100+duration),null);assert.equal(actionPoseState(type,1).stage,stages.at(-1));
 }
});
test('fishing poses leave authoritative boat or shore coordinates untouched and never launch litter',()=>{
 for(const type of ['fishing','fish-catch']){
  const effect=Object.freeze({id:type,type,started_at:100,duration:3}),actor=Object.freeze({x:5300,y:2000,facing:'right',boat:{id:'boat'}});
  for(const progress of [0,.2,.4,.6,.8,.99]){const state=actionEffectState(effect,100+3*progress);assert.ok(state);assert.equal(state.x,undefined);assert.equal(state.y,undefined);assert.equal(actionFlight(effect,actor,100+3*progress),null);}
  assert.deepEqual(actor,{x:5300,y:2000,facing:'right',boat:{id:'boat'}});
 }
 assert.equal(actionEffectState({id:'x',type:'fish-catch',started_at:0,duration:11},1),null);
 assert.equal(actionPoseState('fish-catch',NaN),null);
});
test('identical fishing snapshots continue the server clock rather than restarting on each phone refresh',()=>{
 for(const [type,duration] of [['fishing',2],['fish-catch',3]]){
  const effect=Object.freeze({id:`shared-${type}`,type,started_at:100,duration,item_id:type==='fishing'?'rod':'fish'}),elapsed=duration*.6;
  const first=actionEffectState(effect,100+elapsed),retry=actionEffectState({...effect},100+elapsed);
  assert.deepEqual(retry,first);assert.equal(retry.id,effect.id);assert.ok(Math.abs(retry.progress-.6)<1e-8);
  const later=actionEffectState({...effect},100+duration*.8);assert.equal(later.id,first.id);assert.ok(later.progress>first.progress);
  assert.equal(actionEffectState({...effect},100+duration),null);assert.equal(actionEffectState({...effect},100+duration+4),null);
  assert.deepEqual(effect,{id:`shared-${type}`,type,started_at:100,duration,item_id:type==='fishing'?'rod':'fish'});
 }
});
