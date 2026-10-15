import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createCityGroundPlan} from '../web/city-ground.js';
import {lakeContains,segmentCrossesLake} from '../web/water.js';
import {streetDetailObjects} from '../web/street-details.js';
import {cityPhysicalObstacles} from '../web/city-collision.js';
import {sourceBuildingLayout,sourceParkedVehicleLayouts,sourceCityAreaLayouts} from '../web/source-city.js';
import {sourceShoreLayouts} from '../web/source-water.js';
import {supplementalEnvironmentLayouts} from '../web/supplemental-environment.js';
const map=JSON.parse(readFileSync(new URL('../web/world-layout-v18.json',import.meta.url)));
const rooms=JSON.parse(readFileSync(new URL('../web/interiors-map.json',import.meta.url))).rooms;
const plan=createCityGroundPlan(map),buildings=[...map.buildings,...map.district.buildings,...map.background_buildings];
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const pointSegment=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
function segmentBox(a,b,r){let lo=0,hi=1;for(const [i,k,s]of[[0,'x','width'],[1,'y','height']]){const d=b[i]-a[i];if(!d){if(a[i]<r[k]||a[i]>r[k]+r[s]){lo=2;break;}}else{const x=(r[k]-a[i])/d,y=(r[k]+r[s]-a[i])/d;lo=Math.max(lo,Math.min(x,y));hi=Math.min(hi,Math.max(x,y));}}if(lo<=hi)return 0;const toBox=p=>Math.hypot(Math.max(r.x-p[0],0,p[0]-r.x-r.width),Math.max(r.y-p[1],0,p[1]-r.y-r.height));return Math.min(toBox(a),toBox(b),...[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]].map(p=>pointSegment(p,a,b)));}
const treeSupport=t=>({x:t.x-9*t.size,y:t.y+15*t.size,width:18*t.size,height:17*t.size});
test('all source houses and buildings have a paved door connection and usable parking outside street curbs',()=>{
 const frontages=map.architecture?.frontages;assert.ok(frontages,'all buildings need frontage geometry');assert.equal(frontages.length,buildings.length);
 for(const b of buildings){const f=frontages.find(f=>f.building_id===b.id);assert.ok(f,b.id);assert.deepEqual(f.path[0],[b.door.x,b.door.y]);assert.ok(f.width>=44);assert.ok(f.forecourt.width>=b.width);assert.ok(f.parking.bays.length>=1);assert.ok(f.parking.width>=88&&f.parking.height>=60);
  for(const route of [f,f.parking]){const r=map.roads.find(r=>r.id===route.connection.road_id);assert.ok(r,`${b.id}: detached access`);const points=route.path||route.drive,end=points.at(-1);assert.ok(r.points.slice(1).some((p,i)=>pointSegment(end,r.points[i],p)<=r.width/2+27),`${b.id}: access ends in a field`);}
  for(const s of plan.roadSegments.filter(s=>s.kind==='road'))assert.ok(segmentBox(s.a,s.b,f.parking)>s.width/2+plan.sidewalk,`${b.id}: parking on a curb`);
  for(const other of buildings)assert.ok(!overlap(f.parking,other),`${b.id}: parking inside ${other.id}`);
  for(const t of map.decor.trees){assert.ok(!overlap(treeSupport(t),f.parking),`${t.id} roots ${b.id} parking`);for(let i=1;i<f.path.length;i++)assert.ok(segmentBox(f.path[i-1],f.path[i],treeSupport(t))>=f.width/2+8,`${t.id} roots ${b.id} approach`);}
 }
});
test('lighting uses aligned rows with stable spacing and all complete sprites leave doors, props and water clear',()=>{
 const lamps=map.decor.lamps;assert.ok(lamps.length>=28&&lamps.length<=85);assert.ok(lamps.every(l=>l.id&&l.row_id&&Number.isFinite(l.row_position)));const rows=Map.groupBy(lamps,l=>l.row_id);assert.ok(rows.size>=12);
 const details=streetDetailObjects(map);for(const row of rows.values()){const sorted=row.toSorted((a,b)=>a.row_position-b.row_position);for(let i=1;i<sorted.length;i++){const gap=sorted[i].row_position-sorted[i-1].row_position;assert.ok(gap>=240,`${sorted[i].id} excessive density`);assert.ok(Math.abs(gap/row[0].spacing-Math.round(gap/row[0].spacing))<.025,'row gaps must be whole spacing intervals');}}
 for(const l of lamps){const r={x:l.x-20,y:l.y-100,width:50,height:120};for(const s of plan.roadSegments)assert.ok(segmentBox(s.a,s.b,r)>=s.width/2+27,`${l.id} sits on curb ${s.id}`);for(const t of map.decor.trees)assert.ok(!overlap(r,treeSupport(t)),`${l.id} beneath ${t.id}`);for(const p of details)assert.ok(!overlap(r,p.bounds),`${l.id} covers ${p.id}`);
  const corners=[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]];for(let i=0;i<4;i++)assert.equal(segmentCrossesLake(map.lake,{x:corners[i][0],y:corners[i][1]},{x:corners[(i+1)%4][0],y:corners[(i+1)%4][1]},-18),false,l.id);assert.equal(lakeContains(map.lake,l,-18),false);
 }
});
test('retained assembled v18 parking drives avoid their own canonical walls and supports',()=>{
 const nodes=[...streetDetailObjects(map),...map.architecture.props.map(p=>({id:p.id,footprint:p.footprint})),...map.decor.lamps.map(l=>({id:l.id,footprint:{x:l.x-12,y:l.y+1,width:24,height:5}}))];
 const shapes=JSON.parse(readFileSync(new URL('../web/prop-collisions.json',import.meta.url))),extra=plan.plantings.map(b=>({id:b.id,x:b.x-2,y:b.y-2,width:b.width+4,height:b.height+7}));
 for(const rack of map.architecture.bike_racks)extra.push({...rack.footprint,id:rack.id});
 // This fixture is the retained assembled v18 city, so its canonical supports
 // must come from the same snapshot, never the current exact-scene JSON.
 for(const car of sourceParkedVehicleLayouts(map))extra.push({...car.footprint,id:car.id,kind:'vehicle'});
 for(const prop of supplementalEnvironmentLayouts(map).filter(p=>p.footprint))extra.push({...prop.footprint,id:prop.id,kind:prop.kind});
 for(const shore of sourceShoreLayouts(map).filter(s=>/shore-(?:boulders|stones)$/.test(s.assetId))){const width=shore.width*.7,height=shore.assetId.endsWith('boulders')?14:10;extra.push({id:shore.id,x:shore.anchor.x-width/2,y:shore.anchor.y-height,width,height,kind:'rock'});}
 const supports=cityPhysicalObstacles(map,shapes,extra);
 for(const f of map.architecture.frontages)for(let i=1;i<f.parking.drive.length;i++){for(const b of supports)assert.ok(segmentBox(f.parking.drive[i-1],f.parking.drive[i],b)>=16-1e-7,`${f.id} driveway crosses ${b.id}`);for(const t of map.decor.trees)assert.ok(segmentBox(f.parking.drive[i-1],f.parking.drive[i],treeSupport(t))>=16-1e-7,`${f.id} driveway enters ${t.id} crown`);}
 for(const f of map.architecture.frontages.filter(f=>f.terrace)){const tables=map.architecture.props.filter(p=>p.kind==='terrace-table'&&p.id.startsWith(`terrace-table-${f.building_id}-`));assert.equal(tables.length,2);for(const p of tables){const r=p.footprint,t=f.terrace;assert.ok(r.x>=t.x&&r.y>=t.y&&r.x+r.width<=t.x+t.width&&r.y+r.height<=t.y+t.height);}}
});
test('source city does not retain physical location signs apart from the welcome sign',()=>{
 assert.equal(map.design_source.physical_welcome_sign_only,true);
 assert.ok(!map.decor.street_details.some(p=>p.kind==='guide'||p.kind==='wayfinder'));
});
test('architecture art provides distinct public silhouettes and truthful solid footprints',async()=>{
 const url=new URL('../web/city-architecture.js',import.meta.url);assert.ok(existsSync(url),'architecture renderer missing');const {publicBuildingGeometry,drawPublicBuilding,createCityArchitectureObjects}=await import(url);
 let createCanvas;try{({createCanvas}=createRequire(import.meta.url)('@napi-rs/canvas'));}catch{({createCanvas}=createRequire(process.execPath)('@napi-rs/canvas'));}
 const signatures=[];for(const b of map.buildings){const g=publicBuildingGeometry(b),native=sourceBuildingLayout(b);assert.ok(g);const canvas=createCanvas(Math.ceil(g.bounds.width),Math.ceil(g.bounds.height)),c=canvas.getContext('2d');c.translate(-g.bounds.x,-g.bounds.y);assert.equal(drawPublicBuilding(c,b),true);const data=c.getImageData(0,0,canvas.width,canvas.height).data;assert.ok(data.some(v=>v));signatures.push(native.assetId);assert.ok(g.bounds.x<=native.bounds.x&&g.bounds.y<=native.bounds.y);assert.ok(g.bounds.x+g.bounds.width>=native.bounds.x+native.bounds.width&&g.bounds.y+g.bounds.height>=native.bounds.y+native.bounds.height);}
 assert.ok(new Set(signatures).size>=8,'public places need different silhouettes');const nodes=createCityArchitectureObjects(map);assert.equal(nodes.length,map.architecture.props.length);assert.ok(nodes.length>=4);for(const n of nodes){const p=map.architecture.props.find(p=>p.id===n.id);assert.deepEqual(n.footprint,p.footprint);assert.ok(n.depth>=n.footprint.y);assert.ok(n.footprint.width>0&&n.footprint.height>0);for(const b of buildings)assert.ok(!overlap(n.footprint,b),`${n.id} inside ${b.id}`);for(const f of map.architecture.frontages)for(let i=1;i<f.path.length;i++)assert.ok(segmentBox(f.path[i-1],f.path[i],n.footprint)>=f.width/2+14,`${n.id} blocks ${f.id}`);}
});
test('all eleven modular public interiors bind individual native equipment with the same physical supports',async()=>{
 const {drawRoomProps,supportedInteriorPropTypes}=await import('../web/interior-props.js');assert.ok(supportedInteriorPropTypes.includes('lockers'));const railway=rooms.find(r=>r.id==='railway');assert.equal(railway.props.find(p=>p.id==='suitcase').type,'luggage');assert.equal(railway.props.find(p=>p.id==='suitcase').source_asset,'station-interior-suitcase');
 for(const r of rooms){assert.equal(r.modular_source,true);assert.equal(r.source_scene,undefined);assert.ok(r.props.every(p=>p.source_asset&&p.visual),`${r.id} lacks its native equipment bindings`);const nodes=drawRoomProps(r);assert.equal(nodes.length,r.props.length);for(const node of nodes){const p=r.props.find(p=>`${r.id}:${p.id}`===node.id);assert.deepEqual(node.footprint,{x:p.x,y:p.y,width:p.width,height:p.height});assert.equal(node.depth,p.y+p.height);}}
 assert.equal(rooms.length,11);
});
test('architecture ground never paints over asphalt or junctions',async()=>{
 const {drawCityArchitectureGround}=await import('../web/city-architecture.js');let createCanvas;try{({createCanvas}=createRequire(import.meta.url)('@napi-rs/canvas'));}catch{({createCanvas}=createRequire(process.execPath)('@napi-rs/canvas'));}
 const canvas=createCanvas(map.width,map.height),c=canvas.getContext('2d');drawCityArchitectureGround(c,map,{x:0,y:0});
 for(const s of plan.roadSegments.filter(s=>s.kind==='road'))for(let d=0;d<=s.length;d+=19)for(const side of[-1,0,1]){const x=Math.round(s.a[0]+s.tangent[0]*d+s.normal[0]*side*(s.width/2-2)),y=Math.round(s.a[1]+s.tangent[1]*d+s.normal[1]*side*(s.width/2-2));assert.equal(c.getImageData(x,y,1,1).data[3],0,`new surface covers ${s.id} at ${x},${y}`);}
});
