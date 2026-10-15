import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {preloadDesignViews} from '../web/design-assets.js';
import {sourceCityModuleObjects,sourceCityGroundObjects,sourceEntityLayout,drawSourceEntity} from '../web/source-city.js';
import {preloadSourceWater} from '../web/source-water.js';
import {preloadSourceInteriorRoom,sourceInteriorDetailLayout,drawSourceInteriorDetail} from '../web/source-interiors.js';
import {drawInteriorGround,interiorObjects} from '../web/interiors.js';
import {worldMap,cityGroundPlan,createCityArt,sortWorldDepth,drawAvatar} from '../web/world.js';
import {drawCityGround} from '../web/city-ground.js';
import {loadSourceActor} from '../web/source-actors.js';
import {defaultAvatar} from '../web/avatar.js';

const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const root=new URL('../',import.meta.url),destination=new URL(`../docs/${worldMap.schema_version>=23?'bugfix-v23':worldMap.schema_version>=22?'city-scale-v22':worldMap.schema_version>=21?'roads-parking-v21':'modular-design-v20'}/`,import.meta.url);
const capturedRaw=await readFile(new URL('../web/world-map.json',import.meta.url)),capturedSHA=createHash('sha256').update(capturedRaw).digest('hex');
assert.deepEqual(worldMap,JSON.parse(capturedRaw),'map changed while renderer modules loaded');
const shaOption=process.argv.indexOf('--expected-map-sha');
if(shaOption>=0)assert.equal(capturedSHA,process.argv[shaOption+1],'renderer is not using the requested map snapshot');
const renderedOutputs=new Map();
const interiorMap=JSON.parse(await readFile(new URL('../web/interiors-map.json',import.meta.url),'utf8'));
if(worldMap.schema_version<20)throw new Error('The current modular map must be built before rendering.');
await mkdir(destination,{recursive:true});
const load=url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root)));
globalThis.document={createElement(){return createCanvas(1,1);}};
const ground=sourceCityGroundObjects(worldMap),objects=sourceCityModuleObjects(worldMap),plots=worldMap.district.buildings;
await preloadDesignViews([...ground,...objects,...plots.map(sourceEntityLayout)].filter(Boolean).map(n=>({id:n.assetId,direction:n.direction||'front'})).concat({id:'source-road-asphalt-tile',direction:'front'}),load);
await preloadSourceWater(load,{createCanvas});
const art=createCityArt();
const nodes=[...art.objects,...plots.map(p=>({...sourceEntityLayout(p),id:p.id,depth:p.depth,draw:c=>drawSourceEntity(c,p)}))];
const actorEnvironment={createCanvas,loadImage:path=>loadImage(fileURLToPath(new URL(path,root)))};
await loadSourceActor('human-male',actorEnvironment);await loadSourceActor('human-female',actorEnvironment);
async function city(name,x,y,width,height,scale,actor=null){
 const canvas=createCanvas(Math.ceil(width*scale),Math.ceil(height*scale)),c=canvas.getContext('2d');
 c.imageSmoothingEnabled=false;c.scale(scale,scale);c.translate(-x,-y);
 drawCityGround(c,cityGroundPlan,{x,y,width,height});
 const all=actor?[...nodes,{bounds:{x:actor.x-40,y:actor.y-80,width:80,height:90},depth:actor.y,draw:ctx=>drawAvatar(ctx,{...actor,id:'address-scale',avatar:defaultAvatar,facing:'down'},0,false,false,true,0,[],false)}]:nodes;
 for(const node of sortWorldDepth(all)){const b=node.bounds;if(b.x<x+width&&b.x+b.width>x&&b.y<y+height&&b.y+b.height>y)node.draw(c);}
 renderedOutputs.set(name+'.png',canvas.toBuffer('image/png'));
}
await city('city-overview',0,0,worldMap.width,worldMap.height,.2);
for(const id of ['railway','plaza','shop-furniture','clan-district','park']){
 const b=worldMap.buildings.find(b=>b.id===id),p=worldMap.landmarks[id==='clan-district'?'district':id]||b?.door||worldMap.landmarks.plaza;
 const x=Math.max(0,Math.min(worldMap.width-1440,p.x-720)),y=Math.max(0,Math.min(worldMap.height-960,p.y-600));
 await city('city-'+id,x,y,1440,960,1);
}
if(worldMap.schema_version>=21){
 for(const lot of worldMap.scene_objects.filter(n=>n.kind==='parking')){
  const b=sourceEntityLayout(lot)?.bounds||lot,p={x:b.x+b.width/2,y:b.y+b.height/2};
  const x=Math.max(0,Math.min(worldMap.width-1440,p.x-720)),y=Math.max(0,Math.min(worldMap.height-960,p.y-480));
  await city('city-'+lot.id,x,y,1440,960,1);
 }
}
if(worldMap.schema_version>=22){
 for(const building of worldMap.buildings){
  const b=sourceEntityLayout(building).bounds,p={x:b.x+b.width/2,y:b.y+b.height/2+60};
  const x=Math.max(0,Math.min(worldMap.width-1440,p.x-720)),y=Math.max(0,Math.min(worldMap.height-960,p.y-480));
  await city('address-'+building.id,x,y,1440,960,1,worldMap.schema_version>=23?{x:building.door.x,y:building.door.y+65}:null);
 }
 if(worldMap.schema_version>=23)for(const building of worldMap.background_buildings){
  const b=sourceEntityLayout(building).bounds,p={x:b.x+b.width/2,y:b.y+b.height/2+60};
  const x=Math.max(0,Math.min(worldMap.width-1440,p.x-720)),y=Math.max(0,Math.min(worldMap.height-960,p.y-480));
  await city('address-'+building.id,x,y,1440,960,1,{x:building.door.x,y:building.door.y+65});
 }
 // A side-by-side comparison uses the actual rendered historical/current maps,
 // at the same whole-city scale. It does not substitute a guide PNG for play.
 const oldVersion=worldMap.schema_version>=23?22:21,oldURL=new URL(`../docs/${oldVersion===22?'city-scale-v22':'roads-parking-v21'}/city-overview.png`,import.meta.url);
 try{
  const old=await loadImage(fileURLToPath(oldURL)),current=await loadImage(renderedOutputs.get('city-overview.png')),gap=24,header=52;
  const canvas=createCanvas(current.width*2+gap,current.height+header),c=canvas.getContext('2d');
  c.imageSmoothingEnabled=false;c.fillStyle='#f4f2ea';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#202320';c.font='24px sans-serif';
  c.fillText('До: версия '+oldVersion,20,34);c.fillText('После: версия '+worldMap.schema_version,current.width+gap+20,34);
  c.drawImage(old,0,header,current.width,current.height);c.drawImage(current,current.width+gap,header);
  renderedOutputs.set('city-overview-comparison.png',canvas.toBuffer('image/png'));
 }catch(error){if(error.code!=='ENOENT')throw error;}
 const car=worldMap.scene_objects.find(n=>n.kind==='car'),bench=worldMap.bench_groups[0];
 assert.ok(car&&bench,'scale proof requires actual car and bench instances');
 const canvas=createCanvas(1200,420),c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.fillStyle='#f4f2ea';c.fillRect(0,0,1200,420);
 c.fillStyle='#202320';c.font='22px sans-serif';c.fillText('Реальный игровой масштаб — одинаковое увеличение × 2',20,35);
 c.save();c.scale(2,2);
 const bottom=150;
 drawAvatar(c,{id:'scale-man',x:70,y:bottom,avatar:defaultAvatar,facing:'down'},0,false,false,true,0,[],false);
 drawAvatar(c,{id:'scale-woman',x:145,y:bottom,avatar:{...defaultAvatar,gender:1},facing:'down'},0,false,false,true,0,[],false);
 drawSourceEntity(c,{...car,design:{...car.design,x:300,y:bottom},depth:bottom});
 drawSourceEntity(c,{...bench,design:{...bench.design,x:505,y:bottom},depth:bottom});c.restore();
 c.font='18px sans-serif';c.fillText('Мужской персонаж',25,365);c.fillText('Женский персонаж',220,390);c.fillText('Автомобиль: '+Math.round(sourceEntityLayout(car).bounds.width)+' ед.',485,365);c.fillText('Лавка',975,365);
 renderedOutputs.set('city-scale-comparison.png',canvas.toBuffer('image/png'));
}
for(const room of interiorMap.rooms){
 await preloadSourceInteriorRoom(room,load);
 const scale=Math.min(1,1440/room.width,1000/room.height),canvas=createCanvas(Math.ceil(room.width*scale),Math.ceil(room.height*scale)),c=canvas.getContext('2d');
 c.imageSmoothingEnabled=false;c.scale(scale,scale);drawInteriorGround(c,room);
 const details=sourceInteriorDetailLayout(room);for(const detail of details.filter(d=>d.layer==='background'))drawSourceInteriorDetail(c,detail);
 const actors=worldMap.schema_version>=23?[
  {id:'room-scale-man',x:room.spawn.x,y:room.spawn.y-140,avatar:defaultAvatar,facing:'down'},
  {id:'room-scale-woman',x:room.spawn.x+75,y:room.spawn.y-140,avatar:{...defaultAvatar,gender:1},facing:'left'}
 ]:[];
 const nodes=[...interiorObjects(room),...details.filter(d=>d.layer==='object').map(d=>({depth:d.depth,draw:ctx=>drawSourceInteriorDetail(ctx,d)})),...actors.map(p=>({depth:p.y,draw:ctx=>drawAvatar(ctx,p,0,false,false,true,0,[],false)}))];
 for(const n of sortWorldDepth(nodes))n.draw(c);
 for(const detail of details.filter(d=>d.layer==='foreground'))drawSourceInteriorDetail(c,detail);
 renderedOutputs.set('interior-'+room.id+'.png',canvas.toBuffer('image/png'));
}
const mapSHA=createHash('sha256').update(await readFile(new URL('../web/world-map.json',import.meta.url))).digest('hex');
assert.equal(mapSHA,capturedSHA,'map changed during scene rendering; images are not a stable snapshot');
for(const [name,buffer] of renderedOutputs)await writeFile(new URL(name,destination),buffer);
console.log(JSON.stringify({mapVersion:worldMap.schema_version,map_sha256:mapSHA,cityNodes:nodes.length,groundNodes:ground.length,parkingLots:worldMap.scene_objects.filter(n=>n.kind==='parking').length,rooms:interiorMap.rooms.length,destination:fileURLToPath(destination)}));
