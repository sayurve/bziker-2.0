import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {designData} from '../web/design-data.js';
import {isExactSourceCity,drawExactSourceCity,preloadExactSourceCity,sourceCityAreaLayouts,sourceParkedVehicleLayouts} from '../web/source-city.js';
import {createCityGroundPlan,drawCityGround,drawMiniMapGround} from '../web/city-ground.js';
import {drawCityArchitectureGround} from '../web/city-architecture.js';
import {sourceShoreLayouts} from '../web/source-water.js';
import {supplementalEnvironmentLayouts} from '../web/supplemental-environment.js';
const require=createRequire(process.execPath),{createCanvas,loadImage}=require('@napi-rs/canvas');
const map=JSON.parse(await readFile(new URL('../web/world-layout-v19.json',import.meta.url),'utf8'));
const {cityPhysicalObstacles,nearestFreeCityPoint}=await import('../web/city-collision.js');
const physical=cityPhysicalObstacles(map,JSON.parse(await readFile(new URL('../web/prop-collisions.json',import.meta.url),'utf8')));
const clampPosition=(x,y)=>nearestFreeCityPoint({x,y},physical,{left:18,right:map.width-18,top:18,bottom:map.height-18});
const asset=designData.assets['city-source-map'];
const original=fileURLToPath(new URL('../source-reference/01_Окружение/Карта_города/Квадраты_карты/Карта_исходная.png',import.meta.url));
const exported=fileURLToPath(new URL(`..${asset.url}`,import.meta.url));
await preloadExactSourceCity(url=>loadImage(fileURLToPath(new URL(`..${url}`,import.meta.url))));
const source=await loadImage(original),rawCanvas=createCanvas(1536,1024),raw=rawCanvas.getContext('2d');raw.drawImage(source,0,0);
const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;

test('the approved original and imported city artwork have identical decoded pixels',async()=>{
 assert.equal(createHash('sha256').update(await readFile(original)).digest('hex'),asset.source_sha256);
 const c=createCanvas(1536,1024);c.getContext('2d').drawImage(await loadImage(exported),0,0);
 assert.deepEqual(pixels(c),pixels(rawCanvas));
});
test('exact city scene draws every approved pixel without synthesized streets or objects',()=>{
 assert.equal(isExactSourceCity(map),true);assert.equal(map.schema_version,19);
 const c=createCanvas(1536,1024),ctx=c.getContext('2d');ctx.scale(1/5,1/5);
 assert.equal(drawExactSourceCity(ctx,map),true);assert.deepEqual(pixels(c),pixels(rawCanvas));
 assert.deepEqual(sourceCityAreaLayouts(map),[]);assert.deepEqual(sourceParkedVehicleLayouts(map),[]);assert.deepEqual(sourceShoreLayouts(map),[]);assert.deepEqual(supplementalEnvironmentLayouts(map),[]);
});
test('a viewport preserves source pixels exactly and never paints outside its rectangle',()=>{
 const c=createCanvas(1536,1024),ctx=c.getContext('2d');ctx.scale(1/5,1/5);
 const view={x:440*5,y:310*5,width:400*5,height:330*5};drawExactSourceCity(ctx,map,view);
 const actual=pixels(c),expected=pixels(rawCanvas);
 for(let y=0;y<1024;y++)for(let x=0;x<1536;x++){
  const i=(y*1536+x)*4;if(x>=440&&x<840&&y>=310&&y<640){for(let k=0;k<4;k++)assert.equal(actual[i+k],expected[i+k]);}
  else assert.equal(actual[i+3],0);
 }
});
test('ground, minimap and architecture consumers preserve the exact scene',()=>{
 const plan=createCityGroundPlan(map);assert.equal(plan.exactScene,true);
 for(const draw of [c=>drawCityGround(c,plan),c=>drawMiniMapGround(c,plan)]){
  const canvas=createCanvas(1536,1024),c=canvas.getContext('2d');c.scale(.2,.2);draw(c);drawCityArchitectureGround(c,map);
  assert.deepEqual(pixels(canvas),pixels(rawCanvas));
 }
});
test('exact migration retains v18 destinations, account-independent IDs and eleven real entrances',()=>{
 assert.deepEqual(map.previous_landmarks_v18,JSON.parse(require('node:fs').readFileSync(new URL('../web/world-layout-v18.json',import.meta.url),'utf8')).landmarks);
 assert.equal(map.buildings.length,11);assert.equal(map.district.buildings.length,8);
 for(const b of [...map.buildings,...map.district.buildings]){
  assert.equal(b.design.baked_scene,true);assert.ok(b.design.source_bounds.length===4);
  assert.ok(Number.isFinite(b.door.x)&&Number.isFinite(b.door.y));
 }
});

test('all nineteen thresholds, client exits and native boarding points are physically usable',async()=>{
 const {pedestrianLakeContains,lakeContains}=await import('../web/water.js');

 const inside=(p,b)=>p.x>b.x&&p.x<b.x+b.width&&p.y>b.y&&p.y<b.y+b.height;
 for(const b of [...map.buildings,...map.district.buildings])for(const dy of [0,24,25,28]){
  const p={x:b.door.x,y:b.door.y+dy};assert.equal(pedestrianLakeContains(map.lake,p),false,`${b.id} exit touches water`);
  assert.ok(!physical.some(b=>inside(p,b)),`${b.id}+${dy} exit touches solid`);
 }
 for(const boat of map.boats){assert.equal(lakeContains(map.lake,boat.dock,12),true,`${boat.id} begins outside navigable native water`);assert.equal(pedestrianLakeContains(map.lake,boat.boarding),false);assert.ok(!physical.some(b=>inside(boat.boarding,b)));}
 const bridge=map.lake.walkways.find(w=>w.id==='island-bridge');for(const [x,y]of bridge.points)assert.equal(lakeContains(map.lake,{x,y}),false,'native bridge joins actual dry shore and island');
});
test('native foreground masks reapply existing source pixels without altering the empty city',async()=>{
 const {sourceCityExactObjects}=await import('../web/source-city.js');
 await preloadExactSourceCity(url=>loadImage(fileURLToPath(new URL(`..${url}`,import.meta.url))),{createCanvas});
 const c=createCanvas(1536,1024),ctx=c.getContext('2d');ctx.scale(.2,.2);drawExactSourceCity(ctx,map);
 const objects=sourceCityExactObjects(map);assert.ok(objects.length>100,'native foreground contours are required for actor depth');
 for(const object of objects.sort((a,b)=>a.depth-b.depth))object.draw(ctx);
 assert.deepEqual(pixels(c),pixels(rawCanvas));
});
test('all active action approaches follow dry native corridors and remain clear of actual supports',async()=>{
 const {pedestrianLakeContains}=await import('../web/water.js');
 const inside=(p,b)=>p.x>b.x&&p.x<b.x+b.width&&p.y>b.y&&p.y<b.y+b.height;
 assert.equal(map.action_routes.length,5);
 for(const route of [...map.roads,...map.action_routes])for(let i=1;i<route.points.length;i++){
  const a=route.points[i-1],b=route.points[i],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/8));
  for(let j=0;j<=steps;j++){
   const p={x:a[0]+(b[0]-a[0])*j/steps,y:a[1]+(b[1]-a[1])*j/steps};assert.ok(!physical.some(b=>inside(p,b)),`${route.id} crosses a source support`);
   for(const [dx,dy]of [[0,0],[14,0],[-14,0],[0,14],[0,-14]])assert.equal(pedestrianLakeContains(map.lake,{x:p.x+dx,y:p.y+dy}),false,`${route.id} crosses actual native water`);
  }
 }
});

test('visible native wagons and platform edges have narrow physical ground supports',async()=>{

 const props=JSON.parse(await readFile(new URL('../web/source-props-v19.json',import.meta.url),'utf8')).props;
 const rail=props.filter(p=>['train','platform'].includes(p.kind));
 assert.equal(rail.filter(p=>p.kind==='train').length,4);
 assert.equal(rail.filter(p=>p.kind==='platform').length,3);
 for(const p of rail){
  const supports=map.solids.filter(b=>b.id===p.id||b.source_prop_id===p.id);
  assert.ok(supports.length,`${p.id} must be part of the canonical city geometry`);
  for(const solid of supports){
   assert.ok(solid.height<=50,'the footprint follows the lower edge, not the full visible roof or walkable platform floor');
   assert.equal(solid.source_kind,p.kind);
   const foot={x:solid.x+solid.width/2,y:solid.y+solid.height/2};
   assert.notDeepEqual(clampPosition(foot.x,foot.y),foot,`${p.id} must block walking through its vertical ground support`);
  }
 }
 const bridge=props.filter(p=>p.kind==='rail-bridge-column');
 assert.equal(bridge.length,2,'only the two visible bridge feet are physical supports');
 for(const p of bridge){
  const foot={x:(p.x+p.width/2)*5,y:(p.y+p.height/2)*5};
  assert.notDeepEqual(clampPosition(foot.x,foot.y),foot,`${p.id} must block its actual metal foot`);
 }
 const openFloor={x:1205*5,y:241*5};
 assert.deepEqual(clampPosition(openFloor.x,openFloor.y),openFloor,'the native platform floor between the two posts stays walkable');
});
