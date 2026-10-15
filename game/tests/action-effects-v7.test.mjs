import test from 'node:test';import assert from 'node:assert/strict';
import {actionEffectState} from '../web/action-effects.js';
test('an action has four phases and expires exactly at its server deadline',()=>{
 const effect={id:'pickup',type:'pick-litter',started_at:100,duration:3};
 assert.deepEqual([100,100.8,101.6,102.4].map(t=>actionEffectState(effect,t)?.frame),[0,1,2,3]);
 assert.equal(actionEffectState(effect,99.99),null);assert.equal(actionEffectState(effect,103),null);
 assert.deepEqual(effect,{id:'pickup',type:'pick-litter',started_at:100,duration:3});
});
test('malformed or unsupported actions never start a visible animation',()=>{
 const effect={id:'x',type:'eat',started_at:0,duration:3};
 for(const changes of [{type:'unknown'},{id:7},{duration:-1},{duration:Infinity},{duration:99},{started_at:NaN}])assert.equal(actionEffectState({...effect,...changes},1),null);
 assert.equal(actionEffectState(effect,Infinity),null);assert.equal(actionEffectState(null,1),null);
});
