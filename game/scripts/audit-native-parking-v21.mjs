import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEntityLayout,sourceBuildingLayout,drawSourceEntity} from '../web/source-city.js';
import {preloadDesignViews} from '../web/design-assets.js';
import {citySceneEntities} from '../web/city-scene.js';
import {lakeContains} from '../web/water.js';
// Use the exact renderer and Native Canvas alpha masks; do not infer crowns
// from their species label or equate transparent bounding boxes with paint.
const root=fileURLToPath(new URL('../',import.meta.url));
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const raw=readFileSync(`${root}/web/world-map.json`),map=JSON.parse(raw),mapSHA=createHash('sha256').update(raw).digest('hex');
const args=process.argv.slice(2);
const option=name=>{const index=args.indexOf(name);if(index<0)return null;assert.ok(args[index+1]&&!args[index+1].startsWith('--'),`${name} needs a value`);return args[index+1];};
const expectedSHA=option('--expected-map-sha'),output=option('--output');
if(process.argv.includes('--expected-map-sha'))assert.equal(mapSHA,expectedSHA,'captured map differs from requested audit snapshot');
assert.ok(map.schema_version>=21,'native parking audit requires schema21 or newer');
const lots=map.scene_objects.filter(p=>p.kind==='parking'),cars=map.scene_objects.filter(p=>p.kind==='car'),buildings=[...map.buildings,...map.district.buildings,...map.background_buildings],entities=citySceneEntities(map,{privateBases:true}).filter(e=>sourceEntityLayout(e));
const scene=citySceneEntities(map,{privateBases:true}),treeSet=new Set(map.decor.trees),trees=scene.filter(e=>treeSet.has(e));
assert.equal(trees.length,map.decor.trees.length,'scene must contain every authored species-kind tree');
assert.equal(new Set(trees).size,trees.length,'tree membership must not duplicate instances');
for(const tree of trees)assert.ok(sourceEntityLayout(tree),`native layout missing for ${tree.id}`);
const drives=map.roads.filter(r=>r.kind==='driveway'),roads=map.roads.filter(r=>r.kind==='road');
assert.ok(lots.length>0&&cars.length>0&&drives.length>0&&trees.length>0,'audit must not pass on empty scene groups');
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const contains=(a,b,pad=0)=>b.x>=a.x+pad-.02&&b.y>=a.y+pad-.02&&b.x+b.width<=a.x+a.width-pad+.02&&b.y+b.height<=a.y+a.height-pad+.02;
const intersection=(a,b)=>{const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),right=Math.min(a.x+a.width,b.x+b.width),bottom=Math.min(a.y+a.height,b.y+b.height);return right>x&&bottom>y?{x:Math.floor(x),y:Math.floor(y),width:Math.ceil(right)-Math.floor(x),height:Math.ceil(bottom)-Math.floor(y)}:null;};
const pointDistance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
const boundsForRoad=r=>{const reach=r.width/2+(r.kind==='driveway'?r.sidewalk_width??10:map.design_source.sidewalk_width),xs=r.points.map(p=>p[0]),ys=r.points.map(p=>p[1]);return {x:Math.min(...xs)-reach,y:Math.min(...ys)-reach,width:Math.max(...xs)-Math.min(...xs)+reach*2,height:Math.max(...ys)-Math.min(...ys)+reach*2};};
const pairs=[];
for(const lot of lots)for(const b of buildings){const region=intersection(sourceEntityLayout(lot).bounds,sourceEntityLayout(b).bounds);if(region)pairs.push({a:lot,b,region,kind:'lot-facade'});}
for(const d of drives)for(const e of entities.filter(e=>treeSet.has(e)||buildings.includes(e))){const region=intersection(boundsForRoad(d),sourceEntityLayout(e).bounds);if(region)pairs.push({road:d,b:e,region,kind:'driveway-native-volume'});}
for(const lot of lots)for(const tree of trees){const region=intersection(sourceEntityLayout(lot).bounds,sourceEntityLayout(tree).bounds);if(region)pairs.push({a:lot,b:tree,region,kind:'lot-tree-native'});}
for(const car of cars)for(const tree of trees){const region=intersection(sourceEntityLayout(car).bounds,sourceEntityLayout(tree).bounds);if(region)pairs.push({a:car,b:tree,region,kind:'car-tree-native'});}
for(const lot of lots)for(const road of roads){const region=intersection(sourceEntityLayout(lot).bounds,boundsForRoad(road));if(region)pairs.push({a:lot,road,region,kind:'lot-main-shoulder'});}
const requested=pairs.flatMap(p=>[p.a,p.b].filter(Boolean)).concat(cars,trees);
await preloadDesignViews(requested.map(e=>({id:e.design.assetId,direction:e.design.direction||'front'})),url=>loadImage(resolve(root,url.replace(/^\//,''))));
const pixels=(e,r)=>{const c=createCanvas(r.width,r.height).getContext('2d');c.translate(-r.x,-r.y);assert.equal(drawSourceEntity(c,e),true,`native asset draw failed for ${e.id}`);return c.getImageData(0,0,r.width,r.height).data;};
const roadPixels=(road,r)=>{const c=createCanvas(r.width,r.height).getContext('2d');c.translate(-r.x,-r.y);c.beginPath();c.moveTo(...road.points[0]);for(const p of road.points.slice(1))c.lineTo(...p);c.lineWidth=road.width+2*(road.kind==='driveway'?road.sidewalk_width??10:map.design_source.sidewalk_width);c.lineCap=c.lineJoin='round';c.strokeStyle='#fff';c.stroke();return c.getImageData(0,0,r.width,r.height).data;};
const treeNativeCoverage=[];
for(const tree of trees){const b=sourceEntityLayout(tree).bounds,r={x:Math.floor(b.x),y:Math.floor(b.y),width:Math.ceil(b.x+b.width)-Math.floor(b.x),height:Math.ceil(b.y+b.height)-Math.floor(b.y)},a=pixels(tree,r);let opaque=0;for(let i=3;i<a.length;i+=4)if(a[i]>=160)opaque++;assert.ok(opaque>0,`tree rendered empty for ${tree.id}`);treeNativeCoverage.push({id:tree.id,opaquePixels:opaque});}
assert.equal(treeNativeCoverage.length,map.decor.trees.length,'all authored trees must be natively rendered during audit');
const opaqueOverlaps=[];
for(const pair of pairs){const a=pair.a?pixels(pair.a,pair.region):roadPixels(pair.road,pair.region),b=pair.b?pixels(pair.b,pair.region):roadPixels(pair.road,pair.region);let count=0;for(let i=3;i<a.length;i+=4)if(a[i]>=160&&b[i]>=160)count++;if(count)opaqueOverlaps.push({kind:pair.kind,a:pair.a?.id||pair.road.id,b:pair.b?.id||pair.road.id,pixels:count,region:pair.region,aDepth:pair.a?sourceEntityLayout(pair.a).depth:null,bDepth:pair.b?sourceEntityLayout(pair.b).depth:null,bDrawnAboveA:pair.a&&pair.b?sourceEntityLayout(pair.b).depth>=sourceEntityLayout(pair.a).depth:true});}
const carProblems=[],lotProblems=[],driveProblems=[];
for(const lot of lots){const box=sourceEntityLayout(lot).bounds;if(!contains({x:map.walkable.left,y:map.walkable.top,width:map.walkable.right-map.walkable.left,height:map.walkable.bottom-map.walkable.top},box,14))lotProblems.push({id:lot.id,reason:'lot-outside-walking-bounds',box});let wet=0;for(let x=box.x;x<box.x+box.width;x+=8)for(let y=box.y;y<box.y+box.height;y+=8)if(lakeContains(map.lake,{x,y}))wet++;if(wet)lotProblems.push({id:lot.id,reason:'wet-lot',samples:wet});
 for(const b of buildings.filter(b=>b.id.startsWith('base-')))for(let exterior_style=0;exterior_style<6;exterior_style++){const v=sourceBuildingLayout(b,{exterior_style}).bounds;if(overlap(box,v))lotProblems.push({id:lot.id,reason:'future-base-facade-envelope',building:b.id,exterior_style});}
}
for(const car of cars){const lot=lots.find(p=>p.id===car.parking_id),slot=lot?.native_slots?.find(p=>p.id===car.slot_id),box=sourceEntityLayout(car).bounds;if(!slot||!contains(slot.bounds,box,4))carProblems.push({id:car.id,reason:'car-outside-native-slot',lot:lot?.id,slot:slot?.id,box,slotBounds:slot?.bounds});if(cars.some(c=>c!==car&&c.parking_id===car.parking_id&&c.slot_id===car.slot_id))carProblems.push({id:car.id,reason:'duplicate-slot'});}
for(const lot of lots){const d=drives.find(r=>r.id===lot.driveway_id);if(!d){driveProblems.push({id:lot.id,reason:'missing-driveway'});continue;}const box=sourceEntityLayout(lot).destination,scale=box.width/664,expected={x:box.x+(384-53)*scale,y:box.y+(458-16)*scale};if(Math.hypot(d.points[0][0]-expected.x,d.points[0][1]-expected.y)>.03)driveProblems.push({id:d.id,reason:'not-native-bottom-opening',expected,actual:d.points[0]});const street=roads.find(r=>r.id===d.connection?.road_id),last=d.points.at(-1);if(!street||!street.points.slice(1).some((p,i)=>pointDistance(last,street.points[i],p)<=street.width/2+.02))driveProblems.push({id:d.id,reason:'driveway-does-not-reach-connected-main-street',street:d.connection?.road_id});if(d.width+2*d.sidewalk_width>134*scale+1)driveProblems.push({id:d.id,reason:'native-entrance-too-narrow',paintWidth:d.width+2*d.sidewalk_width,opening:134*scale});let wet=0;for(let i=1;i<d.points.length;i++){const a=d.points[i-1],b=d.points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),normal=[-(b[1]-a[1])/len,(b[0]-a[0])/len],reach=d.width/2+d.sidewalk_width;for(let k=0;k<=Math.ceil(len/10);k++){const t=k/Math.ceil(len/10);for(let off=-reach;off<=reach;off+=10){const p={x:a[0]+(b[0]-a[0])*t+normal[0]*off,y:a[1]+(b[1]-a[1])*t+normal[1]*off};if(lakeContains(map.lake,p))wet++;}}}if(wet)driveProblems.push({id:d.id,reason:'wet-driveway-width',samples:wet});}
const finalSHA=createHash('sha256').update(readFileSync(`${root}/web/world-map.json`)).digest('hex');
const report={audit_version:2,method:{renderer:'drawSourceEntity + preloadDesignViews',canvas:'@napi-rs/canvas',opaque_alpha_minimum:160,tree_selection:'membership in map.decor.trees'},map_sha:mapSHA,final_map_sha:finalSHA,snapshot_stable:mapSHA===finalSHA,schema:map.schema_version,counts:{lots:lots.length,cars:cars.length,driveways:drives.length,mapTrees:map.decor.trees.length,sceneTrees:trees.length,nativelyRenderedTrees:treeNativeCoverage.length,lamps:map.decor.lamps.length,pairs:pairs.length,treePairCandidates:pairs.filter(p=>treeSet.has(p.b)).length},lotProblems,carProblems,driveProblems,opaqueOverlaps};
const json=JSON.stringify(report,null,2)+'\n';
console.log(json.trimEnd());
assert.equal(mapSHA,finalSHA,'map changed during native audit; report applies only to captured map_sha');
assert.deepEqual(lotProblems,[],'parking bounds, water or future facade conflicts');
assert.deepEqual(carProblems,[],'cars must occupy unique native bays');
assert.deepEqual(driveProblems,[],'driveways must fit the native entrance and reach the main street on dry ground');
assert.deepEqual(opaqueOverlaps,[],'native parking, car or driveway paint overlaps another opaque object');
// Persist evidence only after all assertions, never replace a verified report
// with a failed or moving snapshot. Output paths are relative to this repo.
if(output){const path=resolve(root,output);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,json);}
