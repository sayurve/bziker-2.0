import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceDistancePhase} from '../web/character-system/clock.js';
import {advanceWalkCycle,advancePetMotion} from '../web/walk-cycle.js';

test('distance clock is independent of rendering frame rate and preserves complete cycles',()=>{
 for(const step of [1,2,4,8]){let phase=0;for(let x=0;x<256;x+=step)phase=advanceDistancePhase(phase,step,128);assert.equal(phase,0);}
 assert.equal(advanceDistancePhase(120,16,128),8);
 assert.equal(advanceDistancePhase(32,0,128),32);
 assert.ok(Number.isFinite(advanceDistancePhase(Number.MAX_VALUE*.6,Number.MAX_VALUE*.6,Number.MAX_VALUE)));
 assert.throws(()=>advanceDistancePhase(0,NaN,128));
});
test('world movement and pets consume one shared phase rule after accepted travel',()=>{
 const previous={x:100,y:100,sceneKey:JSON.stringify(['city',null,null]),distance:40};
 const state=advanceWalkCycle(previous,{x:116,y:100,scene:'city',walking:true});
 assert.equal(state.distance,advanceDistancePhase(40,16,128));
 const p={id:'pet',x:100,y:100,motion_scene:JSON.stringify(['city',null,null]),motion_distance:35};
 assert.equal(advancePetMotion(p,{...p,x:110,scene:'city'},.1).motion_distance,advanceDistancePhase(35,10,40));
});
