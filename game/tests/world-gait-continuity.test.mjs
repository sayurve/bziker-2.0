import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWorld} from '../web/world.js';
import {sourceActorFrame} from '../web/source-actors.js';
import {motionRuntimeV25} from './helpers/world-motion-runtime-v25.mjs';
import {fixtureRenderer} from './helpers/phaser-renderer-fixture.mjs';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function harness(withPeer=false){
 const h=motionRuntimeV25(),records=[],moves=[],room={id:'gait-continuity-room',label:'audit',kind:'station',width:1500,height:1000,bounds:{left:0,right:1500,top:0,bottom:1000},seats:[],props:[],details:[],zones:[],solids:[],spawn:{x:200,y:200},exit:{x:1400,y:900},action:{x:1400,y:50,id:'test'},modular_source:true};
 let peer={id:'gait-peer',scene:'interior',interior_id:room.id,x:250,y:300,facing:'right',pose:'idle',avatar:{gender:0}},snapshot={scene:'interior',interior_id:room.id,interior:room,position:{x:200,y:200},players:withPeer?[peer]:[]},time=0;
 const rendererFactory=(canvas,options)=>{const f=fixtureRenderer(canvas,options),paint=f.paint;f.paint=(key,bounds,draw,opts)=>{const match=key.match(/object:player:(gait-self|gait-peer)$/);if(match){const r=JSON.parse(JSON.parse(opts.revision.slice(0,opts.revision.lastIndexOf(':')))[1]),walking=r[6],walkFrame=r[8];records.push({id:match[1],time,x:bounds.x+120,y:bounds.y+110,walking,walkFrame,sourceFrame:sourceActorFrame(r[0]||{},{facing:r[5],walking,running:walking,walkFrame}).frameIndex});}return paint(key,bounds,draw,opts);};return f;};
 const view=mountWorld(h.container,{profile:{id:'gait-self',avatar:{gender:0}},rendererFactory,settings:{showNicknames:false},api:async(path,data)=>{if(path==='/api/world/move'){moves.push(data);snapshot={...snapshot,position:{x:data.x,y:data.y}};}return snapshot;}});await settle();
 return {h,view,records,moves,frame(ms){time=ms;h.frame(ms);},peer:()=>peer,last(id='gait-peer'){return records.filter(r=>r.id===id).at(-1);},async updatePeer(change){peer={...peer,...change};snapshot={...snapshot,players:[peer]};await view.refresh();},refresh:()=>view.refresh()};
}
test('accepted low-stick motion keeps its stride and movement path at 60,120 and240Hz',async()=>{
 for(const fps of[60,120,240]){const rt=await harness();try{rt.frame(0);rt.h.stick(.13,0);for(let i=1;i<=fps*2;i++){rt.frame(i*1000/fps);await settle();}assert.ok(Math.abs(rt.view.getState().position.x-244.72)<1e-7,`${fps}: same accepted travel`);const samples=rt.records.filter(r=>r.id==='gait-self'&&r.time>0);assert.ok(samples.every(r=>r.walking),`${fps}: moving character must not render idle`);assert.ok(samples.some(r=>r.walkFrame>=2),`${fps}: stride advances by accepted distance`);assert.ok(rt.moves.some(m=>m.path?.length),`${fps}: accepted travel must reach the authority as a movement path`);}finally{rt.view.destroy();}}
});
test('one-second slow peer samples preserve a complete stride at 60,120 and240Hz',async()=>{
 for(const fps of[60,120,240]){
  const rt=await harness(true);try{
   rt.frame(0);
   for(let cycle=1;cycle<=6;cycle++){
    rt.frame(cycle*1000);await settle();await rt.updatePeer({x:250+22.36*cycle});
    for(let i=1;i<fps;i++){rt.frame(cycle*1000+i*1000/fps);await settle();}
   }
   rt.frame(7000);
   const samples=rt.records.filter(r=>r.id==='gait-peer'&&r.time>1000);
   assert.deepEqual([...new Set(samples.filter(r=>r.walking).map(r=>r.sourceFrame))].sort(),[0,1,2,3],`${fps}: all source phases`);
   assert.ok(samples.every(r=>r.walking),`${fps}: continuous samples retain the stride, including repeated coordinates from local move replies`);
   assert.ok(Math.abs(rt.last().x-384.16)<1e-7,`${fps}: arrive exactly at the final target`);
   assert.ok(samples.every(r=>r.x<=250+22.36*Math.min(6,Math.floor(r.time/1000))+1e-7),`${fps}: never extrapolate beyond authority`);
  }finally{rt.view.destroy();}
 }
});
test('an unchanged peer sample completes arrival and stops rather than walking forever',async()=>{
 const rt=await harness(true);try{rt.frame(0);rt.frame(1000);await rt.updatePeer({x:272.36});rt.frame(1500);assert.equal(rt.last().walking,true);rt.frame(2000);await rt.updatePeer({x:272.36});rt.frame(2200);assert.equal(rt.last().walking,false);assert.equal(rt.last().walkFrame,0);assert.equal(rt.last().x,272.36);rt.frame(5000);assert.equal(rt.last().walking,false);assert.equal(rt.last().x,272.36);}finally{rt.view.destroy();}
});
test('a peer with no further samples stops after a bounded arrival grace without extrapolation',async()=>{
 const rt=await harness(true);try{rt.frame(0);rt.frame(1000);await rt.updatePeer({x:272.36});rt.frame(2500);assert.equal(rt.last().walking,false);assert.equal(rt.last().x,272.36);rt.frame(10000);assert.equal(rt.last().walking,false);assert.equal(rt.last().x,272.36);}finally{rt.view.destroy();}
});
test('peer teleport and seated or phone state snap immediately and reset the gait',async()=>{
 for(const change of[{x:700},{x:272.36,pose:'sit',bench_id:'audit-seat'},{x:272.36,phone_open:true}]){const rt=await harness(true);try{rt.frame(0);rt.frame(1000);await rt.updatePeer({x:272.36});rt.frame(1100);await rt.updatePeer(change);rt.frame(1101);assert.equal(rt.last().x,change.x);assert.equal(rt.last().walking,false);assert.equal(rt.last().walkFrame,0);}finally{rt.view.destroy();}}
});
test('an ordinary self refresh preserves the in-progress stride and releasing input resets it',async()=>{
 const rt=await harness();try{rt.frame(0);rt.h.stick(.6,0);for(let i=1;i<=35;i++)rt.frame(i*16);const before=rt.last('gait-self');assert.ok(before.walkFrame>0);await rt.refresh();rt.frame(576);assert.ok(rt.last('gait-self').walkFrame>0,'poll does not restart accepted local gait');for(const handler of rt.h.element('.world-stick').handlers.pointerup||[])handler({pointerId:1});const position=rt.view.getState().position;rt.frame(592);assert.equal(rt.last('gait-self').walking,false);assert.equal(rt.last('gait-self').walkFrame,0);assert.deepEqual(rt.view.getState().position,position);}finally{rt.view.destroy();}
});
