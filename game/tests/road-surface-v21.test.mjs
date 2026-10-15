import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createCityGroundPlan,drawCityGround} from '../web/city-ground.js';
import {preloadDesignViews,resolveDesignAsset} from '../web/design-assets.js';

const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const asphalt=resolveDesignAsset('source-road-asphalt-tile');let nativeAsphalt;
await preloadDesignViews([{id:'source-road-asphalt-tile'}],async url=>nativeAsphalt=await loadImage(fileURLToPath(new URL(`..${url}`,import.meta.url))));
const width=640,height=560;
const map={schema_version:21,width,height,design_source:{modular_scene:true},architecture:{sidewalk_width:60,frontages:[{building_id:'test-door',width:80,path:[[100,85],[460,485]],connection:{road_id:'test-road'}}]},roads:[],scene_objects:[],decor:{crosswalks:[]}};
const diagonal=createCityGroundPlan(map);
const rgba=hex=>[...hex.slice(1).match(/../g).map(v=>parseInt(v,16)),255];
function paint(plan,tile={x:0,y:0,width,height}){
 const c=createCanvas(tile.width,tile.height).getContext('2d');c.translate(-tile.x,-tile.y);drawCityGround(c,plan,tile);return c;
}
function interiorPixels(){
 // An independent distance-to-line oracle excludes caps and antialiasing at
 // the path's edge, but keeps every genuine slab seam inside the diagonal.
 const a=[100,85],dx=360,dy=400,length=Math.hypot(dx,dy),points=[];
 for(let y=100;y<470;y++)for(let x=100;x<455;x++){
  const along=((x+.5-a[0])*dx+(y+.5-a[1])*dy)/length;
  const across=Math.abs((x+.5-a[0])*dy-(y+.5-a[1])*dx)/length;
  if(along>25&&along<length-25&&across<25)points.push([x,y]);
 }
 return points;
}
function expectedSlab(x,y){
 const row=Math.floor(y/40),vertical=(x-(row%2)*24)%48===0;
 return rgba(vertical?'#aea690':y%40===0?'#a9a18d':diagonal.materials.pavement);
}
function nativeAsphaltPlane(w,h,color){
 const c=createCanvas(w,h).getContext('2d');c.fillStyle=color;c.fillRect(0,0,w,h);c.imageSmoothingEnabled=false;
 const repeatWidth=160,repeatHeight=repeatWidth*asphalt.height/asphalt.width;
 for(let y=0;y<h;y+=repeatHeight)for(let x=0;x<w;x+=repeatWidth)c.drawImage(nativeAsphalt,x,y,repeatWidth,repeatHeight);
 return c;
}
const pixel=(c,x,y)=>[...c.getImageData(x,y,1,1).data];
function assertAsphaltPixel(c,expected,x,y){const a=pixel(c,x,y),e=pixel(expected,x,y);for(let k=0;k<4;k++)assert.ok(Math.abs(a[k]-e[k])<=1,`Native asphalt interrupted at ${x},${y}`);}
test('modular diagonal pavement contains only one world-aligned slab grid; legacy angled seams remain available',()=>{
 const actual=paint(diagonal).getImageData(0,0,width,height).data,legacy=paint({...diagonal,modularScene:false}).getImageData(0,0,width,height).data;
 let horizontal=0,vertical=0,legacyDifferences=0;
 for(const [x,y]of interiorPixels()){
  const k=(y*width+x)*4,expected=expectedSlab(x,y);
  assert.deepEqual([...actual.slice(k,k+4)],expected,`A second turned seam cuts the world slab at ${x},${y}`);
  if(y%40===0)horizontal++;if((x-(Math.floor(y/40)%2)*24)%48===0)vertical++;
  if([...legacy.slice(k,k+4)].some((v,ch)=>v!==expected[ch]))legacyDifferences++;
 }
 assert.ok(horizontal>200&&vertical>200,'Both real horizontal and vertical grid seams are sampled');
 assert.ok(legacyDifferences>500,'The archived path mode retains its original angled slab detail');
});
test('cached diagonal pavement chunks retain the same world grid phase across uneven seams',()=>{
 const full=paint(diagonal),points=interiorPixels();let checked=0,seamPixels=0;
 for(const tile of [{x:0,y:0,width:317,height:263},{x:317,y:0,width:323,height:263},{x:0,y:263,width:317,height:297},{x:317,y:263,width:323,height:297}]){
  const actual=paint(diagonal,tile),a=actual.getImageData(0,0,tile.width,tile.height).data,e=full.getImageData(tile.x,tile.y,tile.width,tile.height).data;
  // Edge antialiasing can depend on the Canvas clip bounds. Slab interiors
  // must retain their exact world phase, including both sides of each seam.
  for(const [x,y]of points)if(x>=tile.x&&x<tile.x+tile.width&&y>=tile.y&&y<tile.y+tile.height){const k=((y-tile.y)*tile.width+x-tile.x)*4;assert.deepEqual(a.slice(k,k+4),e.slice(k,k+4),`Paving phase changed at world pixel ${x},${y}`);checked++;if([316,317].includes(x)||[262,263].includes(y))seamPixels++;}
 }
 assert.equal(checked,points.length);assert.ok(seamPixels>100,'Both physical cache joins cross the sampled path');
});
test('wide modular asphalt junction retains a continuous native texture without pedestrian seams across it',()=>{
 const plan=createCityGroundPlan({...map,architecture:{sidewalk_width:60,frontages:[{building_id:'junction-door',width:80,path:[[320,90],[320,280]],connection:{road_id:'horizontal'}}]},roads:[{id:'horizontal',kind:'road',width:280,points:[[50,280],[590,280]]},{id:'vertical',kind:'road',width:300,points:[[320,20],[320,540]]}]});
 assert.equal(plan.sidewalk,60);assert.equal(plan.junctions.length,1);
 const actual=paint(plan),expected=nativeAsphaltPlane(width,height,plan.materials.asphalt);
 const a=actual.getImageData(240,200,160,160).data,e=expected.getImageData(240,200,160,160).data;
 for(let k=0;k<a.length;k++)assert.ok(Math.abs(a[k]-e[k])<=1,`Junction lost its common native asphalt at ${240+(Math.floor(k/4)%160)},${200+Math.floor(k/4/160)}`);
});
test('authored parking driveway uses native asphalt and its own narrow shoulder without lane markings',()=>{
 const bare={schema_version:21,width,height,architecture:{sidewalk_width:60,frontages:[]},roads:[],scene_objects:[],decor:{crosswalks:[]}},drive={id:'parking-driveway',kind:'driveway',width:140,sidewalk_width:10,points:[[320,70],[320,490]]};
 const plan=createCityGroundPlan({...bare,roads:[drive]}),actual=paint(plan),expected=nativeAsphaltPlane(width,height,plan.materials.asphalt),grass=paint(createCityGroundPlan(bare));
 assert.equal(plan.sidewalk,60,'Main road sidewalk metadata remains unchanged');assert.deepEqual(plan.laneMarkings,[],'Parking access has no centre-line dashes');
 for(const [x,y]of [[320,213],[272,253],[368,293]])assertAsphaltPixel(actual,expected,x,y);
 assert.deepEqual(pixel(actual,395,213),rgba(plan.materials.pavement),'The authored10px shoulder is walkable paving');
 assert.deepEqual(pixel(actual,412,213),pixel(grass,412,213),'A driveway does not inherit the main60px sidewalk');
});
test('native shared parking lower entrance joins its asphalt driveway without a sidewalk strip across the opening',async()=>{
 const parking={id:'shared-parking',kind:'parking',depth:-1,design:{assetId:'city-parking-empty-view-top',x:600,y:480,width:650,height:449,anchorX:.5,anchorY:1,crop:'solid',direction:'front'}};
 await preloadDesignViews([{id:parking.design.assetId}],url=>loadImage(fileURLToPath(new URL(`..${url}`,import.meta.url))));
 const joined={schema_version:21,width:1200,height:900,architecture:{sidewalk_width:60,frontages:[]},roads:[{id:'main',kind:'road',width:280,points:[[70,700],[1130,700]]},{id:'parking-driveway',kind:'driveway',width:140,sidewalk_width:10,points:[[600,700],[600,465]]},{id:'crossing-sidewalk',kind:'path',width:60,points:[[430,510],[770,510]]}],scene_objects:[parking],decor:{crosswalks:[]}};
 const plan=createCityGroundPlan(joined),actual=paint(plan,{x:0,y:0,width:1200,height:900}),expected=nativeAsphaltPlane(1200,900,plan.materials.asphalt);
 // These pixels start immediately beyond the measured lower native opening,
 // cross the pedestrian path, and reach the main-road sidewalk junction.
 for(const y of [481,490,510,540,555,580,650])for(const x of [580,600,620])assertAsphaltPixel(actual,expected,x,y);
 assert.deepEqual(pixel(actual,450,510),rgba(plan.materials.pavement),'The neighbouring sidewalk retains its slab surface');
});
const mouthMap=(kind,contactY)=>({schema_version:21,width:1200,height:900,architecture:{sidewalk_width:60,frontages:[]},roads:[{id:'main',kind:'road',width:280,points:[[70,700],[1130,700]]},{id:'parking-mouth',kind,width:140,sidewalk_width:10,points:[[560,contactY],[560,465]]}],scene_objects:[],decor:{crosswalks:[{x:560,y:700,orientation:'horizontal'}]}});
for(const contactY of [700,562])test(`the ${contactY===700?'centre-line':'real carriageway-edge'} driveway mouth excludes zebra and centre dashes from its shared asphalt`,()=>{
  const plan=createCityGroundPlan(mouthMap('driveway',contactY)),before=JSON.stringify(plan.roads);
  assert.equal(plan.junctions.length,1,`The real parking entry at y${contactY} must form a vehicular join`);
  assert.deepEqual(plan.junctions[0].center,[560,700]);assert.deepEqual(plan.junctions[0].roadIds,['main','parking-mouth']);
  assert.equal(plan.crossings.length,1,'The requested zebra retains a safe nearby placement');
  assert.ok(Math.abs(plan.crossings[0].center[0]-560)>=140/2+60+55+16-1e-7,'The zebra and its landing cannot cover the driveway mouth');
  for(const dash of plan.laneMarkings)assert.ok(Math.abs(dash.center[0]-560)>=140/2+30,'A centre dash cannot be painted over the parking junction');
  const actual=paint(plan,{x:0,y:0,width:1200,height:900}),expected=nativeAsphaltPlane(1200,900,plan.materials.asphalt),a=actual.getImageData(510,590,100,220).data,e=expected.getImageData(510,590,100,220).data;
  for(let k=0;k<a.length;k++)assert.ok(Math.abs(a[k]-e[k])<=1,`Zebra/dash interrupted the real driveway join at ${510+(Math.floor(k/4)%100)},${590+Math.floor(k/4/100)}`);
  assert.equal(JSON.stringify(plan.roads),before,'Joining an entry does not extend or shift authored road geometry');
});
test('a pedestrian walkway or disconnected parking drive does not create a vehicular mouth exclusion',()=>{
 const pedestrian=createCityGroundPlan(mouthMap('path',562));assert.deepEqual(pedestrian.junctions,[]);assert.deepEqual(pedestrian.crossings[0].center,[560,700]);
 const separated=mouthMap('driveway',450);separated.roads[1].points=[[560,450],[560,300]];const plan=createCityGroundPlan(separated);
 assert.deepEqual(plan.junctions,[],'A40px real asphalt gap cannot create a parking junction');assert.deepEqual(plan.crossings[0].center,[560,700]);
});
