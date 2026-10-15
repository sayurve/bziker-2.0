import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceEntityLayout,sourceBuildingLayout} from '../web/source-city.js';
import {designData} from '../web/design-data.js';
import {cityPhysicalObstacles} from '../web/city-collision.js';
import {lakeContains} from '../web/water.js';

const map=JSON.parse(fs.readFileSync(new URL('../web/world-map.json',import.meta.url)));
const lots=map.scene_objects.filter(p=>p.kind==='parking');
const cars=map.scene_objects.filter(p=>p.kind==='car');
const buildings=[...map.buildings,...map.district.buildings,...map.background_buildings];
const obstacles=cityPhysicalObstacles(map);
const lotBounds=p=>{for(const k of ['x','y','width','height'])assert.ok(Number.isFinite(p[k]),`${p.id} has no real floor ${k}`);return {x:p.x,y:p.y,width:p.width,height:p.height};};
const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a[0]-t*dx,p.y-a[1]-t*dy);};
const gap=(p,b)=>Math.hypot(Math.max(b.x-p.x,0,p.x-b.x-b.width),Math.max(b.y-p.y,0,p.y-b.y-b.height));
const overlaps=(a,b,pad=0)=>a.x<b.x+b.width+pad&&a.x+a.width>b.x-pad&&a.y<b.y+b.height+pad&&a.y+a.height>b.y-pad;
const contains=(a,b,pad=0)=>b.x>=a.x+pad-.02&&b.y>=a.y+pad-.02&&b.x+b.width<=a.x+a.width-pad+.02&&b.y+b.height<=a.y+a.height-pad+.02;
function clear(p,pad=14){return p.x>=map.walkable.left+pad&&p.y>=map.walkable.top+pad&&p.x<=map.walkable.right-pad&&p.y<=map.walkable.bottom-pad&&!lakeContains(map.lake,p,-pad)&&!obstacles.some(b=>gap(p,b)<pad);}
function samples(points,callback,step=10){
 assert.ok(points?.length>=2,'a route needs at least two points');
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/step));for(let k=0;k<=n;k++)callback({x:a[0]+(b[0]-a[0])*k/n,y:a[1]+(b[1]-a[1])*k/n},i,k);}
}
function walk(points,pad=14,id='route'){samples(points,(p,i,k)=>assert.ok(clear(p,pad),`${id} is blocked at ${i}:${k} (${p.x},${p.y})`));}
function boxDistance(a,b,r){
 let lo=0,hi=1;for(const [k,key,span]of [[0,'x','width'],[1,'y','height']]){const d=b[k]-a[k];if(!d){if(a[k]<r[key]||a[k]>r[key]+r[span]){lo=2;break;}}else{const u=(r[key]-a[k])/d,v=(r[key]+r[span]-a[k])/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));}}if(lo<=hi)return 0;const corners=[[r.x,r.y],[r.x+r.width,r.y],[r.x,r.y+r.height],[r.x+r.width,r.y+r.height]];return Math.min(gap({x:a[0],y:a[1]},r),gap({x:b[0],y:b[1]},r),...corners.map(([x,y])=>distance({x,y},a,b)));
}

test('city22 roads retain two dry usable lanes and sixty-unit sidewalks',()=>{
 assert.ok(map.schema_version>=22);
 assert.equal(map.design_source.sidewalk_width,60);
 const roads=map.roads.filter(r=>r.kind==='road');assert.ok(roads.length>=6);
 for(const r of roads){assert.equal(r.width,280,`${r.id} width`);samples(r.points,p=>{const reach=r.width/2+60;assert.ok(!lakeContains(map.lake,p,-reach),`${r.id} wet full width`);assert.ok(!obstacles.some(o=>gap(p,o)<reach),`${r.id} blocked full width`);},20);}
});

test('shared modular floors describe actual bays and retain a complete dry envelope away from facades',()=>{
 const shared=lots.filter(l=>!l.residential_courtyard),courtyards=lots.filter(l=>l.residential_courtyard);
 assert.ok(shared.length>=6&&shared.length<=12,`expected six to twelve main shared lots, got ${shared.length}`);
 assert.ok(courtyards.length<=buildings.length);
 for(const lot of lots){
  assert.equal(lot.parking_layout,'modular');assert.equal(lot.design,undefined,'parking is constructed from measured ground cells, not a shrunken scene PNG');
  assert.ok([1,2].includes(lot.ground.banks));assert.ok([1,2,3,4].includes(lot.ground.rows));if(lot.ground.rows===1){assert.equal(lot.residential_courtyard,true);assert.equal(lot.ground.banks,1);assert.ok(lot.courtyard_for?.length&&lot.courtyard_for.every(id=>buildings.some(b=>b.id===id)));}if(lot.ground.rows===4)assert.equal(lot.ground.banks,1,'four-row parking is a narrow courtyard bank');assert.ok([468,708].includes(lot.width));assert.ok([168,288,408,528].includes(lot.height));
  assert.equal(lot.ground.border,24);assert.equal(lot.ground.bay_width,240);assert.equal(lot.ground.bay_height,120);assert.equal(lot.ground.aisle_width,180);
  assert.equal(lot.width,2*lot.ground.border+lot.ground.banks*lot.ground.bay_width+lot.ground.aisle_width);
  assert.equal(lot.height,2*lot.ground.border+lot.ground.rows*lot.ground.bay_height);
  assert.equal(lot.native_slots.length,lot.ground.banks*lot.ground.rows);assert.deepEqual(lot.slots,lot.native_slots);
  const b=lotBounds(lot);assert.ok(contains({x:map.walkable.left,y:map.walkable.top,width:map.walkable.right-map.walkable.left,height:map.walkable.bottom-map.walkable.top},b,14),`${lot.id} clipped`);
  for(let x=b.x;x<=b.x+b.width;x+=20)for(let y=b.y;y<=b.y+b.height;y+=20)assert.ok(!lakeContains(map.lake,{x,y},-8),`${lot.id} wet floor`);
  for(const house of buildings){const views=house.id.startsWith('base-')?Array.from({length:6},(_,exterior_style)=>sourceBuildingLayout(house,{exterior_style}).bounds):[sourceEntityLayout(house).bounds];for(const v of views)assert.ok(!overlaps(b,v,8),`${lot.id} covers ${house.id}`);}
  for(const other of lots)if(other!==lot)assert.ok(!overlaps(b,lotBounds(other),8),`${lot.id} intersects ${other.id}`);
 }
});

test('each larger native car fits one real bay with a model-specific size and surrounding space',()=>{
 assert.ok(cars.length>=lots.filter(l=>!l.residential_courtyard).length,'every main shared lot contains at least one parked native car');const sizes=new Set();
 for(const lot of lots){
  const expected=[];for(let row=0;row<lot.ground.rows;row++)for(let side=0;side<lot.ground.banks;side++)expected.push({x:lot.x+24+side*420,y:lot.y+24+row*120,width:240,height:120});
  assert.deepEqual(lot.native_slots.map(s=>s.bounds).sort((a,b)=>a.y-b.y||a.x-b.x),expected);
  const parked=cars.filter(c=>c.parking_id===lot.id);if(lot.residential_courtyard)assert.equal(parked.length,0,`${lot.id} reserves its local bay for the residents`);else assert.ok(parked.length>0&&parked.length<lot.native_slots.length,`${lot.id} leaves empty spaces`);
  const used=new Set();for(const car of parked){
   assert.ok(['left','right'].includes(car.design.direction));assert.equal(car.design.rotation??0,0,'upright native car views are not flat-rotated');assert.equal(car.design.componentCrop,undefined);
   const asset=designData.assets[car.design.assetId];assert.ok(asset?.views?.[car.design.direction],`${car.id} has a genuine native side view`);assert.notEqual(asset.views.left.url,asset.views.right.url,'opposite sides use separate PNGs');
   const slot=lot.native_slots.find(s=>s.id===car.slot_id),actual=sourceEntityLayout(car).bounds;assert.ok(slot,`${car.id} is assigned a real bay`);
   assert.ok(actual.width>=174.98&&actual.width<=205.02,`${car.id} length ${actual.width}`);assert.ok(Math.abs(actual.width-car.design.width)<.02,`${car.id} is silently shrunk by a mismatched view height`);sizes.add(Math.round(actual.width));
   assert.ok(contains(slot.bounds,actual,6),`${car.id} crosses its bay lines`);assert.ok(!lot.native_slots.filter(s=>s!==slot).some(s=>overlaps(actual,s.bounds)),`${car.id} crosses another bay`);
   assert.ok(!used.has(slot.id),`${car.id} shares an occupied bay`);used.add(slot.id);
  }
 }
 assert.ok(sizes.size>=3,'compact, sedan and larger utility families retain different lengths');
 assert.ok(Math.max(...sizes)-Math.min(...sizes)>=20,'vehicle families do not share one miniature size');
});

test('each street-facing opening has a short clear driveway reaching a real main street',()=>{
 for(const lot of lots){
  assert.ok(['top','bottom'].includes(lot.entry.edge));
  assert.deepEqual(lot.entry.point,{x:lot.x+354,y:lot.y+(lot.entry.edge==='bottom'?lot.height:0)});assert.equal(lot.entry.width,180);
  const d=map.roads.find(r=>r.id===lot.driveway_id);assert.ok(d,`${lot.id} needs a driveway`);assert.equal(d.kind,'driveway');assert.equal(d.parking_id,lot.id);
  assert.equal(d.width,164);assert.equal(d.sidewalk_width,8);assert.equal(d.width+2*d.sidewalk_width,lot.entry.width);assert.deepEqual(d.points[0],[lot.entry.point.x,lot.entry.point.y]);
  const length=d.points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-d.points[i][0],p[1]-d.points[i][1]),0),limit=lot.residential_courtyard&&['parking-local-terrace','parking-local-apartment-3'].includes(lot.id)?900:650;assert.ok(length<limit,`${lot.id} has a ${length}-unit detached access road`);
  const r=map.roads.find(r=>r.id===d.connection.road_id);assert.equal(r.kind,'road');const last=d.points.at(-1),streetJoin=lot.residential_courtyard?0:r.width/2-2;
  // The v23 local lanes merge into the street centre; large shared lots retain
  // their edge join. Both are painted as one road surface and remain walkable.
  assert.ok(r.points.slice(1).some((p,i)=>Math.abs(distance({x:last[0],y:last[1]},r.points[i],p)-streetJoin)<1.1),`${lot.id} reaches its authored street join`);
  walk(d.points,d.width/2+d.sidewalk_width,lot.id);
 }
});

test('all addresses share actual parking bounds and reach their assigned lot by legal walking paths',()=>{
 const snapshot=new URL('../web/world-landmarks-v21.json',import.meta.url);assert.ok(fs.existsSync(snapshot),'the immutable21 migration landmarks exist');const previous=JSON.parse(fs.readFileSync(snapshot));assert.equal(previous.schema_version,21);assert.deepEqual(map.previous_landmarks_v21,previous.landmarks);
 assert.equal(map.architecture.frontages.length,buildings.length);
 for(const f of map.architecture.frontages){
  const p=f.parking,lot=lots.find(l=>l.id===p.scene_id);assert.ok(lot,`${f.building_id} assigned a real parking lot`);assert.equal(p.shared,lot.residential_courtyard?lot.courtyard_for.length>1:true);assert.equal(p.spaces,lot.native_slots.length);if(lot.residential_courtyard)assert.ok(lot.courtyard_for.includes(f.building_id));
  const b=lotBounds(lot);for(const k of ['x','y','width','height'])assert.ok(Math.abs(p[k]-b[k])<.02,`${f.building_id} has fake parking ${k}`);
  walk(p.access_path,14,`${f.building_id} to parking`);
  const entries=[{...lot.entry,id:`${lot.id}-vehicle-entry`,type:'vehicle'},...(lot.pedestrian_entries||[]).map(e=>({...e,type:'pedestrian'}))],entry=entries.find(e=>e.id===p.entry_id);
  assert.ok(entry,`${f.building_id} is assigned an actual parking entrance`);assert.equal(p.entry_type,entry.type);assert.deepEqual(p.access_path.at(-1),[entry.point.x,entry.point.y]);
  const length=p.access_path.slice(1).reduce((sum,q,i)=>sum+Math.hypot(q[0]-p.access_path[i][0],q[1]-p.access_path[i][1]),0);assert.ok(Math.abs(p.walking_distance-length)<.01,`${f.building_id} reports a fictional walking distance`);
  if(map.schema_version>=23)assert.ok(length<=1250,`${f.building_id} requires an unreasonable detour to its nearby parking`);
  const house=buildings.find(b=>b.id===f.building_id);assert.deepEqual(p.access_path[0],[house.door.x,house.door.y+24]);
  const doorToLot=Math.hypot(Math.max(lot.x-house.door.x,0,house.door.x-lot.x-lot.width),Math.max(lot.y-house.door.y,0,house.door.y-lot.y-lot.height));
  if(map.schema_version>=23)assert.ok(doorToLot<=500,`${f.building_id} parking is detached from the house`);
 }
});

test('parking pedestrian openings cut real curbs and have complete paved routes to the street or frontage',()=>{
 let count=0;
 for(const lot of lots){assert.ok(lot.pedestrian_entries?.length>=1,`${lot.id} has no dedicated pedestrian route`);for(const entry of lot.pedestrian_entries){
  count++;assert.equal(entry.width,60);assert.ok(['top','bottom','left','right'].includes(entry.edge));
  const point=entry.point,horizontal=['top','bottom'].includes(entry.edge);
  assert.ok(Math.abs((horizontal?point.y:point.x)-(horizontal?lot.y+(entry.edge==='bottom'?lot.height:0):lot.x+(entry.edge==='right'?lot.width:0)))<.02,`${entry.id} is not on its stated curb`);
  const road=map.roads.find(r=>r.id===entry.path_id);assert.equal(road?.kind,'walkway');assert.equal(road.width,40);assert.deepEqual(road.points,entry.path);assert.deepEqual(road.points[0],[point.x,point.y]);
  walk(entry.path,24,entry.id);
  for(let offset=-24;offset<=24;offset+=4){const p={x:point.x+(horizontal?offset:0),y:point.y+(horizontal?0:offset)};assert.ok(!obstacles.some(o=>gap(p,o)<.01),`${entry.id} is painted across an uncut physical curb`);}
  const frontage=map.architecture.frontages.find(f=>f.id===entry.connection.frontage_id||f.building_id===entry.connection.frontage_id),connection=map.roads.find(r=>r.id===entry.connection.road_id);
  assert.ok(connection||frontage,`${entry.id} has no real connection`);const end=entry.path.at(-1);
  assert.ok(connection?.points.slice(1).some((p,i)=>distance({x:end[0],y:end[1]},connection.points[i],p)<=connection.width/2+(connection.kind==='road'?(connection.sidewalk_width??60):connection.kind==='driveway'?(connection.sidewalk_width??8):4)+.03)||frontage?.path.some(p=>Math.hypot(end[0]-p[0],end[1]-p[1])<.03),`${entry.id} ends on an isolated patch of lawn`);
 }}
 assert.ok(count>=lots.length,'every parking parcel has a dedicated pedestrian route');
});

test('the smoking pad, bench and ashtray do not occupy vehicle parking parcels',()=>{
 const smoking=[...map.scene_objects,...map.bench_groups].filter(n=>['smoking-pad','smoking-bench','smoking-ashtray'].includes(n.id));
 assert.equal(smoking.length,3,'all native smoking-zone elements remain available');
 for(const item of smoking){const painted=sourceEntityLayout(item).bounds;for(const lot of lots)assert.ok(!overlaps(painted,lotBounds(lot)),`${item.id} occupies ${lot.id}`);}
});

test('frontage walks join the sidewalk with a paved landing at the visible public staircase',()=>{
 for(const f of map.architecture.frontages){const r=map.roads.find(r=>r.id===f.connection.road_id),end=f.path.at(-1);assert.ok(r.points.slice(1).some((p,i)=>Math.abs(distance({x:end[0],y:end[1]},r.points[i],p)-(r.width/2+30))<1.1),`${f.id} runs into the road centre`);assert.ok(f.path.length<=4,`${f.id} has ${f.path.length-1} crooked segments`);for(let i=1;i<f.path.length;i++)assert.ok(Math.hypot(f.path[i][0]-f.path[i-1][0],f.path[i][1]-f.path[i-1][1])>=45,`${f.id} has a tiny stub`);walk(f.path,14,f.id);}
 for(const house of [...map.buildings,...map.district.buildings]){const f=map.architecture.frontages.find(f=>f.building_id===house.id),p=house.design.doorTarget;assert.ok(p.y>=f.forecourt.y-.02&&p.y<=f.forecourt.y+f.forecourt.height+.02&&p.x>=f.forecourt.x&&p.x<=f.forecourt.x+f.forecourt.width,`${house.id} staircase is detached from its paving`);}
 const ratio=(map.design_source.layout_scale||map.design_source.scale)/5,meeting=[6400*ratio,4650*ratio],roads=['east-link','east-boulevard','shopping-avenue'].map(id=>map.roads.find(r=>r.id===id));for(const r of roads)assert.ok(r.points.some(p=>Math.hypot(p[0]-meeting[0],p[1]-meeting[1])<.01),`${r.id} misses the shared exact junction`);
});

test('independent native crowns leave complete parking floors and vehicle mouths visible',()=>{
 assert.ok(map.decor.trees.length>=240,'this audit must cover the actual native tree collection');
 for(const tree of map.decor.trees){const crown=sourceEntityLayout(tree).bounds;for(const lot of lots)assert.ok(!overlaps(crown,lotBounds(lot),8),`${tree.id} covers ${lot.id}`);for(const drive of map.roads.filter(r=>r.kind==='driveway'))for(let i=1;i<drive.points.length;i++)assert.ok(boxDistance(drive.points[i-1],drive.points[i],crown)>=drive.width/2+drive.sidewalk_width,`${tree.id} covers ${drive.id}`);}
});

test('assigned parking walks follow authored pavement rather than park lawns',()=>{
 const paved=p=>map.roads.some(r=>r.points.slice(1).some((b,i)=>distance(p,r.points[i],b)<=r.width/2+(r.kind==='road'?(r.sidewalk_width??60):r.kind==='driveway'?(r.sidewalk_width??8):4)+.03))||lots.some(l=>{const b=lotBounds(l);return p.x>=b.x-.02&&p.x<=b.x+b.width+.02&&p.y>=b.y-.02&&p.y<=b.y+b.height+.02;});
 for(const f of map.architecture.frontages)samples(f.parking.access_path,p=>assert.ok(paved(p),`${f.building_id} takes a grass shortcut`),3);
});
