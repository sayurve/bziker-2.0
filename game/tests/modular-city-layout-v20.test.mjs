import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {designData} from '../web/design-data.js';
import {pedestrianLakeContains, lakeContains} from '../web/water.js';
const map=JSON.parse(await readFile(new URL('../web/world-map.json',import.meta.url),'utf8'));
const animals=JSON.parse(await readFile(new URL('../web/animals-map.json',import.meta.url),'utf8')).animals;
const buildings=[...map.buildings,...map.district.buildings,...map.background_buildings];
const props=[...map.decor.trees,...map.decor.lamps,...map.decor.street_details,...map.bench_groups,...map.scene_objects||[]];
const obstacles=[...buildings,...props,...map.activities,...map.solids].map(p=>p.footprint||(!p.design&&!Object.hasOwn(p,'footprint')&&p.width?p:null)).filter(Boolean);
const clear=(p,pad=14)=>!pedestrianLakeContains(map.lake,p)&&!obstacles.some(b=>Math.hypot(Math.max(b.x-p.x,0,p.x-b.x-b.width),Math.max(b.y-p.y,0,p.y-b.y-b.height))<pad);
const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a[0]-t*dx,p.y-a[1]-t*dy);};
const segmentsMeet=(a,b,c,d)=>{const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);return cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))&&Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]));};
test('city20 independently assembles resources and retains the exact19 migration positions',()=>{
 assert.ok(map.schema_version>=20);assert.equal(map.design_source.modular_scene,true);assert.equal(map.design_source.scene_mode,'modular-independent-assets');assert.equal(map.design_source.live_background_asset,null);assert.ok(map.previous_landmarks_v19.station);
 for(const item of [...buildings,...props]){
  if(item.kind==='parking'&&item.parking_layout==='modular'){
   assert.ok(map.schema_version>=22);assert.equal(item.design,undefined);assert.ok([1,2].includes(item.ground.banks));assert.equal(item.width,48+240*item.ground.banks+180);assert.ok([168,288,408,528].includes(item.height));if(item.height===168){assert.equal(item.residential_courtyard,true);assert.equal(item.ground.banks,1);assert.ok(item.courtyard_for?.length);}if(item.height===528)assert.equal(item.ground.banks,1);assert.equal(item.native_slots.length,(item.height-48)/120*item.ground.banks);assert.equal(item.ground.bay_width,240);assert.equal(item.ground.bay_height,120);assert.equal(item.ground.aisle_width,180);assert.ok(item.native_slots.every(s=>s.bounds.width===240&&s.bounds.height===120));continue;
  }
  const d=item.design;assert.ok(d?.assetId,`${item.id} needs its own resource`);assert.ok(!/city-source-map|city-map-square/.test(d.assetId));assert.equal(d.crop,'solid');const a=designData.assets[d.assetId]?.views?.[d.direction]||designData.assets[d.assetId];assert.ok(a,`${d.assetId} is available`);if(!d.componentCrop){const b=a.solid_bbox;assert.ok(Math.abs(d.width/d.height-(b[2]-b[0])/(b[3]-b[1]))<.025,`${item.id} distorted`);}if(item.footprint)assert.equal(item.depth,item.footprint.y+item.footprint.height);
 }
});
test('source neighbourhood composition and real residential side images form dense quarters',()=>{
 const ratio=(map.design_source.layout_scale||map.design_source.scale)/5,b=id=>map.buildings.find(b=>b.id===id).design;assert.ok(b('clans').x<2200*ratio&&b('clans').y<1500*ratio);assert.ok(b('railway').x>4200*ratio&&b('railway').y<1900*ratio);assert.ok(b('casino').x<b('shop-food').x&&b('casino').y<b('shop-clothes').y);assert.ok(b('shop-clothes').x<b('shop-furniture').x&&b('shop-furniture').x<b('messages').x&&b('messages').x<b('arena').x);
 // Wider carriageways and six full parking parcels replace cramped residential
 // placements. Keep populated quarters while reserving real land for access.
 assert.ok(map.background_buildings.length>=30);assert.ok(new Set(map.background_buildings.map(b=>b.design.direction)).size>=4);assert.ok(map.decor.trees.length>=240);const p=map.architecture.districts.find(d=>d.id==='park');assert.ok(map.decor.trees.filter(t=>t.x>p.x&&t.x<p.x+p.width&&t.y>p.y&&t.y<p.y+p.height).length>=45);
});
test('source door anchor, physical landing and all actual city return offsets agree',()=>{
 for(const b of [...map.buildings,...map.district.buildings]){const d=b.design;assert.equal(Math.round(d.x+(d.doorAnchor.x-d.anchorX)*d.width),d.doorTarget.x);assert.equal(d.doorTarget.y+24,b.door.y);for(const dy of [0,24,25,28,70])assert.ok(clear({x:b.door.x,y:b.door.y+dy}),`${b.id}+${dy} blocked`);}
 for(const [id,p]of Object.entries(map.landmarks))assert.ok(clear(p),`${id} blocked`);assert.ok(clear(map.spawn));
});
test('complete connected road corridors contain no solid support',()=>{
 const roads=map.roads.filter(r=>r.kind==='road');assert.ok(roads.length>=6);for(const r of roads){assert.ok(r.width>=260&&r.width<=300);for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/15);for(let j=0;j<=n;j++){const p={x:a[0]+(b[0]-a[0])*j/n,y:a[1]+(b[1]-a[1])*j/n};assert.ok(!obstacles.some(o=>Math.hypot(Math.max(o.x-p.x,0,p.x-o.x-o.width),Math.max(o.y-p.y,0,p.y-o.y-o.height))<r.width/2+map.design_source.sidewalk_width),`${r.id} blocked`);assert.ok(!lakeContains(map.lake,p,-r.width/2-map.design_source.sidewalk_width),`${r.id} crosses water`);}}assert.ok(roads.some(o=>o!==r&&r.points.slice(1).some((b,i)=>o.points.slice(1).some((d,j)=>segmentsMeet(r.points[i],b,o.points[j],d)||Math.min(distance({x:r.points[i][0],y:r.points[i][1]},o.points[j],d),distance({x:b[0],y:b[1]},o.points[j],d),distance({x:o.points[j][0],y:o.points[j][1]},r.points[i],b),distance({x:d[0],y:d[1]},r.points[i],b))<r.width/2+o.width/2))),`${r.id} disconnected`);}
});
test('two claimed bench seats stay within the support while their visual pose sits in front and can stand up',()=>{
 for(const g of map.bench_groups){assert.ok(g.design);const seats=map.benches.filter(b=>b.group_id===g.id);assert.equal(seats.length,2);for(const b of seats){const f=g.footprint;assert.ok(b.seat.x>f.x&&b.seat.x<f.x+f.width&&b.seat.y>f.y&&b.seat.y<f.y+f.height);assert.equal(b.visual.x,b.seat.x);assert.ok(b.visual.y>=g.depth);assert.ok(clear({x:b.seat.x,y:b.seat.y+70}),`${b.id} cannot leave`);}}
});
test('all authored interaction routes walk exactly from the real park origin without touching props or water',()=>{
 assert.ok(map.action_routes.length>=26,'doors, boat boarding and fishing need real connected paths');for(const r of [...map.action_routes,{id:'arrival',points:map.arrival_route.points}]){assert.ok(r.points.length>=2);if(r.from==='park')assert.deepEqual(r.points[0],[map.landmarks.park.x,map.landmarks.park.y]);for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/5));for(let j=0;j<=n;j++)assert.ok(clear({x:a[0]+(b[0]-a[0])*j/n,y:a[1]+(b[1]-a[1])*j/n}),`${r.id} blocked at segment${i}`);}}
});
test('twelve roaming animals keep distinct initial targets and physically clear full routes',()=>{
 assert.equal(animals.length,12);for(let i=0;i<animals.length;i++){const a=animals[i];assert.ok(a.route.length>=2);for(let k=0;k<a.route.length;k++){const p=a.route[k],q=a.route[(k+1)%a.route.length],n=Math.max(1,Math.ceil(Math.hypot(q.x-p.x,q.y-p.y)/5));for(let j=0;j<=n;j++)assert.ok(clear({x:p.x+(q.x-p.x)*j/n,y:p.y+(q.y-p.y)*j/n},18),`${a.id} blocked`);}for(let j=i+1;j<animals.length;j++)assert.ok(Math.hypot(a.route[0].x-animals[j].route[0].x,a.route[0].y-animals[j].route[0].y)>=110);}
 for(const id of ['park-dog','park-cat']){const a=animals.find(a=>a.id===id).route[0],p=map.activities.find(p=>p.id===id);assert.equal(a.x,p.x);assert.equal(a.y,p.y);}
});
