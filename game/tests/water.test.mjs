import test from 'node:test';
import assert from 'node:assert/strict';
import * as world from '../web/world.js';
import {drawBoat,drawAnimal} from '../web/waterfront.js';
import {readFileSync} from 'node:fs';
const water=await import('../web/water.js').catch(()=>({}));
const lake={x:300,y:200,radius_x:100,radius_y:40,rotation:Math.PI/4};
function dryCrossing(){
 const m=world.worldMap.lake,bounds=water.lakeBounds(m),obstacles=JSON.parse(readFileSync(new URL('../web/city-collisions.json',import.meta.url))).obstacles;
 const clear=p=>!obstacles.some(b=>Math.hypot(Math.max(b.x-p.x,0,p.x-b.x-b.width),Math.max(b.y-p.y,0,p.y-b.y-b.height))<14)&&!water.pedestrianLakeContains(m,p);
 for(let i=0;i<=28;i++)for(const padding of [40,60,80,100]){
  const start={x:bounds.x-padding,y:bounds.y+bounds.height*(.15+i*.025)},end={x:bounds.x+bounds.width+padding,y:start.y};
  const solidCrossing=obstacles.some(b=>start.y>b.y&&start.y<b.y+b.height&&b.x<end.x&&b.x+b.width>start.x);
  if(clear(start)&&clear(end)&&!solidCrossing&&water.pedestrianSegmentCrossesLake(m,start,end))return {start,end};
 }
 assert.fail('The actual lake needs two dry shores clear of props by a 14px body radius, with water as the crossing barrier');
}
function waterPoint(){
 const m=world.worldMap.lake,dock=world.worldMap.boats[0].dock;
 for(const fraction of [.45,.35,.25,.55]){
  const point={x:dock.x+(m.x-dock.x)*fraction,y:dock.y+(m.y-dock.y)*fraction};
  if(water.lakeContains(m,point,14)&&water.segmentStaysInLake(m,dock,point,12))return point;
 }
 assert.fail('Map has no navigable point reachable from the first dock');
}

test('rotated water geometry follows the rendered ellipse, not its rectangular bounds',()=>{
 assert.equal(typeof water.lakeContains,'function');
 assert.equal(water.lakeContains(lake,{x:350,y:250}),true);
 assert.equal(water.lakeContains(lake,{x:350,y:150}),false);
 assert.equal(water.lakeContains(lake,{x:NaN,y:200}),false);
});
test('a dry foot centre cannot leave its complete circle over the actual lake bank',()=>{
 const p=world.movePosition({x:7912,y:2730},0,18);
 assert.equal(water.pedestrianLakeContains(world.worldMap.lake,p,14),false,'the lower foot support crosses the bank even though its centre is dry');
 const repaired=world.clampPosition(7912,2748);assert.equal(water.pedestrianLakeContains(world.worldMap.lake,repaired,14),false);
});
test('bank recovery avoids actual nearby tree supports as well as the water',()=>{
 const point=world.clampPosition(8576,2980),solids=JSON.parse(readFileSync(new URL('../web/city-collisions.json',import.meta.url))).obstacles;
 assert.equal(water.pedestrianLakeContains(world.worldMap.lake,point,14),false);
 assert.ok(solids.every(b=>Math.hypot(Math.max(b.x-point.x,0,point.x-b.x-b.width),Math.max(b.y-point.y,0,point.y-b.y-b.height))>=14-1e-7),'the closest dry shore alone overlaps tree-v23-121');
});
test('a bridge landing supports the union of shore and bridge without rejecting a legal straddling circle',()=>{
 const m={outline:[[0,0],[300,0],[300,300],[0,300]],walkways:[{points:[[310,150],[200,150]],width:40}]};
 assert.equal(water.pedestrianLakeContains(m,{x:310,y:157},14),false,'part of the circle rests on shore and the rest fits the bridge');
 assert.equal(water.pedestrianLakeContains(m,{x:310,y:185},14),true,'a dry centre beside the landing still overlaps water');
 assert.equal(water.pedestrianLakeContains(m,{x:250,y:156},14),false,'exact bridge-edge touch is legal');
 assert.equal(water.pedestrianLakeContains(m,{x:250,y:157},14),true);
 assert.equal(water.pedestrianSegmentCrossesLake(m,{x:340,y:150},{x:220,y:150},14),false,'the real bridge approach remains traversable');
 assert.equal(water.pedestrianSegmentCrossesLake(m,{x:340,y:180},{x:220,y:180},14),true);
});
test('a wet region wholly inside a foot circle or swept path is still detected',()=>{
 const small={outline:[[4,4],[6,4],[6,6],[4,6]]},ahead={outline:[[44,4],[46,4],[46,6],[44,6]]};
 assert.equal(water.pedestrianLakeContains(small,{x:0,y:0},14),true);
 assert.equal(water.pedestrianSegmentCrossesLake(ahead,{x:0,y:0},{x:100,y:0},14),true);
});
test('all four native lake walkways retain a complete dry circle along their actual paths',()=>{
 assert.equal(world.worldMap.lake.walkways.length,4);
 for(const walkway of world.worldMap.lake.walkways){
  const a={x:walkway.points[0][0],y:walkway.points[0][1]},b={x:walkway.points.at(-1)[0],y:walkway.points.at(-1)[1]};
  assert.equal(water.pedestrianSegmentCrossesLake(world.worldMap.lake,a,b,14),false,walkway.id);
  assert.deepEqual(world.movePosition(a,b.x-a.x,b.y-a.y),b,`${walkway.id}: outward movement`);
  assert.deepEqual(world.movePosition(b,a.x-b.x,a.y-b.y),a,`${walkway.id}: return to the bank`);
 }
});
test('rotated elliptical banks use the true circular clearance along every normal',()=>{
 for(let i=0;i<48;i++){
  const theta=i*Math.PI/24,cos=Math.cos(lake.rotation),sin=Math.sin(lake.rotation),u=lake.radius_x*Math.cos(theta),v=lake.radius_y*Math.sin(theta),x=lake.x+cos*u-sin*v,y=lake.y+sin*u+cos*v,nu=Math.cos(theta)/lake.radius_x,nv=Math.sin(theta)/lake.radius_y,length=Math.hypot(nu,nv),nx=(cos*nu-sin*nv)/length,ny=(sin*nu+cos*nv)/length;
  assert.equal(water.pedestrianLakeContains(lake,{x:x+nx*14.1,y:y+ny*14.1},14),false,`legal normal at ${i}`);
  assert.equal(water.pedestrianLakeContains(lake,{x:x+nx*13.9,y:y+ny*13.9},14),true,`overlapping normal at ${i}`);
 }
});
test('a whole crossing segment is blocked even when both endpoints are on dry land',()=>{
 assert.equal(typeof water.segmentCrossesLake,'function');
 assert.equal(water.segmentCrossesLake(lake,{x:100,y:200},{x:500,y:200}),true);
 assert.equal(water.segmentCrossesLake(lake,{x:100,y:100},{x:500,y:100}),false);
 const {start,end}=dryCrossing();assert.deepEqual(world.clampPosition(start.x,start.y),start);assert.deepEqual(world.clampPosition(end.x,end.y),end);
 assert.equal(water.pedestrianSegmentCrossesLake(world.worldMap.lake,start,end),true);
 const stopped=world.movePosition(start,end.x-start.x,0);
 assert.ok(stopped.x>start.x&&stopped.x<end.x,'a long step reaches the near bank instead of crossing the lake');
 assert.equal(water.pedestrianSegmentCrossesLake(world.worldMap.lake,start,stopped,14),false);
});
test('a pedestrian walks along the bank while a boat remains within navigable water',()=>{
 assert.equal(typeof water.moveBoatPosition,'function');
 const m=world.worldMap.lake,p=dryCrossing().start;assert.deepEqual(world.clampPosition(p.x,p.y+20),{x:p.x,y:p.y+20});assert.equal(world.movePosition(p,0,20).y,p.y+20);
 const center=waterPoint(),edge=water.moveBoatPosition(m,center,2000,2000,12);assert.equal(water.lakeContains(m,edge,12),true);assert.equal(water.segmentStaysInLake(m,center,edge,12),true);assert.ok(Math.hypot(edge.x-center.x,edge.y-center.y)<Math.hypot(2000,2000),'the first shore or island prevents a full unbounded step');
 const again=water.moveBoatPosition(m,edge,2000,2000,12);assert.ok(Math.hypot(again.x-edge.x,again.y-edge.y)<.01);
});
test('a boat restored in the rounding margin stays near its bank and sends a safe integer position',()=>{
 const m=world.worldMap.lake,center=waterPoint(),legacy=water.moveBoatPosition(m,center,2000,0,12),next=water.moveBoatPosition(m,legacy,0,2,14);
 assert.ok(Math.hypot(legacy.x-next.x,legacy.y-next.y)<8);assert.equal(water.lakeContains(m,{x:Math.round(next.x),y:Math.round(next.y)},12),true);
});
test('recovering an old pedestrian water position uses a nearby bank or bridge rather than the railway',()=>{
 const m=world.worldMap.lake,old=waterPoint(),p=world.clampPosition(old.x,old.y);assert.notDeepEqual(p,world.worldSpawn);assert.equal(water.pedestrianLakeContains(m,p,14),false);assert.ok(Math.hypot(p.x-m.x,p.y-m.y)<m.radius_x+50);
});
test('three boats have real dry boarding approaches and navigable water docks',()=>{
 assert.equal(typeof water.lakeContains,'function');assert.equal(world.worldMap.boats.length,3);
 for(const b of world.worldMap.boats){assert.equal(water.lakeContains(world.worldMap.lake,b.dock,12),true);assert.equal(water.lakeContains(world.worldMap.lake,b.boarding),false);assert.equal(b.boarding.radius,65);}
 for(const spot of world.worldMap.activities.filter(a=>a.action==='fishing'))assert.equal(water.lakeContains(world.worldMap.lake,spot),false);
 assert.ok(world.worldMap.activities.some(a=>a.action==='pet-cat'));
 assert.deepEqual(world.travelTarget('dock').position,{x:world.worldMap.boats[1].boarding.x,y:world.worldMap.boats[1].boarding.y});
});
test('a city pet following a player on the bank stays on dry land',()=>{
 const m=world.worldMap.lake,owner={id:'shore-owner',scene:'city',x:m.x,y:m.y-m.radius_y-8,facing:'up',pet:{id:'shore-pet',kind:'dog'}};
 assert.equal(water.lakeContains(m,owner),false);const pet=world.petFollower(owner,null);assert.equal(water.lakeContains(m,pet),false);assert.ok(Math.hypot(pet.x-owner.x,pet.y-owner.y)<70);
});
test('pet gestures follow authoritative timestamps and expire without changing seated or phone state',()=>{
 assert.equal(typeof water.petEffectState,'function');const effect={id:'real-effect',target_id:'park-cat',kind:'cat',started_at:100,duration:2};
 assert.equal(water.petEffectState(effect,99),null);const active=water.petEffectState(effect,100.4);assert.equal(active.id,effect.id);assert.ok(active.reach>0);assert.equal(water.petEffectState(effect,102),null);assert.equal(water.petEffectState({...effect,kind:'dragon'},101),null);
});

test('reduced motion holds boat planes still while keeping an active pet reaction visible',()=>{
 const render=draw=>{const rects=[],ctx={fillRect(x,y,w,h){rects.push([x,y,w,h,this.fillStyle]);}};draw(ctx);return rects;},boat={x:500,y:400,occupant_id:'real-sailor',moving:true};
 assert.deepEqual(render(c=>drawBoat(c,boat,200,false,true)),render(c=>drawBoat(c,boat,700,false,true)),'Reduced motion removes decorative bobbing and repetitive rowing');
 assert.notDeepEqual(render(c=>drawBoat(c,boat,200)),render(c=>drawBoat(c,boat,700)),'Ordinary motion still renders the boat animation');
 const originalNow=Date.now,effect={id:'reduced-reaction',kind:'dog',target_id:'dog',started_at:100,duration:2};
 try{Date.now=()=>100400;const first=render(c=>drawAnimal(c,{x:500,y:400,kind:'dog'},effect,true));Date.now=()=>100700;const second=render(c=>drawAnimal(c,{x:500,y:400,kind:'dog'},effect,true));assert.deepEqual(second,first,'Pet bounce, tail and floating hearts stay steady');assert.ok(first.some(r=>r[4]==='#e88d78'),'A static heart keeps the action feedback visible');}finally{Date.now=originalNow;}
});
