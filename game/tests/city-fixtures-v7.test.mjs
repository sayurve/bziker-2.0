import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCityGroundPlan} from '../web/city-ground.js';
const map=JSON.parse(await readFile(new URL('../web/world-layout-v18.json',import.meta.url),'utf8'));
const plan=createCityGroundPlan(map);
function pointSegment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n)):0;return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);}
function pointRect(p,r){return Math.hypot(Math.max(r.x-p[0],0,p[0]-r.x-r.width),Math.max(r.y-p[1],0,p[1]-r.y-r.height));}
function segmentRect(a,b,r){let low=0,high=1;for(const [i,key,span] of [[0,'x','width'],[1,'y','height']]){const delta=b[i]-a[i];if(!delta){if(a[i]<r[key]||a[i]>r[key]+r[span])return false;continue;}const first=(r[key]-a[i])/delta,last=(r[key]+r[span]-a[i])/delta;low=Math.max(low,Math.min(first,last));high=Math.min(high,Math.max(first,last));if(low>high)return false;}return true;}
function rectangleDistance(a,b,r){if(segmentRect(a,b,r))return 0;return Math.min(pointRect(a,r),pointRect(b,r),...[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]].map(p=>pointSegment(p,a,b)));}
const onRoad=r=>plan.roadSegments.filter(s=>s.kind==='road'&&rectangleDistance(s.a,s.b,r)<=s.width/2);
// Feet and seat plane are ground-level. Raised backs, foliage and lamp glass
// may overlap a road in projection without placing a physical support in it.
const benchFootprint=b=>({x:b.x-5,y:b.y+20,width:131,height:21});
const lampFootprint=l=>({x:l.x-12,y:l.y+1,width:24,height:5});
const binFootprint=b=>({x:b.x-16,y:b.y-9,width:32,height:23});
const archiveFootprint=()=>({x:map.landmarks.archive.x-40,y:map.landmarks.archive.y,width:80,height:13});
function assertRoadClear(id,r){assert.deepEqual(onRoad(r).map(s=>s.id),[],`${id} ground supports intersect asphalt`);}

test('all city benches and both occupied seat slots stand clear of asphalt',()=>{
 for(const b of map.bench_groups){assertRoadClear(b.id,benchFootprint(b));const seats=map.benches.filter(s=>s.group_id===b.id);assert.equal(seats.length,2,`${b.id} must preserve both slots`);for(let i=0;i<seats.length;i++){assert.deepEqual(seats[i].seat,{x:b.x+35+i*50,y:b.y+28},`${seats[i].id} follows its rendered bench`);assertRoadClear(seats[i].id,{x:seats[i].seat.x-8,y:seats[i].seat.y-5,width:16,height:10});}}
});

test('lamp bases, public containers, archive legs and tree roots do not occupy road asphalt',()=>{
 for(const l of map.decor.lamps)assertRoadClear(l.id,lampFootprint(l));
 for(const b of map.activities.filter(b=>b.action==='trash-bin'))assertRoadClear(b.id,binFootprint(b));
 assertRoadClear('archive',archiveFootprint());
 for(const t of map.decor.trees)assertRoadClear(t.id,{x:t.x-13*t.size,y:t.y+25*t.size,width:25*t.size,height:5*t.size});
});

function pedestrianPoint(p){const inside=r=>p[0]>=r.x&&p[0]<=r.x+r.width&&p[1]>=r.y&&p[1]<=r.y+r.height;return inside(plan.plaza)||inside(plan.smoking)||plan.pads.some(inside)||plan.approaches.some(a=>inside(a.forecourt))||plan.roadSegments.some(s=>{const d=pointSegment(p,s.a,s.b);return s.kind==='road'?d>s.width/2&&d<=s.width/2+plan.sidewalk:d<=s.width/2;});}
function onPedestrianArea(r){for(const p of [[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]])assert.ok(pedestrianPoint(p),`relocated fixture corner ${p} must be on an existing pedestrian surface`);}
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
test('every source bench, public container and archive stays on its usable pedestrian paving',()=>{
 const fixtures=[...map.bench_groups.map(benchFootprint),...map.activities.filter(b=>b.action==='trash-bin').map(binFootprint),archiveFootprint()];
 for(const f of fixtures){onPedestrianArea(f);for(const a of plan.approaches)assert.ok(!overlap(f,a.corridor),`fixture blocks ${a.id} entrance`);for(const bed of plan.plantings)assert.ok(!overlap(f,bed),`fixture covers ${bed.id}`);}
});
