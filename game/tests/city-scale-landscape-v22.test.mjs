import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCityGroundPlan} from '../web/city-ground.js';
import {cityPhysicalObstacles} from '../web/city-collision.js';
import {lakeContains} from '../web/water.js';

const map=JSON.parse(fs.readFileSync(new URL('../web/world-map.json',import.meta.url)));
const plan=createCityGroundPlan(map);
const obstacles=cityPhysicalObstacles(map);
const gap=(p,b)=>Math.hypot(Math.max(b.x-p.x,0,p.x-b.x-b.width),Math.max(b.y-p.y,0,p.y-b.y-b.height));
const dryClear=(p,pad=14)=>p.x>=map.walkable.left+pad&&p.y>=map.walkable.top+pad&&p.x<=map.walkable.right-pad&&p.y<=map.walkable.bottom-pad&&!lakeContains(map.lake,p,-pad)&&!obstacles.some(b=>gap(p,b)<pad);
const segmentDistance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a[0]-t*dx,p.y-a[1]-t*dy);};
const contains=(box,p,pad=0)=>p.x>=box.x+pad-.02&&p.y>=box.y+pad-.02&&p.x+p.width<=box.x+box.width-pad+.02&&p.y+p.height<=box.y+box.height-pad+.02;

test('five or more actual rendered crossings connect both sidewalks across a clear full-width street',()=>{
 assert.ok(plan.crossings.length>=5,`the rendered city has only ${plan.crossings.length} pedestrian crossings`);
 const used=new Set();
 for(const crossing of plan.crossings){
  const road=map.roads.find(r=>r.id===crossing.roadId);assert.equal(road?.kind,'road');assert.equal(crossing.stripes.length,7);assert.equal(crossing.pads.length,2);
  const key=`${crossing.center[0].toFixed(2)}:${crossing.center[1].toFixed(2)}`;assert.ok(!used.has(key),'crossings do not duplicate one location');used.add(key);
  for(const polygon of [...crossing.stripes,...crossing.pads])for(const [x,y]of polygon)assert.ok(dryClear({x,y},8),`${crossing.id} is clipped by water or a support`);
  const span=road.width/2+30,a={x:crossing.center[0]-span*crossing.normal[0],y:crossing.center[1]-span*crossing.normal[1]},b={x:crossing.center[0]+span*crossing.normal[0],y:crossing.center[1]+span*crossing.normal[1]};
  for(let i=0;i<=40;i++)assert.ok(dryClear({x:a.x+(b.x-a.x)*i/40,y:a.y+(b.y-a.y)*i/40}),`${crossing.id} cannot be walked from sidewalk to sidewalk`);
 }
});

test('every park bench, fountain and gazebo has a real paved landing connected to a clear authored alley',()=>{
 const fixtures=[...map.bench_groups.filter(p=>p.zone==='park'),...map.scene_objects.filter(p=>['park-fountain','park-gazebo'].includes(p.id))];
 assert.ok(fixtures.length>=6,'this assertion covers the actual park furniture collection');
 const pads=map.decor.fixture_pads||[];assert.equal(pads.length,fixtures.length,'each physical park fixture has one landing');
 const ids=new Set();
 for(const fixture of fixtures){
  const matches=pads.filter(p=>p.fixture_id===fixture.id);assert.equal(matches.length,1,`${fixture.id} has one real paved support`);const pad=matches[0],foot=fixture.footprint;
  assert.ok(foot,'park fixtures keep their actual physical support');assert.equal(pad.function,'park-fixture');assert.ok(contains(pad,foot,14),`${fixture.id} protrudes from its own landing`);assert.ok(!ids.has(pad.id));ids.add(pad.id);
  assert.ok(plan.pads.some(p=>p.id===pad.id),`${pad.id} is included in the rendered ground plan`);
  const path=map.roads.find(r=>r.id===pad.path_id);assert.equal(path?.kind,'walkway');assert.equal(path.width,40);assert.deepEqual(path.points,pad.path);
  assert.ok(path.points[0][0]>=foot.x&&path.points[0][0]<=foot.x+foot.width&&path.points[0][1]>=foot.y+foot.height+14,`${fixture.id} alley starts in front of its physical support`);
  assert.ok(contains(pad,{x:path.points[0][0],y:path.points[0][1],width:0,height:0},14),`${fixture.id} has no paved space in front`);
  const alley=map.roads.find(r=>r.id===pad.connection.road_id);assert.ok(['park-loop','park-centre','station-promenade','lake-ring'].includes(alley?.id),`${fixture.id} connects to the real park network`);
  const last=path.points.at(-1);assert.ok(alley.points.slice(1).some((b,i)=>segmentDistance({x:last[0],y:last[1]},alley.points[i],b)<=alley.width/2+.02),`${fixture.id} ends before its alley`);
  for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/8));for(let k=0;k<=n;k++)assert.ok(dryClear({x:a[0]+(b[0]-a[0])*k/n,y:a[1]+(b[1]-a[1])*k/n}),`${fixture.id} path is physically blocked at ${i}:${k}`);}
 }
});
