import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createCityGroundPlan,drawCityGround,drawMiniMapGround} from '../web/city-ground.js';
import {preloadDesignViews,resolveDesignAsset} from '../web/design-assets.js';
import {lakeContains} from '../web/water.js';

const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
let native;
await preloadDesignViews([{id:'source-road-asphalt-tile'}],async url=>native=await loadImage(fileURLToPath(new URL(`..${url}`,import.meta.url))));
const lot={id:'courtyard',kind:'parking',parking_layout:'modular',x:100,y:80,width:708,height:408,entry:{edge:'bottom',point:{x:454,y:488},width:180},pedestrian_entries:[{id:'courtyard-foot-entry',edge:'top',point:{x:454,y:80},width:60}],ground:{border:24,bay_width:240,bay_height:120,aisle_width:180,rows:3,banks:2},native_slots:[],borders:[{id:'left-curb',x:100,y:80,width:8,height:408},{id:'right-curb',x:800,y:80,width:8,height:408},{id:'top-west-curb',x:100,y:80,width:324,height:8},{id:'top-east-curb',x:484,y:80,width:324,height:8},{id:'bottom-west-curb',x:100,y:480,width:264,height:8},{id:'bottom-east-curb',x:544,y:480,width:264,height:8}],bumpers:[{id:'stop',x:129,y:142,width:12,height:44}]};
for(let row=0;row<3;row++)for(let side=0;side<2;side++)lot.native_slots.push({id:`bay-${side}-${row}`,bounds:{x:124+side*420,y:104+row*120,width:240,height:120}});
const map={schema_version:22,width:1000,height:850,scene_objects:[lot],architecture:{frontages:[]},roads:[{id:'entry',kind:'driveway',width:164,sidewalk_width:8,points:[[454,488],[454,750]]},{id:'foot-entry',kind:'walkway',width:40,points:[[454,80],[454,30]]}],decor:{crosswalks:[]}};
const plan=createCityGroundPlan(map),pixel=(c,x,y)=>[...c.getImageData(x,y,1,1).data];
function paint(tile={x:0,y:0,width:1000,height:850},mini=false){const c=createCanvas(tile.width,tile.height).getContext('2d');c.translate(-tile.x,-tile.y);(mini?drawMiniMapGround:drawCityGround)(c,plan,tile);return c;}
function oracle(){const asset=resolveDesignAsset('source-road-asphalt-tile'),c=createCanvas(1000,850).getContext('2d'),h=160*asset.height/asset.width;c.fillStyle=plan.materials.asphalt;c.fillRect(0,0,1000,850);c.imageSmoothingEnabled=false;for(let y=0;y<850;y+=h)for(let x=0;x<1000;x+=160)c.drawImage(native,x,y,160,h);return c;}
test('a geometric courtyard floor joins its entire vehicle entry without a curb or painted stripe',()=>{
 assert.equal(plan.parkingLots?.length,1,'A modular floor is planned even without a design PNG');
 const c=paint(),e=oracle();for(const y of [450,470,486,488,510,550])for(const x of [384,420,454,480,520])assert.deepEqual(pixel(c,x,y),pixel(e,x,y),`The open180px aisle is interrupted at${x},${y}`);
 assert.notDeepEqual(pixel(c,104,220),pixel(e,104,220),'The raised left curb remains visible');
 assert.notDeepEqual(pixel(c,134,150),pixel(e,134,150),'The real bumper is drawn at its physical support');
 for(const [x,y]of [[320,483],[580,483]])assert.notDeepEqual(pixel(c,x,y),pixel(e,x,y),'The lower curb exists on both sides of the vehicle opening');
});
test('a separate pedestrian mouth cuts the real upper curb and keeps both flanking curb pieces',()=>{
 const c=paint(),e=oracle();
 for(const x of [440,454,470])for(const y of [80,82,86,95,120])assert.deepEqual(pixel(c,x,y),pixel(e,x,y),`The pedestrian mouth is blocked at${x},${y}`);
 for(const x of [415,493])assert.notDeepEqual(pixel(c,x,83),pixel(e,x,83),'The pedestrian opening has an actual curb on both sides');
});
test('parking asphalt has the same world texture phase across cached ground chunks',()=>{
 const full=paint(),tile={x:347,y:219,width:313,height:301},piece=paint(tile);for(let y=220;y<487;y+=17)for(let x=348;x<660;x+=19)assert.deepEqual(pixel(piece,x-tile.x,y-tile.y),pixel(full,x,y),`Parking tile seam changes the surface at${x},${y}`);
});
test('the map and game share parking outlines, slots and open entry; planning does not mutate saved geometry',()=>{
 const before=JSON.stringify(map),p=createCityGroundPlan(map);assert.equal(JSON.stringify(map),before);assert.deepEqual(p.parkingLots[0].native_slots,lot.native_slots);
 const game=paint(),mini=paint(undefined,true);for(const [x,y]of [[100,220],[134,150],[364,224],[544,344],[454,487]])assert.deepEqual(pixel(game,x,y),pixel(mini,x,y),`Map parking disagrees at${x},${y}`);
});
test('an authored lake has a continuous dry stone edge without changing its walkable island or water boundary',()=>{
 const lake={x:550,y:430,radius_x:250,radius_y:150,outline:[[300,280],[800,280],[800,580],[300,580]],islands:[{x:550,y:430,radius_x:45,radius_y:30}]},m={...map,roads:[],scene_objects:[],lake},p=createCityGroundPlan(m),before=JSON.stringify(m),c=createCanvas(1000,850).getContext('2d');
 drawCityGround(c,p,{x:0,y:0,width:1000,height:850});
 for(let x=330;x<790;x+=37)assert.notDeepEqual(pixel(c,x,273),pixel(c,x,240),`A bare grass break remains on the dry shore at${x}`);
 assert.equal(lakeContains(lake,{x:450,y:430}),true);assert.equal(lakeContains(lake,{x:550,y:430}),false,'The island stays dry');assert.equal(lakeContains(lake,{x:550,y:273}),false,'The decorative bank does not extend water');
 assert.equal(JSON.stringify(m),before,'Drawing a shore does not modify collision or boat geometry');
});
