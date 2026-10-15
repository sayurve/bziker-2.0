import test from 'node:test';
import assert from 'node:assert/strict';
import * as city from '../web/world.js';
import {readFileSync} from 'node:fs';
const obstacles=JSON.parse(readFileSync(new URL('../web/city-collisions.json',import.meta.url),'utf8')).obstacles;
const inside=(p,b)=>p.x>b.x&&p.x<b.x+b.width&&p.y>b.y&&p.y<b.y+b.height;
const radius=14;

test('expanded city clamps finite positions and relocates building interiors',()=>{
 assert.deepEqual(city.clampPosition(-20,120),{x:city.worldBounds.left+radius,y:120});assert.deepEqual(city.clampPosition(city.worldBounds.right+1000,city.worldBounds.bottom+1000),{x:city.worldBounds.right-radius,y:city.worldBounds.bottom-radius});assert.deepEqual(city.clampPosition(NaN,Infinity),city.worldSpawn);
 const b=obstacles.find(b=>b.id==='clans'),point={x:b.x+b.width/2,y:b.y+b.height/2},repaired=city.clampPosition(point.x,point.y);
 assert.ok(inside(point,b));assert.ok(!obstacles.some(o=>inside(repaired,o)),'an occupied native support is relocated to free ground');assert.deepEqual(city.clampPosition(repaired.x,repaired.y),repaired);assert.deepEqual(city.clampPosition(city.worldSpawn.x,city.worldSpawn.y),city.worldSpawn);
});
test('all working city doors activate, central results board stays accessible',()=>{
 for(const b of city.cityBuildings)assert.equal(city.nearestEntrance(b.door.x,b.door.y),b.id);assert.equal(city.nearestEntrance(city.worldMap.landmarks.archive.x,city.worldMap.landmarks.archive.y),'results');assert.equal(city.nearestEntrance(city.worldBounds.right,city.worldBounds.bottom),null);assert.equal(city.nearestEntrance(NaN,850),null);
});
test('axis-separated movement slides along walls and prevents tunnelling',()=>{
 const b=obstacles.find(b=>b.id==='arena'),p={x:b.x-radius,y:b.y+40};assert.deepEqual(city.clampPosition(p.x,p.y),p);assert.deepEqual(city.movePosition(p,20,20),{x:p.x,y:p.y+20});assert.deepEqual(city.movePosition(p,b.width+50,0),p);assert.deepEqual(city.movePosition({x:city.worldBounds.left+radius,y:city.worldBounds.top+radius},-50,-50),{x:city.worldBounds.left+radius,y:city.worldBounds.top+radius});
});
test('district houses use shared bounds, doors and collision without fabricated clans',()=>{
 assert.equal(city.districtHouses.length,8);assert.deepEqual(city.districtHouses.map(h=>h.id),Array.from({length:8},(_,i)=>`base-${i+1}`));
 for(const house of city.districtHouses){assert.ok(house.x+house.width<city.worldMap.landmarks.plaza.x,'Clan plots belong to the source northwest neighbourhood');assert.ok(house.door.x>=house.x&&house.door.x<=house.x+house.width,'the source doorway stays on its real facade, without forcing a central entrance');assert.ok(house.door.y>house.y+house.height);assert.ok(house.width>0&&house.height>0);assert.equal(house.design.baked_scene,false);assert.ok(house.design.assetId);assert.deepEqual(house.footprint,Object.fromEntries(['x','y','width','height'].map(k=>[k,house[k]])));assert.ok(!house.clan,'Map geometry must not invent an occupied clan');assert.deepEqual(city.clampPosition(house.door.x,house.door.y+24),{x:house.door.x,y:house.door.y+24});}
 const h=obstacles.find(b=>b.id==='base-1'),interior={x:h.x+h.width/2,y:h.y+h.height/2},repaired=city.clampPosition(interior.x,interior.y);assert.equal(city.nearestEntrance(city.districtHouses[0].door.x,city.districtHouses[0].door.y),'base-1');assert.ok(inside(interior,h));assert.ok(!obstacles.some(o=>inside(repaired,o)));assert.deepEqual(city.clampPosition(repaired.x,repaired.y),repaired);const approach={x:h.x-radius,y:h.y+50};assert.deepEqual(city.clampPosition(approach.x,approach.y),approach);assert.deepEqual(city.movePosition(approach,20,20),{x:approach.x,y:approach.y+20});
});
test('published map exactly matches client geometry',()=>{
 const map=JSON.parse(readFileSync(new URL('../web/world-map.json',import.meta.url)));assert.deepEqual(city.worldSize,{width:map.width,height:map.height});assert.deepEqual(city.worldBounds,map.walkable);assert.deepEqual(city.worldSpawn,map.spawn);assert.deepEqual(map.buildings,city.cityBuildings);assert.deepEqual(map.district.buildings,city.districtHouses);assert.deepEqual(map.benches,city.worldBenches);
});
test('base rejects overlaps, unsupported furniture, bounds and full rooms',()=>{
  const items=[{id:'one',type:'desk',x:2,y:3}];
  assert.equal(city.canPlaceItem(items,null),false);
  assert.equal(city.canPlaceItem(undefined,{id:'two',type:'plant',x:3,y:3}),false);
  assert.equal(city.canPlaceItem(items,{id:'two',type:'plant',x:3,y:3}),true);
  assert.equal(city.canPlaceItem(items,{id:'two',type:'plant',x:2,y:3}),false);
  assert.equal(city.canPlaceItem(items,{id:'one',type:'chair',x:4,y:3}),false);
  assert.equal(city.canPlaceItem(items,{id:'two',type:'door',x:4,y:3}),false);
  assert.equal(city.canPlaceItem(items,{id:'two',type:'chair',x:12,y:7}),false);
  assert.equal(city.canPlaceItem(items,{id:'two',type:'chair',x:1.2,y:7}),false);
  assert.equal(city.canPlaceItem(Array.from({length:30},(_,i)=>({id:String(i),type:'plant',x:i%12,y:Math.floor(i/12)})),{id:'extra',type:'chair',x:10,y:7}),false);
});

test('doors, smoke zone and every seat share interaction geometry',()=>{
 const smoke=city.worldMap.smoking;assert.equal(city.nearestEntrance(smoke.door.x,smoke.door.y),'smoking');assert.ok(city.worldMap.bench_groups.length>0);assert.equal(city.worldBenches.length,city.worldMap.bench_groups.length*2);assert.equal(new Set(city.worldBenches.map(s=>s.id)).size,city.worldBenches.length);
 for(const b of city.worldBenches)assert.equal(city.nearestAction(b.seat.x,b.seat.y).id,b.id);
});
test('physical keys and Cyrillic shortcuts resolve to the same actions',()=>{
 assert.equal(city.worldKey({key:'у',code:'KeyE'}),'interact');
 assert.equal(city.worldKey({key:'з',code:'KeyP'}),'phone');
 assert.equal(city.worldKey({key:'ф',code:'KeyA'}),'a');
 assert.equal(city.worldKey({key:'E'}),'interact');
});
test('travel has legal unified destinations and own base requires its actual clan building',()=>{
 assert.equal(city.travelTarget('district').scene,'city');
 assert.deepEqual(city.travelTarget('district').position,city.worldMap.landmarks.district);
 assert.equal(city.travelTarget('base',{my_clan:null}),null);
 assert.equal(city.travelTarget('base',{my_clan:{id:'x',base:{building_id:'base-2'}}}).scene,'base');
 for(const d of city.travelDestinations.filter(d=>d.id!=='base'))assert.deepEqual(city.clampPosition(d.x,d.y),{x:d.x,y:d.y});
});
test('park travel leaves the dog visible beside the player and immediately reachable for petting',()=>{
 const point=city.travelTarget('park').position,dog=city.worldMap.activities.find(a=>a.action==='pet-dog'),separation=Math.hypot(point.x-dog.x,point.y-dog.y);
 assert.ok(separation>=38,'the arrival sprite must not cover the dog on either side');assert.ok(separation<=dog.radius,'petting remains available without another step');assert.deepEqual(city.clampPosition(point.x,point.y),point);assert.deepEqual(city.clampPosition(dog.x,dog.y),{x:dog.x,y:dog.y},'the initial dog interaction point is legal ground');
 const action=city.nearestAction(point.x,point.y);assert.equal(action.id,dog.id);assert.equal(action.action,'pet-dog');
});
