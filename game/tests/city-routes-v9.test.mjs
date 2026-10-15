import test from 'node:test';
import assert from 'node:assert/strict';
import {worldMap,cityGroundPlan,movePosition,clampPosition,nearestEntrance,nearestAction} from '../web/world.js';
import {pedestrianLakeContains} from '../web/water.js';
import {readFileSync} from 'node:fs';

const solids=JSON.parse(readFileSync(new URL('../web/city-collisions.json',import.meta.url))).obstacles;
function samples(points,spacing=8){
 const result=[];
 for(let edge=1;edge<points.length;edge++){
  const a=points[edge-1],b=points[edge],length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.max(1,Math.ceil(length/spacing));
  for(let k=0;k<=steps;k++)result.push({x:a[0]+(b[0]-a[0])*k/steps,y:a[1]+(b[1]-a[1])*k/steps});
 }
 return result;
}
const distanceToBox=(p,b)=>Math.hypot(Math.max(b.x-p.x,0,p.x-b.x-b.width),Math.max(b.y-p.y,0,p.y-b.y-b.height));
const authored=()=>worldMap.roads.map(r=>({id:r.id,points:r.points}));
const approaches=()=>cityGroundPlan.approaches.map(a=>({id:`approach-${a.id}`,points:a.path}));

// A player needs a corridor around their foot position. Checking only the
// polyline endpoints misses a street running through a house or a lake bend.
test('every authored road, footpath and generated door approach has a dry body-sized corridor',()=>{
 assert.ok(worldMap.design_source);
 if(worldMap.schema_version>=20){for(const f of worldMap.architecture.frontages){const house=[...worldMap.buildings,...worldMap.district.buildings,...worldMap.background_buildings].find(b=>b.id===f.building_id);assert.ok(house);assert.deepEqual(f.path[0],[house.door.x,house.door.y]);const road=worldMap.roads.find(r=>r.id===`access-${house.id}`);assert.ok(road,`${house.id} has an actual access path`);assert.deepEqual(road.points,f.path);}}
 else if(worldMap.design_source.exact_scene){assert.equal(worldMap.roads.filter(r=>r.id.startsWith('entrance-')).length,worldMap.architecture.frontages.length);for(const f of worldMap.architecture.frontages)assert.deepEqual(f.path[0],[f.door.x,f.door.y]);}
 else{assert.equal(worldMap.roads.filter(r=>r.id.startsWith('door-')).length,worldMap.architecture.frontages.length);assert.equal(worldMap.roads.filter(r=>r.id.startsWith('parking-')).length,worldMap.architecture.frontages.length);}
 for(const route of [...authored(),...approaches()])for(const p of samples(route.points)){
  const obstruction=solids.find(b=>distanceToBox(p,b)<14-1e-7);
  assert.equal(obstruction,undefined,`${route.id} enters ${obstruction?.id||'an apartment'} at ${p.x},${p.y}`);
  for(const [dx,dy] of [[0,0],[14,0],[-14,0],[0,14],[0,-14]])assert.equal(pedestrianLakeContains(worldMap.lake,{x:p.x+dx,y:p.y+dy}),false,`${route.id} loses pedestrian clearance at ${p.x+dx},${p.y+dy}`);
 }
});

test('walking every road and all public/clan approaches in both directions never blocks or resets the player',()=>{
 assert.equal(cityGroundPlan.approaches.length,worldMap.buildings.length+worldMap.district.buildings.length+worldMap.background_buildings.length);
 for(const route of [...authored(),...approaches()])for(const points of [route.points,[...route.points].reverse()]){
  let position={x:points[0][0],y:points[0][1]};
  assert.deepEqual(clampPosition(position.x,position.y),position,`${route.id} starts on clear ground`);
  for(const p of samples(points)){
   position=movePosition(position,p.x-position.x,p.y-position.y);
   assert.ok(Math.hypot(position.x-p.x,position.y-p.y)<1e-7,`${route.id} blocked at ${p.x},${p.y}, actual ${position.x},${position.y}`);
  }
 }
});

test('all 19 outdoor doors have clear action targets and both slots of every bench can be left in every direction',()=>{
 for(const building of [...worldMap.buildings,...worldMap.district.buildings]){
  const p={x:building.door.x,y:building.door.y+24};
  assert.deepEqual(clampPosition(p.x,p.y),p,`${building.id} door arrival is legal`);
  assert.equal(nearestEntrance(p.x,p.y),building.id,`${building.id} can be entered from its approach`);
  assert.equal(nearestAction(p.x,p.y).id,building.id,`${building.id} entrance is not displaced by another nearby action`);
 }
 assert.equal(worldMap.benches.length,worldMap.bench_groups.length*2);
 for(const bench of worldMap.benches){
  const p=bench.seat;
  assert.deepEqual(clampPosition(p.x,p.y),p,`${bench.id} seat is legal`);
  assert.equal(nearestAction(p.x,p.y).id,bench.id,`${bench.id} uses its own action target`);
  for(const [dx,dy] of [[0,8],[8,0],[-8,0],[0,-8]]){
   const next=movePosition(p,dx,dy);
   assert.ok(Math.hypot(next.x-p.x,next.y-p.y)>0&&Math.hypot(next.x-p.x,next.y-p.y)<70,`${bench.id} leaves its solid support locally toward ${dx},${dy}`);
   assert.deepEqual(clampPosition(next.x,next.y),next,`${bench.id} exit is on free ground`);
   assert.ok([[0,8],[8,0],[-8,0],[0,-8]].some(([mx,my])=>{const free=movePosition(next,mx,my);return free.x!==next.x||free.y!==next.y;}),`${bench.id} has a walkable route after exit`);
  }
 }
});
