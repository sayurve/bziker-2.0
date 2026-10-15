import test from 'node:test';
import assert from 'node:assert/strict';
import * as world from '../web/world.js';
import {sourceActorFrame} from '../web/source-actors.js';
import {sourceEntityLayout} from '../web/source-city.js';
import {avatarGeometry,avatarRaster} from '../web/avatar.js';
import {createCanvas,loadImage,rgbaGrid} from './helpers/character-core-native-fixture-v30.mjs';
import {preloadDesignViews} from '../web/design-assets.js';
import {drawSourceEntity} from '../web/source-city.js';
import {fileURLToPath} from 'node:url';
await preloadDesignViews([{id:'actor-prop-trash'}],path=>loadImage(fileURLToPath(new URL('../'+path,import.meta.url))));
import {motionRuntimeV25} from './helpers/world-motion-runtime-v25.mjs';
import {fixtureRenderer} from './helpers/phaser-renderer-fixture.mjs';
const flush=()=>new Promise(r=>setImmediate(r));
const litter=world.worldMap.activities.find(a=>a.id==='litter-park-1');
const avatar={gender:0,hairStyle:7,hairColor:6,skin:3,shirtColor:8};
function mount({reject=false,delay=false}={}){
 const h=motionRuntimeV25(),calls=[];let position={x:5495,y:3416},release;
 const snapshot=()=>({scene:'city',server_time:100,position:{...position},pose:'idle',players:[],animals:[],collected_litter:[]});
 const view=world.mountWorld(h.container,{profile:{id:'pickup-test',avatar},diagnostics:true,settings:{lightingMode:'day',showNicknames:false},rendererFactory:fixtureRenderer,onInteract:(action,data)=>calls.push({action,data,position:view.getState().position}),api:async(path,data)=>{if(path==='/api/world/move'){calls.push({path,data});if(delay)await new Promise(r=>release=r);if(!reject)position={x:data.x,y:data.y};}return snapshot();}});
 return {h,view,calls,release:()=>release?.()};
}
test('stance uses actual opaque trash centre and the final squat prop socket for both models/all facings',()=>{
 assert.equal(typeof world.pickupStance,'function');
 const b=sourceEntityLayout(litter).destination,target={x:b.x+b.width/2,y:b.y+b.height/2};
 for(const gender of[0,1])for(const facing of['up','down','left','right']){const stance=world.pickupStance({x:5495,y:3416},{gender},litter,{facings:[facing]});assert.ok(stance);const f=sourceActorFrame({gender},{action:'pick-litter',actionProgress:.5,facing}),hand=f.rect.propSockets?.trash||f.hand;assert.ok(Math.hypot(stance.x+(hand[0]-f.anchor[0])*(avatarGeometry.worldScale??1.25)-target.x,stance.y+(hand[1]-f.anchor[1])*(avatarGeometry.worldScale??1.25)-target.y)<1e-7);assert.deepEqual(world.movePosition({x:5495,y:3416},stance.x-5495,stance.y-3416),{x:stance.x,y:stance.y});}
 assert.equal(world.pickupStance({x:5495,y:3416},avatar,litter,{move:point=>point}),null,'blocked paths cannot teleport to a socket');
});
test('pickup begins only at contact pose; ground and interaction disappear at contact, and return with a new day snapshot',()=>{
 assert.equal(sourceActorFrame(avatar,{action:'pick-litter',actionProgress:.4,facing:'left'}).prop,null);
 assert.equal(sourceActorFrame(avatar,{action:'pick-litter',actionProgress:.43,facing:'left'}).prop,'trash');
 assert.equal(typeof world.litterIsVisible,'function');
 const effect={id:'pick',type:'pick-litter',target_id:litter.id,started_at:100,duration:3},snapshot={collected_litter:[litter.id],action_effect:effect};
 assert.equal(world.litterIsVisible(litter,snapshot,101.28),true);assert.equal(world.litterIsVisible(litter,snapshot,101.3),false);assert.equal(world.litterIsVisible(litter,{collected_litter:[]},110),true);
 assert.notEqual(world.nearestAction(litter.x,litter.y,snapshot)?.id,litter.id,'collected target must never win nearest action');assert.equal(world.nearestAction(litter.x,litter.y,{collected_litter:[]})?.id,litter.id);
});
test('actual mountWorld walks a bounded collision-checked path and awaits accepted server position before one pickup',async()=>{const m=mount();try{await flush();m.h.frame(0);m.h.click('.world-enter');m.h.click('.world-enter');assert.equal(m.calls.some(c=>c.action),false);let previous=m.view.getState().position;for(let t=16;t<600;t+=16){m.h.frame(t);const p=m.view.getState().position;assert.ok(Math.hypot(p.x-previous.x,p.y-previous.y)<=world.worldMap.movement_speed*.016+1e-6,'same movement speed, no body slide/teleport');previous=p;await flush();}const picks=m.calls.filter(c=>c.action==='pick-litter');assert.equal(picks.length,1);const accepted=m.calls.filter(c=>c.path==='/api/world/move').at(-1);assert.ok(accepted.data.path?.length);assert.equal(accepted.data.teleport,undefined);assert.deepEqual(picks[0].position,{x:accepted.data.x,y:accepted.data.y});const s=world.pickupStance({x:5495,y:3416},avatar,litter);assert.ok(Math.hypot(picks[0].position.x-s.x,picks[0].position.y-s.y)<=.01);const gait=new Set(Array.from({length:8},(_,walkFrame)=>JSON.stringify(avatarRaster(avatar,{walking:true,running:true,facing:s.facing,walkFrame}).grid)));assert.ok(m.h.drawImages.some(d=>d.image.width===96&&d.image.height===128&&d.image.getContext&&gait.has(JSON.stringify(rgbaGrid(d.image.getContext('2d').getImageData(0,0,96,128).data,96,128).flat()))),'actual actor bitmap during approach equals approved L locomotion, not merely any background image');}finally{m.view.destroy()}});
test('server rejection, manual movement, phone opening, and cancellation during move await never pick remotely',async()=>{for(const reason of['reject','manual','phone','inventory','await']){const m=mount({reject:reason==='reject',delay:reason==='await'});try{await flush();m.h.frame(0);m.h.click('.world-enter');if(reason==='manual')m.h.key('ArrowRight');if(reason==='phone')await m.view.setPhone(true);if(reason==='inventory')await m.view.setInventory(true);for(let t=16;t<500;t+=16){m.h.frame(t);await flush();}if(reason==='await'){m.h.key('ArrowRight');m.release();await flush();}assert.equal(m.calls.filter(c=>c.action).length,0,reason);}finally{m.release();m.view.destroy()}}});

test('actual native ground paper pixels and mount floor node disappear at contact, survive stale GET, and return next day',async()=>{
 const b=sourceEntityLayout(litter).bounds,c=createCanvas(30,30),q=c.getContext('2d'),art={drawGround(){},groundObjects:[{...litter,bounds:b,draw(ctx){drawSourceEntity(ctx,litter)}}]},view={x:b.x-5,y:b.y-5,width:30,height:30};
 const pixels=snapshot=>{q.clearRect(0,0,30,30);q.save();q.translate(-view.x,-view.y);world.drawCityGroundFrame(q,art,view,0,false,snapshot,101.4);q.restore();return [...q.getImageData(0,0,30,30).data].filter((v,i)=>i%4===3&&v>127).length;};
 assert.ok(pixels({})>100,'positive actual source paper pixels');assert.equal(pixels({collected_litter:[litter.id]}),0);assert.ok(pixels({collected_litter:[]})>100);
 const h=motionRuntimeV25(),keys=[],old={scene:'city',server_time:100,position:{x:5495,y:3416},pose:'idle',players:[],collected_litter:[]};let snap=old,delayed=false,release;
 const v=world.mountWorld(h.container,{profile:{id:'visibility',avatar},settings:{lightingMode:'day'},rendererFactory:(canvas,options)=>{const r=fixtureRenderer(canvas,options),paint=r.paint;return {...r,paint(key,...args){keys.push(key);paint(key,...args)}}},api:async()=>delayed?new Promise(r=>release=r):snap});
 const visible=time=>{keys.length=0;h.frame(time);return keys.includes('city:city:floor:'+litter.id)};
 try{await flush();assert.equal(visible(0),true);delayed=true;const pending=v.refresh();const effect={id:'pick-visible',type:'pick-litter',target_id:litter.id,started_at:100,duration:3};v.setActionState({server_time:100,action_effect:effect,holding:'litter'});assert.equal(visible(1200),true);assert.equal(visible(1300),false);release(old);await pending;assert.equal(visible(1400),false,'old GET must not resurrect collected ground');delayed=false;snap={...old,server_time:200};await v.refresh();assert.equal(visible(1400),true,'fresh day clears ownership rather than unioning it forever');}finally{v.destroy()}
});

test('a late previous-day movement response cannot restore yesterday collected IDs after a fresh empty day',async()=>{
 const h=motionRuntimeV25(),keys=[],old={scene:'city',server_time:100,position:{x:5495,y:3416},pose:'idle',players:[],collected_litter:[litter.id]};let snap=old,release;
 const v=world.mountWorld(h.container,{profile:{id:'day-order',avatar},settings:{lightingMode:'day'},rendererFactory:(canvas,options)=>{const r=fixtureRenderer(canvas,options),paint=r.paint;return {...r,paint(key,...args){keys.push(key);paint(key,...args)}}},api:async path=>path==='/api/world/move'?new Promise(r=>release=r):snap});
 const visible=t=>{keys.length=0;h.frame(t);return keys.includes('city:city:floor:'+litter.id)};
 try{await flush();assert.equal(visible(0),false);visible(4500);await flush();assert.equal(typeof release,'function');snap={...old,server_time:200,collected_litter:[]};await v.refresh();assert.equal(visible(4516),true);release(old);await flush();assert.equal(visible(4532),true);}finally{v.destroy()}
});
test('a late previous-day action result cannot roll back collection, current action, holding or snapshot clock',async()=>{
 const h=motionRuntimeV25(),keys=[],old={scene:'city',server_time:100,position:{x:5495,y:3416},pose:'idle',players:[],collected_litter:[litter.id]};let snap=old;
 const v=world.mountWorld(h.container,{profile:{id:'action-day-order',avatar},settings:{lightingMode:'day'},rendererFactory:(canvas,options)=>{const r=fixtureRenderer(canvas,options),paint=r.paint;return {...r,paint(key,...args){keys.push(key);paint(key,...args)}}},api:async()=>snap});
 const visible=t=>{keys.length=0;h.frame(t);return keys.includes('city:city:floor:'+litter.id)};
 try{await flush();assert.equal(visible(0),false);const currentEffect={id:'new-day-drink',type:'drink',started_at:200,duration:3};snap={...old,server_time:200,collected_litter:[],action_effect:currentEffect,holding:null};await v.refresh();assert.equal(visible(16),true);
 assert.equal(v.setActionState({server_time:100,action_effect:{id:'yesterday-pick',type:'pick-litter',target_id:litter.id,started_at:100,duration:3},holding:'litter'}),false,'older action must not replace a newer accepted snapshot');assert.deepEqual(v.getState().action_effect,currentEffect);assert.equal(v.getState().holding,null);assert.equal(visible(32),true);assert.equal(visible(4016),true,'paper remains after old action would have expired');
 assert.equal(v.setActionState({server_time:204,action_effect:{id:'today-pick',type:'pick-litter',target_id:litter.id,started_at:204,duration:3},holding:'litter'}),true,'new legitimate action is still accepted');assert.equal(visible(4032),true,'new event starts on its own clock, at reach before contact');assert.equal(visible(5432),false,'new legitimate contact still collects');
 }finally{v.destroy()}
});
