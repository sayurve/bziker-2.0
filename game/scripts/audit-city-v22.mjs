import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEntityLayout,sourceBuildingLayout,drawSourceEntity} from '../web/source-city.js';
import {preloadDesignViews,resolveDesignAsset,designData} from '../web/design-assets.js';
import {citySceneEntities} from '../web/city-scene.js';
import {lakeContains} from '../web/water.js';
import {avatarGeometry} from '../web/avatar.js';
import {cityPhysicalObstacles} from '../web/city-collision.js';

// Independent evidence for the authored scene. Bounding boxes only select
// candidates; the real native PNG alpha determines sprite-paint conflicts.
// Ground parking rectangles are fully painted surfaces, not stretched PNGs.
const root=fileURLToPath(new URL('../',import.meta.url));
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const raw=readFileSync(resolve(root,'web/world-map.json')),map=JSON.parse(raw);
const mapSHA=createHash('sha256').update(raw).digest('hex'),args=process.argv.slice(2);
const option=name=>{const index=args.indexOf(name);if(index<0)return null;assert.ok(args[index+1]&&!args[index+1].startsWith('--'),`${name} requires a value`);return args[index+1];};
const expectedSHA=option('--expected-map-sha'),output=option('--output');
if(expectedSHA)assert.equal(mapSHA,expectedSHA,'audit is not using the requested map snapshot');
assert.ok(map.schema_version>=22,'modular parking audit requires city22 or newer');
const lots=map.scene_objects.filter(n=>n.kind==='parking'),cars=map.scene_objects.filter(n=>n.kind==='car');
const buildings=[...map.buildings,...map.district.buildings,...map.background_buildings];
const scene=citySceneEntities(map,{privateBases:true}),treeSet=new Set(map.decor.trees);
const trees=scene.filter(entity=>treeSet.has(entity)),native=scene.filter(entity=>sourceEntityLayout(entity));
const drives=map.roads.filter(n=>n.kind==='driveway'),roads=map.roads.filter(n=>n.kind==='road');
assert.equal(trees.length,map.decor.trees.length,'scene omitted an authored tree species');
assert.equal(new Set(trees).size,trees.length,'scene contains duplicate tree instances');
assert.ok(lots.length>0&&cars.length>0&&trees.length>0,'audit cannot pass with empty scene groups');
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const contains=(a,b,pad=0)=>b.x>=a.x+pad-.03&&b.y>=a.y+pad-.03&&b.x+b.width<=a.x+a.width-pad+.03&&b.y+b.height<=a.y+a.height-pad+.03;
const intersection=(a,b)=>{
 const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),right=Math.min(a.x+a.width,b.x+b.width),bottom=Math.min(a.y+a.height,b.y+b.height);
 return right>x&&bottom>y?{x:Math.floor(x),y:Math.floor(y),width:Math.ceil(right)-Math.floor(x),height:Math.ceil(bottom)-Math.floor(y)}:null;
};
const lotBounds=lot=>({x:lot.x,y:lot.y,width:lot.width,height:lot.height});
const roadReach=road=>road.width/2+(road.kind==='road'?map.design_source.sidewalk_width:road.kind==='driveway'?road.sidewalk_width??8:4);
const roadBounds=road=>{const reach=roadReach(road),xs=road.points.map(p=>p[0]),ys=road.points.map(p=>p[1]);return {x:Math.min(...xs)-reach,y:Math.min(...ys)-reach,width:Math.max(...xs)-Math.min(...xs)+reach*2,height:Math.max(...ys)-Math.min(...ys)+reach*2};};
const pointDistance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
const pixels=(entity,region)=>{
 const c=createCanvas(region.width,region.height).getContext('2d');c.translate(-region.x,-region.y);
 assert.equal(drawSourceEntity(c,entity),true,`native drawing failed for ${entity.id}`);
 return c.getImageData(0,0,region.width,region.height).data;
};
const rectPixels=(box,region)=>{const c=createCanvas(region.width,region.height).getContext('2d');c.fillStyle='#fff';c.fillRect(Math.round(box.x)-region.x,Math.round(box.y)-region.y,box.width,box.height);return c.getImageData(0,0,region.width,region.height).data;};
const roadPixels=(road,region)=>{
 const c=createCanvas(region.width,region.height).getContext('2d');c.translate(-region.x,-region.y);
 c.beginPath();c.moveTo(...road.points[0]);for(const point of road.points.slice(1))c.lineTo(...point);
 c.lineWidth=roadReach(road)*2;c.lineCap=c.lineJoin='round';c.strokeStyle='#fff';c.stroke();
 return c.getImageData(0,0,region.width,region.height).data;
};
const parkingPiecePixels=(node,region)=>{
 const p=node.entity,c=createCanvas(region.width,region.height).getContext('2d');c.fillStyle='#fff';
 c.fillRect(Math.round(p.x)-region.x,Math.round(p.y)-region.y,p.width,p.height);
 c.fillRect(Math.round(p.x+(node.pieceType==='bumper'?2:0))-region.x,Math.round(p.y+(node.pieceType==='bumper'?3:4))-region.y,p.width,p.height);
 return c.getImageData(0,0,region.width,region.height).data;
};
const dataFor=(node,region)=>node.type==='road'?roadPixels(node.entity,region):node.type==='rectangle'?rectPixels(node.bounds,region):node.type==='parking-piece'?parkingPiecePixels(node,region):pixels(node.entity,region);
const sprite=entity=>({type:'sprite',id:entity.id,entity,bounds:sourceEntityLayout(entity).bounds});
const lotNode=lot=>({type:'rectangle',id:lot.id,entity:lot,bounds:lotBounds(lot)});
const roadNode=road=>({type:'road',id:road.id,entity:road,bounds:roadBounds(road)});
const lotProblems=[],carProblems=[],driveProblems=[],supportProblems=[],landscapeProblems=[],pedestrianProblems=[],assignmentProblems=[];
const fieldBounds={x:map.walkable.left,y:map.walkable.top,width:map.walkable.right-map.walkable.left,height:map.walkable.bottom-map.walkable.top};
const wetSamples=box=>{let wet=0;for(let x=box.x;x<=box.x+box.width;x+=8)for(let y=box.y;y<=box.y+box.height;y+=8)if(lakeContains(map.lake,{x,y}))wet++;return wet;};
const physicalRect=entity=>entity.footprint||(['x','y','width','height'].every(k=>Number.isFinite(entity[k]))?{x:entity.x,y:entity.y,width:entity.width,height:entity.height}:null);
const physicalObstacles=cityPhysicalObstacles(map);
const rectGap=(point,box)=>Math.hypot(Math.max(box.x-point[0],0,point[0]-box.x-box.width),Math.max(box.y-point[1],0,point[1]-box.y-box.height));
const physicalProblemsAt=(point,pad=14)=>{
 const reasons=[];
 if(point[0]<map.walkable.left+pad||point[0]>map.walkable.right-pad||point[1]<map.walkable.top+pad||point[1]>map.walkable.bottom-pad)reasons.push('outside-walking-bounds');
 if(lakeContains(map.lake,{x:point[0],y:point[1]},-pad))reasons.push('water');
 for(const obstacle of physicalObstacles)if(rectGap(point,obstacle)<pad-.03)reasons.push(obstacle.id);
 return reasons;
};
const routeLength=points=>points.slice(1).reduce((sum,point,index)=>sum+Math.hypot(point[0]-points[index][0],point[1]-points[index][1]),0);
const validPath=points=>Array.isArray(points)&&points.length>=2&&points.every(point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite));
const samePoint=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&Math.hypot(a[0]-b[0],a[1]-b[1])<=.03;
const checkPhysicalWalk=(points,id,problems,pad=14)=>{
 if(!validPath(points)){problems.push({id,reason:'walking-path-is-missing-or-has-invalid-coordinates'});return;}
 for(let index=1;index<points.length;index++){
  const a=points[index-1],b=points[index],samples=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/6));
  for(let k=0;k<=samples;k++){
   const point=[a[0]+(b[0]-a[0])*k/samples,a[1]+(b[1]-a[1])*k/samples],obstacles=physicalProblemsAt(point,pad);
   if(obstacles.length){problems.push({id,reason:'physical-walking-route-is-blocked',point,obstacles});return;}
  }
 }
};
for(const lot of lots){
 const box=lotBounds(lot),slots=lot.slots,rows=lot.ground?.rows,banks=lot.ground?.banks;
 if(lot.parking_layout!=='modular'||lot.design?.assetId)lotProblems.push({id:lot.id,reason:'parking-uses-a-whole-scene-PNG'});
 if(!contains(fieldBounds,box,14))lotProblems.push({id:lot.id,reason:'parcel-outside-walking-bounds',bounds:box});
 const courtyard=map.schema_version>=23&&lot.residential_courtyard===true;
 if(![1,2].includes(banks)||!(courtyard?rows===1&&banks===1:[2,3].includes(rows))||box.width!==48+240*banks+180||box.height!==48+120*rows)lotProblems.push({id:lot.id,reason:'incorrect-human-scale-parcel',bounds:box,rows,banks});
 if(courtyard&&(!lot.courtyard_for?.length||lot.courtyard_for.some(id=>!buildings.some(b=>b.id===id))))lotProblems.push({id:lot.id,reason:'local-courtyard-has-no-real-resident-addresses'});
 const wet=wetSamples(box);if(wet)lotProblems.push({id:lot.id,reason:'wet-parking-ground',samples:wet});
 if(slots?.length!==rows*banks)lotProblems.push({id:lot.id,reason:'bay-count-does-not-match-authored-banks-and-rows',actual:slots?.length,rows,banks});
 for(const [index,slot] of (slots||[]).entries()){
  const expected={x:box.x+24+420*Math.floor(index/rows),y:box.y+24+120*(index%rows),width:240,height:120};
  if(!contains(box,slot.bounds)||Object.keys(expected).some(key=>Math.abs(slot.bounds[key]-expected[key])>.03))lotProblems.push({id:lot.id,reason:'misaligned-bay',slot:slot.id,expected,actual:slot.bounds});
 }
 if(JSON.stringify(lot.native_slots)!==JSON.stringify(slots))lotProblems.push({id:lot.id,reason:'public-bay-alias-does-not-match-rendered-slots'});
 const parked=cars.filter(car=>car.parking_id===lot.id);
 if(courtyard?parked.length!==0:!parked.length||parked.length>=slots?.length)lotProblems.push({id:lot.id,reason:courtyard?'local-resident-bay-is-not-available':'parking-needs-both-cars-and-available-spaces',cars:parked.length});
 for(const piece of [...(lot.borders||[]),...(lot.bumpers||[])]){
  const support=map.solids.find(solid=>solid.id===piece.id);
  if(!support||['x','y','width','height'].some(key=>support[key]!==piece[key]))supportProblems.push({id:piece.id,reason:'rendered-solid-has-no-matching-collision',parking:lot.id});
  if(!contains(box,piece))supportProblems.push({id:piece.id,reason:'parking-piece-outside-ground',parking:lot.id});
 }
}
const carScale=[],avatarHeight=avatarGeometry.height*(avatarGeometry.worldScale??1.25);
for(const car of cars){
 const layout=sourceEntityLayout(car),lot=lots.find(n=>n.id===car.parking_id),slot=lot?.slots?.find(n=>n.id===car.slot_id);
 if(!layout){carProblems.push({id:car.id,reason:'missing-native-view'});continue;}
 const asset=resolveDesignAsset(car.design.assetId,car.design.direction),box=layout.bounds;
 const family=designData.assets[car.design.assetId];
 if(!['left','right'].includes(car.design.direction)||!family?.views?.[car.design.direction]||!asset?.url||family.views.left?.url===family.views.right?.url)carProblems.push({id:car.id,reason:'car-does-not-use-a-genuine-horizontal-view'});
 if(car.design.rotation||car.design.mirror||car.design.flipX)carProblems.push({id:car.id,reason:'flat-transform-instead-of-native-view'});
 if(box.width<174.99||box.width>205.01)carProblems.push({id:car.id,reason:'miniature-or-oversized-car',actualWidth:box.width});
 if(!slot||!contains(slot.bounds,box,8))carProblems.push({id:car.id,reason:'car-paint-crosses-the-bay',bounds:box,lot:lot?.id,slot:slot?.id,slotBounds:slot?.bounds});
 if(cars.some(n=>n!==car&&n.parking_id===car.parking_id&&n.slot_id===car.slot_id))carProblems.push({id:car.id,reason:'two-cars-share-a-bay'});
 if(!car.footprint||!contains(box,car.footprint))carProblems.push({id:car.id,reason:'physical-body-does-not-fit-native-paint',bounds:box,footprint:car.footprint});
 const wet=wetSamples(box);if(wet)carProblems.push({id:car.id,reason:'wet-car',samples:wet});
 carScale.push({id:car.id,asset:car.design.assetId,direction:car.design.direction,worldWidth:box.width,worldHeight:box.height,characterFrameHeight:avatarHeight,lengthToCharacterHeight:box.width/avatarHeight});
}
for(const lot of lots){
 const drive=drives.find(n=>n.id===lot.driveway_id);
 if(!drive){driveProblems.push({id:lot.id,reason:'no-driveway'});continue;}
 const side=lot.entry?.edge,expected={x:lot.x+354,y:lot.y+(side==='top'?0:lot.height)},entry=lot.entry?.point;
 if(!['top','bottom'].includes(side)||!entry||Math.hypot(entry.x-expected.x,entry.y-expected.y)>.03||Math.hypot(drive.points[0][0]-expected.x,drive.points[0][1]-expected.y)>.03)driveProblems.push({id:drive.id,reason:'driveway-is-not-in-the-authored-aisle-opening',side,expected,entry,actual:drive.points[0]});
 if(lot.entry?.width!==180||roadReach(drive)*2>lot.entry.width+.03)driveProblems.push({id:drive.id,reason:'driveway-crosses-the-parking-curb',paintWidth:roadReach(drive)*2,opening:lot.entry?.width});
 const street=roads.find(n=>n.id===drive.connection?.road_id),last=drive.points.at(-1);
 if(!street||!street.points.slice(1).some((point,index)=>pointDistance(last,street.points[index],point)<=street.width/2+.03))driveProblems.push({id:drive.id,reason:'driveway-is-not-connected-to-a-real-street',street:drive.connection?.road_id});
 let length=0,wet=0;
 for(let index=1;index<drive.points.length;index++){
  const a=drive.points[index-1],b=drive.points[index],span=Math.hypot(b[0]-a[0],b[1]-a[1]),normal=[-(b[1]-a[1])/(span||1),(b[0]-a[0])/(span||1)],samples=Math.max(1,Math.ceil(span/8));length+=span;
  for(let k=0;k<=samples;k++)for(let offset=-roadReach(drive);offset<=roadReach(drive);offset+=8){const p={x:a[0]+(b[0]-a[0])*k/samples+normal[0]*offset,y:a[1]+(b[1]-a[1])*k/samples+normal[1]*offset};if(lakeContains(map.lake,p))wet++;}
 }
 const limit=lot.residential_courtyard&&['parking-local-terrace','parking-local-apartment-3'].includes(lot.id)?900:650;
 if(length>=limit)driveProblems.push({id:drive.id,reason:'driveway-detours-across-the-block',length,limit});
 if(wet)driveProblems.push({id:drive.id,reason:'wet-full-driveway-width',samples:wet});
}
const pedestrianWalks=[],entryIndex=new Map(),walkingAssignments=[];
const entryFrame=(lot,entry)=>{
 const p=entry.point,edge=entry.edge;
 if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
 if(edge==='top')return {point:[p.x,p.y],boundary:lot.y,coordinate:p.y,tangent:[1,0],normal:[0,-1],along:p.x,min:lot.x,max:lot.x+lot.width};
 if(edge==='bottom')return {point:[p.x,p.y],boundary:lot.y+lot.height,coordinate:p.y,tangent:[1,0],normal:[0,1],along:p.x,min:lot.x,max:lot.x+lot.width};
 if(edge==='left')return {point:[p.x,p.y],boundary:lot.x,coordinate:p.x,tangent:[0,1],normal:[-1,0],along:p.y,min:lot.y,max:lot.y+lot.height};
 if(edge==='right')return {point:[p.x,p.y],boundary:lot.x+lot.width,coordinate:p.x,tangent:[0,1],normal:[1,0],along:p.y,min:lot.y,max:lot.y+lot.height};
 return null;
};
for(const lot of lots){
 const vehicleId=`${lot.id}-vehicle-entry`;
 entryIndex.set(vehicleId,{lot,type:'vehicle',point:lot.entry?.point});
 if(!Array.isArray(lot.pedestrian_entries)||lot.pedestrian_entries.length===0){pedestrianProblems.push({id:lot.id,reason:'pedestrian-entrance-list-is-missing-or-empty'});continue;}
 for(const entry of lot.pedestrian_entries){
  if(!entry.id||entryIndex.has(entry.id)){pedestrianProblems.push({id:entry.id||lot.id,reason:'pedestrian-entrance-id-is-missing-or-duplicated'});continue;}
  entryIndex.set(entry.id,{lot,type:'pedestrian',point:entry.point});
  const frame=entryFrame(lot,entry);
  if(!frame||entry.width!==60||Math.abs(frame.coordinate-frame.boundary)>.03||frame.along<frame.min+30||frame.along>frame.max-30){pedestrianProblems.push({id:entry.id,reason:'pedestrian-mouth-is-not-a-real-sixty-pixel-boundary-opening',entry});continue;}
  // A complete 60px opening must leave a 14px-radius character clear, including
  // both extremes of its permitted centre position and the physical curb depth.
  let blockedMouth=null;
  for(const along of [-16,-8,0,8,16])for(let across=-30;across<=30;across+=5){
   const point=[frame.point[0]+frame.tangent[0]*along+frame.normal[0]*across,frame.point[1]+frame.tangent[1]*along+frame.normal[1]*across],obstacles=physicalProblemsAt(point,14);
   if(obstacles.length&&!blockedMouth)blockedMouth={point,obstacles};
  }
  if(blockedMouth)pedestrianProblems.push({id:entry.id,reason:'pedestrian-mouth-curb-or-nearby-body-is-uncut',...blockedMouth});
  const walkway=map.roads.find(road=>road.id===entry.path_id);
  if(!walkway||walkway.kind!=='walkway'||walkway.width!==40||!validPath(walkway.points)||JSON.stringify(walkway.points)!==JSON.stringify(entry.path)||!samePoint(walkway.points?.[0],frame.point)){
   pedestrianProblems.push({id:entry.id,reason:'pedestrian-entry-has-no-matching-real-forty-pixel-walkway',path_id:entry.path_id});continue;
  }
  if(pedestrianWalks.some(road=>road.id===walkway.id))pedestrianProblems.push({id:entry.id,reason:'different-entrances-reuse-one-walkway',path_id:entry.path_id});
  pedestrianWalks.push(walkway);checkPhysicalWalk(walkway.points,entry.id,pedestrianProblems);
  const linked=map.roads.find(road=>road.id===entry.connection?.road_id),last=walkway.points.at(-1);
  const linkReach=linked?.width/2+(linked?.kind==='road'?map.design_source.sidewalk_width:linked?.kind==='driveway'?linked.sidewalk_width??8:4);
  if(!linked||linked.id===walkway.id||!linked.points.slice(1).some((point,index)=>pointDistance(last,linked.points[index],point)<=linkReach+.03))pedestrianProblems.push({id:entry.id,reason:'pedestrian-walkway-is-not-linked-to-its-authored-pavement',road_id:entry.connection?.road_id,last});
 }
}
assert.ok(pedestrianWalks.length>0,'city22 pedestrian audit cannot pass without any real pedestrian walkway');
const pavedPoint=point=>map.roads.some(road=>road.points.slice(1).some((end,index)=>pointDistance(point,road.points[index],end)<=roadReach(road)+.03))||lots.some(lot=>point[0]>=lot.x-.03&&point[0]<=lot.x+lot.width+.03&&point[1]>=lot.y-.03&&point[1]<=lot.y+lot.height+.03);
for(const frontage of map.architecture?.frontages||[]){
 const assignment=frontage.parking,lot=lots.find(lot=>lot.id===assignment?.scene_id),entry=entryIndex.get(assignment?.entry_id),building=buildings.find(building=>building.id===frontage.building_id),route=assignment?.access_path;
 if(!lot||!entry||entry.lot!==lot||assignment.entry_type!==entry.type){assignmentProblems.push({id:frontage.building_id,reason:'parking-assignment-names-no-real-vehicle-or-pedestrian-entrance',scene_id:assignment?.scene_id,entry_id:assignment?.entry_id,entry_type:assignment?.entry_type});continue;}
 const target=[entry.point?.x,entry.point?.y],start=[building?.door?.x,building?.door?.y+24];
 if(!samePoint(route?.[0],start)||!samePoint(route?.at(-1),target))assignmentProblems.push({id:frontage.building_id,reason:'parking-walk-does-not-connect-the-real-door-and-selected-opening',expectedStart:start,actualStart:route?.[0],expectedEnd:target,actualEnd:route?.at(-1)});
 if(!validPath(route)){assignmentProblems.push({id:frontage.building_id,reason:'parking-assignment-has-no-valid-real-path'});continue;}
 const measured=routeLength(route);
 if(map.schema_version>=23&&measured>1250)assignmentProblems.push({id:frontage.building_id,reason:'nearby-parking-requires-a-long-neighbourhood-detour',measuredWorldDistance:measured});
 if(!Number.isFinite(assignment.walking_distance)||Math.abs(assignment.walking_distance-measured)>.002)assignmentProblems.push({id:frontage.building_id,reason:'saved-walking-distance-is-not-measured-from-the-actual-route',saved:assignment.walking_distance,measured});
 const courtyard=map.schema_version>=23&&lot.residential_courtyard===true,shared=courtyard?lot.courtyard_for.length>1:true;
 if(assignment.shared!==shared||courtyard&&!lot.courtyard_for.includes(frontage.building_id)||assignment.spaces!==lot.slots.length||['x','y','width','height'].some(key=>Math.abs(assignment[key]-lot[key])>.03))assignmentProblems.push({id:frontage.building_id,reason:'assignment-advertises-a-fake-parking-parcel'});
 const doorToLot=Math.hypot(Math.max(lot.x-building.door.x,0,building.door.x-lot.x-lot.width),Math.max(lot.y-building.door.y,0,building.door.y-lot.y-lot.height)),directEntryDistance=Math.hypot(start[0]-target[0],start[1]-target[1]);
 if(map.schema_version>=23&&doorToLot>500)assignmentProblems.push({id:frontage.building_id,reason:'parking-is-detached-from-its-resident-address',doorToLot,directEntryDistance});
 checkPhysicalWalk(route,`parking-assignment-${frontage.building_id}`,assignmentProblems);
 let offPavement=null;
 for(let index=1;index<route.length;index++){
  const a=route[index-1],b=route[index],samples=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/6));
  for(let k=0;k<=samples;k++){const point=[a[0]+(b[0]-a[0])*k/samples,a[1]+(b[1]-a[1])*k/samples];if(!pavedPoint(point)&&!offPavement)offPavement=point;}
 }
 if(offPavement)assignmentProblems.push({id:frontage.building_id,reason:'parking-walk-shortcuts-through-unpaved-landscape',point:offPavement});
 walkingAssignments.push({building_id:frontage.building_id,parking_id:lot.id,entry_id:assignment.entry_id,entry_type:entry.type,doorToLot,directEntryDistance,measuredWorldDistance:measured,savedWorldDistance:assignment.walking_distance,points:route.length});
}
if(walkingAssignments.length!==(map.architecture?.frontages||[]).length)assignmentProblems.push({reason:'some-authored-addresses-have-no-measured-parking-assignment',frontages:map.architecture?.frontages?.length,measuredAssignments:walkingAssignments.length});
// Physical supports must stay on dry ground. A tree's transparent crown is
// never promoted into a rectangular obstacle. Every tree is still rendered
// below to prove the species-independent audit did not silently omit it.
for(const entity of [...buildings,...trees]){
 const support=physicalRect(entity);if(!support)continue;
 const wet=wetSamples(support);if(wet)landscapeProblems.push({id:entity.id,reason:'wet-building-or-tree-support',samples:wet});
}
const facadeNodes=buildings.flatMap(building=>{
 if(!building.id.startsWith('base-'))return [sprite(building)];
 return Array.from({length:6},(_,exterior_style)=>{
  const layout=sourceBuildingLayout(building,{exterior_style});assert.ok(layout,`missing future base view ${building.id}:${exterior_style}`);
  const entity={...building,id:`${building.id}:style-${exterior_style}`,design:{...building.design,assetId:layout.assetId,x:layout.anchor.x,y:layout.anchor.y,width:layout.width,height:layout.height,anchorX:layout.anchorX,anchorY:layout.anchorY,direction:layout.direction,crop:layout.crop}};
  return sprite(entity);
 });
});
const lotNodes=lots.map(lotNode),carNodes=cars.map(sprite),treeNodes=trees.map(sprite),lampNodes=map.decor.lamps.map(sprite),planterNodes=native.filter(entity=>['planter','flowerbed'].includes(entity.kind)).map(sprite),driveNodes=drives.map(roadNode),streetNodes=roads.map(roadNode),pedestrianNodes=pedestrianWalks.map(roadNode),pairs=[];
const addPairs=(left,right,kind,except=()=>false)=>{for(const a of left)for(const b of right){if(except(a,b))continue;const region=intersection(a.bounds,b.bounds);if(region)pairs.push({a,b,region,kind});}};
addPairs(lotNodes,facadeNodes,'parking-facade');
addPairs(lotNodes,treeNodes,'parking-crown');
addPairs(lotNodes,lampNodes,'parking-lamp');
addPairs(carNodes,lampNodes,'car-lamp');
addPairs(carNodes,treeNodes,'car-crown');
addPairs(carNodes,facadeNodes,'car-facade');
addPairs(driveNodes,treeNodes,'driveway-crown');
addPairs(driveNodes,facadeNodes,'driveway-facade');
addPairs(pedestrianNodes,facadeNodes,'pedestrian-walkway-facade');
addPairs(pedestrianNodes,treeNodes,'pedestrian-walkway-crown');
addPairs(pedestrianNodes,planterNodes,'pedestrian-walkway-planter');
addPairs(pedestrianNodes,carNodes,'pedestrian-walkway-car');
addPairs(lotNodes,streetNodes,'parking-main-road-and-sidewalk');
addPairs(lotNodes,driveNodes,'parking-foreign-driveway',(lot,drive)=>lot.entity.driveway_id===drive.entity.id);
addPairs(carNodes,driveNodes,'car-driveway');
const collisionNodes=lots.flatMap(lot=>[
 ...(lot.borders||[]).map(piece=>({type:'parking-piece',pieceType:'curb',id:piece.id,entity:piece,bounds:{x:piece.x,y:piece.y,width:piece.width,height:piece.height+4}})),
 ...(lot.bumpers||[]).map(piece=>({type:'parking-piece',pieceType:'bumper',id:piece.id,entity:piece,bounds:{x:piece.x,y:piece.y,width:piece.width+2,height:piece.height+3}})),
]);
addPairs(driveNodes,collisionNodes,'driveway-parking-curb-or-bumper');
addPairs(pedestrianNodes,collisionNodes,'pedestrian-walkway-parking-curb-or-bumper');
addPairs(collisionNodes,facadeNodes,'parking-curb-or-bumper-facade');
addPairs(collisionNodes,treeNodes,'parking-curb-or-bumper-crown');
addPairs(collisionNodes,carNodes,'parking-curb-or-bumper-car');
const requested=new Map(native.map(entity=>[entity.id,entity]));
for(const {a,b} of pairs)for(const node of [a,b])if(node.type==='sprite')requested.set(node.id,node.entity);
const loaded=await preloadDesignViews([...requested.values()].map(entity=>({id:entity.design.assetId,direction:entity.design.direction||'front'})),url=>loadImage(resolve(root,url.replace(/^\//,''))));
assert.ok(loaded.every(Boolean),'at least one native asset failed to decode');
const carNativeCoverage=[];
for(const car of cars){
 const bounds=sourceEntityLayout(car)?.bounds;assert.ok(bounds,`no native layout for ${car.id}`);
 const region={x:Math.floor(bounds.x),y:Math.floor(bounds.y),width:Math.ceil(bounds.x+bounds.width)-Math.floor(bounds.x),height:Math.ceil(bounds.y+bounds.height)-Math.floor(bounds.y)};
 const paint=pixels(car,region);let opaque=0,left=region.width,right=-1,top=region.height,bottom=-1;
 for(let index=3;index<paint.length;index+=4)if(paint[index]>=160){const pixel=(index-3)/4,x=pixel%region.width,y=Math.floor(pixel/region.width);opaque++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 assert.ok(opaque>0,`car ${car.id} rendered empty`);
 carNativeCoverage.push({id:car.id,opaquePixels:opaque,opaquePaintBounds:{x:region.x+left,y:region.y+top,width:right-left+1,height:bottom-top+1}});
}
const treeNativeCoverage=[];
for(const tree of trees){
 const bounds=sourceEntityLayout(tree)?.bounds;assert.ok(bounds,`no native layout for ${tree.id}`);
 const region={x:Math.floor(bounds.x),y:Math.floor(bounds.y),width:Math.ceil(bounds.x+bounds.width)-Math.floor(bounds.x),height:Math.ceil(bounds.y+bounds.height)-Math.floor(bounds.y)};
 const paint=pixels(tree,region);let opaque=0;for(let index=3;index<paint.length;index+=4)if(paint[index]>=160)opaque++;
 assert.ok(opaque>0,`tree ${tree.id} rendered empty`);treeNativeCoverage.push({id:tree.id,opaquePixels:opaque});
}
assert.equal(treeNativeCoverage.length,map.decor.trees.length,'not all authored trees were actually drawn');
const opaqueOverlaps=[];
for(const pair of pairs){
 const a=dataFor(pair.a,pair.region),b=dataFor(pair.b,pair.region);let count=0;
 for(let index=3;index<a.length;index+=4)if(a[index]>=160&&b[index]>=160)count++;
 if(count)opaqueOverlaps.push({kind:pair.kind,a:pair.a.id,b:pair.b.id,pixels:count,region:pair.region});
}
const collisionData=JSON.parse(readFileSync(resolve(root,'web/city-collisions.json'))),collisionSHA=collisionData.map_sha256||collisionData.map_sha||collisionData.source_map_sha256;
const finalSHA=createHash('sha256').update(readFileSync(resolve(root,'web/world-map.json'))).digest('hex');
const walkingDistances=walkingAssignments.map(assignment=>assignment.measuredWorldDistance).sort((a,b)=>a-b),walkingCount=walkingDistances.length;
const walkingStats={unit:'world-pixels; not real-world metres',count:walkingCount,minimum:walkingDistances[0]??null,maximum:walkingDistances.at(-1)??null,mean:walkingCount?walkingDistances.reduce((sum,length)=>sum+length,0)/walkingCount:null,median:walkingCount?(walkingDistances[Math.floor((walkingCount-1)/2)]+walkingDistances[Math.floor(walkingCount/2)])/2:null,p95:walkingCount?walkingDistances[Math.ceil(walkingCount*.95)-1]:null,assignments:walkingAssignments};
const report={audit_version:2,method:{native_renderer:'drawSourceEntity + preloadDesignViews',ground:'fully painted modular parking rectangle and authored curb/bumpers',canvas:'@napi-rs/canvas',opaque_alpha_minimum:160,tree_selection:'membership in map.decor.trees',future_clan_facades:'all six independent native views per plot',baseline_character:'avatarGeometry.height × worldScale (default 1.25)',pedestrian_paint:'40px path + two4px curb edges; round joins/caps',pedestrian_clearance:'60px cut mouth sampled across its width and curb depth;14px character clearance',parking_assignment:'real building door+24 to the selected authored vehicle/pedestrian opening, physically clear and on painted pavement'},map_sha256:mapSHA,final_map_sha256:finalSHA,snapshot_stable:mapSHA===finalSHA,schema:map.schema_version,counts:{lots:lots.length,bays:lots.reduce((sum,lot)=>sum+(lot.slots?.length||0),0),cars:cars.length,nativelyRenderedCars:carNativeCoverage.length,emptyBays:lots.reduce((sum,lot)=>sum+(lot.slots?.length||0),0)-cars.length,driveways:drives.length,pedestrianEntries:lots.reduce((sum,lot)=>sum+(lot.pedestrian_entries?.length||0),0),pedestrianWalkways:pedestrianWalks.length,parkingAssignments:walkingAssignments.length,buildings:buildings.length,mapTrees:map.decor.trees.length,sceneTrees:trees.length,nativelyRenderedTrees:treeNativeCoverage.length,lamps:map.decor.lamps.length,pairCandidates:pairs.length,crownPairCandidates:pairs.filter(pair=>treeSet.has(pair.b.entity)).length},scale:{carLengthMinimum:Math.min(...carScale.map(car=>car.worldWidth)),carLengthMaximum:Math.max(...carScale.map(car=>car.worldWidth)),opaqueCarLengthMinimum:Math.min(...carNativeCoverage.map(car=>car.opaquePaintBounds.width)),opaqueCarLengthMaximum:Math.max(...carNativeCoverage.map(car=>car.opaquePaintBounds.width)),baselineCharacterHeight:avatarHeight,oldCity21CarLength:110,baySize:{width:240,height:120},lotSizes:lots.map(lot=>({id:lot.id,width:lot.width,height:lot.height,bays:lot.slots?.length})),cars:carScale,actualCarPaint:carNativeCoverage},walking:walkingStats,collision_map_sha256:collisionSHA,lotProblems,carProblems,driveProblems,supportProblems,landscapeProblems,pedestrianProblems,assignmentProblems,opaqueOverlaps};
console.log(JSON.stringify(report,null,2));
assert.equal(mapSHA,finalSHA,'map changed during audit; evidence only applies to the captured SHA');
assert.equal(collisionSHA,mapSHA,'collision export is not for this map snapshot');
for(const [name,problems] of Object.entries({lotProblems,carProblems,driveProblems,supportProblems,landscapeProblems,pedestrianProblems,assignmentProblems,opaqueOverlaps}))assert.deepEqual(problems,[],`city22 ${name}`);
// A failing or changing snapshot must never overwrite verified evidence.
if(output){const path=resolve(root,output);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n');}
