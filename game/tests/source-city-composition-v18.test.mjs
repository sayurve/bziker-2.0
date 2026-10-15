import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {sourceBuildingLayout,sourceStreetLayout,preloadExactSourceCity,sourceCityExactObjects} from '../web/source-city.js';
const map=JSON.parse(await readFile(new URL('../web/world-layout-v18.json',import.meta.url),'utf8'));
const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/n)):0;return Math.hypot(p.x-a[0]-t*dx,p.y-a[1]-t*dy);};
const streets=map.roads.filter(r=>r.kind==='road'),segments=streets.flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b,width:r.width})));

test('the source city has coherent residential blocks with houses at the visible native scale',()=>{
 assert.equal(map.design_source.composition_revision,18);
 assert.ok(map.background_buildings.length>=45,'residential blocks should surround the centre rather than isolated field houses');
 const widths=map.background_buildings.map(b=>sourceBuildingLayout(b).bounds.width).sort((a,b)=>a-b);
 assert.ok(widths[0]>=350&&widths.at(-1)<=425,`native residential widths ${widths[0]}..${widths.at(-1)}`);
 const median=widths[Math.floor(widths.length/2)];
 for(const id of ['railway','casino','shop-clothes','shop-furniture','messages','arena'])assert.ok(sourceBuildingLayout(map.buildings.find(b=>b.id===id)).bounds.width<=median*3.5,`${id} overwhelms the residential scale`);
 for(const b of map.background_buildings){
  assert.ok(Math.min(...segments.map(s=>distance(b.door,s.a,s.b)))<=700,`${b.id} is isolated from a street`);
  assert.ok(Math.min(...map.background_buildings.filter(n=>n.id!==b.id).map(n=>Math.hypot(n.door.x-b.door.x,n.door.y-b.door.y)))<=950,`${b.id} has no neighbouring frontage`);
 }
});
test('street width, complete quarter paving and park canopy groups match the city composition',()=>{
 assert.ok(streets.length>=8);assert.ok(streets.every(r=>r.width>=170&&r.width<=220));
 assert.ok(map.architecture.block_paving.length>=5,'quarters need complete paving rather than detached T-shaped pads');
 const park=map.architecture.districts.find(d=>d.id==='park');
 assert.ok(park&&park.width>=1500&&park.height>=1400);
 const trees=map.decor.trees.filter(t=>t.x>=park.x&&t.x<=park.x+park.width&&t.y>=park.y&&t.y<=park.y+park.height);
 const crowns=trees.map(t=>sourceStreetLayout('tree',t.x,t.y,{size:t.size,kind:t.kind}).bounds);
 assert.ok(trees.length>=30,'the central park needs several substantial native groves');
 let covered=0,samples=0;for(let y=park.y+10;y<park.y+park.height;y+=20)for(let x=park.x+10;x<park.x+park.width;x+=20){samples++;covered+=crowns.some(r=>x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<=r.y+r.height);}
 assert.ok(covered/samples>=.30,`native canopy groups cover only ${(covered/samples*100).toFixed(1)}% of the park`);
 for(const r of crowns)assert.ok(r.height>=180,'native upright canopies are too small');
 assert.ok(Array.isArray(map.architecture.railway_strip.points)&&map.architecture.railway_strip.points.length>=3);
 assert.ok(map.lake.outline.length>=20&&map.lake.islands.length===1,'shoreline needs bays and a dry island');
});


test('every roaming animal has its own reachable initial interaction point',async()=>{
 const actual=JSON.parse(await readFile(new URL('../web/world-map.json',import.meta.url),'utf8'));
 const animals=JSON.parse(await readFile(new URL('../web/animals-map.json',import.meta.url),'utf8')).animals;
 for(let i=0;i<animals.length;i++)for(let j=i+1;j<animals.length;j++){
  const a=animals[i].route[0],b=animals[j].route[0];
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=110,`${animals[i].id} shares its initial interaction with ${animals[j].id}`);
 }
 for(const id of ['park-dog','park-cat']){const target=actual.activities.find(a=>a.id===id),start=animals.find(a=>a.id===id).route[0];assert.equal(target.x,start.x);assert.equal(target.y,start.y);}
});


test('archived exact city arrivals and all nineteen door exits leave the actor visible through actual native mask pixels',async()=>{
 const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
 await preloadExactSourceCity(url=>loadImage(fileURLToPath(new URL(`..${url}`,import.meta.url))),{createCanvas});
 const actual=JSON.parse(await readFile(new URL('../web/world-layout-v19.json',import.meta.url),'utf8')),nodes=sourceCityExactObjects(actual);
 const {cityPhysicalObstacles,nearestFreeCityPoint}=await import('../web/city-collision.js'),physical=cityPhysicalObstacles(actual,JSON.parse(await readFile(new URL('../web/prop-collisions.json',import.meta.url),'utf8')));
 const clamp=(x,y)=>nearestFreeCityPoint({x,y},physical,{left:18,right:actual.width-18,top:18,bottom:actual.height-18});
 assert.equal(actual.schema_version,19);assert.ok(nodes.length>100,'real loaded native foreground pixels are required');
 const points=[{id:'spawn',...actual.spawn},...[...actual.buildings,...actual.district.buildings].map(b=>({id:`travel-${b.id}`,x:b.door.x,y:b.door.y+24})),...Object.entries(actual.landmarks).map(([id,p])=>({id,...p})),...[...actual.buildings,...actual.district.buildings].flatMap(b=>[24,25,28].map(dy=>({id:`${b.id}+${dy}`,x:b.door.x,y:b.door.y+dy})))];
 const canvas=createCanvas(100,110),c=canvas.getContext('2d');
 for(const point of points){
  c.resetTransform();c.clearRect(0,0,100,110);c.translate(50-point.x,95-point.y);c.fillStyle='#ff00ff';c.fillRect(point.x-32,point.y-80,64,80);
  for(const n of nodes.filter(n=>n.depth>=point.y&&n.bounds&&n.bounds.x<point.x+32&&n.bounds.x+n.bounds.width>point.x-32&&n.bounds.y<point.y&&n.bounds.y+n.bounds.height>point.y-80))n.draw(c);
  const data=c.getImageData(18,15,64,80).data;let visible=0;for(let i=0;i<data.length;i+=4)visible+=data[i]===255&&data[i+1]===0&&data[i+2]===255?1:0;
  assert.ok(visible/(64*80)>=.98,`${point.id} has only ${(visible/(64*80)*100).toFixed(2)}% of its real actor rectangle visible`);
  assert.deepEqual(clamp(point.x,point.y),{x:point.x,y:point.y},`${point.id} must remain physically reachable`);
 }
});
