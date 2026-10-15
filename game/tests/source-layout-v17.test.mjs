import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const map=JSON.parse(fs.readFileSync(new URL('../web/world-layout-v18.json',import.meta.url)));
test('source city uses the new station, clan, shopping and lake neighbourhoods',()=>{
 assert.equal(map.design_source?.grid?.join(','),'3,2');
 assert.ok(map.landmarks.station.x>map.landmarks.district.x);
 assert.ok(map.landmarks.station.y<map.landmarks.plaza.y);
 assert.ok(map.lake.x>map.landmarks.park.x);
 assert.ok(map.buildings.find(b=>b.id==='casino').door.x<map.lake.x);
 assert.ok(map.design_areas.some(a=>a.assetId==='city-tennis-court'));
 assert.ok(map.design_areas.some(a=>a.assetId==='city-basketball-court'));
});
test('every building and clan plot has a connected pedestrian entrance',()=>{
 for(const b of [...map.buildings,...map.district.buildings,...map.background_buildings]){
  assert.ok(map.architecture.frontages.some(f=>f.building_id===b.id),`${b.id} frontage`);
  assert.ok(map.roads.some(r=>r.points.some(p=>p[0]===b.door.x&&p[1]===b.door.y)),`${b.id} path from actual door`);
 }
});
