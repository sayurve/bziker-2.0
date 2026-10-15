import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const city=await import('../web/source-city.js').catch(()=>({}));
const map=JSON.parse(await readFile(new URL('../web/world-layout-v18.json',import.meta.url),'utf8'));
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;

test('all source city families are selectable while saved collision and entrance data stays unchanged',()=>{
 assert.equal(typeof city.sourceBuildingLayout,'function');
 assert.equal(typeof city.sourceStreetLayout,'function');
 const saved=JSON.stringify(map);
 for(const b of [...map.buildings,...map.background_buildings,...map.district.buildings]){
  const layout=city.sourceBuildingLayout(b,b.id.startsWith('base-')?{exterior_style:2}:null);
  assert.ok(layout?.assetId,`${b.id} has no design asset`);
  assert.equal(layout.depth,b.y+b.height);
  assert.equal(layout.anchor.x,b.design?.x??b.door.x);assert.equal(layout.anchor.y,b.design?.y??b.y+b.height+15);
  assert.ok(layout.bounds.width>=b.width*.9&&layout.bounds.width<=b.width*1.15);
  assert.ok(layout.bounds.y<layout.depth);
  assert.ok(layout.bounds.y+layout.bounds.height<=b.door.y+20,'sprite base is beyond its approach');
 }
 assert.equal(JSON.stringify(map),saved);
 assert.ok(city.sourceCityAssetIds.includes('city-tennis-court'));
 assert.ok(city.sourceCityAssetIds.includes('city-basketball-court'));
 assert.ok(city.sourceCityAssetIds.includes('city-parking-empty'));
});

test('city uses all eight tree species and three bench designs with grounded sprite bounds',()=>{
 const species=new Set(map.decor.trees.map(t=>city.sourceTreeAssetId?.(t.kind,t.x,t.y)));
 for(const id of ['tree-oak','tree-birch','tree-maple','tree-linden','tree-willow','tree-poplar','tree-pine','tree-spruce'])assert.ok(species.has(id),`missing ${id}`);
 const benches=new Set(map.bench_groups.map(b=>city.sourceBenchAssetId?.(b.x,b.y)));
 assert.deepEqual([...benches].sort(),['bench-long-wood','bench-medium-metal','bench-short-backless'].sort());
 for(const t of map.decor.trees){const r=city.sourceStreetLayout('tree',t.x,t.y,{size:t.size,kind:t.kind});assert.equal(r.depth,t.y+28*t.size);assert.ok(r.bounds.x>=t.x-98*t.size);assert.ok(r.bounds.x+r.bounds.width<=t.x+98*t.size);assert.ok(r.bounds.y+r.bounds.height<=t.y+45*t.size);}
});

test('source courts stay clear of all saved roads, buildings and authored scenery',()=>{
 assert.equal(typeof city.sourceCityAreaLayouts,'function');
 const areas=city.sourceCityAreaLayouts(map);assert.ok(areas.length>=2);
 for(const a of areas){assert.ok(a.bounds.x>=0&&a.bounds.y>=0&&a.bounds.x+a.bounds.width<=map.width&&a.bounds.y+a.bounds.height<=map.height);for(const b of [...map.buildings,...map.background_buildings,...map.district.buildings,...map.decor.street_details.map(d=>d.footprint).filter(Boolean)])assert.ok(!overlap(a.bounds,b),`${a.id} covers a saved obstacle`);}
 const again=city.sourceCityAreaLayouts(map);assert.deepEqual(again,areas);
});

test('source road texture clipping is local to the same road topology as city movement',async()=>{
 const ground=await import('../web/city-ground.js');assert.equal(typeof ground.drawSourceRoadTextures,'function');
 const {createCityGroundPlan}=ground,p=createCityGroundPlan(map),calls=[];
 const c=new Proxy({beginPath(){calls.push('path');},clip(){calls.push('clip');},save(){calls.push('save');},restore(){calls.push('restore');}},{get:(t,k)=>t[k]??(()=>{})});
 const before=JSON.stringify(p.roads);ground.drawSourceRoadTextures(c,p,{x:0,y:0,width:1024,height:1024});
 assert.equal(JSON.stringify(p.roads),before);assert.ok(calls.includes('clip'),'road grain needs the road mask');assert.equal(calls.filter(x=>x==='save').length,calls.filter(x=>x==='restore').length);
});

test('source terrace without a separate connector still renders its authored ground',async()=>{
 const {drawCityArchitectureGround}=await import('../web/city-architecture.js');
 const c=new Proxy({},{get:(t,k)=>t[k]??(()=>{})});
 const saved=JSON.stringify(map);
 assert.doesNotThrow(()=>drawCityArchitectureGround(c,map,{x:0,y:0,width:1024,height:1024}));
 assert.equal(JSON.stringify(map),saved);
});

test('parked source cars fit their bays, keep doors clear and stay deterministic',()=>{
 assert.equal(typeof city.sourceParkedVehicleLayouts,'function');
 const saved=JSON.stringify(map),cars=city.sourceParkedVehicleLayouts(map);assert.ok(cars.length>5);
 assert.deepEqual(cars,city.sourceParkedVehicleLayouts(map));
 for(const car of cars){assert.ok(car.bounds.x>=car.bay.x&&car.bounds.x+car.bounds.width<=car.bay.x+car.bay.width);assert.ok(car.bounds.y+car.bounds.height<=car.bay.y+car.bay.height);for(const b of map.buildings)assert.ok(Math.hypot(car.anchor.x-b.door.x,car.anchor.y-b.door.y)>75);assert.equal(city.sourceVehicleAssetId(car),car.assetId);}
 assert.ok(new Set(cars.map(c=>c.color_key)).size>=4);assert.ok(new Set(cars.map(c=>c.direction)).size>=3);
 assert.equal(JSON.stringify(map),saved);
 assert.equal(city.sourceVehicleAssetId({model:'bentley'}),'vehicle-bentley');
 assert.equal(city.sourceVehicleAssetId({model:'invalid'}),'vehicle-compact-hatchback');
});

test('saved vehicle model, native paint colour and facing select the correct source view',()=>{
 assert.equal(city.sourceVehicleAssetId({model:'bentley',color:'red'}),'vehicle-bentley-red');
 assert.equal(city.sourceVehicleAssetId('vehicle-bentley-blue'),'vehicle-bentley-blue');
 assert.equal(city.sourceVehicleAssetId({model:'bentley',color:'#c73e37'}),'vehicle-bentley-red');
 const r=city.sourceVehicleLayout({model:'bentley',color:'red',facing:'up'},100,200);
 assert.equal(r.assetId,'vehicle-bentley-red');assert.equal(r.direction,'back');
});

test('new authored street bins keep the native sprite and physical support',async()=>{
 const {streetDetailObjects}=await import('../web/street-details.js');
 const bins=map.decor.street_details.filter(d=>d.kind==='bin'),objects=streetDetailObjects(map);
 assert.ok(bins.length>0);
 for(const bin of bins){const object=objects.find(o=>o.id===bin.id);assert.ok(object);assert.ok(object.footprint.width>0&&object.footprint.height>0);assert.equal(object.depth,bin.y+15);}
});

test('ready source buildings and scenery draw real native assets, inside their fitted bounds',async()=>{
 const {createRequire}=await import('node:module'),require=createRequire(process.execPath),{createCanvas,loadImage}=require('@napi-rs/canvas');
 const {preloadDesignAssets,resolveDesignAsset}=await import('../web/design-assets.js');
 const roots=new URL('../',import.meta.url),{fileURLToPath}=await import('node:url');
 await preloadDesignAssets(city.sourceCityAssetIds,url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),roots))));
 for(const b of map.buildings){const r=city.sourceBuildingLayout(b),canvas=createCanvas(Math.ceil(r.bounds.width)+6,Math.ceil(r.bounds.height)+6),c=canvas.getContext('2d');c.translate(-r.bounds.x+3,-r.bounds.y+3);assert.equal(city.drawSourceBuilding(c,b),true,`${b.id} failed to use ${r.assetId}`);assert.ok(c.getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3&&v>80));}
 for(const type of ['tree','bench','flowerbed','bin']){const r=city.sourceStreetLayout(type,150,160),canvas=createCanvas(350,350),c=canvas.getContext('2d');assert.ok(resolveDesignAsset(r.assetId));assert.equal(city.drawSourceStreet(c,type,150,160),true);const pixels=c.getImageData(0,0,350,350).data;let count=0;for(let y=0;y<350;y++)for(let x=0;x<350;x++)if(pixels[(y*350+x)*4+3]){count++;assert.ok(x>=Math.floor(r.bounds.x)&&y>=Math.floor(r.bounds.y)&&x<=Math.ceil(r.bounds.x+r.bounds.width)&&y<=Math.ceil(r.bounds.y+r.bounds.height));}assert.ok(count>120);}
});
