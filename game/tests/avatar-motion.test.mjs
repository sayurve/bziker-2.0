import test from 'node:test';
import assert from 'node:assert/strict';
import * as avatar from '../web/avatar.js';
import {render as draw,customizedPose,directions} from './helpers/character-core-native-fixture-v30.mjs';
import {locomotionActorsData as L} from '../web/locomotion-actors-data.js';
import {sourceActorFrame} from '../web/source-actors.js';
test('compact shared sprite exports its grounding geometry and preserves saved outfit IDs',()=>{
 for(const [key,value] of Object.entries({width:48,height:64,anchorX:24,anchorY:63,walkFrames:8}))assert.equal(avatar.avatarGeometry[key],value);
 assert.match(avatar.avatarSVG({}),/viewBox="0 0 48 64"/);
 assert.equal(avatar.parts.outfit.options.length,7);
 for(let outfit=0;outfit<7;outfit++)assert.equal(avatar.profileAvatar({outfit}).outfit,outfit);
});
test('eight movement samples hold four complete approved run poses in their source order',async()=>{
 const input={hairStyle:11,accessory:1,shirtStyle:3},frames=Array.from({length:8},(_,walkFrame)=>draw(input,{walkFrame,walking:true,running:true}));
 assert.equal(new Set(frames.map(frame=>JSON.stringify(frame.grid))).size,4);
 for(let phase=0;phase<8;phase+=2)assert.deepEqual(frames[phase].grid,frames[phase+1].grid);
 for(let phase=0;phase<8;phase++){
  const expected=await customizedPose(L.actors['human-male'].run.down,Math.floor(phase/2),{},'down');
  assert.deepEqual(draw({}, {walkFrame:phase,walking:true,running:true}).grid.flat(),expected,`Phase ${phase} must equal the complete approved native PNG`);
 }
 assert.notDeepEqual(frames[0].grid.slice(50),frames[4].grid.slice(50),'Opposite contact phases must swap leading feet');
});
test('phone preserves the selected directional face and the occupied seated body',()=>{
 for(const gender of[0,1])for(const facing of directions){const plain=draw({gender},{pose:'sit',facing}),phone=draw({gender},{pose:'sit',phoneOpen:true,facing});
 assert.notDeepEqual(phone.grid,plain.grid,'actual phone item must be visible');assert.deepEqual(phone.grid.slice(102),plain.grid.slice(102),'actual seated pelvis/boots cannot move');
 const frame=sourceActorFrame({gender},{pose:'sit',phoneOpen:true,facing});assert.equal(frame.context,'seated');assert.equal(frame.facing,facing);
 assert.deepEqual(phone.grid.slice(0,72),plain.grid.slice(0,72),'phone must retain this direction’s canonical head');
 const idle=draw({gender},{facing}),standing=draw({gender},{phoneOpen:true,facing});assert.deepEqual(standing.grid.slice(0,80),idle.grid.slice(0,80),'static phone retains exact selected head/body above actual hand item');
 }
});
test('poses, all directions and phone overlays remain inside64px and jury ignores every personal layer',()=>{
 const generic=draw({},{generic:true});
 for(const facing of ['down','up','left','right'])for(const pose of ['idle','sit','smoke'])for(const phoneOpen of [false,true]){
  for(const r of draw({outfit:6,hairStyle:10,headwear:4},{facing,pose,phoneOpen,walkFrame:7,walking:pose==='idle',running:pose==='idle'}).rects)assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=avatar.avatarGeometry.width&&r.y+r.h<=64);
 }
 for(const pose of ['idle','sit','smoke','phone'])assert.deepEqual(draw({gender:1,outfit:5,hairStyle:11},{generic:true,pose,phoneOpen:true}).rects,generic.rects);
});
