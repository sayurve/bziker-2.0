import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCityGroundPlan} from '../web/city-ground.js';
import {lakeContains} from '../web/water.js';
import * as world from '../web/world.js';
const map=JSON.parse(await readFile(new URL('../web/world-layout-v18.json',import.meta.url),'utf8'));
const plan=createCityGroundPlan(map),buildings=[...map.buildings,...map.district.buildings,...map.background_buildings];
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
function pointSegment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function pointRect(p,r){return Math.hypot(Math.max(r.x-p[0],0,p[0]-r.x-r.width),Math.max(r.y-p[1],0,p[1]-r.y-r.height));}
function segmentRect(a,b,r){let low=0,high=1;for(const [i,key,span] of [[0,'x','width'],[1,'y','height']]){const delta=b[i]-a[i];if(!delta){if(a[i]<r[key]||a[i]>r[key]+r[span])return false;continue;}const first=(r[key]-a[i])/delta,last=(r[key]+r[span]-a[i])/delta;low=Math.max(low,Math.min(first,last));high=Math.min(high,Math.max(first,last));if(low>high)return false;}return true;}
function segmentRectDistance(a,b,r){if(segmentRect(a,b,r))return 0;return Math.min(pointRect(a,r),pointRect(b,r),...[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]].map(p=>pointSegment(p,a,b)));}
function assertAsphaltClear(id,r){for(const s of plan.roadSegments.filter(s=>s.kind==='road'))assert.ok(segmentRectDistance(s.a,s.b,r)>s.width/2,`${id} intersects ${s.id} asphalt`);}

test('every building footprint is clear of the entire street and sidewalk band',()=>{
 for(let i=0;i<buildings.length;i++){for(let j=i+1;j<buildings.length;j++)assert.ok(!overlap(buildings[i],buildings[j]),`${buildings[i].id} overlaps ${buildings[j].id}`);for(const s of plan.roadSegments.filter(s=>s.kind==='road'))assert.ok(segmentRectDistance(s.a,s.b,buildings[i])>s.width/2+plan.sidewalk,`${buildings[i].id} overlaps ${s.id} asphalt or sidewalk`);}
});

test('source district has distinct north and south streets and every street fits inside the map',()=>{
 assert.ok(map.design_source);assert.ok(map.roads.some(r=>r.id==='clan-north'&&r.points.length>=2));assert.ok(map.roads.some(r=>r.id==='clan-middle'&&r.points.length>=2));assert.ok(plan.junctions.length>=3);
 for(const r of map.roads.filter(r=>r.kind==='road'))for(const p of r.points){const margin=r.width/2+plan.sidewalk;assert.ok(p[0]>=margin&&p[0]+margin<=map.width);assert.ok(p[1]>=margin&&p[1]+margin<=map.height);assert.ok(p[0]<=map.walkable.right&&p[1]<=map.walkable.bottom);}
});

test('waterfront pavement keeps its whole width plus a visible shore margin outside water',()=>{
 const waterfront=map.roads.filter(r=>['lake-ring','station-promenade','park-loop'].includes(r.id));assert.equal(waterfront.length,3);
 for(const r of waterfront)for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/5);for(let j=0;j<=steps;j++){const p={x:a[0]+(b[0]-a[0])*j/steps,y:a[1]+(b[1]-a[1])*j/steps};assert.equal(lakeContains(map.lake,p,-r.width/2-18),false,`${r.id} edge or curb enters the shoreline at ${p.x},${p.y}`);}}
});

test('all fixed physical city supports remain clear of buildings, entrances and asphalt',()=>{
 const fixtures=[...map.decor.trees.map(t=>({id:t.id,x:t.x-13*t.size,y:t.y+25*t.size,width:25*t.size,height:5*t.size})),...map.decor.lamps.map(l=>({id:l.id,x:l.x-12,y:l.y+1,width:24,height:5})),...map.bench_groups.map(b=>({id:b.id,x:b.x-5,y:b.y+20,width:131,height:21})),...map.activities.filter(a=>a.action==='trash-bin').map(a=>({id:a.id,x:a.x-16,y:a.y-9,width:32,height:23}))];
 for(const f of fixtures){assertAsphaltClear(f.id,f);for(const b of buildings)assert.ok(!overlap(f,b),`${f.id} blocks ${b.id}`);for(const a of plan.approaches)assert.ok(!overlap(f,a.corridor),`${f.id} blocks ${a.id} entrance`);}
 for(const t of map.decor.trees)for(const s of plan.roadSegments.filter(s=>s.kind!=='road'&&!s.roadId.startsWith('door-')&&!s.roadId.startsWith('access-')))assert.ok(pointSegment([t.x,t.y+27*t.size],s.a,s.b)>s.width/2+13*t.size,`${t.id} root blocks ${s.id} path`);
});

test('generated bike racks sit on pavement outside asphalt without physical location lettering',()=>{
 assert.equal(typeof world.cityBikeRackLayout,'function');assert.equal(typeof world.cityPlazaTitleLayout,'function');const racks=world.cityBikeRackLayout(map,plan);assert.equal(racks.length,9);
 for(const rack of racks){assertAsphaltClear(rack.id,rack.footprint);for(const a of plan.approaches)assert.ok(!overlap(rack.footprint,a.corridor),`${rack.id} blocks ${a.id} door`);for(const bed of plan.plantings)assert.ok(!overlap(rack.footprint,bed),`${rack.id} overlaps ${bed.id}`);}
 assert.equal(map.design_source.physical_welcome_sign_only,true);
});

test('rendered house side planes remain outside asphalt',()=>{
 // Imported building footprints already describe their native ground plane.
 // Public front walls retain the server's additional solid projection.
 for(const b of buildings){const projection=map.buildings.includes(b)?{width:18,height:10}:{width:0,height:0};assertAsphaltClear(`${b.id} volume`,{...b,width:b.width+projection.width,height:b.height+projection.height});}
});

test('generated planter bases, sign posts and public furniture do not occupy asphalt',()=>{
 for(const bed of plan.plantings){const foot={x:bed.x-2,y:bed.y-2,width:bed.width+6,height:bed.height+10};assertAsphaltClear(bed.id,foot);for(const a of plan.approaches)assert.ok(!overlap(foot,a.corridor),`${bed.id} base blocks ${a.id} entrance`);}
 const archive=map.landmarks.archive,welcome=map.landmarks.welcome,smoke=map.smoking;
 const supports=[{id:'archive-legs',x:archive.x-39,y:archive.y,width:79,height:13},{id:'welcome-left-post',x:welcome.x-113,y:welcome.y-51,width:5,height:16},{id:'welcome-right-post',x:welcome.x+108,y:welcome.y-51,width:5,height:16},{id:'smoking-ashtray',x:smoke.x+200,y:smoke.y+105,width:26,height:21},...map.architecture.props.map(p=>({id:p.id,...p.footprint}))];
 for(const support of supports)assertAsphaltClear(support.id,support);
});
