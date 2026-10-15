import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCityGroundPlan} from '../web/city-ground.js';
import {segmentCrossesLake,lakeContains} from '../web/water.js';
import {streetDetailObjects} from '../web/street-details.js';

const map=JSON.parse(await readFile(process.env.BZIKER_V11_MAP||new URL('../web/world-layout-v18.json',import.meta.url),'utf8'));
const animals=JSON.parse(await readFile(process.env.BZIKER_V11_ANIMALS||new URL('../web/animals-map.json',import.meta.url),'utf8')).animals;
const added=map.decor.trees;
const plan=createCityGroundPlan(map);
const bounds=t=>({x:t.x-9*t.size,y:t.y+15*t.size,width:18*t.size,height:17*t.size});
const canopy=t=>({x:t.x-98*t.size,y:t.y-207*t.size,width:196*t.size,height:252*t.size});
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const expand=(b,n)=>({x:b.x-n,y:b.y-n,width:b.width+2*n,height:b.height+2*n});
const routes=[...plan.roadSegments.map(s=>({...s,clearance:s.width/2+(s.kind==='road'?plan.sidewalk:12)})),...plan.approaches.flatMap(a=>a.path.slice(1).map((b,i)=>({id:`entrance-${a.id}`,a:a.path[i],b,clearance:a.width/2+8})))];
function segmentDistanceToBox(a,b,box){
 const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
 const toSegment=p=>{const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
 const toBox=p=>Math.hypot(Math.max(box.x-p[0],0,p[0]-box.x-box.width),Math.max(box.y-p[1],0,p[1]-box.y-box.height));
 let lo=0,hi=1;
 for(const [axis,key,span] of [[0,'x','width'],[1,'y','height']]){const delta=b[axis]-a[axis];if(!delta){if(a[axis]<box[key]||a[axis]>box[key]+box[span]){lo=2;break;}}else{const first=(box[key]-a[axis])/delta,last=(box[key]+box[span]-a[axis])/delta;lo=Math.max(lo,Math.min(first,last));hi=Math.min(hi,Math.max(first,last));}}
 if(lo<=hi)return 0;
 return Math.min(toBox(a),toBox(b),...[[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]].map(toSegment));
}
const obstacles=[
 ...map.buildings,...map.district.buildings,...map.background_buildings,
 ...map.decor.lamps.map(l=>({id:l.id,x:l.x-33,y:l.y-104,width:66,height:124})),
 ...streetDetailObjects(map).map(d=>({id:d.id,...d.bounds})),
 ...map.bench_groups.map(b=>({id:b.id,x:b.x-6,y:b.y-25,width:132,height:67})),
 ...map.activities.filter(a=>a.action==='trash-bin').map(a=>({id:a.id,x:a.x-23,y:a.y-61,width:46,height:80})),
 ...plan.plantings.map(b=>({id:b.id,x:b.x-2,y:b.y-16,width:b.width+8,height:47})),
 {id:'smoking',...map.smoking},
];

test('source fields contain eight native tree families spread through all city sectors',()=>{
 assert.ok(map.design_source);assert.ok(added.length>=200&&added.length<=1000,`Found ${added.length} source trees`);
 assert.equal(new Set(added.map(t=>t.id)).size,added.length);
 for(const kind of ['oak','birch','maple','linden','willow','poplar','pine','spruce'])assert.ok(added.filter(t=>t.kind===kind).length>=20,`${kind} is missing from the city`);
 for(let row=0;row<2;row++)for(let col=0;col<3;col++)assert.ok(added.filter(t=>Math.min(2,Math.floor(t.x/(map.width/3)))===col&&Math.min(1,Math.floor(t.y/(map.height/2)))===row).length>=15,`Empty field sector ${col},${row}`);
});
test('native tree roots leave the entire street and footpath shoulders and every house entrance open',()=>{
 for(const tree of added)for(const route of routes)assert.ok(segmentDistanceToBox(route.a,route.b,bounds(tree))>=route.clearance-1e-7,`${tree.id} covers ${route.id}`);
});
test('native tree supports leave buildings, lamps, bins and usable activity areas unobstructed',()=>{
 for(const tree of added){const b=bounds(tree);for(const fixed of obstacles)assert.ok(!overlap(b,fixed),`${tree.id} overlaps ${fixed.id}`);}
 // Tree canopies may overlap in forest groups; every physical trunk still has distinct ground space.
 for(let i=0;i<added.length;i++)for(let j=i+1;j<added.length;j++)assert.ok(Math.hypot(added[i].x-added[j].x,added[i].y-added[j].y)>=70,`${added[i].id} shares a trunk with ${added[j].id}`);
});
test('tree supports stay on dry map land with distinct ground space in dense canopy groups',()=>{
 for(const tree of added){assert.ok(['oak','birch','maple','linden','willow','poplar','pine','spruce'].includes(tree.kind));assert.ok(tree.size>=.55&&tree.size<=1.2);assert.equal(tree.radius,tree.size*15);
  const b=bounds(tree);assert.ok(b.x>=35&&b.y>=35&&b.x+b.width<=map.width-35&&b.y+b.height<=map.height-35);
  const corners=[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}];
  for(let i=0;i<4;i++)assert.equal(segmentCrossesLake(map.lake,corners[i],corners[(i+1)%4],-24),false,`${tree.id} covers shoreline`);
  assert.equal(lakeContains(map.lake,{x:tree.x,y:tree.y+23.5*tree.size},-24),false);
 }
 for(let i=0;i<added.length;i++){const t=added[i],nearest=Math.min(...added.filter((_,j)=>i!==j).map(other=>Math.hypot(t.x-other.x,t.y-other.y)));assert.ok(nearest>=70,`${t.id} is packed into a wall`);}
});
test('source front gardens occupy usable clear ground beside their own building approach',()=>{
 assert.ok(plan.plantings.length>=12);
 for(const bed of plan.plantings){const b={x:bed.x-2,y:bed.y-16,width:bed.width+8,height:47},entry=plan.approaches.find(a=>a.id===bed.buildingId);assert.ok(entry);assert.ok(!overlap(b,entry.corridor));
  for(const route of routes)assert.ok(segmentDistanceToBox(route.a,route.b,b)>=(route.kind==='road'?route.clearance:route.kind?route.width/2+14:route.clearance)-1e-7,`${bed.id} covers ${route.id}`);
  for(const tree of added)assert.ok(!overlap(b,bounds(tree)),`${bed.id} is beneath ${tree.id}`);
 }
});
test('all current native animal routes keep an eighteen-pixel body clear of actual ground supports, including loop closure',async()=>{
 const raw=await readFile(new URL('../web/world-map.json',import.meta.url)),actual=JSON.parse(raw);
 const collision=JSON.parse(await readFile(new URL('../web/city-collisions.json',import.meta.url),'utf8')),physical=collision.obstacles;
 assert.equal(collision.map_sha256,createHash('sha256').update(raw).digest('hex'),'the animal audit uses the current canonical scene supports');
 assert.ok(actual.schema_version>=20);assert.equal(actual.design_source.modular_scene,true);assert.ok(actual.decor.trees.every(t=>t.design?.assetId&&t.footprint),'each current native tree has an authored physical root');assert.equal(animals.length,12);
 for(const animal of animals)for(let i=0;i<animal.route.length;i++){
  const a=animal.route[i],b=animal.route[(i+1)%animal.route.length];
  for(const support of physical)assert.ok(segmentDistanceToBox([a.x,a.y],[b.x,b.y],support)>=18-1e-7,`${animal.id} continuous body enters ${support.id}`);
  for(const [dx,dy]of [[0,0],[18,0],[-18,0],[0,18],[0,-18]])assert.equal(segmentCrossesLake(actual.lake,{x:a.x+dx,y:a.y+dy},{x:b.x+dx,y:b.y+dy}),false,`${animal.id} body crosses actual source water`);
 }
});

test('tree crowns leave the smoking platform, fountain, gazebo and train windows visible',()=>{
 const fixed=[{id:'smoking',...map.smoking},...map.decor.environment_props.filter(p=>['fountain','gazebo','passenger-coach'].includes(p.kind)).map(p=>({id:p.id,x:p.x-p.width/2,y:p.y-p.height*(p.kind==='passenger-coach'?.72:1),width:p.width,height:p.height*(p.kind==='passenger-coach'?.72:1)}))];
 for(const t of added)for(const f of fixed)assert.ok(!overlap(canopy(t),f),`${t.id} covers ${f.id}`);
});
