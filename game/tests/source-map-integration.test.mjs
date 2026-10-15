import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceCityGroundObjects,sourceCityModuleObjects} from '../web/source-city.js';
import {segmentBoxDistance,playerBodyRadius} from '../web/city-collision.js';
import {pedestrianLakeContains} from '../web/water.js';
const map=JSON.parse(readFileSync(new URL('../web/world-map.json',import.meta.url)));
const obstacles=JSON.parse(readFileSync(new URL('../web/city-collisions.json',import.meta.url))).obstacles;
const nodes=[...sourceCityGroundObjects(map),...sourceCityModuleObjects(map)];
test('native rail pieces join continuously across the whole reserved north corridor and every coach',()=>{
 const rails=nodes.filter(n=>n.kind==='rail').sort((a,b)=>a.bounds.x-b.bounds.x);
 assert.ok(rails.length>0);
 const first=rails[0].bounds,last=rails.at(-1).bounds;
 assert.ok(first.x<=5856+.001&&last.x+last.width>=10296-.001,'cover the complete planned northern corridor');
 for(let i=1;i<rails.length;i++){
  const a=rails[i-1].bounds,b=rails[i].bounds;
  assert.ok(Math.abs(b.x-(a.x+a.width))<.001,`${rails[i-1].id} -> ${rails[i].id}: visible gap or arbitrary overlap`);
  assert.ok(Math.abs(a.y-b.y)<.001&&Math.abs(a.height-b.height)<.001,'one level native track, no stretched joints');
 }
 for(const coach of nodes.filter(n=>['coach','canopy'].includes(n.kind)))assert.ok(coach.bounds.x>=first.x-.001&&coach.bounds.x+coach.bounds.width<=last.x+last.width+.001,`${coach.id} has rail along its full length`);
});
test('the sole physical welcome sign supplies the clear landmark and actual arrival endpoint',()=>{
 const signs=map.scene_objects.filter(n=>n.id==='welcome-sign');assert.equal(signs.length,1);
 const sign=signs[0],target={x:sign.footprint.x+sign.footprint.width/2,y:sign.footprint.y+sign.footprint.height+24};
 assert.deepEqual(map.landmarks.welcome,target,'landmark follows the real sign, not a stale native coordinate');
 assert.deepEqual(map.arrival_route.points.at(-1),[target.x,target.y]);
 assert.ok(!pedestrianLakeContains(map.lake,target,playerBodyRadius));
 assert.ok(!obstacles.some(b=>segmentBoxDistance(target,target,b)<playerBodyRadius-1e-7));
 for(let i=1;i<map.arrival_route.points.length;i++){
  const a=map.arrival_route.points[i-1],z=map.arrival_route.points[i],start={x:a[0],y:a[1]},end={x:z[0],y:z[1]};
  assert.ok(!obstacles.some(b=>segmentBoxDistance(start,end,b)<playerBodyRadius-1e-7),'arrival walk never cuts the sign or another support');
 }
});
test('gazebo landmark is the actual authored landing in front of the rendered gazebo',()=>{
 const gazebo=map.scene_objects.find(o=>o.id==='park-gazebo');
 const pad=map.decor.fixture_pads.find(p=>p.fixture_id===gazebo.id);
 const [x,y]=pad.path[0],target={x,y};
 assert.deepEqual(map.landmarks.gazebo,target,'use the gazebo landing, not a detached old label coordinate');
 assert.deepEqual(gazebo.approach,target,'the physical object owns its approach');
 assert.ok(x>=gazebo.footprint.x&&x<=gazebo.footprint.x+gazebo.footprint.width);
 assert.ok(y>=gazebo.footprint.y+gazebo.footprint.height+playerBodyRadius);
 assert.ok(!obstacles.some(b=>segmentBoxDistance(target,target,b)<playerBodyRadius-1e-7));
 assert.ok(!pedestrianLakeContains(map.lake,target,playerBodyRadius));
 for(let i=1;i<pad.path.length;i++){
  const a=pad.path[i-1],z=pad.path[i];
  assert.ok(!obstacles.some(b=>segmentBoxDistance({x:a[0],y:a[1]},{x:z[0],y:z[1]},b)<playerBodyRadius-1e-7),'existing gazebo alley stays clear');
 }
});
