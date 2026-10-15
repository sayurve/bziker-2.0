import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as source from '../web/source-city.js';
import {designData,designCrop,designDestination,resolveDesignAsset,preloadDesignViews} from '../web/design-assets.js';
import {cityPhysicalObstacles} from '../web/city-collision.js';
import {createCityGroundPlan,drawCityGround} from '../web/city-ground.js';
import {drawCityArchitectureGround,publicBuildingGeometry,drawPublicBuilding} from '../web/city-architecture.js';
const entity=(id,assetId,footprint,depth,extra={})=>({id,kind:'prop',x:700,y:700,width:999,height:999,footprint,depth,design:{assetId,x:240,y:320,width:180,height:140,anchorX:.25,anchorY:.8,crop:'solid',direction:'front'},...extra});
const bench=entity('bench-a','bench-long-wood',{x:210,y:291,width:126,height:14},305);
const building=entity('shop-food','food-kiosk',{x:440,y:100,width:180,height:90},190,{door:{x:500,y:191}});
const parking=entity('parking-a','city-parking-empty-view-top',null,-1,{layer:'ground'});
const map={schema_version:20,width:1000,height:900,design_source:{modular_scene:true,exact_scene:false},roads:[{id:'main',kind:'road',width:180,points:[[100,550],[900,550]]}],buildings:[building],background_buildings:[],district:{buildings:[entity('base-1','clan-base-modern-clubhouse',{x:700,y:100,width:180,height:90},190)]},bench_groups:[bench],decor:{trees:[entity('oak-a','tree-oak',{x:78,y:315,width:14,height:9},324)],lamps:[],street_details:[],crosswalks:[],fixture_pads:[],plaza:{x:480,y:640,width:100,height:100}},architecture:{frontages:[{id:'front-food',building_id:'shop-food',width:60,path:[[500,191],[500,434]],forecourt:{x:450,y:191,width:100,height:60},connection:{road_id:'main'}}],block_paving:[]},scene_objects:[bench,parking,entity('bin-a','street-bin',{x:360,y:310,width:18,height:14},324)],activities:[],solids:[],smoking:{x:680,y:630,width:120,height:100},lake:{x:830,y:800,radius_x:50,radius_y:40,rotation:0}};

test('modular static nodes use authored native resources and support depth once; ground and private bases are separate',()=>{
 assert.equal(typeof source.sourceCityModuleObjects,'function');
 const nodes=source.sourceCityModuleObjects(map);
 assert.deepEqual(nodes.map(n=>n.id).sort(),['bench-a','bin-a','oak-a','shop-food']);
 for(const node of nodes){const record=[building,bench,...map.decor.trees,...map.scene_objects].find(e=>e.id===node.id),d=record.design;
  assert.deepEqual(node.footprint,record.footprint);assert.equal(node.depth,record.depth);
  assert.deepEqual(node.bounds,designDestination(resolveDesignAsset(d.assetId,d.direction),d.x,d.y,d.width,d.height,d));
  assert.ok(!node.assetId?.includes('city-source-map'));
 }
 assert.ok(!source.sourceCityAssetIds.includes('city-source-map'),'whole city is never in modular preloads');
});
test('physical supports are exactly the same authored footprints as rendered nodes, without inferred padding or phantom extras',()=>{
 const obstacles=cityPhysicalObstacles(map,{bench:{x:-400,y:-400,width:900,height:900},tree:{x:-200,y:-200,width:600,height:600}},[{id:'guessed-car',x:1,y:1,width:200,height:100}]);
 const expected=[building,...map.district.buildings,bench,...map.decor.trees,...map.scene_objects.filter(e=>e.footprint)].filter((e,i,a)=>a.findIndex(n=>n.id===e.id)===i);
 assert.deepEqual(obstacles.map(o=>o.id).sort(),expected.map(e=>e.id).sort());
 for(const e of expected)assert.deepEqual(Object.fromEntries(['x','y','width','height'].map(k=>[k,obstacles.find(o=>o.id===e.id)[k]])),e.footprint);
 assert.equal(obstacles.find(o=>o.id==='oak-a').kind,'tree','species/visual labels must retain the published physical tree kind');
 assert.deepEqual(publicBuildingGeometry(building).footprint,building.footprint);
});
test('one modular ground plan owns explicit frontages and parking; architecture never adds a duplicate pass',()=>{
 const plan=createCityGroundPlan(map);
 assert.equal(plan.modularScene,true);assert.equal(plan.exactScene,false);
 assert.equal(plan.approaches.length,1);assert.deepEqual(plan.approaches[0].path,map.architecture.frontages[0].path);
 assert.equal(plan.plantings.length,0,'no invented beds beside native sprites');
 assert.deepEqual(plan.groundObjects.map(n=>n.id),['parking-a']);
 let calls=0;drawCityArchitectureGround(new Proxy({}, {get(){return ()=>{calls++;};},set(){calls++;return true;}}),map);
 assert.equal(calls,0,'frontages without parking must be legal and painted only once');
 assert.equal(createCityGroundPlan({...map,design_source:{...map.design_source,sidewalk_width:40}}).sidewalk,40,'rendered sidewalk follows authored clearance, not legacy52');
});
test('a modular prop draws its own solid native crop with uniform aspect and does not replay any full-map pixels',async()=>{
 const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
 await preloadDesignViews([{id:bench.design.assetId}],url=>loadImage(fileURLToPath(new URL(`..${url}`,import.meta.url))));
 assert.equal(typeof source.sourceCityModuleObjects,'function');
 const node=source.sourceCityModuleObjects(map).find(n=>n.id===bench.id),actual=createCanvas(500,500),expected=createCanvas(500,500),d=bench.design;
 node.draw(actual.getContext('2d'));
 const asset=resolveDesignAsset(d.assetId),crop=designCrop(asset,d),box=designDestination(asset,d.x,d.y,d.width,d.height,d),image=await loadImage(fileURLToPath(new URL(`..${asset.url}`,import.meta.url))),c=expected.getContext('2d');
 c.imageSmoothingEnabled=false;c.drawImage(image,crop.x,crop.y,crop.width,crop.height,Math.round(box.x),Math.round(box.y),box.width,box.height);
 assert.deepEqual(actual.getContext('2d').getImageData(0,0,500,500).data,c.getImageData(0,0,500,500).data);
});
test('modular ground renders a provided ground resource once and its metadata cannot enable historic full-map replay',async()=>{
 const {createCanvas}=createRequire(process.execPath)('@napi-rs/canvas');
 let drawn=0;const plan=createCityGroundPlan({...map,design_source:{...map.design_source,exact_scene:true}}),node=plan.groundObjects[0];
 node.draw=()=>{drawn++;return true;};
 const canvas=createCanvas(1000,900);drawCityGround(canvas.getContext('2d'),plan);
 assert.equal(drawn,1);assert.equal(source.isExactSourceCity(plan.map),false);
 assert.equal(source.drawExactSourceCity(canvas.getContext('2d'),plan.map),false);
});
test('changing a built clan facade keeps its actual source staircase, canonical entrance and shared support fixed',()=>{
 assert.ok(source.sourceClanDoorAnchors);
 assert.equal(new Set(source.sourceClanHouseAssets).size,6,'all six facade choices use distinct provided resources');
 const house={...map.district.buildings[0],door:{x:770,y:244},design:{...map.district.buildings[0].design,x:780,y:220,width:330,height:250,doorAnchor:{x:.465,y:1},doorTarget:{x:770,y:220},doorOffsetY:24}};
 for(let style=0;style<source.sourceClanHouseAssets.length;style++){
  const r=source.sourceBuildingLayout(house,{exterior_style:style}),a=source.sourceClanDoorAnchors[r.assetId];assert.ok(a,`source staircase anchor is required for ${r.assetId}`);
  assert.ok(Math.abs(r.bounds.x+r.bounds.width*a.x-house.design.doorTarget.x)<1e-8,`${r.assetId} moves its staircase sideways`);
  assert.ok(Math.abs(r.bounds.y+r.bounds.height*a.y-house.design.doorTarget.y)<1e-8,`${r.assetId} moves its staircase vertically`);
  assert.deepEqual(r.footprint,house.footprint);assert.equal(r.depth,house.depth);
  assert.ok(Math.abs(r.bounds.width-house.design.width)<1e-8,`${r.assetId} shrinks to fit the old construction-site height`);
 }
});
test('the supplied flat pier component keeps native pixels and aspect through an explicit ground rotation',async()=>{
 const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),d={assetId:'bziker-water-pier',x:250,y:260,width:190,height:80,anchorX:.5,anchorY:.5,crop:'solid',direction:'front',componentCrop:{x:320,y:600,width:60,height:100},rotation:Math.PI/2},record={id:'bridge-ground',kind:'bridge',layer:'ground',depth:-1,footprint:null,design:d};
 await preloadDesignViews([{id:d.assetId}],url=>loadImage(fileURLToPath(new URL(`..${url}`,import.meta.url))));
 const node=source.sourceCityGroundObjects({...map,scene_objects:[record]},{createCanvas})[0];
 assert.ok(node);assert.equal(node.componentCrop?.width,60);assert.equal(node.rotation,Math.PI/2);
 assert.ok(Math.abs(node.bounds.width-80)<1e-8);assert.ok(Math.abs(node.bounds.height-48)<1e-8);
 const actual=createCanvas(500,500),expected=createCanvas(500,500),c=expected.getContext('2d'),asset=resolveDesignAsset(d.assetId),image=await loadImage(fileURLToPath(new URL(`..${asset.url}`,import.meta.url)));
 node.draw(actual.getContext('2d'));c.imageSmoothingEnabled=false;c.translate(d.x,d.y);c.rotate(d.rotation);c.drawImage(image,320,600,60,100,-24,-40,48,80);
 assert.ok(actual.getContext('2d').getImageData(0,0,500,500).data.some((v,i)=>i%4===3&&v>0),'the measured component contains actual native plank pixels');
 assert.deepEqual(actual.getContext('2d').getImageData(0,0,500,500).data,c.getImageData(0,0,500,500).data);
 const invalid={...record,design:{...d,assetId:'clan-base-modern-clubhouse'}};
 assert.equal(source.sourceEntityLayout(invalid),null,'volume assets cannot use a flat component/rotation shortcut');
 const wholePier={...record,design:{...d,componentCrop:undefined,rotation:Math.PI}};
 assert.equal(source.sourceEntityLayout(wholePier),null,'native pier posts and platforms cannot be turned upside down as ground');
});
test('a missing modular native facade never produces a procedural replacement building',()=>{
 let calls=0;const c=new Proxy({}, {get(){return ()=>{calls++;};},set(){calls++;return true;}}),b={...building,design:{...building.design,assetId:'missing-source-facade'}};
 assert.equal(drawPublicBuilding(c,b),false);assert.equal(calls,0);
});
