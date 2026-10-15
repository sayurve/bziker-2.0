import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {worldSpawn,travelTarget,nearestEntrance,worldInteractionRadii} from '../web/world.js';
const map=JSON.parse(await readFile(new URL('../web/world-layout-v18.json',import.meta.url),'utf8'));
const rooms=JSON.parse(await readFile(new URL('../web/interiors-map.json',import.meta.url),'utf8')).rooms;
test('railway arrival is a short distinct walk from the town rather than a wide empty gap',()=>{
 const points=map.arrival_route.points,length=points.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0),seconds=length/map.movement_speed;
 assert.ok(seconds>=3&&seconds<=10,`Source-layout arrival takes ${seconds.toFixed(2)} seconds`);
 assert.ok(Math.abs(map.arrival_route.walking_seconds-seconds)<=.1);
 assert.deepEqual(points[0],[map.spawn.x,map.spawn.y]);
 assert.ok(Math.hypot(points.at(-1)[0]-map.landmarks.welcome.x,points.at(-1)[1]-map.landmarks.welcome.y)<=200,'Welcome sign belongs beside the entrance, with its physical legs clear');
 assert.deepEqual(map.roads.find(r=>r.id==='arrival').points,points);
});
test('newcomers, map travel and the railway interior share the exact native doorway',async()=>{
 const actual=JSON.parse(await readFile(new URL('../web/world-map.json',import.meta.url),'utf8'));
 const station=actual.buildings.find(b=>b.id==='railway'),room=rooms.find(r=>r.id==='railway');
 assert.ok(actual.schema_version>=20);assert.equal(actual.design_source.modular_scene,true);assert.equal(station.design.baked_scene,false);assert.equal(station.design.assetId,'railway-station');assert.ok(station.footprint,'the visible station has its own exact physical support');
 assert.deepEqual(worldSpawn,actual.spawn);assert.deepEqual(travelTarget('station').position,actual.spawn);
 assert.deepEqual(actual.landmarks.station,actual.spawn);assert.deepEqual(room.door,station.door);
 assert.deepEqual(station.door,{x:station.design.doorTarget.x,y:station.design.doorTarget.y+station.design.doorOffsetY},'the action door is anchored to the provided native staircase');
 assert.equal(nearestEntrance(actual.spawn.x,actual.spawn.y),'railway','the actual station spawn is inside its usable entrance range');assert.ok(Math.abs(actual.spawn.x-station.door.x)<=32,'native spawn remains beside the actual staircase');assert.ok(actual.spawn.y-station.design.doorTarget.y>=20,'spawn stays beyond the solid native staircase');assert.ok(Math.hypot(actual.spawn.x-station.door.x,actual.spawn.y-station.door.y)<=worldInteractionRadii.door,'newcomers can use the native station door within its shared client/server radius');
 assert.equal(nearestEntrance(station.door.x,station.door.y+24),'railway');
});
