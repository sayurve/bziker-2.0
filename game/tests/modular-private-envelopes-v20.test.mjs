import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceBuildingLayout} from '../web/source-city.js';
import {createCityGroundPlan,segmentEntersGroundObstacle} from '../web/city-ground.js';
import {cityPhysicalObstacles,nearestFreeCityPoint} from '../web/city-collision.js';
import {pedestrianLakeContains} from '../web/water.js';
const map=JSON.parse(await readFile(new URL('../web/world-map.json',import.meta.url),'utf8')),plan=createCityGroundPlan(map);
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
function segmentBoxDistance(s,b){
 if(segmentEntersGroundObstacle(s.a,s.b,b))return 0;
 const toBox=p=>Math.hypot(Math.max(b.x-p[0],0,p[0]-b.x-b.width),Math.max(b.y-p[1],0,p[1]-b.y-b.height));
 return Math.min(toBox(s.a),toBox(s.b),...[[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]].map(p=>{const along=Math.max(0,Math.min(s.length,(p[0]-s.a[0])*s.tangent[0]+(p[1]-s.a[1])*s.tangent[1]));return Math.hypot(p[0]-s.a[0]-along*s.tangent[0],p[1]-s.a[1]-along*s.tangent[1]);}));
}
test('all six built native facades fit every private plot without covering another building or a visible street',()=>{
 assert.ok(map.schema_version>=20);assert.equal(map.district.buildings.length,8);
 const publicBounds=[...map.buildings,...map.background_buildings].map(b=>({id:b.id,...sourceBuildingLayout(b).bounds}));
 const variants=map.district.buildings.flatMap(h=>Array.from({length:6},(_,style)=>({id:h.id,style,...sourceBuildingLayout(h,{exterior_style:style}).bounds})));
 for(const b of variants){
  assert.ok(b.x>=18&&b.y>=18&&b.x+b.width<=map.width-18&&b.y+b.height<=map.height-18,`${b.id} style${b.style} leaves the playable map`);
  for(const other of publicBounds)assert.equal(overlap(b,other),false,`${b.id} style${b.style} covers ${other.id}`);
  for(const other of variants.filter(o=>o.id!==b.id))assert.equal(overlap(b,other),false,`${b.id} style${b.style} covers ${other.id} style${other.style}`);
  for(const s of plan.roadSegments.filter(s=>s.kind==='road'))assert.ok(segmentBoxDistance(s,b)>=s.width/2+plan.sidewalk-1,`${b.id} style${b.style} covers the visible ${s.roadId} street/sidewalk`);
 }
});
test('every selectable facade keeps the real door and its return landing physically clear',()=>{
 const obstacles=cityPhysicalObstacles(map),bounds={left:18,top:18,right:map.width-18,bottom:map.height-18};
 for(const h of map.district.buildings)for(let style=0;style<6;style++){
  const r=sourceBuildingLayout(h,{exterior_style:style});
  assert.deepEqual(r.footprint,h.footprint,`${h.id} style${style} moves its physical support`);
  assert.deepEqual(r.doorTarget,h.design.doorTarget);
  assert.ok(Math.abs(r.bounds.x+r.bounds.width*r.doorAnchor.x-h.door.x)<1e-8,`${h.id} style${style} moves the visible stair horizontally`);
  assert.ok(Math.abs(r.bounds.y+r.bounds.height*r.doorAnchor.y+24-h.door.y)<1e-8,`${h.id} style${style} moves the visible stair vertically`);
  for(const dy of [0,24,25,28,70]){
   const p={x:h.door.x,y:h.door.y+dy};
   assert.deepEqual(nearestFreeCityPoint(p,obstacles,bounds),p,`${h.id} style${style} blocks return +${dy}`);
   assert.equal(pedestrianLakeContains(map.lake,p),false,`${h.id} style${style} returns into water +${dy}`);
  }
 }
});
