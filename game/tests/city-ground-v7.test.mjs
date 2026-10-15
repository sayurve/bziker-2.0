import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const ground=await import('../web/city-ground.js').catch(()=>({}));
const map=JSON.parse(await readFile(new URL('../web/world-layout-v18.json',import.meta.url),'utf8'));
const plan=()=>{assert.equal(typeof ground.createCityGroundPlan,'function','one ground plan must serve city and map');return ground.createCityGroundPlan(map);};
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const context=()=>{const calls=[];return {calls,c:new Proxy({fillStyle:'',fillRect(x,y,w,h){calls.push({kind:'rect',x,y,width:w,height:h,color:this.fillStyle});},fill(){calls.push({kind:'polygon',color:this.fillStyle});},stroke(){calls.push({kind:'stroke',color:this.strokeStyle});}},{get:(t,k)=>t[k]??(()=>{})})};};

test('open map ground is grass even outside the old pocket lawns and city rectangle',()=>{
 const p=plan();assert.match(p.materials.grass,/^#[0-9a-f]{6}$/);const channels=[1,3,5].map(i=>parseInt(p.materials.grass.slice(i,i+2),16));assert.ok(channels[1]>channels[0]&&channels[1]>channels[2],'open land should be natural green grass');const {c,calls}=context();ground.drawCityGround(c,p,{x:0,y:0,width:1024,height:1024});assert.deepEqual(calls[0],{kind:'rect',x:0,y:0,width:1024,height:1024,color:p.materials.grass});
 assert.ok(!calls.some(n=>n.kind==='rect'&&n.x===map.decor.city.x&&n.y===map.decor.city.y&&n.width===map.decor.city.width&&n.height===map.decor.city.height),'the blanket white city must not return');
});

test('every public door and clan plot has a clear forecourt and a road-connected path',()=>{
 const p=plan(),buildings=[...map.buildings,...map.district.buildings];assert.equal(p.approaches.length,buildings.length);
 for(const b of buildings){const a=p.approaches.find(a=>a.id===b.id);assert.ok(a,`${b.id} forecourt`);assert.ok(a.path.length>=2,`${b.id} needs a connecting path`);assert.deepEqual(a.path[0],[b.door.x,b.door.y]);assert.ok(a.corridor.width>=76);assert.ok(a.corridor.x<=b.door.x&&a.corridor.x+a.corridor.width>=b.door.x);
  for(const bed of p.plantings.filter(n=>n.buildingId===b.id))assert.ok(!overlap(a.corridor,bed),`${b.id} planted entrance`);
  const connection=p.roads.find(r=>r.id===a.connection?.roadId);assert.ok(connection,`${b.id} connected road exists`);const end=a.path.at(-1),distanceToRoad=Math.min(...connection.points.slice(1).map((q,i)=>{const v=connection.points[i],dx=q[0]-v[0],dy=q[1]-v[1],t=Math.max(0,Math.min(1,((end[0]-v[0])*dx+(end[1]-v[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(end[0]-v[0]-t*dx,end[1]-v[1]-t*dy);}));assert.ok(distanceToRoad<=connection.width/2+26,`${b.id} must finish at a real path or sidewalk`);
 }
});

test('access paths do not cut through another house or apartment footprint',()=>{
 const p=plan(),solids=[...map.buildings,...map.district.buildings,...map.solids];
 for(const a of p.approaches)for(let i=1;i<a.path.length;i++)for(const b of solids)assert.equal(ground.segmentEntersGroundObstacle(a.path[i-1],a.path[i],b),false,`${a.id} path enters ${b.id||'apartment'}`);
});

test('zebra crossings follow a real road segment and keep all stripes inside its asphalt edges',()=>{
 const p=plan();assert.equal(p.crossings.length,map.decor.crosswalks.length);
 for(const x of p.crossings){assert.ok(x.stripes.length>=5);const segment=p.roadSegments.find(s=>s.id===x.segmentId);assert.ok(segment);assert.ok(x.along>=x.clearance&&segment.length-x.along>=x.clearance);
  for(const polygon of x.stripes)for(const vertex of polygon){const normal=(vertex[0]-x.center[0])*segment.normal[0]+(vertex[1]-x.center[1])*segment.normal[1];assert.ok(Math.abs(normal)<=segment.width/2-3.9,`${x.id} stripe exceeds road width`);}
  assert.ok(Math.abs(x.tangent[0]*x.normal[0]+x.tangent[1]*x.normal[1])<1e-10);
 }
});

test('crossing paint is drawn after plazas so the square cannot erase half a crossing',()=>{
 const p=plan(),{c,calls}=context();ground.drawCityGround(c,p,{x:5120,y:2048,width:1024,height:1024});const plaza=calls.findIndex(n=>n.color===p.materials.square),paint=calls.findIndex(n=>n.color===p.materials.crossing);assert.ok(plaza>=0);assert.ok(paint>plaza);
});

test('mini-map draws the same grass, asphalt and access geometry as the outdoor renderer',()=>{
 const p=plan(),{c,calls}=context();ground.drawMiniMapGround(c,p);assert.equal(calls[0].color,p.materials.grass);assert.ok(calls.some(n=>n.color===p.materials.asphalt));assert.ok(calls.some(n=>n.color===p.materials.pavement));assert.ok(!calls.some(n=>n.kind==='rect'&&n.width===map.decor.city.width&&n.height===map.decor.city.height));
});

test('ground planning preserves saved geometry and handles zero-length road edges',()=>{
 const before=JSON.stringify(map);plan();assert.equal(JSON.stringify(map),before);const degenerate={...map,roads:[{id:'empty',points:[[10,10],[10,10]],kind:'road',width:90}],decor:{...map.decor,crosswalks:[]}};const p=ground.createCityGroundPlan(degenerate);assert.equal(p.roadSegments.length,0);assert.equal(p.crossings.length,0);assert.ok(p.approaches.every(a=>a.path.flat().every(Number.isFinite)));
});

test('house paths meet sidewalks with flat ends and the forecourt hides interior curb seams',()=>{
 const p=plan(),calls=[];let points=[];const c=new Proxy({fillStyle:'',beginPath(){points=[];},moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);},stroke(){calls.push({kind:'stroke',points:[...points],cap:this.lineCap,color:this.strokeStyle});},fillRect(x,y,width,height){calls.push({kind:'rect',x,y,width,height,color:this.fillStyle});}},{get:(t,k)=>t[k]??(()=>{})});ground.drawCityGround(c,p,{x:6144,y:1024,width:1024,height:1024});
 for(const a of p.approaches){const index=calls.findIndex(n=>n.kind==='stroke'&&n.color===p.materials.pavement&&JSON.stringify(n.points)===JSON.stringify(a.path));assert.ok(index>=0);assert.equal(calls[index].cap,'butt',`${a.id} approach must not protrude into asphalt`);const f=a.forecourt;assert.ok(calls.slice(index+1).some(n=>n.kind==='rect'&&n.x===f.x+3&&n.y===f.y+3&&n.width===f.width-6),`${a.id} square must cover path seams`);}
});
