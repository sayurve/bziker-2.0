import test from 'node:test';
import assert from 'node:assert/strict';
import * as effects from '../web/action-effects.js';
import {drawAvatarCanvas,avatarSVG,parts,avatarGeometry} from '../web/avatar.js';

import {preloadNativeAvatars,readyAvatarRaster} from './helpers/native-avatar-fixture-v30.mjs';
import {sourceActorFrame} from '../web/source-actors.js';
await preloadNativeAvatars();
function raster(options={},input={}){
 const sprite=readyAvatarRaster(input,options);
 return {sprite,grid:Array.from({length:sprite.height},(_,y)=>sprite.grid.slice(y*sprite.width,(y+1)*sprite.width)),rects:sprite.runs};
}
function bottom(grid){let last=-1;for(let y=0;y<grid.length;y++)if(grid[y].some(Boolean))last=y;return last;}
const effect=(type,duration=3)=>({id:type,type,started_at:100,duration,x:180,y:220});
test('cigarette is a server-timed sequence with retrieval, contact pause, exhale and lowering',()=>{
 assert.equal(typeof effects.actionPoseState,'function');
 const samples=[.04,.18,.32,.48,.66,.80,.90,.98].map(p=>effects.actionPoseState('smoke',p));
 assert.deepEqual(samples.map(s=>s.stage),['retrieve','raise','inhale','hold','exhale','lower','rest','finish']);
 const active=effects.actionEffectState(effect('smoke',8),104);
 assert.equal(active.stage,'hold');assert.equal(active.progress,.5);
 assert.equal(effects.actionEffectState(effect('smoke',8),108),null);
 for(const state of samples)assert.ok(Number.isInteger(state.poseFrame));
});
test('food and drink hold at the mouth before lowering; pickup bends before it holds; throw releases',()=>{
 assert.equal(typeof effects.actionPoseState,'function');
 assert.equal(effects.actionPoseState('eat',.55).stage,'chew');
 assert.equal(effects.actionPoseState('drink',.55).stage,'sip-hold');
 assert.equal(effects.actionPoseState('pick-litter',.3).stage,'crouch');
 assert.equal(effects.actionPoseState('pick-litter',.8).stage,'hold');
 assert.equal(effects.actionPoseState('throw-litter',.5).stage,'flight');
 assert.equal(effects.actionPoseState('unknown',.5),null);
});
test('smoking selects authored attached hand keyposes with a fixed ground, and phone keeps the neutral seat static',()=>{
 const samples=[.04,.18,.32,.48,.66,.80,.90,.98];
 for(const facing of ['down','up','right','left']){
  const frames=samples.map(actionProgress=>raster({action:'smoke',actionProgress,facing}));
  assert.equal(new Set(frames.map(r=>JSON.stringify(r.grid))).size,3,'retrieve/chest/mouth are the three authored smoking bodies');
  assert.deepEqual(samples.map(actionProgress=>sourceActorFrame({}, {action:'smoke',actionProgress,facing}).frameIndex),[0,1,1,2,2,1,1,0]);
  for(const [i,r] of frames.entries()){
   const f=sourceActorFrame({}, {action:'smoke',actionProgress:samples[i],facing});
   assert.equal(f.poseFamily,'hand');assert.equal(f.prop,'cigarette');assert.deepEqual(f.anchor,[24,63]);
   assert.equal(bottom(r.grid),125,'authored standing feet retain the native ground baseline');
  }
 }
 const sitting=raster({pose:'sit',phoneOpen:true,facing:'left'});
 assert.equal(sourceActorFrame({}, {pose:'sit',phoneOpen:true,facing:'left'}).prop,'phone');
 assert.notDeepEqual(sitting.grid,raster({pose:'sit',facing:'left'}).grid,'the actual native phone PNG is present');
 for(const actionProgress of samples){
  const options={pose:'sit',phoneOpen:true,facing:'left',action:'smoke',actionProgress},frame=sourceActorFrame({},options);
  assert.equal(frame.poseFamily,'seated');assert.equal(frame.frameIndex,0);assert.equal(frame.prop,'phone');
  assert.deepEqual(raster(options).grid,sitting.grid,'opening the phone is the exact neutral seated body plus the same prop');
 }
 assert.equal(avatarSVG({outfit:5},true,{action:'smoke',actionProgress:.6}),avatarSVG({},true));
});
test('pickup has authored knee and torso bends, fixed feet ground and an actual held native paper prop',()=>{
 const idle=raster({facing:'right'}),options={facing:'right',action:'pick-litter',actionProgress:.3},crouch=raster(options),factor=idle.sprite.factor;
 assert.notDeepEqual(crouch.grid.slice(25*factor,59*factor),idle.grid.slice(25*factor,59*factor));
 assert.notDeepEqual(crouch.grid.slice(0,25*factor),idle.grid.slice(0,25*factor),'the head follows the authored bend');
 const frame=sourceActorFrame({},options);assert.equal(frame.poseFamily,'lowerReach');assert.deepEqual(frame.anchor,[24,63]);
 assert.equal(bottom(crouch.grid),bottom(idle.grid));assert.equal(bottom(crouch.grid),125,'separate drawn poses share the same ground, without forcing identical shoe silhouettes');
 const heldOptions={facing:'right',action:'pick-litter',actionProgress:.85},held=sourceActorFrame({},heldOptions);
 assert.equal(held.prop,'trash');assert.equal(held.frameIndex,3);
 assert.notDeepEqual(raster(heldOptions).grid,raster({facing:'right',action:'pet',actionProgress:.85}).grid,'same lowerReach3 body contains visible native paper only when held');
});
test('throw flight starts at the releasing hand and lands at the actual target rather than the sprite edge',()=>{
 assert.equal(typeof effects.actionFlight,'function');
 const action=effect('throw-litter'),actor={x:80,y:200,facing:'right'};
 assert.equal(effects.actionFlight(action,actor,100.2),null);
 const start=effects.actionFlight(action,actor,100+3*.4),middle=effects.actionFlight(action,actor,100+3*.575),end=effects.actionFlight(action,actor,100+3*.75);
 assert.ok(start&&middle&&end);assert.ok(start.x<actor.x+25&&start.x>actor.x);
 assert.ok(middle.x>start.x&&middle.x<end.x);
 assert.ok(middle.y<Math.min(start.y,end.y),'Paper has a short visible arc');
 assert.equal(end.x,action.x);assert.equal(end.y,action.y-34);
 assert.equal(effects.actionFlight(action,actor,102.8),null);
 assert.equal(effects.actionFlight(action,actor,101.5,true),null);
});
test('all continuous action poses fit every saved costume and preserve integer pixel drawing',()=>{
 for(const action of ['smoke','eat','drink','pick-litter','throw-litter','pet'])for(const outfit of parts.outfit.options.keys())for(const facing of ['down','up','right','left'])for(const actionProgress of [.04,.18,.32,.48,.66,.80,.90,.98]){
  const {rects}=raster({action,actionProgress,facing},{outfit,hairStyle:10,headwear:4});
  for(const r of rects)assert.ok(Number.isInteger(r.x)&&Number.isInteger(r.y)&&r.x>=0&&r.y>=0&&r.x+r.w<=avatarGeometry.width*2&&r.y+r.h<=64*2);
 }
});
test('malformed timeline keys and progress cannot expose object properties or start a pose',()=>{
 assert.equal(effects.actionPoseState('constructor',.5),null);
 assert.equal(effects.actionPoseState('toString',.5),null);
 assert.equal(effects.actionPoseState('eat',NaN),null);
 assert.equal(effects.actionPoseState('drink',Infinity),null);
 assert.equal(effects.actionPoseState('eat',-1).stage,'retrieve');
 assert.equal(effects.actionPoseState('eat',1).stage,'finish');
});
test('flying paper draws one coherent pixel cluster and mirrors the release origin',()=>{
 const shapes=[],context={fillStyle:'',fillRect(x,y,w,h){shapes.push({x,y,w,h,color:this.fillStyle});}},action=effect('throw-litter');
 const right=effects.actionFlight(action,{x:80,y:200,facing:'right'},101.2),left=effects.actionFlight(action,{x:80,y:200,facing:'left'},101.2);
 assert.ok(Math.abs((right.x-80)-(80-left.x))<1e-8);
 effects.drawActionFlight(context,action,{x:80,y:200,facing:'right'},101.5);
 assert.ok(shapes.length>3);
 for(const shape of shapes)assert.ok([shape.x,shape.y,shape.w,shape.h].every(Number.isInteger));
 const before=shapes.length;effects.drawActionFlight(context,action,{x:80,y:200,facing:'right'},101.5,true);assert.equal(shapes.length,before);
 assert.equal(effects.actionFlight(action,{x:NaN,y:200},101.5),null);
});
