import test from 'node:test';
import assert from 'node:assert/strict';
import * as gait from '../web/walk-cycle.js';

const actor=(x,y=100,extra={})=>({x,y,walking:true,scene:'city',...extra});
test('gait follows distance, including slow joystick movement and turns, instead of the page clock',()=>{
 assert.equal(typeof gait.advanceWalkCycle,'function');
 let state=gait.advanceWalkCycle(null,actor(100));
 state=gait.advanceWalkCycle(state,actor(108));assert.equal(state.frame,0);
 state=gait.advanceWalkCycle(state,actor(116));assert.equal(state.frame,1);
 state=gait.advanceWalkCycle(state,actor(116,116));assert.equal(state.frame,2);
 state=gait.advanceWalkCycle(state,actor(116,116));assert.equal(state.frame,2,'No displacement must not advance the feet');
});
test('stationary, phone, seats, scene transfers and teleports cannot continue a walking cycle',()=>{
 let state=gait.advanceWalkCycle(null,actor(100));state=gait.advanceWalkCycle(state,actor(148));assert.equal(state.frame,3);
 assert.equal(gait.advanceWalkCycle(state,actor(148,100,{walking:false})).frame,0);
 assert.equal(gait.advanceWalkCycle(state,actor(148,100,{pose:'sit'})).frame,0);
 assert.equal(gait.advanceWalkCycle(state,actor(148,100,{phone_open:true})).frame,0);
 assert.equal(gait.advanceWalkCycle(state,actor(500)).frame,0);
 assert.equal(gait.advanceWalkCycle(state,actor(148,100,{scene:'interior',interior_id:'shop-food'})).frame,0);
 assert.equal(gait.advanceWalkCycle(state,actor(148),true).frame,0);
});
test('all eight contacts cycle without accumulating distance and results are frame-rate independent',()=>{
 const advance=step=>{let state=gait.advanceWalkCycle(null,actor(100)),frames=new Set();for(let x=100+step;x<=356;x+=step){state=gait.advanceWalkCycle(state,actor(x));frames.add(state.frame);}return {state,frames};};
 for(const step of [1,2,4,8]){const {state,frames}=advance(step);assert.equal(frames.size,8);assert.equal(state.frame,0);assert.equal(state.distance,0);}
});
