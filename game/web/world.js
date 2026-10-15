import * as avatar from './avatar.js';
import {sourceActorFrame,sourceAnimalFrame} from './source-actors.js';
import {sourceBinSlot,sourceEntityLayout} from './source-city.js';
import {interactionRadii} from './interaction-radii.js';
import {preloadDesignViews,drawDesignAsset} from './design-assets.js';
import {isExactSourceCity,drawExactSourceCity,preloadExactSourceCity,sourceCityExactObjects,sourceCityModuleObjects,sourceCityGroundObjects,sourceCityAssetIds,sourceClanHouseAssets,sourceBuildingLayout,sourceStreetLayout,drawSourceTree,drawSourceBench,drawSourceLamp,drawSourceFlowerbed,drawSourceBin,drawSourceApartment,drawSourceSmoking,sourceCityAreaLayouts,drawSourceCityArea,sourceParkedVehicleLayouts,drawSourceVehicle} from './source-city.js';
import {sourceInteriorSurfaceAssets,sourceInteriorPropLayout,drawSourceInteriorSurfaces,drawSourceFurniture,sourceInteriorDetailLayout,drawSourceInteriorDetail,preloadSourceInteriorRoom,isExactSourceInterior,drawExactSourceInteriorForeground} from './source-interiors.js';
import {sourceHudHTML,sourceControlsHTML,drawSourceJoystick,preloadSourceUI} from './source-ui.js';
import {preloadSourceWater,sourceBoatLayout,sourceDockLayout,sourceShoreLayouts,drawSourceShore,drawSourceLake} from './source-water.js';
import {preloadSourceHouseMaterials} from './source-house-materials.js';
import {preloadSupplementalEnvironment,supplementalEnvironmentLayouts,drawSupplementalEnvironment} from './supplemental-environment.js';
import {actionEffectState,actionFlight,drawActionFlight,drawWaterAction,preloadWaterActions} from './action-effects.js';
import {advanceWalkCycle,advancePetMotion} from './walk-cycle.js';
import {followPetPosition} from './pet-follow.js';
import {nearestFreeCityPoint,moveBetweenObstacles,createCityObstacleIndex,playerBodyRadius,segmentBoxDistance} from './city-collision.js';
import {worldCamera,worldViewportHeight,interiorCameraBounds} from './world-camera.js';
import {drawPublicBuilding,publicBuildingGeometry,publicBuildingLights,createCityArchitectureObjects,drawCityArchitectureGround} from './city-architecture.js';
import {streetDetailObjects} from './street-details.js';
import {createCityGroundPlan,drawCityGround,drawGroundPlanting,drawMiniMapGround} from './city-ground.js';
import {drawHouseCanvas,drawConstructionPlot} from './house-models.js';
import {lakeContains,pedestrianLakeContains,pedestrianSegmentCrossesLake as segmentCrossesLake,segmentStaysInLake,nearestShore,nearestPedestrianShore,movePedestrianPosition,moveBoatPosition,petEffectState,lakeBounds} from './water.js';
import {lakeWalkwayLayouts,drawLakeWalkway} from './lake-walkways.js';
import {nearestBoatAction,drawDock,drawBoat,drawAnimal} from './waterfront.js';
import {animalsAt,nearestAnimalAction,snapshotAnimalTime} from './ambient-animals.js';
import {drawInteriorGround,interiorObjects,interiorBlock,moveInteriorPosition,nearestInteriorAction,drawFurnitureVolume,drawFloorMaterial,drawInteriorMiniMap,interiorSeatedActor} from './interiors.js';
import {furnitureSeatVisualOffset,drawFacingFurnitureForeground} from './furniture-views.js';
import {fitFurniturePreview} from './furniture-preview.js';
import {PhaserWorldRenderer} from './phaser-world-renderer.js';
import {paintWorldFrame} from './phaser-scene-paint.js';
const {worldArenaLobby}=avatar;
let waterActionAssets;

async function readWorldData(name){const url=new URL(name,import.meta.url);if(typeof process!=='undefined'&&process.versions?.node){const {readFile}=await import('node:fs/promises');return JSON.parse(await readFile(url,'utf8'));}const response=await fetch(url);if(!response.ok)throw new Error('Не удалось загрузить схему города');return response.json();}
export const worldMap=await readWorldData('./world-map.json');
export const worldInteractionRadii=Object.freeze({...interactionRadii,...worldMap.interaction_radii});
export const worldGroundTileSpec=Object.freeze({worldSize:512,rasterSize:512,cacheLimit:12});
export const cityGroundPlan=createCityGroundPlan(worldMap);
export const furnitureCatalog=await readWorldData('./furniture-map.json');
export const worldSize=Object.freeze({width:worldMap.width,height:worldMap.height});
const W=worldSize.width,H=worldSize.height;
export const worldSpawn=Object.freeze({...worldMap.spawn});
export const worldBounds=Object.freeze({...worldMap.walkable});
export const basePalette=Object.freeze([...furnitureCatalog.palette]);
export const cityBuildings=Object.freeze(worldMap.buildings);
export const districtHouses=Object.freeze(worldMap.district.buildings);
export const worldBenches=Object.freeze(worldMap.benches);
export const smokingZone=Object.freeze(worldMap.smoking);
export const worldRoads=Object.freeze(worldMap.roads.map(r=>r.points));
export const travelDestinations=Object.freeze([
 {id:'station',label:'Вокзал',...worldMap.landmarks.station,kind:'arrival'},
 {id:'plaza',label:'Площадь Бзикера',...worldMap.landmarks.plaza,kind:'square'},
 {id:'district',label:'Клановый квартал',...worldMap.landmarks.district,kind:'clans'},
 {id:'base',label:'Моя база',kind:'base'},
 ...cityBuildings.filter(b=>b.id!=='railway').map(b=>({id:b.id,label:({'clans':'Дом кланов','arena':'Своя игра','profile':'Студия образов','results':'Галерея результатов','messages':'Кафе и сообщения','terrace':'Творческая гостиная','shop-food':'Продуктовый','shop-clothes':'Магазин одежды','shop-furniture':'Магазин мебели','casino':'Казино'})[b.id],x:b.door.x,y:b.door.y+24,kind:b.id})),
 {id:'smoking',label:'Курилка',...worldMap.landmarks.smoking,kind:'social'},
 {id:'park',label:'Парк у озера',...worldMap.landmarks.park,kind:'park'},
 {id:'dock',label:'Причал',...worldMap.landmarks.dock,kind:'waterfront'}
]);
const furniture=Object.fromEntries(furnitureCatalog.types.map(t=>[t.id,t.label]));
const entrances=[...cityBuildings.filter(b=>b.door).map(b=>({id:b.id,...b.door})),...districtHouses.map(b=>({id:b.id,...b.door})),{id:'results',kind:'board',...worldMap.landmarks.archive},{id:'smoking',...smokingZone.door}];
const collisionData=await readWorldData('./city-collisions.json');
const footprints=collisionData.obstacles;
const obstacleIndex=createCityObstacleIndex(footprints,160,playerBodyRadius);
const inside=(x,y,b)=>x>b.x&&x<b.x+b.width&&y>b.y&&y<b.y+b.height;
const cityGroundAllowed=p=>p.x>=worldBounds.left+playerBodyRadius&&p.x<=worldBounds.right-playerBodyRadius&&p.y>=worldBounds.top+playerBodyRadius&&p.y<=worldBounds.bottom-playerBodyRadius&&!obstacleIndex.near(p).some(b=>segmentBoxDistance(p,p,b)<playerBodyRadius-1e-7);
const dryFootAllowed=p=>!pedestrianLakeContains(worldMap.lake,p,playerBodyRadius);
export function clampPosition(x,y) {
 const point={x:Math.min(worldBounds.right-playerBodyRadius,Math.max(worldBounds.left+playerBodyRadius,Number.isFinite(x)?x:worldSpawn.x)),y:Math.min(worldBounds.bottom-playerBodyRadius,Math.max(worldBounds.top+playerBodyRadius,Number.isFinite(y)?y:worldSpawn.y))};
 if(pedestrianLakeContains(worldMap.lake,point,playerBodyRadius))return nearestPedestrianShore(worldMap.lake,point,playerBodyRadius,cityGroundAllowed);
 if(worldBenches.some(b=>Math.hypot(b.seat.x-point.x,b.seat.y-point.y)<.01))return point;
 return nearestFreeCityPoint(point,footprints,worldBounds,playerBodyRadius,dryFootAllowed);
}
export function movePosition(position,dx,dy) {
 let point=clampPosition(position.x,position.y);
 if(dx||dy)point=nearestFreeCityPoint(point,obstacleIndex.near(point),worldBounds,playerBodyRadius,dryFootAllowed);
 const end={x:point.x+(Number.isFinite(dx)?dx:0),y:point.y+(Number.isFinite(dy)?dy:0)},next=moveBetweenObstacles(point,dx,dy,obstacleIndex.near(point,end),worldBounds,playerBodyRadius);
 return movePedestrianPosition(worldMap.lake,point,next,playerBodyRadius);
}
/** Contact is the centre of actual native trash pixel (3,3), not its approach marker. */
export function pickupStance(position,model,target,{facings=['left','right','down','up'],move=movePosition}={}){
 const layout=sourceEntityLayout(target);if(target?.action!=='pick-litter'||layout?.assetId!=='actor-prop-trash'||![position?.x,position?.y].every(Number.isFinite))return null;
 const b=layout.destination,contact={x:b.x+b.width/2,y:b.y+b.height/2},scale=avatar.avatarGeometry.worldScale??1.25;
 return facings.flatMap(facing=>{
  const frame=sourceActorFrame(model,{action:'pick-litter',actionProgress:.5,facing}),hand=frame?.rect.propSockets?.trash||frame?.hand;
  if(frame?.poseFamily!=='lowerReach'||!hand)return [];
  const candidate={x:contact.x-(hand[0]-frame.anchor[0])*scale,y:contact.y-(hand[1]-frame.anchor[1])*scale,facing};
  const distance=Math.hypot(candidate.x-position.x,candidate.y-position.y);if(distance>110||Math.hypot(candidate.x-target.x,candidate.y-target.y)>target.radius)return [];
  // Validate the actual short straight walk at normal substeps; no endpoint clamping/teleport.
  let point={...position};const steps=Math.max(1,Math.ceil(distance/3));
  for(let i=1;i<=steps;i++){const next={x:position.x+(candidate.x-position.x)*i/steps,y:position.y+(candidate.y-position.y)*i/steps};point=move(point,next.x-point.x,next.y-point.y);if(Math.hypot(point.x-next.x,point.y-next.y)>.01)return [];}
  return [{...candidate,distance}];
 }).sort((a,b)=>a.distance-b.distance)[0]||null;
}
/** Collected ground nodes are independent of cached floor tiles. Keep paper until real contact. */
export function litterIsVisible(node,snapshot={},now=NaN,reducedMotion=false){
 if(node.action!=='pick-litter')return true;
 const active=actionEffectState(snapshot.action_effect,now);
 if(active?.type==='pick-litter'&&active.target_id===node.id)return !reducedMotion&&active.progress<.43;
 return !(snapshot.collected_litter||[]).includes(node.id);
}
export function nearestEntrance(x,y) {
 if(!Number.isFinite(x)||!Number.isFinite(y))return null;
 return [...entrances].sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y)).find(e=>Math.hypot(e.x-x,e.y-y)<=worldInteractionRadii.door)?.id||null;
}
export function nearestAction(x,y,snapshot={},selfId=null){
 if(!Number.isFinite(x)||!Number.isFinite(y))return null;
 const seats=worldBenches.filter(b=>Math.hypot(b.seat.x-x,b.seat.y-y)<=worldInteractionRadii.bench).sort((a,b)=>Math.hypot(a.seat.x-x,a.seat.y-y)-Math.hypot(b.seat.x-x,b.seat.y-y));
 const occupied=new Set((snapshot?.players||[]).filter(p=>p.id!==selfId&&p.bench_id).map(p=>p.bench_id));
 const bench=seats.find(b=>!occupied.has(b.id));
 const boat=nearestBoatAction(snapshot?.boats||worldMap.boats,x,y,selfId);
 const animal=nearestAnimalAction(snapshot?.animals,x,y);
 const activity=[...worldMap.activities.filter(a=>!(a.action==='pick-litter'&&(snapshot.collected_litter||[]).includes(a.id))&&(!Array.isArray(snapshot?.animals)||!['pet-dog','pet-cat'].includes(a.action))&&Math.hypot(a.x-x,a.y-y)<=a.radius),...(animal?[animal]:[])].sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
 const id=nearestEntrance(x,y),door=entrances.find(e=>e.id===id&&Math.hypot(e.x-x,e.y-y)<=worldInteractionRadii.door);
 const candidates=[door?{id,kind:door.kind||'door',x:door.x,y:door.y,radius:worldInteractionRadii.door}:null,bench?{id:bench.id,kind:'bench',x:bench.seat.x,y:bench.seat.y,radius:worldInteractionRadii.bench}:null,boat,activity?{...activity,kind:'activity'}:null].filter(Boolean);
 return candidates.sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0]||null;
}
export function worldKey(event){
 const physical={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',KeyE:'interact',KeyP:'phone',KeyI:'inventory',KeyR:'rotate'};
 if(physical[event.code])return physical[event.code];
 const key=event.key?.length===1?event.key.toLowerCase():event.key;
 return ({e:'interact',у:'interact',p:'phone',з:'phone',i:'inventory',ш:'inventory',r:'rotate',к:'rotate',ц:'w',ф:'a',ы:'s',в:'d'})[key]||key;
}
export function travelTarget(id,world={}){
 if(id==='railway')id='station';
 if(id==='base'){if(!world.my_clan?.id||!districtHouses.some(h=>h.id===world.my_clan.base?.building_id))return null;return {scene:'base',position:{...worldMap.base.spawn}};}
 const d=travelDestinations.find(d=>d.id===id);
 return d?{scene:'city',position:{x:d.x,y:d.y}}:null;
}
export function furnitureFootprint(item){const type=furnitureCatalog.types.find(t=>t.id===item?.type);if(!type)return null;const shape=!Object.hasOwn(item,'rotation')&&type.legacy_footprint?type.legacy_footprint:type.footprint;return item.rotation===90||item.rotation===270?{width:shape.height,height:shape.width}:{...shape};}
export function canPlaceItem(items,item,ignoreId=null){
 const grid=worldMap.base.grid,shape=furnitureFootprint(item),type=furnitureCatalog.types.find(t=>t.id===item?.type);
 if(!Array.isArray(items)||items.length>=30&&!ignoreId||!shape||!Object.hasOwn(item,'rotation')&&!type.legacy_footprint||typeof item.id!=='string'||!item.id||!Number.isInteger(item.x)||!Number.isInteger(item.y)||item.x<0||item.y<0||item.x+shape.width>grid.columns||item.y+shape.height>grid.rows||Object.hasOwn(item,'rotation')&&!type.rotations.includes(item.rotation)||item.color&&!basePalette.includes(item.color)||item.variant&&!['standard','premium'].includes(item.variant))return false;
 return !items.some(i=>{if(i.id===ignoreId)return false;const s=furnitureFootprint(i);return i.id===item.id||type.solid&&furnitureCatalog.types.find(t=>t.id===i.type)?.solid&&s&&item.x<i.x+s.width&&item.x+shape.width>i.x&&item.y<i.y+s.height&&item.y+shape.height>i.y;});
}
export function baseSeats(activeBase){
 const grid=worldMap.base.grid;return (activeBase?.base?.items||[]).flatMap(item=>{
  const type=furnitureCatalog.types.find(t=>t.id===item.type),shape=furnitureFootprint(item);if(!type||!shape)return [];
  const legacy=!Object.hasOwn(item,'rotation')&&type.legacy_footprint,offsets=legacy?type.seats.slice(0,1):type.seats;
  const w=type.footprint.width*grid.cell_width,h=type.footprint.height*grid.cell_height;
  return offsets.map((seat,i)=>{let x=seat.x,y=seat.y;
   if(legacy){x=Math.min(grid.cell_width-12,x);y=Math.min(grid.cell_height-6,y);}
   else if(item.rotation===90)[x,y]=[h-y,x];else if(item.rotation===180)[x,y]=[w-x,h-y];else if(item.rotation===270)[x,y]=[y,w-x];
   return {id:`base:${activeBase.id}:${item.id}:seat-${i+1}`,item_id:item.id,kind:'bench',x:grid.x+item.x*grid.cell_width+x,y:grid.y+item.y*grid.cell_height+y,facing:({0:'down',90:'left',180:'up',270:'right'})[item.rotation||0],radius:65};
  });
 });
}
export function baseSeatedActor(activeBase,player){
 const saved=activeBase?.base?.seats?.find(s=>s.id===player.bench_id),seat=saved||baseSeats(activeBase).find(s=>s.id===player.bench_id);
 return seat&&['sit','phone'].includes(player.pose)?{...player,pose:'sit',facing:seat.facing||'down',phone_open:!!player.phone_open||player.pose==='phone'}:player;
}
export function baseActorPlacement(activeBase,player){
 if(!['sit','phone'].includes(player.pose))return {player,depth:player.y};
 const seat=baseSeats(activeBase).find(s=>s.id===player.bench_id),item=activeBase?.base?.items?.find(i=>i.id===seat?.item_id);
 if(!item)return {player,depth:player.y};
 const offset=furnitureSeatVisualOffset(item),shape=furnitureFootprint(item),grid=worldMap.base.grid;
 return {player:{...player,pose:'sit',phone_open:!!player.phone_open||player.pose==='phone',facing:seat.facing,x:seat.x+offset.x,y:seat.y+offset.y},depth:grid.y+(item.y+shape.height)*grid.cell_height+.1};
}
export function moveBasePosition(activeBase,p,dx,dy){
 const bounds=worldMap.base.bounds,grid=worldMap.base.grid;
 const solids=(activeBase?.base?.items||[]).filter(i=>furnitureCatalog.types.find(t=>t.id===i.type)?.solid).map(i=>{const shape=furnitureFootprint(i);return {x:grid.x+i.x*grid.cell_width,y:grid.y+i.y*grid.cell_height,width:shape.width*grid.cell_width,height:shape.height*grid.cell_height};});
 // Leaving a claimed seat steps to the nearest free edge in the chosen direction.
 // Intermediate points deep inside solid furniture would be rejected by the server.
 const occupied=solids.find(b=>inside(p.x,p.y,b)),released={...p};
 if(occupied&&(dx||dy)){if(Math.abs(dx)>Math.abs(dy))released.x=dx<0?occupied.x-playerBodyRadius:occupied.x+occupied.width+playerBodyRadius;else released.y=dy<0?occupied.y-playerBodyRadius:occupied.y+occupied.height+playerBodyRadius;}
 const point=nearestFreeCityPoint(released,solids,bounds,playerBodyRadius);
 return moveBetweenObstacles(point,dx,dy,solids,bounds,playerBodyRadius);
}
const colors={paper:'#faf8f2',ink:'#141414',green:'#879c7c',leaf:'#617d63',water:'#80a4ad',turquoise:'#62cdb9',blue:'#7d9de6',yellow:'#f2ce61',coral:'#e88d78',violet:'#b697d7'};
const buildingColors={railway:colors.blue,clans:colors.turquoise,arena:colors.yellow,profile:colors.violet,results:colors.blue,messages:colors.coral,terrace:colors.turquoise,'shop-food':colors.green,'shop-clothes':colors.violet,'shop-furniture':colors.coral,casino:colors.yellow};
function rect(c,x,y,w,h,color=colors.ink){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
function label(c,text,x,y,size=12,color=colors.ink,align='center'){c.font=`bold ${size}px monospace`;c.fillStyle=color;c.textAlign=align;c.fillText(text,x,y);}
function outline(c,x,y,w,h,fill=colors.paper){rect(c,x,y,w,h);rect(c,x+3,y+3,w-6,h-6,fill);}
function dither(c,x,y,w,h,spacing=16,color='#ffffff24'){for(let i=x;i<x+w;i+=spacing)for(let j=y;j<y+h;j+=spacing)rect(c,i,j,2,2,color);}
function path(c,points,width,color){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';c.lineCap='round';c.stroke();}
function windowPane(c,x,y,w=26,h=40,tint='#b5d7e1'){outline(c,x,y,w,h,tint);rect(c,x+4,y+4,w-8,3,'#ffffffa0');rect(c,x+w/2-1,y+2,3,h-4);rect(c,x+2,y+h/2,w-4,2);}
function potPaint(c,x,y,color=colors.coral){
 rect(c,x-14,y+6,31,4,'#263f2920');rect(c,x-12,y-11,24,20,'#515e56');rect(c,x-10,y-9,20,16,color);rect(c,x-9,y-8,4,14,'#ffffff55');rect(c,x+7,y-8,3,14,'#0002');rect(c,x-13,y-12,26,4,'#b7c2ad');rect(c,x-10,y-9,20,3,'#4d5945');
 rect(c,x-2,y-41,4,32,'#647950');for(const [dx,dy,direction] of [[-13,-38,-1],[2,-46,1],[-12,-52,-1],[3,-29,1],[-4,-60,1]]){rect(c,x+dx,y+dy+3,11,7,'#57764d');rect(c,x+dx+2,y+dy,8,9,'#839d69');rect(c,x+dx+3,y+dy+2,5,2,'#a6bb84');rect(c,x+dx+(direction<0?7:2),y+dy+4,1,5,'#476540');}
}
function benchPaint(c,x,y){if(drawSourceBench(c,x,y))return;
 rect(c,x+9,y+31,118,8,'#26352b22');for(const xx of [x+10,x+104]){rect(c,xx,y-3,6,43,'#2b393b');rect(c,xx+1,y-2,2,40,'#718080');rect(c,xx-3,y+38,12,3,'#253439');}
 for(let k=0;k<3;k++){const yy=y-7+k*8;rect(c,x-2,yy-1,124,8,'#6b7064');rect(c,x,yy,120,6,k===1?'#a6a591':'#aaa993');rect(c,x+1,yy,118,1,'#d8d5bd');rect(c,x+1,yy+5,118,1,'#858772');for(let i=10;i<110;i+=21){rect(c,x+i+(k%2)*7,yy+3,11,1,'#929783');rect(c,x+i+2,yy+2,4,1,'#bfc1a7');}for(const xx of [x+12,x+107])rect(c,xx,yy+2,2,2,'#53665f');}
 rect(c,x-3,y+20,126,11,'#5c695e');rect(c,x,y+20,120,7,'#b7b6a0');rect(c,x+1,y+20,118,2,'#dedbc2');rect(c,x,y+27,120,3,'#7e8875');for(let i=9;i<112;i+=19)rect(c,x+i,y+24,11,1,'#9da38e');for(const xx of [x-5,x+121]){rect(c,xx,y+12,5,16,'#283b3b');rect(c,xx,y+12,5,2,'#95a599');}
}
function lampPaint(c,x,y){if(drawSourceLamp(c,x,y))return;
 rect(c,x-9,y+1,30,7,'#26362b22');rect(c,x-4,y-82,8,83,'#26373b');rect(c,x-3,y-81,2,80,'#83918a');rect(c,x+2,y-81,2,80,'#1b3035');rect(c,x-7,y-11,14,11,'#35484a');rect(c,x-6,y-11,12,2,'#94a197');
 rect(c,x-13,y-89,26,28,'#24363a');rect(c,x-10,y-86,20,22,'#dccb91');rect(c,x-8,y-84,16,18,'#fff0b9');rect(c,x-7,y-83,5,17,'#fff8d9');rect(c,x+5,y-84,3,18,'#d0b77c');rect(c,x-1,y-86,2,22,'#687d75');rect(c,x-11,y-69,22,3,'#c6bc8c');
 rect(c,x-16,y-94,32,7,'#2d4145');rect(c,x-13,y-94,26,2,'#87988d');rect(c,x-11,y-98,22,4,'#405654');rect(c,x-3,y-100,6,3,'#4b615c');rect(c,x-12,y+1,24,5,'#23383b');rect(c,x-10,y+1,20,1,'#93a18e');
}
function leafCluster(c,cx,cy,rx,ry,seed=0){
 const shades=['#405e46','#587950','#7d985f','#a4ba81'];
 for(let yy=-ry;yy<=ry;yy+=3){const edge=Math.floor(Math.sqrt(Math.max(0,1-(yy/ry)**2))*rx/3)*3;if(edge>0)rect(c,cx-edge,cy+yy,edge*2,4,yy>ry*.55?shades[0]:shades[1]);}
 for(let yy=-ry+4;yy<ry-3;yy+=5)for(let xx=-rx+3;xx<rx-3;xx+=6){if((xx/rx)**2+(yy/ry)**2>.82)continue;const n=(Math.imul(xx+seed*31,73856093)^Math.imul(yy+seed*17,19349663))>>>0,light=yy<0&&xx<rx*.55,lx=cx+xx+(n%3)-1,ly=cy+yy+((n>>>3)%3)-1;rect(c,lx,ly,2+(n%3),2,shades[light?(n%3===0?3:2):(n%4===0?2:0)]);if(n%5===0)rect(c,lx+2,ly+2,2,2,shades[1]);}
}
function treePaint(c,x,y,size=1,kind='round'){if(drawSourceTree(c,x,y,size,kind))return;
 c.save();c.translate(x,y);c.scale(size,size);rect(c,-29,13,64,15,'#274c3225');rect(c,-18,26,56,5,'#274c3218');
 rect(c,-7,-35,14,63,'#69543d');rect(c,-6,-35,4,58,'#b5a071');rect(c,3,-26,4,54,'#4d4435');for(let yy=-26;yy<24;yy+=10){rect(c,-1,yy,2,7,'#8c7951');rect(c,-6,yy+3,2,4,'#c3ad7b');}rect(c,-13,25,25,4,'#5e6741');rect(c,-12,28,8,2,'#899169');
 for(const [a,b] of [[[-4,-21],[-26,-44]],[[3,-30],[24,-51]],[[1,-43],[-9,-63]]])path(c,[a,b],5,'#806748');
 if(kind==='pine'){
  for(let tier=0;tier<5;tier++){const top=-113+tier*18,extent=12+tier*7;for(let row=0;row<25;row+=3){const width=Math.min(extent,Math.ceil((row+4)/28*extent));rect(c,-width,top+row,width*2+1,4,row>20?'#405e46':'#587950');for(let dx=-width+3;dx<width-2;dx+=7)if((dx+row+tier)%3)rect(c,dx,top+row,3,2,row<16?'#7d985f':'#638251');}rect(c,-extent+4,top+22,6,3,'#a1b57a');}c.restore();return;
 }
 if(kind==='birch'){rect(c,-5,-30,10,57,'#dedbc8');rect(c,-5,-30,3,54,'#f0eddb');for(let yy=-24;yy<26;yy+=9){rect(c,-5,yy,4,2,'#677366');rect(c,1,yy+4,4,2,'#8a8e74');}}
 for(const [xx,yy,rx,ry,seed] of [[-18,-51,27,27,1],[15,-52,29,25,2],[-3,-77,33,26,3],[-1,-99,19,13,4],[-33,-41,16,14,5],[31,-37,16,14,6]])leafCluster(c,xx,yy,rx,ry,seed);c.restore();
}
function flowerbedPaint(c,x,y,w=72){if(drawSourceFlowerbed(c,x,y,w))return;outline(c,x,y,w,24,'#478d51');for(let i=8;i<w-5;i+=13){rect(c,x+i,y+7,5,5,i%2?colors.yellow:colors.coral);rect(c,x+i+2,y+12,2,7,colors.leaf);}}
function tablePaint(c,x,y){outline(c,x,y,42,30,colors.paper);rect(c,x+18,y+30,5,10);for(const [dx,dy] of [[-14,6],[46,6]])outline(c,x+dx,y+dy,10,23,colors.coral);pot(c,x+22,y+6,colors.yellow,y+56);}
function signPaint(c,text,x,y,color=colors.paper){outline(c,x-65,y-30,130,32,color);label(c,text,x,y-8,12);rect(c,x-2,y+2,4,20);}
function doors(c,b,w=44){const x=b.door?.x||b.x+b.width/2,y=b.y+b.height;outline(c,x-w/2,y-54,w,54,'#254249');rect(c,x-w/2+5,y-48,w-10,32,'#97c5d0');rect(c,x+w/2-10,y-25,4,4,colors.yellow);rect(c,x-w/2-6,y,w+12,8,colors.paper);rect(c,x-w/2-10,y+8,w+20,7,'#c4c3b9');}
function facadePaint(c,b){
 const {x,y,width:w,height:h,id}=b,accent=buildingColors[id]||colors.turquoise;
 rect(c,x+10,y+14,w,h,'#30433324');
 if(id==='railway'){
  outline(c,x,y,w,h,'#eceadf');rect(c,x,y+5,w,13,accent);outline(c,x+w/2-60,y-28,120,51,accent);label(c,'БЗИКЕР',x+w/2,y+3,20);outline(c,x+w/2-15,y+25,30,30,colors.paper);rect(c,x+w/2-1,y+29,2,12);rect(c,x+w/2-1,y+39,10,2);for(const [dx,dy] of [[0,-10],[10,0],[0,10],[-10,0]])rect(c,x+w/2+dx-1,y+39+dy,2,2);label(c,'ЖЕЛЕЗНОДОРОЖНЫЙ ВОКЗАЛ',x+w/2,y+76,15);
  for(let i=20;i<w-55;i+=65)windowPane(c,x+i,y+92,42,53);doors(c,b,64);
 }else if(id==='arena'){
  outline(c,x,y,w,h,colors.ink);rect(c,x+5,y+5,w-10,38,accent);label(c,'СВОЯ ИГРА',x+w/2,y+31,20);rect(c,x+14,y+59,w-28,65,'#303a44');label(c,'БЗИКЕР',x+w/2,y+103,30,colors.paper);for(let i=18;i<w-10;i+=28)rect(c,x+i,y+132,14,17,i%3?accent:colors.paper);doors(c,b,62);
 }else if(id==='shop-food'){
  outline(c,x,y,w,h,'#fff3de');rect(c,x+7,y+6,w-14,27,colors.green);label(c,'ПРОДУКТЫ',x+w/2,y+26,17);for(let i=7;i<w-8;i+=20)rect(c,x+i,y+38,20,19,(i/20|0)%2?colors.paper:colors.green);windowPane(c,x+16,y+69,65,57);windowPane(c,x+w-81,y+69,65,57);rect(c,x+22,y+104,48,8,colors.yellow);rect(c,x+w-75,y+109,53,7,colors.coral);doors(c,b);
 }else if(id==='shop-clothes'||id==='profile'){
  outline(c,x,y,w,h,'#f2edff');rect(c,x+5,y+5,w-10,id==='profile'?40:31,accent);label(c,id==='profile'?'СТУДИЯ ОБРАЗОВ':'ОДЕЖДА',x+w/2,y+29,id==='profile'?16:21);
  for(const wx of [x+18,x+w-83]){outline(c,wx,y+60,65,h-80,'#b9d6ec');rect(c,wx+21,y+77,23,14,colors.paper);rect(c,wx+14,y+88,37,40,wx===x+18?colors.coral:colors.ink);rect(c,wx+30,y+130,3,15);}
  if(id==='profile'){rect(c,x+90,y-18,w-180,14,accent);label(c,'✦',x+w/2,y+66,22);}doors(c,b,46);
 }else if(id==='shop-furniture'){
  outline(c,x,y,w,h,'#fff2e7');rect(c,x+6,y+6,w-12,29,accent);label(c,'МЕБЕЛЬ',x+w/2,y+29,22);outline(c,x+14,y+52,78,73,'#c5ddd7');outline(c,x+w-92,y+52,78,73,'#c5ddd7');outline(c,x+23,y+94,58,25,colors.coral);rect(c,x+28,y+86,48,13,colors.paper);rect(c,x+w-77,y+85,47,6,'#a86c4a');rect(c,x+w-72,y+90,4,26);rect(c,x+w-39,y+90,4,26);doors(c,b);
 }else if(id==='casino'){
  outline(c,x,y,w,h,'#293f42');rect(c,x+5,y+5,w-10,45,colors.ink);label(c,'БЗИКЕР · КАЗИНО',x+w/2,y+35,23,accent);for(let i=10;i<w-8;i+=18)rect(c,x+i,y+53,6,6,accent);label(c,'♠  ♥  ♣  ♦',x+w/2,y+96,25,colors.paper);for(const wx of [x+22,x+w-62])windowPane(c,wx,y+121,40,45,accent);rect(c,x+8,y+h-8,w-16,7,accent);doors(c,b,58);
 }else if(id==='messages'||id==='terrace'){
  outline(c,x,y,w,h,'#fff0e0');rect(c,x+8,y+9,w-16,26,accent);label(c,id==='messages'?'КАФЕ / БЗИКЕР':'ТЕРРАСА',x+w/2,y+28,16);for(let i=8;i<w-8;i+=23)rect(c,x+i,y+44,23,17,(i/23|0)%2?colors.paper:accent);for(const wx of [x+18,x+w-76])windowPane(c,wx,y+76,58,48);if(b.door)doors(c,b);else rect(c,x+14,y+h-13,w-28,13,'#947153');for(const dx of [25,w-62])table(c,x+dx,y+h+32);
 }else if(id==='clans'){
  outline(c,x,y,w,h,'#dff1e9');rect(c,x+8,y+8,w-16,36,accent);label(c,'ДОМ КЛАНОВ',x+w/2,y+33,21);for(const [dx,col] of [[24,colors.coral],[w-53,colors.blue]]){rect(c,x+dx,y+58,4,58);rect(c,x+dx+4,y+60,28,18,col);}windowPane(c,x+67,y+73,40,48);windowPane(c,x+w-107,y+73,40,48);doors(c,b,56);label(c,'СООБЩЕСТВО',x+w/2,y+144,11);
 }else{
  outline(c,x,y,w,h,'#e6eef7');rect(c,x,y,11,h,accent);outline(c,x+30,y+15,w-60,35,accent);label(c,'ГАЛЕРЕЯ',x+w/2,y+39,21);for(const wx of [x+24,x+w-70]){outline(c,wx,y+72,46,65,colors.paper);rect(c,wx+8,y+83,30,27,colors.ink);rect(c,wx+14,y+119,20,7,accent);}doors(c,b,56);
 }
 rect(c,x,y+h-4,w,4);pot(c,x+w-6,y+h+14,accent);
}
export function sortWorldDepth(nodes){return [...nodes].sort((a,b)=>a.depth-b.depth||(Number(!!a.actor)-Number(!!b.actor)));}
let collectingObjects=null;
function spriteObject(id,bounds,depth,draw){
 const [x,y,w,h]=bounds,canvas=document.createElement('canvas');const rasterScale=Math.min(1,1024/w,1024/h);canvas.width=Math.ceil(w*rasterScale);canvas.height=Math.ceil(h*rasterScale);const c=canvas.getContext('2d');c.scale(rasterScale,rasterScale);c.translate(-x,-y);draw(c);
 return {id,depth,bounds:{x,y,width:w,height:h},draw(c){c.drawImage(canvas,x,y,w,h);}};
}
function prop(id,c,bounds,depth,draw,native=false){if(collectingObjects){const node={};collectingObjects.push(node);Object.assign(node,native?{id,depth,bounds:{x:bounds[0],y:bounds[1],width:bounds[2],height:bounds[3]},draw}:spriteObject(id,bounds,depth,draw));return;}draw(c);}
function pot(c,x,y,color,depth=y+12){prop(`pot-${x}-${y}`,c,[x-25,y-60,60,85],depth,ctx=>potPaint(ctx,x,y,color));}
const propBounds=r=>[r.bounds.x-2,r.bounds.y-2,r.bounds.width+4,r.bounds.height+4];
function bench(c,x,y){const r=sourceStreetLayout('bench',x,y);prop(`bench-${x}-${y}`,c,propBounds(r),r.depth,ctx=>benchPaint(ctx,x,y),true);}
function lamp(c,x,y){const r=sourceStreetLayout('lamp',x,y);prop(`lamp-${x}-${y}`,c,propBounds(r),r.depth,ctx=>lampPaint(ctx,x,y),true);}
function tree(c,x,y,size=1,kind='round'){const r=sourceStreetLayout('tree',x,y,{size,kind});prop(`tree-${x}-${y}`,c,propBounds(r),r.depth,ctx=>treePaint(ctx,x,y,size,kind),true);}
function flowerbed(c,x,y,w=72){const r=sourceStreetLayout('flowerbed',x,y,{width:w});prop(`flowers-${x}-${y}`,c,propBounds(r),r.depth,ctx=>flowerbedPaint(ctx,x,y,w),true);}
function table(c,x,y){prop(`table-${x}-${y}`,c,[x-28,y-58,110,125],y+42,ctx=>{interiorBlock(ctx,x,y,42,30,20,colors.paper);tablePaint(ctx,x,y-14);});}
function sign(c,text,x,y,color){prop(`sign-${x}-${y}`,c,[x-78,y-42,170,81],y+23,ctx=>{rect(ctx,x-60,y+21,130,9,'#0002');signPaint(ctx,text,x,y,color);rect(ctx,x-62,y-28,124,2,'#fff8');rect(ctx,x-62,y-3,124,2,'#0002');for(const xx of [x-60,x+60])rect(ctx,xx,y-25,2,2,'#87998a');});}
function roof(c,b,accent,style=0){const {x,y,width:w,height:h}=b;
 c.fillStyle='#00000028';c.beginPath();c.moveTo(x+16,y+h);c.lineTo(x+w+44,y+h+18);c.lineTo(x+w+28,y-13);c.lineTo(x+w,y-33);c.closePath();c.fill();
 c.fillStyle='#536361';c.beginPath();c.moveTo(x+w,y-58);c.lineTo(x+w+18,y-44);c.lineTo(x+w+18,y+h+10);c.lineTo(x+w,y+h);c.closePath();c.fill();
 rect(c,x+w+2,y+7,3,h-4,'#82918a');for(let yy=y+22;yy<y+h;yy+=27)rect(c,x+w+3,yy,13,2,'#354b47');
 if(style===3){
  const mid=x+w/2;c.fillStyle='#627b87';c.beginPath();c.moveTo(x-10,y-62);c.lineTo(mid,y-100);c.lineTo(mid,y-38);c.lineTo(x-10,y+4);c.closePath();c.fill();c.fillStyle='#354953';c.beginPath();c.moveTo(mid,y-100);c.lineTo(x+w+10,y-62);c.lineTo(x+w+10,y+4);c.lineTo(mid,y-38);c.closePath();c.fill();
  c.fillStyle='#ede4cf';c.beginPath();c.moveTo(x-8,y+4);c.lineTo(mid,y-38);c.lineTo(x+w+8,y+4);c.closePath();c.fill();path(c,[[x-10,y-62],[mid,y-100],[x+w+10,y-62]],5,'#b4c5c7');path(c,[[x-10,y+4],[mid,y-38],[x+w+10,y+4]],7,'#243e47');
  for(let i=1;i<7;i++){const xx=x-10+i*w/7;path(c,[[xx,y-62-i*5.5],[xx,y+3-i*5.5]],2,'#8297a1');const rx=mid+i*w/14;path(c,[[rx,y-100+i*5.5],[rx,y-38+i*6]],2,'#536b78');}
  rect(c,mid-15,y-30,30,21,'#344f5b');rect(c,mid-11,y-27,22,5,'#a8ccd1');
 }else if(style===1){
  c.fillStyle='#3c454e';c.beginPath();c.moveTo(x-7,y+1);c.lineTo(x+13,y-79);c.lineTo(x+w-13,y-79);c.lineTo(x+w+7,y+1);c.closePath();c.fill();rect(c,x+13,y-79,w-26,5,'#86929b');rect(c,x-7,y-2,w+14,7,'#232f38');
  for(let xx=x+20;xx<x+w-10;xx+=18)path(c,[[xx,y-70],[xx-7,y-7]],3,'#62717c');rect(c,x+34,y-52,53,26,'#1d2c37');rect(c,x+38,y-49,45,20,'#779daf');rect(c,x+59,y-49,3,20,'#ccd8d8');interiorBlock(c,x+w-57,y-45,27,22,34,'#bb8d77');rect(c,x+w-58,y-82,29,5,'#4b5860');
 }else if(style===2){
  rect(c,x-8,y-67,w+16,69,'#1d3d43');rect(c,x-4,y-62,w+8,57,'#b5c9c7');for(let xx=x+2;xx<x+w;xx+=32){rect(c,xx,y-61,27,50,'#a0b9bc');rect(c,xx+2,y-58,23,4,'#dbe5e0');rect(c,xx+22,y-59,4,46,'#829ea4');}rect(c,x-8,y-4,w+16,8,'#d6ece6');rect(c,x+17,y-62,w-34,4,'#416968');rect(c,x+w-60,y-49,42,20,'#697f69');for(let i=0;i<7;i++)rect(c,x+w-62+i*6,y-55+i%3,7,14,i%2?'#98a78a':'#71876f');
 }else{
  rect(c,x-6,y-64,w+12,65,'#141d22');rect(c,x-3,y-62,w+6,6,'#f5f3e7');rect(c,x-1,y-55,w+2,48,'#d7d9d3');rect(c,x+4,y-52,w-8,3,'#faf8f2');rect(c,x-6,y-8,w+12,8,'#939d99');rect(c,x-6,y-8,w+12,3,accent);
  for(let xx=x+20;xx<x+w-12;xx+=31){rect(c,xx,y-48,1,33,'#b9c1bd');rect(c,xx+3,y-16,19,1,'#c0c5c0');}
  interiorBlock(c,x+w-71,y-20,45,17,9,'#8d9c9d');for(let i=0;i<5;i++)rect(c,x+w-67+i*7,y-26,3,11,'#536d72');rect(c,x+26,y-37,28,18,'#536c75');rect(c,x+29,y-35,20,4,'#a6c1c6');rect(c,x+29,y-22,20,2,'#35484d');
 }

}
function building(c,b){const shape=publicBuildingGeometry(b),bounds=shape?.bounds||{x:b.x-35,y:b.y-104,width:b.width+93,height:b.height+210};prop(b.id,c,[bounds.x,bounds.y,bounds.width,bounds.height],b.y+b.height,ctx=>{if(drawPublicBuilding(ctx,b))return;roof(ctx,b,buildingColors[b.id]);facadePaint(ctx,b);},true);}
const houseSprites=new Map();
export function actorVisualRevision(p,effect=null){
 return JSON.stringify([p.avatar,p.kind,p.actor_id,p.breed,p.color,p.facing,p.walking,p.running,p.walkFrame,p.walk_frame,p.pose,p.bench_id,p.phone_open,p.action_effect,p.holding,p.pet_effect,p.boat,p.name,p.clan,effect]);
}
export function houseObject(h,occupant){
 if(isExactSourceCity(worldMap)){
  if(!occupant)return [];
  return [{id:`${h.id}:identity`,revision:JSON.stringify(occupant),depth:h.door.y,bounds:{x:h.door.x-120,y:h.door.y-155,width:240,height:160},draw(c){
   c.fillStyle=occupant.color||'#272727';c.fillRect(h.door.x+45,h.door.y-95,3,52);c.fillRect(h.door.x+48,h.door.y-94,30,18);
   label(c,occupant.flag||'✦',h.door.x+63,h.door.y-80,12,'#ffffff');label(c,String(occupant.name||'').slice(0,24),h.door.x,h.door.y-112,12);
  }}];
 }
 const key=JSON.stringify([h.id,occupant?.name,occupant?.flag,occupant?.color,occupant?.exterior_style,occupant?.exterior_color]);
 if(!houseSprites.has(key)){const r=sourceBuildingLayout(h,occupant);const bounds=r?propBounds(r):[h.x-40,h.y-112,h.width+100,h.height+180];const main=spriteObject(h.id,bounds,h.y+h.height,c=>occupant?drawHouseCanvas(c,h,occupant):drawConstructionPlot(c,h));main.revision=key;houseSprites.set(key,[main]);if(houseSprites.size>80)houseSprites.delete(houseSprites.keys().next().value);}
 return houseSprites.get(key);
}
function welcomeSign(c){const p=worldMap.landmarks.welcome,x=p.x,y=p.y-35;prop('welcome',c,[x-160,y-130,320,130],p.y-35,ctx=>{if(drawDesignAsset(ctx,'welcome-source-sign',x,y,320,130))return;outline(ctx,x-130,y-100,260,59,colors.paper);label(ctx,'Добро пожаловать в Бзикер',x,y-67,15);});}
function cityGround(c,tile){drawCityGround(c,cityGroundPlan,tile);drawCityArchitectureGround(c,worldMap,tile);}
function apartment(c,b){const r=sourceBuildingLayout(b);if(r){prop(b.id,c,propBounds(r),r.depth,ctx=>drawSourceApartment(ctx,b),true);return;}const rise=24+b.floors*28,top=b.y-rise;prop(b.id,c,[b.x-30,top-78,b.width+80,b.height+rise+110],b.y+b.height,ctx=>{roof(ctx,{...b,y:top,height:b.height+rise},'#b1b8b1',b.floors%3===0?1:0);outline(ctx,b.x,top,b.width,b.height+rise,'#eceee8');rect(ctx,b.x+b.width-17,top+3,14,b.height+rise-7,'#c6cec6');for(let yy=top+21;yy<b.y+b.height-38;yy+=42){rect(ctx,b.x+5,yy+37,b.width-12,3,'#aab5ad');for(let xx=b.x+20;xx<b.x+b.width-35;xx+=48){windowPane(ctx,xx,yy,26,27,'#879b9e');rect(ctx,xx-3,yy+25,33,5,'#d5dad2');}}outline(ctx,b.x+b.width/2-25,b.y+b.height-40,50,40,'#364c50');rect(ctx,b.x+4,top+4,4,b.height+rise-9,'#fff9');});}
function dogArt(c,x,y,color='#b8a88e'){rect(c,x-19,y+3,41,7,'#0002');rect(c,x-13,y-17,30,20,color);rect(c,x-18,y-29,20,19,color);rect(c,x-20,y-30,8,17,'#706a5c');rect(c,x-15,y-22,3,3,colors.ink);rect(c,x-23,y-16,9,7,'#eee7d6');rect(c,x-9,y+1,5,10,'#857a68');rect(c,x+10,y+1,5,10,'#857a68');rect(c,x+15,y-17,12,5,color);}
export function petFollower(owner,previous,dt=.04){
 const pet=followPetPosition(owner,previous,dt);
 return pet?shorePet(pet,owner.scene):null;
}
const shorePet=(pet,scene)=>scene==='city'&&lakeContains(worldMap.lake,pet)?{...pet,...nearestShore(worldMap.lake,pet,8)}:pet;
// Measured on the native64x64 play/stretch head: upper crown in B, lower
// cheek in C. These are source pixels, never a bbox fit or an animal scale.
const petHeadStrokes=Object.freeze({
 'cat-british-black':[[27,48],[27,56]],'cat-british-blue':[[27,48],[27,56]],
 'cat-british-cream':[[27,49],[27,57]],'cat-british-silver-tabby':[[27,48],[27,56]],
 'cat-maine-coon-brown-tabby':[[27,48],[27,56]],'cat-maine-coon-red-tabby':[[27,48],[27,56]],
 'cat-maine-coon-silver-tabby':[[27,48],[27,56]],'cat-maine-coon-tortoiseshell':[[27,48],[27,56]],
 'dog-corgi-red-white':[[27,47],[27,55]],'dog-corgi-sable-white':[[27,49],[27,57]],
 'dog-corgi-tricolor':[[27,49],[27,57]],'dog-german-shepherd-black':[[27,47],[27,55]],
 'dog-german-shepherd-black-tan':[[27,47],[27,55]],'dog-german-shepherd-sable':[[27,47],[27,55]],
 'dog-labrador-black':[[27,47],[27,55]],'dog-labrador-chocolate':[[27,47],[27,55]],
 'dog-labrador-yellow':[[27,47],[27,55]],'dog-poodle-apricot':[[27,47],[27,55]],
 'dog-poodle-black':[[27,47],[27,55]],'dog-poodle-white':[[27,47],[27,55]]
});
/** One authoritative pet progress selects both the human palm and the real
 * animal reaction. Only the animal's whole world placement changes. */
export function petInteractionLayout(owner,animal,now,reducedMotion=false){
 const effect=petEffectState(owner?.pet_effect,now);
 if(!effect||effect.target_id!==animal?.id||![owner.x,owner.y,animal.x,animal.y].every(Number.isFinite))return null;
 // Owned pets have always used the right-hand reach in drawAvatar's fallback.
 const facing=animal.owner_id?'right':animal.x<owner.x?'left':'right',progress=reducedMotion?.5:effect.progress;
 const opts={action:'pet',actionProgress:progress,facing,pose:owner.pose||'idle',phoneOpen:!!owner.phone_open};
 const humanFrame=sourceActorFrame(owner.avatar||{},opts);
 if(!['lowerReach','seated'].includes(humanFrame.poseFamily)||!humanFrame.hand)return null;
 const phase=humanFrame.poseFamily==='seated'?2:humanFrame.frameIndex;
 const reaction=sourceAnimalFrame({...animal,pet_contact_frame:phase},effect,reducedMotion,now),stroke=petHeadStrokes[reaction.actorId];
 if(!stroke)return null;
 const scale=avatar.avatarGeometry.worldScale??1.25,anchor=humanFrame.anchor;
 const point=hand=>({x:owner.x+(hand[0]-anchor[0])*scale,y:owner.y+(hand[1]-anchor[1])*scale});
 const hand=point(humanFrame.hand),headSocket=stroke[phase===2?1:0];
 // Reach/withdraw approach the first actual contact location, rather than
 // chasing the high standing hand and teleporting down on the first stroke.
 const contactHand=humanFrame.poseFamily==='lowerReach'&&(phase===0||phase===3)?point(sourceActorFrame(owner.avatar||{},{...opts,actionProgress:.25}).hand):hand;
 const target={x:contactHand.x-headSocket[0]+reaction.anchor[0],y:contactHand.y-headSocket[1]+reaction.anchor[1]};
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
 const blend=reducedMotion?1:progress<.18?smooth(progress/.18):progress>.84?smooth((1-progress)/.16):1;
 return {humanFrame,humanFacing:facing,hand,headSocket,contact:blend===1,
  animal:{...animal,x:animal.x+(target.x-animal.x)*blend,y:animal.y+(target.y-animal.y)*blend,walking:false,pet_contact_frame:phase}};
}

function drawPet(c,p){if(p.kind==='dog'){dogArt(c,p.x,p.y,'#c8c4b4');return;}rect(c,p.x-15,p.y+3,31,6,'#0002');rect(c,p.x-11,p.y-12,24,16,'#bac4bc');rect(c,p.x-17,p.y-22,17,15,'#dce0d5');rect(c,p.x-17,p.y-26,5,8,'#808e85');rect(c,p.x-4,p.y-26,5,8,'#808e85');rect(c,p.x-14,p.y-17,2,2,colors.ink);rect(c,p.x-6,p.y-17,2,2,colors.ink);rect(c,p.x-9,p.y-12,3,2,'#ae9a8c');rect(c,p.x+10,p.y-13,13,4,'#808e85');rect(c,p.x+21,p.y-21,4,11,'#808e85');rect(c,p.x-7,p.y+2,4,8,'#708279');rect(c,p.x+7,p.y+2,4,8,'#708279');}
function activityProp(c,a){const x=a.x,y=a.y;if(a.action==='pet-dog')prop(a.id,c,[x-33,y-42,72,70],y+8,ctx=>dogArt(ctx,x,y));else if(a.action==='trash-bin')prop(a.id,c,[x-25,y-60,61,87],y+15,ctx=>{if(drawSourceBin(ctx,x,y))return;interiorBlock(ctx,x-16,y-9,32,23,38,'#727f77');rect(ctx,x-17,y-47,35,7,'#3e4e47');rect(ctx,x-12,y-34,22,10,'#263e36');rect(ctx,x-12,y-19,3,17,'#9ba69a');for(let i=0;i<4;i++){rect(ctx,x-10+i*6,y-18,2,22,'#566b61');rect(ctx,x-9+i*6,y-17,1,19,'#a3b0a0');}rect(ctx,x-12,y-41,23,2,'#a3b0a0');rect(ctx,x+13,y-32,3,14,'#344f46');rect(ctx,x-4,y-7,8,7,'#c0c9b5');rect(ctx,x-2,y-5,4,3,'#66816a');});else if(a.action==='pick-litter')prop(a.id,c,[x-17,y-12,43,35],y+2,ctx=>{rect(ctx,x-8,y-4,15,9,'#f6f3e7');rect(ctx,x-7,y-3,10,2,'#b4b7a6');rect(ctx,x+7,y-1,6,5,'#9bada4');});else prop(a.id,c,[x-42,y-52,90,94],y+16,ctx=>{interiorBlock(ctx,x-39,y+2,78,18,8,'#c4b597');for(let i=0;i<5;i++)rect(ctx,x-35+i*15,y-3,2,15,'#908a75');rect(ctx,x+14,y-30,3,29,'#5a6158');rect(ctx,x+9,y-30,13,3,'#aeb9a6');});}
export function worldLight(time=Date.now(),mode='auto'){if(mode==='day')return 1;if(mode==='night')return 0;const phase=((time/1000)%worldMap.day_cycle_seconds)/worldMap.day_cycle_seconds;return Math.max(0,Math.min(1,(Math.cos((phase-.35)*Math.PI*2)+.25)*1.2));}
/** Frontage furniture shares the paved entrance apron, clear of the door lane.
 * Cafe racks sit before the terrace tables instead of projecting into traffic. */
export function cityBikeRackLayout(map=worldMap){
 if(Array.isArray(map.architecture?.bike_racks))return map.architecture.bike_racks.map(r=>({...r,footprint:{...r.footprint}}));
 return map.buildings.filter(b=>!['railway','shop-food'].includes(b.id)).map(b=>{
  const x=b.x+8,y=b.y+b.height+(['messages','terrace'].includes(b.id)?-7:7);
  return {id:`bike-rack-${b.id}`,x,y,footprint:{x:x-4,y:y+21,width:68,height:4}};
 });
}
export function cityPlazaTitleLayout(map=worldMap,plan=cityGroundPlan){
 const p=plan.plaza,bounds={x:p.x+p.width-150,y:p.y+16,width:144,height:62};
 return {x:bounds.x+bounds.width/2,y:bounds.y+40,bounds};
}
export function createCityArt(){
 if(isExactSourceCity(worldMap))return {objects:sourceCityExactObjects(worldMap),cacheSize:()=>0,drawGround(ctx,view){drawExactSourceCity(ctx,worldMap,view);}};
 const modular=worldMap.schema_version>=20||worldMap.design_source?.modular_scene;
 const objects=modular?sourceCityModuleObjects(worldMap):[];collectingObjects=objects;const scratch=document.createElement('canvas');scratch.width=1;scratch.height=1;const c=scratch.getContext('2d');
 try{
  if(!modular){
   for(const b of cityBuildings)building(c,b);for(const b of worldMap.background_buildings)apartment(c,b);for(const t of worldMap.decor.trees)tree(c,t.x,t.y,t.size,t.kind);for(const b of worldMap.bench_groups)bench(c,b.x,b.y);for(const l of worldMap.decor.lamps)lamp(c,l.x,l.y);for(const detail of streetDetailObjects(worldMap)){const b=detail.bounds;prop(detail.id,c,[b.x,b.y,b.width,b.height],detail.depth,detail.paint);}for(const a of worldMap.activities.filter(a=>!['pet-dog','pet-cat'].includes(a.action)))activityProp(c,a);for(const b of worldMap.boats){const r=sourceDockLayout(b);prop(`dock-${b.id}`,c,[r.bounds.x,r.bounds.y,r.bounds.width,r.bounds.height],r.depth,ctx=>drawDock(ctx,b));}welcomeSign(c);
  for(const bed of cityGroundPlan.plantings)prop(bed.id,c,[bed.x-5,bed.y-26,bed.width+14,bed.height+43],bed.y+bed.height+6,ctx=>drawGroundPlanting(ctx,bed));
  for(const rack of cityBikeRackLayout()){const {x,y}=rack;prop(rack.id,c,[x-12,y-25,85,65],y+24,ctx=>{for(let i=0;i<3;i++){outline(ctx,x+i*18,y,14,22,'#d5d9d1');rect(ctx,x+3+i*18,y+3,8,19,'#8d9f91');}rect(ctx,x-4,y+21,68,4,'#4f6558');});}
  const smoke=smokingZone;prop('smoking-source',c,[smoke.x-10,smoke.y-90,smoke.width+20,smoke.height+110],smoke.y+smoke.height,ctx=>drawSourceSmoking(ctx,smoke));
  for(const area of sourceCityAreaLayouts(worldMap))prop(area.id,c,propBounds(area),area.depth,ctx=>drawSourceCityArea(ctx,area));
  for(const extra of supplementalEnvironmentLayouts(worldMap))prop(extra.id,c,propBounds(extra),extra.depth,ctx=>drawSupplementalEnvironment(ctx,extra),true);
  for(const bridge of lakeWalkwayLayouts(worldMap.lake))prop(bridge.id,c,propBounds(bridge),bridge.depth,ctx=>drawLakeWalkway(ctx,bridge),true);
  for(const shore of sourceShoreLayouts(worldMap))prop(shore.id,c,[shore.bounds.x,shore.bounds.y,shore.bounds.width,shore.bounds.height],shore.depth,ctx=>drawSourceShore(ctx,shore));
  for(const car of sourceParkedVehicleLayouts(worldMap))prop(car.id,c,propBounds(car),car.depth,ctx=>drawSourceVehicle(ctx,car,car.anchor.x,car.anchor.y,car.width,car.height));
  for(const node of createCityArchitectureObjects(worldMap)){const b=node.bounds;prop(node.id,c,[b.x,b.y,b.width,b.height],node.depth,node.draw);}
  }
 }finally{collectingObjects=null;}
 const tiles=new Map(),size=worldGroundTileSpec.worldSize,groundObjects=modular?sourceCityGroundObjects(worldMap):[];
 return {objects,groundObjects,cacheSize:()=>tiles.size,drawGround(ctx,view,{nativeObjects=true}={}){
  for(let gy=Math.floor(view.y/size);gy<=Math.floor((view.y+view.height)/size);gy++)for(let gx=Math.floor(view.x/size);gx<=Math.floor((view.x+view.width)/size);gx++){
   if(gx<0||gy<0||gx*size>=W||gy*size>=H)continue;
   const key=`${gx}:${gy}`;let tile=tiles.get(key);
   if(!tile){
    tile=document.createElement('canvas');tile.width=worldGroundTileSpec.rasterSize;tile.height=worldGroundTileSpec.rasterSize;
    const tc=tile.getContext('2d');tc.imageSmoothingEnabled=false;tc.translate(-gx*size,-gy*size);
    if(modular)drawCityGround(tc,{...cityGroundPlan,groundObjects:[]},{x:gx*size,y:gy*size,width:size,height:size});
    else cityGround(tc,{x:gx*size,y:gy*size,width:size,height:size});tiles.set(key,tile);
    if(tiles.size>worldGroundTileSpec.cacheLimit)tiles.delete(tiles.keys().next().value);
   }else{tiles.delete(key);tiles.set(key,tile);}
   ctx.drawImage(tile,gx*size,gy*size,size,size);
  }
  if(nativeObjects)for(const node of groundObjects){const b=node.bounds;if(b.x<view.x+view.width&&b.x+b.width>view.x&&b.y<view.y+view.height&&b.y+b.height>view.y)node.draw(ctx);}
 }};
}
export function drawCityGroundFrame(c,art,view,time=0,reducedMotion=false,snapshot={},now=NaN){
 art.drawGround(c,view,{nativeObjects:false});
 const lake=worldMap.lake,bounds=lakeBounds(lake);
 if(!isExactSourceCity(worldMap)&&bounds.x+bounds.width>=view.x&&bounds.x<=view.x+view.width&&bounds.y+bounds.height>=view.y&&bounds.y<=view.y+view.height)drawSourceLake(c,lake,time,{shore:false,reducedMotion});
 for(const node of art.groundObjects||[]){if(!litterIsVisible(node,snapshot,now,reducedMotion))continue;const b=node.bounds;if(b.x<view.x+view.width&&b.x+b.width>view.x&&b.y<view.y+view.height&&b.y+b.height>view.y)node.draw(c);}
}
const locationCaptions={railway:'Вокзал',clans:'Дом кланов',arena:'Бзик Хаб · Своя игра',profile:'Студия образов',results:'Галерея результатов',messages:'Пивковый туз',terrace:'Творческая гостиная','shop-food':'Продукты','shop-clothes':'Одежда','shop-furniture':'Мебель',casino:'Казино'};
function drawLocationLabels(c,view){if(isExactSourceCity(worldMap))return;const size=12/view.scale;c.save();c.font=`bold ${size}px Arial`;c.textAlign='center';for(const b of cityBuildings){const r=sourceBuildingLayout(b),p=r?.bounds;if(!p||p.x>view.x+view.width||p.x+p.width<view.x||p.y>view.y+view.height||p.y+p.height<view.y)continue;const text=locationCaptions[b.id],x=r.anchor.x,y=p.y-10/view.scale,w=c.measureText(text).width;c.fillStyle='#ffffffe8';c.fillRect(x-w/2-6/view.scale,y-size-3/view.scale,w+12/view.scale,size+8/view.scale);c.fillStyle='#181818';c.fillText(text,x,y);}c.restore();}
function drawNight(c,view,light){if(light>=.98)return;rect(c,view.x,view.y,view.width,view.height,`rgba(19,31,52,${(1-light)*.56})`);for(const lamp of worldMap.decor.lamps){if(lamp.x<view.x-100||lamp.x>view.x+view.width+100||lamp.y<view.y-150||lamp.y>view.y+view.height+100)continue;c.save();c.globalCompositeOperation='screen';for(const [rx,ry,alpha] of [[92,49,.035],[68,35,.065],[43,24,.10]]){c.fillStyle=`rgba(252,219,140,${alpha*(1-light)})`;c.beginPath();c.ellipse(lamp.x,lamp.y+7,rx,ry,0,0,Math.PI*2);c.fill();}if(!isExactSourceCity(worldMap)&&worldMap.schema_version<20)rect(c,lamp.x-7,lamp.y-80,14,14,'#fff0b1');c.restore();}if(isExactSourceCity(worldMap)||worldMap.schema_version>=20)return;for(const b of cityBuildings){if(b.x+b.width<view.x||b.x>view.x+view.width||b.y+b.height<view.y||b.y>view.y+view.height)continue;c.save();c.globalCompositeOperation='screen';for(const w of publicBuildingLights(b)){rect(c,w.x,w.y,w.w,w.h,`rgba(237,202,134,${.24*(1-light)})`);rect(c,w.x+3,w.y+3,Math.max(2,w.w-6),2,`rgba(251,224,168,${.25*(1-light)})`);}if(b.door){c.fillStyle=`rgba(242,215,151,${.09*(1-light)})`;c.beginPath();c.ellipse(b.door.x,b.door.y+7,35,18,0,0,Math.PI*2);c.fill();}c.restore();}}

function drawFurniture(c,item,selected=false){const grid=worldMap.base.grid,shape=furnitureFootprint(item);if(!shape)return;drawFurnitureVolume(c,{...item,source_theme:item.source_theme||'modern'},item.type,grid.x+item.x*grid.cell_width,grid.y+item.y*grid.cell_height,shape.width*grid.cell_width,shape.height*grid.cell_height,/^#[0-9a-f]{6}$/i.test(item.color||'')?item.color:colors.paper,selected);}
function drawFurnitureForeground(c,item,type,x,y,width,height,color){c.save();c.beginPath();c.rect(x,y+height-20,width,23);c.clip();const painted=drawSourceFurniture(c,{...item,type,color},item.source_theme||'modern',{x,y,width,height});c.restore();if(!painted)drawFacingFurnitureForeground(c,item,type,x,y,width,height,color);}
function baseArt(c,items,editing,paint,selected,seatedIds=new Set()){
 if(!drawSourceInteriorSurfaces(c,{id:'clans',width:1200,height:900,bounds:{left:171,top:174,right:1031,bottom:744},surface_style:paint.surface_style||'board',wall_material:paint.wall_material||'plaster',floor_color:paint.floor_color,wall_color:paint.wall_color,exit:{x:600,y:770}})){
 rect(c,0,0,1200,900,'#303b38');rect(c,123,70,950,720,paint.wall_color);rect(c,130,77,936,72,paint.wall_color);rect(c,130,77,936,5,'#ffffff50');rect(c,130,143,936,9,'#0003');label(c,'ОБЩАЯ МАСТЕРСКАЯ',600,128,25,paint.wall_color===colors.ink?colors.paper:colors.ink);
 rect(c,123,150,20,630,'#0004');rect(c,1053,150,20,630,'#0006');rect(c,171,174,860,570,paint.floor_color);
 drawFloorMaterial(c,{x:171,y:174,width:860,height:570},paint.floor_color,'wood');
 for(const x of [170,850]){outline(c,x,88,172,49,'#89bbc6');rect(c,x+83,91,4,42);rect(c,x+4,91,160,3,'#cbe7ea');rect(c,x-3,136,179,7,colors.paper);}
 }
 rect(c,171,730,860,12,'#0003');for(let y=0;y<8;y++)for(let x=0;x<12;x++)if(editing){rect(c,180+x*70,260+y*58,68,1,'#ffffff50');rect(c,180+x*70,260+y*58,1,56,'#ffffff50');}
 outline(c,556,744,88,45,'#d8dbc9');label(c,'В ГОРОД ↓',600,769,12);
 return items.flatMap(item=>{const grid=worldMap.base.grid,shape=furnitureFootprint(item),depth=item.type==='rug'?-1:grid.y+(item.y+shape.height)*grid.cell_height;
  const bounds={x:grid.x+item.x*grid.cell_width-200,y:grid.y+item.y*grid.cell_height-400,width:shape.width*grid.cell_width+400,height:shape.height*grid.cell_height+450};
  const nodes=[{id:item.id,depth,bounds,draw(ctx){drawFurniture(ctx,item,item.id===selected);}}];
  if(Object.hasOwn(item,'rotation')&&seatedIds.has(item.id))nodes.push({id:`${item.id}:seat-front`,depth:depth+.2,bounds,draw(ctx){drawFurnitureForeground(ctx,item,item.type,grid.x+item.x*grid.cell_width,grid.y+item.y*grid.cell_height,shape.width*grid.cell_width,shape.height*grid.cell_height,/^#[0-9a-f]{6}$/i.test(item.color||'')?item.color:colors.paper);}});
  return nodes;
 });
}
export function cityActorPlacement(player,map=worldMap){
 const seat=['sit','phone'].includes(player.pose)&&(map.benches||[]).find(s=>s.id===player.bench_id);
 if(!seat?.visual)return {player,depth:player.y};
 return {player:{...player,x:seat.visual.x,y:seat.visual.y,facing:seat.facing||player.facing},depth:seat.visual.y};
}
export function actorRenderBounds(actor,now){
 const bounds={x:actor.x-120,y:actor.y-110,width:240,height:125},action=actionEffectState(actor.action_effect,now);
 if(action?.type==='throw-litter'){
  const effect=actor.action_effect,options={scale:avatar.avatarGeometry.worldScale??1.25,anchorX:avatar.avatarGeometry.anchorX,anchorY:avatar.avatarGeometry.anchorY,target:sourceBinSlot(worldMap.activities.find(a=>a.id===effect.target_id))};
  // Reuse the painted flight geometry. Sample just inside its active interval
  // to avoid decimal-time endpoint rounding, and retain one envelope for the
  // entire action. A sine arc stays above min(endpoints)-its midpoint lift.
  const at=p=>actionFlight(effect,actor,effect.started_at+effect.duration*p,false,options);
  const start=at(.400001),middle=at(.575),end=at(.749999);
  if(!start||!middle||!end)return bounds;
  const lift=Math.max(0,(start.y+end.y)/2-middle.y)+1,margin=6;
  const left=Math.floor(Math.min(bounds.x,start.x-margin,end.x-margin)),top=Math.floor(Math.min(bounds.y,Math.min(start.y,end.y)-lift-margin));
  const right=Math.ceil(Math.max(bounds.x+bounds.width,start.x+margin,end.x+margin)),bottom=Math.ceil(Math.max(bounds.y+bounds.height,start.y+margin,end.y+margin));
  return {x:left,y:top,width:right-left,height:bottom-top};
 }
 if(!action||!['fishing','fish-catch'].includes(action.type))return bounds;
 // Common source-scale envelope for the rotated rod, cast line, float and fish.
 // Hold it through the whole water action so each phase reuses one texture.
 const scale=avatar.avatarGeometry?.worldScale??1.25,left=Math.min(bounds.x,actor.x-96*scale),top=Math.min(bounds.y,actor.y-128*scale);
 const right=Math.max(bounds.x+bounds.width,actor.x+184*scale),bottom=Math.max(bounds.y+bounds.height,actor.y+40*scale);
 return {x:left,y:top,width:right-left,height:bottom-top};
}
export function drawAvatar(c,p,time,isSelf=false,showNicknames=true,reducedMotion=false,now=Date.now()/1000,animalTargets=[],showMarkers=true){
 c.save();
 const transform=c.getTransform?.();
 if(transform&&transform.b===0&&transform.c===0&&transform.a>0&&transform.d>0){
  const x=Math.round(p.x),y=Math.round(p.y);
  c.translate((Math.round(p.x*transform.a+transform.e)-transform.e)/transform.a-x,(Math.round(p.y*transform.d+transform.f)-transform.f)/transform.d-y);
  p={...p,x,y};
 }
 rect(c,p.x-19,p.y-3,38,7,'#0002');
 const gesture=petEffectState(p.pet_effect,now),target=gesture&&(animalTargets.find(a=>a.id===gesture.target_id)||worldMap.activities.find(a=>a.id===gesture.target_id)||{x:p.x+30,y:p.y+12}),side=target&&target.x<p.x?-1:1;
 const action=actionEffectState(p.action_effect,now);
 const geometry=avatar.avatarGeometry||{width:40,height:64,anchorX:20,anchorY:63,walkFrames:4},scale=geometry.worldScale??1.25,walking=!!p.walking&&!p.boat&&!gesture&&!action;
 // Articulated poses leave the physical seat, neck and feet stable.
 c.save();
 avatar.drawAvatarCanvas(c,p.avatar||{},p.x-geometry.anchorX*scale,p.y-geometry.anchorY*scale,{scale,boat:!!p.boat,running:walking,anchorX:geometry.anchorX,anchorY:geometry.anchorY,facing:gesture?(side<0?'left':'right'):p.facing||'down',walking,walkFrame:walking?p.walkFrame||0:0,pose:p.boat?'sit':p.pose||'idle',phoneOpen:!!p.phone_open,poseFrame:Math.floor(time/420)%2,action:action?.type||(gesture?'pet':null),actionFrame:reducedMotion?1:action?.frame??Math.min(3,Math.floor((gesture?.progress||0)*4)),actionProgress:reducedMotion&&(action||gesture)?.5:action?.progress??gesture?.progress,holding:p.holding==='litter'?'litter':null});c.restore();
 if(action&&['fishing','fish-catch'].includes(action.type)){waterActionAssets??=preloadWaterActions();drawWaterAction(c,p.action_effect,p,now,{scale,anchorX:geometry.anchorX,anchorY:geometry.anchorY,reducedMotion});}
 drawActionFlight(c,p.action_effect,p,now,reducedMotion,{scale,anchorX:geometry.anchorX,anchorY:geometry.anchorY,target:sourceBinSlot(worldMap.activities.find(a=>a.id===p.action_effect?.target_id))});
 if(showMarkers)drawAvatarLabels(c,p,isSelf,showNicknames);
 c.restore();
}
export function drawAvatarLabels(c,p,isSelf=false,showNicknames=true){
 c.save();
 const t=c.getTransform?.();if(t&&t.b===0&&t.c===0&&t.a>0&&t.d>0)p={...p,x:(Math.round(p.x*t.a+t.e)-t.e)/t.a,y:(Math.round(p.y*t.d+t.f)-t.f)/t.d};
 if(p.clan?.color){rect(c,p.x+22,p.y-65,3,15);rect(c,p.x+25,p.y-65,9,8,/^#[0-9a-f]{6}$/i.test(p.clan.color)?p.clan.color:colors.ink);}
 if(showNicknames){const name=String(p.name||'').slice(0,32);c.font='bold 11px monospace';const width=Math.min(240,c.measureText(name).width+12);rect(c,p.x-width/2,p.y-98,width,17,isSelf?colors.ink:colors.paper);label(c,name,p.x,p.y-86,11,isSelf?colors.paper:colors.ink);}
 c.restore();
}

const paletteOptions=basePalette.map((c,i)=>`<option value="${c}">${['Чёрный','Молочный','Бирюзовый','Синий','Жёлтый','Коралловый','Лиловый','Белый'][i]}</option>`).join('');
const fallbackCoin='<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#f2ce61" stroke="#141414" stroke-width="2"/><path d="M8 12h16v11H8zM5 10l8-6 3 6 3-6 8 6M10 23v4m12-4v4" fill="#faf8f2" stroke="#141414" stroke-width="2"/><path d="M12 15v4m8-4v4" stroke="#141414" stroke-width="2"/></svg>';

const phoneQueues=new Map();
const worldMutationQueues=new Map();

/** Native world mount. Each async result is scoped to its mount and scene epoch. */
export function mountWorld(container,{profile,api,onInteract=()=>{},onPhone=()=>{},onInventory=()=>{},onArena=()=>{},onCards=()=>{},onSettings=()=>{},onSound=()=>{},onControllerLost=()=>{},settings={},initialScene='city',diagnostics=false,rendererFactory=(canvas,options)=>new PhaserWorldRenderer(canvas,options)}){
 if(!document.getElementById('world-style')){const link=document.createElement('link');link.id='world-style';link.rel='stylesheet';link.href='/web/world.css';document.head.append(link);}
 const root=document.createElement('section');root.className='world-shell';root.setAttribute('aria-label','Город Бзикер');
 root.innerHTML=`<canvas class="world-canvas" tabindex="0" aria-label="Город: стрелки или WASD; E — действие; P — телефон. Коснитесь двери или скамейки рядом."></canvas>${sourceHudHTML()}<div class="world-map-panel" id="world-map-panel" hidden><div class="world-map-heading"><b>БЗИКЕР · ГОРОД И КВАРТАЛ</b><button type="button" class="world-map-close" aria-label="Свернуть карту">×</button></div><canvas class="world-map-large" width="960" height="640" aria-label="Полная карта Бзикера: ваш маркер отмечен кругом. Коснитесь места для перехода."></canvas><div class="world-map-legend">● Вы здесь · Цвет и подпись показывают назначение места</div><div class="world-map-destinations">${travelDestinations.map(d=>`<button type="button" data-travel="${d.id}">${d.label}</button>`).join('')}</div></div><div class="world-actions"><button type="button" class="world-back" hidden>← В город</button><button type="button" class="world-editor-toggle" hidden aria-expanded="false" aria-controls="world-base-editor">Обстановка</button><button type="button" class="world-boat-exit" hidden>Высадиться</button></div><div class="world-editor" id="world-base-editor" role="region" aria-label="Обстановка базы" hidden><div class="world-editor-heading"><b>Обстановка базы</b><button type="button" class="world-editor-close" aria-label="Закрыть редактор обстановки">×</button></div><p>Коснитесь клетки, чтобы поставить предмет; выберите существующий, чтобы покрасить или повернуть. На компьютере — R.</p><label>Предмет<select class="world-item-type" aria-label="Предмет">${Object.entries(furniture).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Вариант<select class="world-item-variant" aria-label="Вариант мебели"><option value="standard">Базовый</option><option value="premium">Премиум</option></select></label><label>Стиль<select class="world-item-theme" aria-label="Стиль мебели"><option value="modern">Современный</option><option value="loft">Лофт</option><option value="tech">Технологичный</option><option value="wood">Дерево</option><option value="stone">Камень</option></select></label><label>Цвет<input type="color" class="world-item-color" aria-label="Цвет предмета" value="#faf8f2"></label><label>Ракурс<select class="world-item-rotation" aria-label="Поворот мебели"><option value="0">Передом</option><option value="90">Левым боком</option><option value="180">Спиной</option><option value="270">Правым боком</option></select></label><button class="world-rotate" type="button" title="Следующий поворот · R">↻ Повернуть</button><canvas class="world-item-preview" width="176" height="144" role="img" aria-label="Предпросмотр мебели"></canvas><small class="world-placement-size"></small><button type="button" class="world-paint">Покрасить</button><label>Стены<input type="color" class="world-wall-color" aria-label="Цвет стен" value="#faf8f2"></label><label>Отделка стен<select class="world-wall-material"><option value="plaster">Штукатурка</option><option value="brick">Кирпич</option><option value="concrete">Бетон</option><option value="wood">Дерево</option><option value="stone">Камень</option><option value="metal">Металл</option></select></label><label>Пол<input type="color" class="world-floor-color" aria-label="Цвет пола" value="#faf8f2"></label><label>Покрытие<select class="world-floor-material"><option value="board">Доска</option><option value="parquet">Паркет</option><option value="concrete">Бетон</option><option value="tile">Плитка</option><option value="stone">Камень</option><option value="metal">Металл</option></select></label><small class="world-exterior-fixed">Архитектура и цвет фасада зафиксированы при строительстве.</small><button type="button" class="world-delete" aria-pressed="false">Убрать</button><button type="button" class="world-save">Сохранить</button><small class="world-premium-hint">Премиум-мебель доступна после покупки.</small></div><div class="world-hint">Подойдите к двери или скамейке</div>${sourceControlsHTML()}<div class="world-status" role="status"></div><div class="world-restricted" hidden>Завершите анонимные оценки, чтобы вернуться в город.</div>`;
 container.append(root);const $=s=>root.querySelector(s),canvas=$('.world-canvas');let art=createCityArt(),artRevision=0,phaser;
 const scratch=document.createElement('canvas'),c=scratch.getContext('2d');
 let dead=false,controllerLost=false,epoch=0,scene=['base','interior'].includes(initialScene)?initialScene:'city',interior=null,roomObjects=[],world=null,clan=null,items=[],paint={wall_color:colors.paper,floor_color:colors.ink},dirty=false,selected=null,removeMode=false,editorOpen=false,restricted=false,arenaTarget=null,cardTarget=null,wallet=null;
 let position={...worldSpawn},facing='down',moving=false,selfPose='idle',benchId=null,phoneOpen=false,selfPhone=false,selfBoat=null,activityBusy=false,raf=0,lastTime=performance.now(),lastSent=0,refreshBusy=false,moveBusy=false,loaded=false,joystick={x:0,y:0},pointerId=null,baseBusy=false;
 let pendingPickup=null;
 let activityQueue=Promise.resolve(),moveCompletion=Promise.resolve(),walletRevision=0,actionRevision=0,lastActionTime=-Infinity,collectionTime=-Infinity;
 let movementPath=[],movementSequence=0,movementGeneration=0,publishedMovementSequence=0;
 const resetMovementPath=()=>{movementPath=[];movementGeneration++;};
 const recordMovement=()=>{
  const next={x:position.x,y:position.y,sequence:++movementSequence},last=movementPath.at(-1),before=movementPath.at(-2);
  if(before&&last.sequence>publishedMovementSequence){
   const ax=last.x-before.x,ay=last.y-before.y,bx=next.x-last.x,by=next.y-last.y;
   if(ax*bx+ay*by>=0&&Math.abs(ax*by-ay*bx)<1e-7){movementPath[movementPath.length-1]=next;return;}
  }
  movementPath.push(next);
 };
 function worldMutation(path,data,durable=false){const current=epoch,owner=profile?.id||api,previous=worldMutationQueues.get(owner)||Promise.resolve();const operation=previous.catch(()=>{}).then(()=>controllerLost||(dead||current!==epoch)&&!durable?null:api(path,data));worldMutationQueues.set(owner,operation);const clean=()=>{if(worldMutationQueues.get(owner)===operation)worldMutationQueues.delete(owner);};operation.then(clean,clean);return operation;}
 const frameMetrics=diagnostics?{started:null,frames:0,frameMs:0,renderMs:0}:null;
 let visibleActorNodes=0,controlsLearned=false,touchInput=!!window.matchMedia?.('(pointer: coarse)').matches,inventoryOpen=false;
 let width=0,height=0,view={scale:1,x:0,y:0},hint='',lastError='',statusTimer,mapExpanded=false,lastStep=0,lastRow=0,mapVisualCache=null;
 const sound=name=>{try{onSound(name);}catch{}};
 let viewSettings={zoom:1.25,showNicknames:true,lightingMode:'auto',...settings};
 const setSettings=next=>{viewSettings={...viewSettings,...next};viewSettings.zoom=Math.max(.8,Math.min(1.6,Number(viewSettings.zoom)||1.25));viewSettings.showNicknames=viewSettings.showNicknames!==false;if(!['auto','day','night'].includes(viewSettings.lightingMode))viewSettings.lightingMode='auto';};setSettings(settings);
 const keys=new Set(),listeners=[],petPositions=new Map(),seenPetEffects=new Set(),seenActionEffects=new Set(),peerMotion=new Map(),walkStates=new Map();
 let animalClockReceivedAt=performance.now();
 const animalNow=()=>snapshotAnimalTime(world,performance.now()-animalClockReceivedAt)??Date.now()/1000;
 const currentStreetAnimals=()=>Array.isArray(world?.animals)?animalsAt(animalNow(),Object.fromEntries(world.animals.filter(a=>a.pause).map(a=>[a.id,a.pause]))):worldMap.activities.filter(a=>['pet-dog','pet-cat'].includes(a.action)).map(a=>({...a,kind:a.action==='pet-cat'?'cat':'dog',facing:'left',walking:false}));
 const animalActionSnapshot=()=>({...world,animals:currentStreetAnimals()});
 const listen=(el,type,fn,opts)=>{el.addEventListener(type,fn,opts);listeners.push(()=>el.removeEventListener(type,fn,opts));};
 const motionPreference=window.matchMedia?.('(prefers-reduced-motion: reduce)');let reducedMotion=!!motionPreference?.matches;if(motionPreference?.addEventListener)listen(motionPreference,'change',event=>{reducedMotion=event.matches;});
 const status=text=>{$('.world-status').textContent=text;clearTimeout(statusTimer);if(text)statusTimer=setTimeout(()=>{if(!dead)$('.world-status').textContent='';},6000);};
 function reportWorldError(error){
  status(error.message);
  if(error.code!=='world_controller_lost')return false;
  if(!controllerLost){controllerLost=true;epoch++;resetControls();moving=false;onControllerLost(error.message);}
  return true;
 }
 const premiumOwned=type=>(wallet?.inventory||[]).some(i=>i.item_id===`furniture-${type}`&&i.quantity>0);
 function editorValues(){ $('.world-floor-material').value=paint.surface_style||'board';$('.world-wall-material').value=paint.wall_material||'plaster'; $('.world-wall-color').value=paint.wall_color;$('.world-floor-color').value=paint.floor_color; }
 function updatePremium(){const type=$('.world-item-type').value||'sofa',owned=premiumOwned(type);const option=$('.world-item-variant option[value="premium"]');option.disabled=!owned;if(!owned&&$('.world-item-variant').value==='premium')$('.world-item-variant').value='standard';$('.world-premium-hint').textContent=owned?'Купленный премиум-вариант доступен.':'Премиум-вариант этого предмета продаётся в мебельном магазине.';}
 function updateChrome(){
  const canEdit=!restricted&&scene==='base'&&!!clan?.is_leader;if(!canEdit)editorOpen=false;root.classList.toggle('world-editing',canEdit&&editorOpen);$('.world-editor-toggle').hidden=!canEdit;$('.world-editor-toggle').setAttribute('aria-expanded',String(editorOpen));
  root.classList.toggle('world-base',scene==='base');root.classList.toggle('world-interior',scene==='interior');
  $('.world-online-count').textContent=world?String(world.online_count??world.players?.length??0):'…';
  $('.world-back').hidden=scene==='city';$('.world-boat-exit').hidden=!selfBoat;
  $('.world-actions').hidden=restricted;$('.world-map-panel').hidden=restricted||!mapExpanded;$('.world-hud').hidden=restricted;$('.world-controls').hidden=restricted;$('.world-hint').hidden=restricted||scene==='base'||controlsLearned;$('.world-editor').hidden=!canEdit||!editorOpen;$('.world-restricted').hidden=!restricted;
  $('.world-scene-label').title=interior?.label||'Карта Бзикера';$('.world-scene-label').textContent=scene==='base'?'БАЗА · КАРТА ↗':scene==='interior'?`${interior?.label||'ПОМЕЩЕНИЕ'} · КАРТА ↗`:'БЗИКЕР · КАРТА ↗';
  $('.world-save').textContent=dirty?'Сохранить ●':'Сохранено';$('.world-save').disabled=!dirty||baseBusy;$('.world-paint').disabled=!selected;
  $('.world-phone').setAttribute('aria-pressed',String(phoneOpen));
  $('.world-balance').textContent=wallet&&Number.isFinite(wallet.balance)?Math.trunc(wallet.balance).toLocaleString('ru-RU'):'…';
  $('.world-map-destinations button[data-travel="base"]').disabled=!world?.my_clan?.base?.building_id;
  const rotation=Number($('.world-item-rotation').value)||0,type=$('.world-item-type').value||'sofa',shape=furnitureFootprint({type,rotation});$('.world-placement-size').textContent=shape?`${shape.width} × ${shape.height} клетки`:'';updatePremium();
  updateActionAvailability();
  $('.world-rotate').disabled=!canEdit||!editorOpen||baseBusy;$('.world-item-rotation').disabled=!canEdit||baseBusy;
  const preview=$('.world-item-preview'),ctx=preview.getContext('2d'),direction=({0:'передом',90:'левым боком',180:'спиной',270:'правым боком'})[rotation]||'передом';
  preview.setAttribute('aria-label',`${furniture[type]} — ${direction}`);ctx.clearRect(0,0,preview.width,preview.height);ctx.imageSmoothingEnabled=false;
  if(shape){const w=shape.width*worldMap.base.grid.cell_width,h=shape.height*worldMap.base.grid.cell_height,item={type,rotation,variant:$('.world-item-variant').value||'standard',source_theme:$('.world-item-theme').value||'modern'},fit=fitFurniturePreview(item,{width:w,height:h},preview);ctx.save();ctx.translate(fit.x,fit.y);ctx.scale(fit.scale,fit.scale);drawFurnitureVolume(ctx,item,type,0,0,w,h,$('.world-item-color').value||colors.paper);ctx.restore();}
 }
 function setWallet(next){walletRevision++;wallet=next||null;updateChrome();}
 function setActionState(result){
  if(dead||restricted||!world||!result||!Number.isFinite(result.server_time)||result.server_time<Math.max(lastActionTime,collectionTime)||!Object.hasOwn(result,'action_effect')||!Object.hasOwn(result,'holding'))return false;
  const own={action_effect:result.action_effect||null,holding:result.holding==='litter'?'litter':null,...(Object.hasOwn(result,'pet_effect')?{pet_effect:result.pet_effect||null}:{})};
  const collected=own.action_effect?.type==='pick-litter'?[...new Set([...(world.collected_litter||[]),own.action_effect.target_id])]:world.collected_litter||[];
  collectionTime=Math.max(collectionTime,result.server_time);
  actionRevision++;lastActionTime=result.server_time;
  world={...world,...own,collected_litter:collected,server_time:result.server_time,players:(world.players||[]).map(p=>p.id===profile?.id?{...p,...own}:p)};animalClockReceivedAt=performance.now();
  const action=actionEffectState(world.action_effect,animalNow());if(action&&!seenActionEffects.has(action.id)){seenActionEffects.add(action.id);if(seenActionEffects.size>256)seenActionEffects.delete(seenActionEffects.values().next().value);sound(action.type);}
  const pet=petEffectState(world.pet_effect,animalNow());if(pet&&!seenPetEffects.has(pet.id)){seenPetEffects.add(pet.id);if(seenPetEffects.size>256)seenPetEffects.delete(seenPetEffects.values().next().value);sound(pet.kind==='cat'?'cat-meow':'dog-bark');}
  resetControls();return true;
 }
 function syncBase(base={}){items=(base.items||[]).map(i=>({...i}));paint={wall_color:/^#[0-9a-f]{6}$/i.test(base.wall_color||'')?base.wall_color:colors.paper,floor_color:/^#[0-9a-f]{6}$/i.test(base.floor_color||'')?base.floor_color:colors.ink,surface_style:base.surface_style||'board',wall_material:base.wall_material||'plaster'};editorValues();}
 const sameScene=p=>(p.scene===scene||scene==='city'&&p.scene==='district')&&(scene!=='interior'||(p.interior_id||p.scene_id)===interior?.id)&&(scene!=='base'||!p.scene_id||p.scene_id===clan?.id);
 // Peers arrive as position samples. Bridge ordinary movement without extrapolating
 // beyond authority; room transfers, seats, phone poses and teleports snap immediately.
 function samplePeer(motion,time){
  const t=motion.duration?Math.max(0,Math.min(1,(time-motion.started)/motion.duration)):1;
  // Hold the last stride briefly at arrival while the next normal sample is due.
  // Position never extrapolates; unchanged samples cannot extend this deadline.
  const walking=motion.duration>0&&(t<1||time<(motion.walkUntil||0));
  return {...motion.target,x:motion.from.x+(motion.target.x-motion.from.x)*t,y:motion.from.y+(motion.target.y-motion.from.y)*t,facing:motion.facing,walking};
 }
 function peerPathClear(from,to){
  if(scene==='city'&&to.boat)return segmentStaysInLake(worldMap.lake,from,to,12);
  if(scene==='city'&&segmentCrossesLake(worldMap.lake,from,to,playerBodyRadius)&&!to.boat)return false;
  const grid=worldMap.base.grid,solids=scene==='city'?footprints:scene==='interior'?interior.solids:(clan?.base?.items||[]).filter(i=>furnitureCatalog.types.find(t=>t.id===i.type)?.solid).map(i=>{const shape=furnitureFootprint(i);return {x:grid.x+i.x*grid.cell_width,y:grid.y+i.y*grid.cell_height,width:shape.width*grid.cell_width,height:shape.height*grid.cell_height};});
  return !solids.some(s=>segmentBoxDistance(from,to,s)<playerBodyRadius-1e-7);
 }
 function syncPeers(fresh,time){
  const retained=new Set();for(const p of fresh.players||[]){if(p.id===profile?.id||!sameScene(p)||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;retained.add(p.id);const previous=peerMotion.get(p.id),from=previous?samplePeer(previous,time):p,dx=p.x-(previous?.target.x??p.x),dy=p.y-(previous?.target.y??p.y),distance=Math.hypot(dx,dy),stationary=p.pose==='sit'||p.pose==='phone'||p.phone_open||!!petEffectState(p.pet_effect,animalNow())||!!actionEffectState(p.action_effect,animalNow()),sameRoom=previous&&previous.target.scene===p.scene&&previous.target.scene_id===p.scene_id&&previous.target.interior_id===p.interior_id;
   const facing=['up','down','left','right'].includes(p.facing)?p.facing:distance>.1?Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down':previous?.facing||'down';
   const sampleInterval=previous&&Number.isFinite(previous.sampledAt)&&time>previous.sampledAt?Math.max(120,Math.min(1500,time-previous.sampledAt)):previous?.sampleInterval||1000;
   if(previous&&sameRoom&&distance<=.1&&!stationary){
    previous.target=p;previous.facing=facing;
    // Local move replies also repeat peer coordinates. An early duplicate must
    // not shorten the measured poll interval or cancel the pending arrival.
    // The unchanged endpoint never extends its finite walk deadline.
    if(!previous.duration||time>=previous.walkUntil){previous.sampledAt=time;previous.sampleInterval=sampleInterval;}
    continue;
   }
   const animate=sameRoom&&!stationary&&previous.target.boat?.id===p.boat?.id&&distance>.1&&distance<=worldMap.movement_speed*1.5&&peerPathClear(from,p);
   const duration=animate?sampleInterval:0;
   peerMotion.set(p.id,{target:p,from:animate?from:p,started:time,duration,facing,sampledAt:time,sampleInterval,walkUntil:animate?time+duration+Math.min(120,sampleInterval*.15):0});
  }
  for(const id of peerMotion.keys())if(!retained.has(id))peerMotion.delete(id);
 }
 function applySnapshot(fresh,{first=false,reconcile=false,walletVersion=walletRevision,actionVersion=actionRevision}={}){
  const receivedTime=fresh.server_time;
  if(world&&Number.isFinite(receivedTime)&&receivedTime<collectionTime)fresh={...fresh,collected_litter:world.collected_litter||[]};
  if(!fresh.restricted&&world&&(actionVersion!==actionRevision||Number.isFinite(fresh.server_time)&&fresh.server_time<lastActionTime)){
   const own={action_effect:world.action_effect||null,holding:world.holding||null,pet_effect:world.pet_effect||null};
   fresh={...fresh,...own,collected_litter:world.collected_litter||[],server_time:animalNow(),players:(fresh.players||[]).map(p=>p.id===profile?.id?{...p,...own}:p)};
  }
  if(Array.isArray(fresh.collected_litter)&&Number.isFinite(receivedTime))collectionTime=Math.max(collectionTime,receivedTime);
  const previousBoatId=selfBoat?.id;world=fresh;restricted=!!fresh.restricted;if(fresh.wallet&&walletVersion===walletRevision)wallet={...wallet,...fresh.wallet};
  if(restricted){clan=null;items=[];resetControls();moving=false;selfPose='idle';updateChrome();return;}
  const activeLobby=worldArenaLobby(fresh);
  if(activeLobby){if(arenaTarget!==activeLobby){arenaTarget=activeLobby;epoch++;resetControls();moving=false;onArena(activeLobby);}return;}
  const activeCard=avatar.worldCardTable?.(fresh);
  if(activeCard){if(cardTarget!==activeCard){cardTarget=activeCard;epoch++;resetControls();moving=false;onCards(cardTarget);}return;}
  const activeBase=fresh.active_base||fresh.my_clan,authoritativeScene=fresh.scene==='base'&&activeBase?'base':fresh.scene==='interior'&&fresh.interior?.id===fresh.interior_id?'interior':'city';
  const sceneChanged=authoritativeScene!==scene||scene==='interior'&&interior?.id!==fresh.interior_id||scene==='base'&&activeBase?.id!==clan?.id;
  if(first||reconcile||sceneChanged){if(sceneChanged){epoch++;resetControls();dirty=false;selected=null;editorOpen=false;}scene=authoritativeScene;
   if(scene==='interior'){interior=fresh.interior;roomObjects=interiorObjects(interior);const pendingRoom=interior;preloadSourceInteriorRoom(interior).then(()=>{if(!dead&&interior===pendingRoom){roomObjects=interiorObjects(interior);artRevision++;}});}else{interior=null;roomObjects=[];}
   if(scene==='base'){clan={...clan,...activeBase};if(!dirty)syncBase(activeBase.base);}else{clan=null;items=[];dirty=false;selected=null;}
  }
  if(scene==='base'&&activeBase?.id===clan?.id){clan={...clan,...activeBase};if(!clan.is_leader)dirty=false;if(!dirty)syncBase(activeBase.base);}
  animalClockReceivedAt=performance.now();
 const self=fresh.players?.find(p=>p.id===profile?.id);
  selfBoat=fresh.scene==='city'&&(fresh.boat||self?.boat)?{...(fresh.boat||self.boat)}:null;
  for(const p of [fresh,...fresh.players||[]]){const e=petEffectState(p.pet_effect,animalNow());if(e&&!seenPetEffects.has(e.id)){seenPetEffects.add(e.id);if(seenPetEffects.size>256)seenPetEffects.delete(seenPetEffects.values().next().value);if(p===fresh||p.id===profile?.id||sameScene(p)&&Math.hypot(p.x-(fresh.position?.x??position.x),p.y-(fresh.position?.y??position.y))<=320)sound(e.kind==='cat'?'cat-meow':'dog-bark');}}
  for(const p of [fresh,...fresh.players||[]]){const e=actionEffectState(p.action_effect,animalNow());if(e&&!seenActionEffects.has(e.id)){seenActionEffects.add(e.id);if(seenActionEffects.size>256)seenActionEffects.delete(seenActionEffects.values().next().value);if(p===fresh||p.id===profile?.id||sameScene(p)&&Math.hypot(p.x-(fresh.position?.x??position.x),p.y-(fresh.position?.y??position.y))<=320)sound(e.type);}}
  selfPose=fresh.pose||self?.pose||'idle';selfPhone=!!(fresh.phone_open??self?.phone_open);benchId=fresh.bench_id||self?.bench_id||null;
  if(scene==='interior'||scene==='base'){const player={pose:selfPose,bench_id:benchId,phone_open:selfPhone,facing},seated=scene==='base'?baseSeatedActor(clan,player):interiorSeatedActor(interior,player);selfPose=seated.pose;selfPhone=seated.phone_open;facing=seated.facing;}
  const seatedContact=selfPose==='sit'&&scene==='interior'&&interior.seats.some(s=>s.id===benchId&&Math.hypot(fresh.position?.x-s.seat.x,fresh.position?.y-s.seat.y)<.01);
  if(fresh.position&&(first||reconcile||sceneChanged||previousBoatId!==selfBoat?.id||selfPose==='sit')){position=selfBoat||seatedContact?{...fresh.position}:scene==='base'?{...fresh.position}:scene==='interior'?moveInteriorPosition(interior,fresh.position,0,0):clampPosition(fresh.position.x,fresh.position.y);resetMovementPath();}
  syncPeers(fresh,performance.now());loaded=true;lastError='';updateChrome();
 }
 async function refresh(){
  if(dead||controllerLost||document.hidden||refreshBusy)return;const current=epoch,walletVersion=walletRevision,actionVersion=actionRevision;refreshBusy=true;
  try{const fresh=await api('/api/world');if(!dead&&current===epoch)applySnapshot(fresh,{first:!loaded,walletVersion,actionVersion});}
  catch(error){if(!dead&&current===epoch&&error.message!==lastError){lastError=error.message;status(error.message);}}
  finally{refreshBusy=false;}
 }
 async function sendPosition(force=false,options={}){
  if(dead||controllerLost||document.hidden||restricted||arenaTarget||cardTarget||!loaded||(baseBusy||activityBusy)&&!force)return;
  if(moveBusy){if(force){const current=epoch;await moveCompletion;if(!dead&&current===epoch)return sendPosition(true,options);}return;}const current=epoch,walletVersion=walletRevision,actionVersion=actionRevision;moveBusy=true;let finishMove;moveCompletion=new Promise(resolve=>{finishMove=resolve;});lastSent=performance.now();
  const generation=movementGeneration,path=options.teleport===true?[]:movementPath.slice(0,128),endpoint=path.at(-1)||position;
  publishedMovementSequence=path.at(-1)?.sequence||publishedMovementSequence;
  const payload={x:endpoint.x,y:endpoint.y,scene};if(path.length)payload.path=path.map(({x,y})=>({x,y}));if(scene==='interior')payload.interior_id=interior?.id;else if(scene==='base')payload.clan_id=clan?.id;else if(selfBoat)payload.boat_id=selfBoat.id;if(options.teleport===true)payload.teleport=true;
  let continuePath=false,accepted=false;
  try{const fresh=await worldMutation('/api/world/move',payload);if(!dead&&current===epoch){
   if(generation===movementGeneration&&path.length)movementPath=movementPath.filter(p=>p.sequence>path.at(-1).sequence);
   const clipped=path.length&&fresh.position&&Math.hypot(fresh.position.x-endpoint.x,fresh.position.y-endpoint.y)>.01;
   if(clipped)resetMovementPath();
   applySnapshot(fresh,{reconcile:clipped||force&&!movementPath.length,walletVersion,actionVersion});
   continuePath=generation===movementGeneration&&movementPath.length>0;accepted=true;
  }}
  catch(error){if(!dead&&current===epoch){if(reportWorldError(error))return;try{const fresh=await api('/api/world');if(!dead&&current===epoch)applySnapshot(fresh,{reconcile:true,walletVersion,actionVersion});}catch(recoveryError){if(!dead&&current===epoch)status(recoveryError.message);}}}
  finally{moveBusy=false;finishMove();}
  if(continuePath&&!dead&&current===epoch)return sendPosition(force,options);
  return accepted;
 }
 async function activity(data){
  const closingPhone=data.action==='phone'&&data.open===false;
  if(controllerLost||!closingPhone&&(dead||restricted||arenaTarget||cardTarget||activityBusy&&data.action!=='phone'))return;
  const current=epoch,walletVersion=walletRevision,actionVersion=actionRevision,owner=profile?.id||api,previousPhone=data.action==='phone'?phoneQueues.get(owner)||Promise.resolve():Promise.resolve();
  const operation=Promise.all([activityQueue,previousPhone]).then(async()=>{
   // Closing is durable cleanup: it must reach the server even after its view was removed.
   // Openings and all other actions remain scoped to the live scene that requested them.
   if(!closingPhone&&(dead||current!==epoch||restricted||arenaTarget||cardTarget))return;activityBusy=true;
   try{if(data.action==='sit'||data.action==='phone'&&data.open)await sendPosition(true);if(!closingPhone&&(dead||current!==epoch))return;const fresh=await worldMutation('/api/world/activity',data,closingPhone);if(!dead&&current===epoch){applySnapshot(fresh,{reconcile:true,walletVersion,actionVersion});if(data.action==='sit'&&selfPose==='sit')sound('sit');else if(data.action==='stand'&&selfPose!=='sit')sound('stand');}}
   catch(error){if(!dead&&current===epoch)reportWorldError(error);}finally{activityBusy=false;}
  });
  const queued=operation.catch(()=>{});activityQueue=queued;
  if(data.action==='phone'){phoneQueues.set(owner,queued);queued.then(()=>{if(phoneQueues.get(owner)===queued)phoneQueues.delete(owner);});}
  return operation;
 }
 async function setPhone(open){
  if(controllerLost||dead&&open)return;phoneOpen=!!open;if(!dead){resetControls();updateChrome();}
  return activity({action:'phone',open:phoneOpen});
 }
 async function setInventory(open){
  if(controllerLost)return;
  inventoryOpen=!!open;resetControls();if(inventoryOpen){mapExpanded=false;editorOpen=false;}
  root.classList.toggle('world-inventory-open',inventoryOpen);updateChrome();
  if(inventoryOpen)await sendPosition(true);
 }

 async function enterBase(clanId=world?.my_clan?.id){
  if(!clanId||dead||controllerLost||!loaded||baseBusy||restricted||arenaTarget||cardTarget)return;const current=epoch,walletVersion=walletRevision,actionVersion=actionRevision;baseBusy=true;resetControls();
  try{await sendPosition(true);if(dead||current!==epoch)return;const fresh=await worldMutation('/api/world/move',{scene:'base',clan_id:clanId,...worldMap.base.spawn});if(dead||current!==epoch)return;epoch++;applySnapshot(fresh,{reconcile:true,walletVersion,actionVersion});toggleMap(false);if(scene==='base'&&clan?.id===clanId)sound('door-open');}
  catch(error){if(!dead&&current===epoch)reportWorldError(error);}finally{baseBusy=false;if(!dead)updateChrome();}
 }
 async function enterInterior(buildingId){
  if(dead||controllerLost||restricted||arenaTarget||cardTarget||!loaded||baseBusy||scene!=='city')return;const current=epoch,walletVersion=walletRevision,actionVersion=actionRevision;baseBusy=true;resetControls();
  try{await sendPosition(true);if(dead||current!==epoch)return;const fresh=await worldMutation('/api/world/enter',{building_id:buildingId});if(dead||current!==epoch)return;epoch++;applySnapshot(fresh,{reconcile:true,walletVersion,actionVersion});toggleMap(false);if(scene==='interior'&&interior?.id===buildingId)sound('door-open');}
  catch(error){if(!dead&&current===epoch)reportWorldError(error);}finally{baseBusy=false;if(!dead)updateChrome();}
 }
 async function exitInterior(){
  if(dead||controllerLost||restricted||arenaTarget||cardTarget||scene!=='interior'||baseBusy)return;if(!interior||Math.hypot(position.x-interior.exit.x,position.y-interior.exit.y)>110){status('Подойдите к выходу из комнаты.');return;}const current=epoch,walletVersion=walletRevision,actionVersion=actionRevision;baseBusy=true;resetControls();
  try{await sendPosition(true);if(dead||current!==epoch)return;const fresh=await worldMutation('/api/world/exit',{});if(dead||current!==epoch)return;epoch++;applySnapshot(fresh,{reconcile:true,walletVersion,actionVersion});if(scene==='city')sound('door-close');}
  catch(error){if(!dead&&current===epoch)reportWorldError(error);}finally{baseBusy=false;if(!dead)updateChrome();}
 }
 function ownPetAction(){const pet=world?.pet||profile?.pet;if(!pet||selfBoat)return null;const follower=petPositions.get(profile?.id)||petFollower({...profile,...position,scene,pet,facing},null);if(!follower||Math.hypot(follower.x-position.x,follower.y-position.y)>65)return null;return {id:pet.id,kind:'activity',action:'pet',label:pet.kind==='cat'?'Погладить свою кошку':'Погладить свою собаку',x:follower.x,y:follower.y,radius:65};}
 function currentAction(){
  if(selfBoat)return {id:`boat:${selfBoat.id}`,kind:'boat-fishing',label:'Рыбачить с лодки',x:position.x,y:position.y,radius:65};
  if(scene==='interior')return nearestInteriorAction(interior,position.x,position.y,world,profile?.id)||ownPetAction();
  if(scene==='city')return nearestAction(position.x,position.y,animalActionSnapshot(),profile?.id)||ownPetAction();
  const seats=clan?.base?.seats?clan.base.seats.map(s=>({kind:'bench',id:s.id,...s.seat,facing:s.facing||'down',radius:65})):baseSeats(clan),occupied=new Set((world?.players||[]).filter(p=>p.id!==profile?.id).map(p=>p.bench_id));
  return seats.filter(s=>!occupied.has(s.id)&&Math.hypot(s.x-position.x,s.y-position.y)<=65).sort((a,b)=>Math.hypot(a.x-position.x,a.y-position.y)-Math.hypot(b.x-position.x,b.y-position.y))[0]||(position.y<690?ownPetAction():null);
 }
 async function travel(id,details={}){
  if(dead||controllerLost||restricted||arenaTarget||cardTarget||!loaded)return;
  if(selfBoat){status('Сначала вернитесь к причалу и высадитесь.');return;}
  if(id==='base'&&details.clan_id)return enterBase(details.clan_id);const target=travelTarget(id,world);if(!target){status(id==='base'?'У вашего клана пока нет базы.':'Это место недоступно.');return;}
  resetControls();if(target.scene==='base')return enterBase();
  resetMovementPath();position=target.position;scene='city';interior=null;roomObjects=[];epoch++;clan=null;items=[];dirty=false;selected=null;selfPose='idle';benchId=null;toggleMap(false);updateChrome();await sendPosition(true,{teleport:true});
 }
 async function setScene(next){
  if(next==='base')return travel('base');if(next==='district')return travel('district');if(next!=='city')return;
  if(scene==='base')return leaveBase();if(scene==='interior')return exitInterior();return travel('station');
 }
 async function leaveBase(){
  if(dead||controllerLost||restricted||arenaTarget||cardTarget)return;
  const house=districtHouses.find(h=>h.id===(clan?.base?.building_id||world?.my_clan?.base?.building_id));
  resetControls();resetMovementPath();scene='city';position=house?{x:house.door.x,y:house.door.y+28}:{...worldMap.landmarks.district};epoch++;clan=null;items=[];dirty=false;selected=null;updateChrome();await sendPosition(true);if(scene==='city')sound('door-close');
 }
 async function boatAction(action,boatId=selfBoat?.id){
  if(!boatId||dead||controllerLost||!loaded||restricted||baseBusy||activityBusy||arenaTarget||cardTarget)return;
  const config=worldMap.boats.find(b=>b.id===boatId);if(action==='boat-exit'&&(!config||Math.hypot(position.x-config.dock.x,position.y-config.dock.y)>85)){status('Вернитесь к своему причалу, чтобы высадиться.');return;}
  const current=epoch,walletVersion=walletRevision,actionVersion=actionRevision;activityBusy=true;resetControls();
  try{await sendPosition(true);if(dead||current!==epoch)return;const fresh=await worldMutation('/api/world/action',{action,target_id:boatId});if(dead||current!==epoch)return;applySnapshot(fresh,{reconcile:true,walletVersion,actionVersion});if(action==='boat-board'&&selfBoat?.id===boatId)sound('boat-board');if(action==='boat-exit'&&!selfBoat)sound('boat-exit');}
  catch(error){if(!dead&&current===epoch)reportWorldError(error);}finally{activityBusy=false;if(!dead)updateChrome();}
 }
 function canInteractNow(action=currentAction(),allowSeatedPet=false){
  const seatedPet=allowSeatedPet&&selfPose==='sit'&&action?.action==='pet'&&!phoneOpen;
  return loaded&&!pendingPickup&&!dead&&!controllerLost&&!restricted&&!inventoryOpen&&!phoneOpen&&(!selfPhone||seatedPet)&&!mapExpanded&&!editorOpen&&!baseBusy&&!activityBusy&&!arenaTarget&&!cardTarget&&!document.querySelector('dialog[open]')&&!petEffectState(world?.pet_effect,animalNow())&&!actionEffectState(world?.action_effect,animalNow())&&(!!action||scene==='base'&&position.y>=690);
 }
 function updateActionAvailability(action=currentAction()){
  const button=$('.world-enter');
  // Keep all three control slots visible in ordinary play. The authored grey
  // hand describes an unavailable action; overlays pause the controls.
  button.hidden=!!(dead||controllerLost||restricted||inventoryOpen||phoneOpen||selfPhone||mapExpanded||editorOpen||arenaTarget||cardTarget||document.querySelector('dialog[open]'));
  button.disabled=!canInteractNow(action);
 }
 function beginPickup(action){
  const stance=pickupStance(position,profile.avatar,action);
  if(!stance){status('Подойдите к мусору с другой стороны.');return;}
  pendingPickup={action,stance,epoch,committing:false};
 }
 async function finishPickup(intent){
  if(pendingPickup!==intent||intent.committing)return;
  intent.committing=true;moving=false;facing=intent.stance.facing;
  const accepted=await sendPosition(true);
  if(pendingPickup!==intent||dead||controllerLost||epoch!==intent.epoch)return;
  if(!accepted||scene!=='city'||Math.hypot((world?.position?.x??Infinity)-intent.stance.x,(world?.position?.y??Infinity)-intent.stance.y)>.01){pendingPickup=null;status('Не удалось подойти к мусору. Попробуйте ещё раз.');return;}
  // The server has accepted the real walk. Only now may the authoritative action begin.
  facing=intent.stance.facing;
  try{await onInteract('pick-litter',{target_id:intent.action.id});}
  catch(error){if(pendingPickup===intent)status(error.message);}
  finally{if(pendingPickup===intent)pendingPickup=null;}
 }
 function interact(action=currentAction()){
  if(!canInteractNow(action,true))return;resetControls();
  if(scene==='base'&&action?.kind!=='bench'&&action?.action!=='pet'){if(position.y>=690)leaveBase();else status(clan?.is_guest?'Вы в гостях на базе клана.':'Общая мастерская вашего клана.');return;}
  if(!action)return;
  if(action.kind==='boat'){boatAction('boat-board',action.id);return;}
  if(action.kind==='boat-fishing'){const current=epoch;sendPosition(true).then(()=>{if(!dead&&current===epoch)onInteract('fishing',{spot_id:action.id});});return;}
  if(scene==='interior'){if(action.kind==='exit'){exitInterior();return;}if(action.kind==='counter'){const current=epoch;sendPosition(true).then(()=>{if(!dead&&current===epoch)onInteract(action.id);});return;}}
  if(action.kind==='activity'&&action.action==='pick-litter'&&scene==='city'&&!selfBoat){beginPickup(action);return;}
  if(action.kind==='activity'){const current=epoch;sendPosition(true).then(()=>{if(!dead&&current===epoch)onInteract(action.action,action.action==='fishing'?{spot_id:action.id}:{target_id:action.id});});return;}
  if(action.kind==='bench'){facing=action.facing||'down';activity(selfPose==='sit'&&benchId===action.id?{action:'stand'}:{action:'sit',bench_id:action.id});return;}
  const entry=action.id;
  if(action.kind==='board'){const current=epoch;sendPosition(true).then(()=>{if(!dead&&current===epoch)onInteract(entry);});}
  else if(entry.startsWith('base-')){const house=world?.buildings?.find(b=>b.id===entry);if(house?.clan?.id)enterBase(house.clan.id);else{const current=epoch;sendPosition(true).then(()=>{if(!dead&&current===epoch)onInteract('clans',{building_id:entry,clan_id:null});});}}
  else if(cityBuildings.some(b=>b.id===entry))enterInterior(entry);
  else onInteract(entry);
 }
 function drawMap(target,expanded=false){
  const mc=target.getContext('2d'),mw=target.width,mh=target.height,fit=Math.min(mw/W,mh/H),sx=isExactSourceCity(worldMap)?fit:mw/W,sy=isExactSourceCity(worldMap)?fit:mh/H,ox=(mw-W*sx)/2,oy=(mh-H*sy)/2;
  if(!expanded&&scene==='interior'&&interior){drawInteriorMiniMap(mc,interior,position,(world?.players||[]).filter(p=>p.id!==profile?.id&&sameScene(p)));return;}
  const styleKey=JSON.stringify(districtHouses.map(h=>{const clan=world?.buildings?.find(b=>b.id===h.id)?.clan;return [clan?.id,clan?.name,clan?.flag,clan?.exterior_style,clan?.exterior_color,clan?.color];}));
  if(!mapVisualCache||mapVisualCache.art!==art||mapVisualCache.styleKey!==styleKey){
   const background=document.createElement('canvas');background.width=960;background.height=Math.round(960*H/W);const bc=background.getContext('2d');bc.imageSmoothingEnabled=false;bc.scale(background.width/W,background.height/H);
   drawCityGround(bc,cityGroundPlan,{x:0,y:0,width:W,height:H});if(!isExactSourceCity(worldMap))drawCityArchitectureGround(bc,worldMap,{x:0,y:0,width:W,height:H});
   const plots=districtHouses.flatMap(h=>houseObject(h,world?.buildings?.find(b=>b.id===h.id)?.clan));
   for(const node of sortWorldDepth([...art.objects,...plots]))node.draw(bc,0);
   mapVisualCache={art,styleKey,canvas:background};
  }
  mc.clearRect(0,0,mw,mh);rect(mc,0,0,mw,mh,'#353d39');mc.imageSmoothingEnabled=false;mc.drawImage(mapVisualCache.canvas,ox,oy,W*sx,H*sy);
  const captions={railway:'ВОКЗАЛ',arena:'СВОЯ ИГРА',clans:'ДОМ КЛАНОВ',profile:'ОБРАЗЫ',results:'ГАЛЕРЕЯ',messages:'КАФЕ',terrace:'ГОСТИНАЯ','shop-food':'ПРОДУКТЫ','shop-clothes':'ОДЕЖДА','shop-furniture':'МЕБЕЛЬ',casino:'КАЗИНО'};
  const captionBoxes=[];
  const caption=(text,x,y,size)=>{const px=x*sx;let py=y*sy;mc.font=`bold ${size}px monospace`;const tw=mc.measureText(text).width;
   // Keep labels legible when nearby places share the same overview row.
   for(const offset of [0,-14,14,-28,28,-42,42]){const candidate={x:px-tw/2-3,y:y*sy+offset-size-1,width:tw+6,height:size+5};if(!captionBoxes.some(b=>candidate.x<b.x+b.width&&candidate.x+candidate.width>b.x&&candidate.y<b.y+b.height&&candidate.y+candidate.height>b.y)){py=y*sy+offset;captionBoxes.push(candidate);break;}}
   rect(mc,px-tw/2-2,py-size,tw+4,size+3,'#faf8f2d9');label(mc,text,px,py,size,'#253c31');};
  if(!isExactSourceCity(worldMap)&&expanded){for(const b of cityBuildings)caption(captions[b.id],b.x+b.width/2,b.y-95,10);for(const h of districtHouses)caption(h.id.split('-')[1].padStart(2,'0'),h.x+h.width-15,h.y+20,10);caption('КЛАНОВЫЙ КВАРТАЛ',worldMap.landmarks.district.x,1100,11);caption('ПАРК У ОЗЕРА',worldMap.landmarks.park.x,worldMap.landmarks.park.y-120,11);caption('КУРИЛКА',smokingZone.door.x,smokingZone.y-30,10);caption('ПЛОЩАДЬ БЗИКЕРА',worldMap.landmarks.plaza.x,worldMap.landmarks.plaza.y+150,10);}
  else if(!isExactSourceCity(worldMap))for(const [text,key] of [['ВОКЗАЛ','station'],['ЦЕНТР','plaza'],['ДОМА','district'],['ПАРК','park']])caption(text,worldMap.landmarks[key].x,worldMap.landmarks[key].y-100,7);
  const point=scene==='base'?districtHouses.find(h=>h.id===clan?.base?.building_id)?.door||worldSpawn:scene==='interior'?interior?.door||worldSpawn:position;mc.fillStyle=colors.paper;mc.beginPath();mc.arc(ox+point.x*sx,oy+point.y*sy,expanded?5:3,0,Math.PI*2);mc.fill();mc.fillStyle=colors.ink;mc.beginPath();mc.arc(ox+point.x*sx,oy+point.y*sy,expanded?3:1.7,0,Math.PI*2);mc.fill();
 }
 function resize(){const top=root.getBoundingClientRect().top;if(Number.isFinite(window.innerHeight))root.style?.setProperty('--world-height',`${worldViewportHeight(window.innerHeight,top)}px`);const r=canvas.getBoundingClientRect();width=Math.round(r.width);height=Math.round(r.height);phaser?.resize(width,height,Math.min(window.devicePixelRatio||1,2));}
 const observer=new ResizeObserver(resize);observer.observe(root);resize();listen(window,'resize',resize);
 function draw(time){
  if(dead)return;if(document.hidden||controllerLost)pendingPickup=null;const frameMs=Math.max(0,time-lastTime),renderStarted=frameMetrics?performance.now():0,dt=Math.min(frameMs/1000,.045);lastTime=time;visibleActorNodes=0;
  if(diagnostics){root.dataset.worldScene=scene;root.dataset.worldX=position.x.toFixed(2);root.dataset.worldY=position.y.toFixed(2);root.dataset.worldPose=selfPose;root.dataset.worldPhone=String(phoneOpen||selfPhone);}
  if(!document.hidden&&!controllerLost){
   const paused=!!document.querySelector('dialog[open]')||!!arenaTarget||!!cardTarget||phoneOpen||selfPhone||inventoryOpen||mapExpanded||editorOpen||baseBusy||activityBusy||!!petEffectState(world?.pet_effect,animalNow())||!!actionEffectState(world?.action_effect,animalNow());
   if(paused)resetControls();
   let dx=joystick.x+(keys.has('ArrowRight')||keys.has('d')?1:0)-(keys.has('ArrowLeft')||keys.has('a')?1:0),dy=joystick.y+(keys.has('ArrowDown')||keys.has('s')?1:0)-(keys.has('ArrowUp')||keys.has('w')?1:0);
   const approach=pendingPickup;
   if(approach&&!approach.committing&&!paused){const sx=approach.stance.x-position.x,sy=approach.stance.y-position.y,distance=Math.hypot(sx,sy);if(distance<=.01)finishPickup(approach);else{const fraction=Math.min(1,distance/(worldMap.movement_speed*dt||1));dx=sx/distance*fraction;dy=sy/distance*fraction;}}
   moving=loaded&&!restricted&&!paused&&Math.hypot(dx,dy)>(approach&&!approach.committing?1e-7:.12);
   if(moving){controlsLearned=true;$('.world-hint').hidden=true;const before={...position};const length=Math.max(1,Math.hypot(dx,dy));dx/=length;dy/=length;position=selfBoat?moveBoatPosition(worldMap.lake,position,dx*worldMap.movement_speed*dt,dy*worldMap.movement_speed*dt,14):scene==='city'?movePosition(position,dx*worldMap.movement_speed*dt,dy*worldMap.movement_speed*dt):scene==='interior'?moveInteriorPosition(interior,position,dx*worldMap.movement_speed*dt,dy*worldMap.movement_speed*dt):moveBasePosition({...clan,base:{...clan?.base,items}},position,dx*worldMap.movement_speed*dt,dy*worldMap.movement_speed*dt);if(Math.hypot(position.x-before.x,position.y-before.y)>1e-7)recordMovement();const travelledX=position.x-before.x,travelledY=position.y-before.y;const faceX=Math.hypot(travelledX,travelledY)>1e-7?travelledX:dx,faceY=Math.hypot(travelledX,travelledY)>1e-7?travelledY:dy;facing=Math.abs(faceX)>Math.abs(faceY)?faceX<0?'left':'right':faceY<0?'up':'down';if(selfPose==='sit'){selfPose='idle';benchId=null;sendPosition(true);}moving=Math.hypot(position.x-before.x,position.y-before.y)>1e-7;if(moving){if(selfBoat){selfBoat={...selfBoat,...position};if(time-lastRow>=650){sound('boat-row');lastRow=time;}}else if(time-lastStep>=240){sound('step');lastStep=time;}}}
   if(approach&&pendingPickup===approach&&!approach.committing){const remaining=Math.hypot(position.x-approach.stance.x,position.y-approach.stance.y);if(remaining<=.01)finishPickup(approach);else if(dt>0&&!moving){pendingPickup=null;status('Проход к мусору перекрыт.');}}
   const sceneWidth=scene==='city'?W:interior?.width||worldMap.base.width,sceneHeight=scene==='city'?H:interior?.height||worldMap.base.height;
   const dpr=Math.min(window.devicePixelRatio||1,2);view=worldCamera({width,height,dpr,zoom:viewSettings.zoom,sceneWidth,sceneHeight,position,sceneBounds:scene==='interior'?interiorCameraBounds(interior):null});const {scale,width:vw,height:vh}=view;
   if(restricted){phaser.setView(view);phaser.clearNight();}
   else{
    let objects=[],ground,groundObjects=[],foregrounds=[];const sceneKey=scene+':'+(interior?.id||clan?.id||'city');
    if(scene==='city'){
     ground=(ctx,tile)=>art.drawGround(ctx,tile,{nativeObjects:false});groundObjects=(art.groundObjects||[]).filter(node=>litterIsVisible(node,world||{},animalNow(),reducedMotion));
     objects=[...art.objects,...districtHouses.flatMap(h=>houseObject(h,world?.buildings?.find(b=>b.id===h.id)?.clan))];
    }else if(scene==='interior'&&interior){
     const details=sourceInteriorDetailLayout(interior);
     ground=(ctx,tile)=>{ctx.save();ctx.fillStyle='#171a1c';ctx.fillRect(tile.x,tile.y,tile.width,tile.height);ctx.restore();drawInteriorGround(ctx,interior);for(const detail of details.filter(d=>d.layer==='background'))drawSourceInteriorDetail(ctx,detail);};
     objects=[...roomObjects,...details.filter(d=>d.layer==='object').map(detail=>({id:detail.id,bounds:detail.bounds,depth:detail.depth,draw:ctx=>drawSourceInteriorDetail(ctx,detail)}))];
     foregrounds=details.filter(d=>d.layer==='foreground').map(detail=>({id:detail.id,bounds:detail.bounds,draw:ctx=>drawSourceInteriorDetail(ctx,detail)}));
    }else{
     const seatedIds=new Set(baseSeats({...clan,base:{...clan?.base,items}}).filter(seat=>[...(world?.players||[]),{pose:selfPose,bench_id:benchId}].some(player=>['sit','phone'].includes(player.pose)&&player.bench_id===seat.id)).map(seat=>seat.item_id));
     ground=ctx=>baseArt(ctx,items,editorOpen&&!!clan?.is_leader,paint,editorOpen?selected:null,seatedIds);
     objects=baseArt(c,items,editorOpen&&!!clan?.is_leader,paint,editorOpen?selected:null,seatedIds);
    }
    const action=currentAction();
    const players=[...peerMotion.values()].map(motion=>samplePeer(motion,time));
    players.push({...profile,action_effect:world?.action_effect||null,holding:world?.holding||null,...position,scene,scene_id:scene==='base'?clan?.id:null,interior_id:interior?.id||null,clan:world?.my_clan||null,pose:selfPose,bench_id:benchId,phone_open:selfPhone||phoneOpen,boat:selfBoat,pet_effect:world?.pet_effect||null,pet:world?.pet||profile?.pet||null,facing,walking:moving,self:true});
    const walkingIds=new Set();for(const player of players){walkingIds.add(player.id);const walk=advanceWalkCycle(walkStates.get(player.id),player,reducedMotion);walkStates.set(player.id,walk);player.walkFrame=walk.frame;}for(const id of walkStates.keys())if(!walkingIds.has(id))walkStates.delete(id);
    const petNodes=players.flatMap(p=>{let pet=petFollower(p,petPositions.get(p.id),dt);if(!pet||p.boat){petPositions.delete(p.id);return [];}const reaction=petEffectState(p.pet_effect,animalNow())?.target_id===pet.id?p.pet_effect:null;if(reaction){const owner=scene==='base'?baseActorPlacement({...clan,base:{...clan?.base,items}},p).player:scene==='city'?cityActorPlacement(p).player:interiorSeatedActor(interior,p),layout=petInteractionLayout(owner,pet,animalNow(),reducedMotion);if(layout)pet=layout.animal;}pet=advancePetMotion(petPositions.get(p.id),{...pet,scene:p.scene,scene_id:p.scene_id,interior_id:p.interior_id},dt,reducedMotion);petPositions.set(p.id,pet);return [{id:'pet:'+pet.id,actor:true,revision:actorVisualRevision(pet,reaction),depth:pet.y,bounds:{x:pet.x-45,y:pet.y-85,width:90,height:105},draw(ctx){drawAnimal(ctx,{...pet,owned:true},reaction,reducedMotion,animalNow());}}];});const playerIds=new Set(players.map(p=>p.id));for(const id of petPositions.keys())if(!playerIds.has(id))petPositions.delete(id);const animalTime=animalNow(),streetAnimals=scene==='city'?currentStreetAnimals():[],streetPets=streetAnimals.map(a=>{const owner=players.filter(p=>petEffectState(p.pet_effect,animalTime)?.target_id===a.id).sort((p,q)=>q.pet_effect.started_at-p.pet_effect.started_at)[0],effect=owner?.pet_effect,placedOwner=owner&&cityActorPlacement(owner).player,layout=placedOwner&&petInteractionLayout(placedOwner,a,animalTime,reducedMotion),animal=layout?.animal||a;return {id:'street-pet:'+a.id,actor:true,revision:actorVisualRevision(animal,effect),depth:animal.y,bounds:{x:animal.x-45,y:animal.y-85,width:90,height:105},draw(ctx){drawAnimal(ctx,animal,effect,reducedMotion,animalTime);}};});const boats=scene==='city'?(world?.boats||worldMap.boats).flatMap(b=>{const owner=players.find(p=>p.boat?.id===b.id),actual=owner?{...b,x:owner.x,y:owner.y,occupant_id:owner.id,moving:owner.walking}:{...b};actual.exact_scene=isExactSourceCity(worldMap);const bounds=sourceBoatLayout(actual,time,reducedMotion).bounds;return [{id:'boat:'+actual.id+':back',actor:true,revision:actorVisualRevision(actual),depth:actual.y-2,bounds,draw(ctx){drawBoat(ctx,actual,time,false,reducedMotion);}},{id:'boat:'+actual.id+':front',actor:true,revision:actorVisualRevision(actual),depth:actual.y+6,bounds,draw(ctx){drawBoat(ctx,actual,time,true,reducedMotion);}}];}):[];const nodes=[...objects,...boats,...streetPets,...petNodes,...players.map(p=>{const placed=scene==='base'?baseActorPlacement({...clan,base:{...clan?.base,items}},p):scene==='city'?cityActorPlacement(p):{player:interiorSeatedActor(interior,p),depth:p.y},actor=placed.player;return {id:'player:'+p.id,actor:true,revision:actorVisualRevision(actor),depth:placed.depth,bounds:actorRenderBounds(actor,animalTime),draw(ctx){drawAvatar(ctx,actor,time,p.self,viewSettings.showNicknames,reducedMotion,animalTime,streetAnimals,scene!=='city');}};})];
    const labels=[];
    if(scene==='city'){
     for(const player of players){const p=cityActorPlacement(player).player;labels.push({id:'player:'+p.id,bounds:{x:p.x-122,y:p.y-110,width:244,height:120},revision:JSON.stringify([p.name,p.clan,viewSettings.showNicknames]),draw:ctx=>drawAvatarLabels(ctx,p,p.self,viewSettings.showNicknames)});}
     if(!isExactSourceCity(worldMap))for(const building of cityBuildings){const r=sourceBuildingLayout(building);if(!r?.bounds)continue;const {x,y,width,height}=r.bounds;labels.push({id:'building:'+building.id,bounds:{x:r.anchor.x-170/view.scale,y:y-30/view.scale,width:340/view.scale,height:40/view.scale},revision:view.scale,draw:ctx=>drawLocationLabels(ctx,{x,y,width,height,scale:view.scale})});}
    }
    const revision=JSON.stringify([artRevision,sceneKey,scene==='base'?[items,paint,editorOpen,selected,world?.players?.map(p=>p.bench_id),benchId]:null]);
    visibleActorNodes=nodes.filter(n=>n.actor&&n.bounds&&n.bounds.x+n.bounds.width>=view.x&&n.bounds.x<=view.x+vw&&n.bounds.y+n.bounds.height>=view.y&&n.bounds.y<=view.y+vh).length;
    paintWorldFrame(phaser,{sceneKey,revision,view,time,reducedMotion,ground,groundObjects,
     water:scene==='city'?ctx=>drawSourceLake(ctx,worldMap.lake,time,{shore:false,reducedMotion}):null,
     waterBounds:scene==='city'?lakeBounds(worldMap.lake):null,nodes:sortWorldDepth(nodes),foregrounds,labels,action,
     lighting:scene==='city'?{light:worldLight(Date.now(),viewSettings.lightingMode),lamps:worldMap.decor.lamps}:null});
    let text=scene==='base'?(position.y>=690?'Выйти в город':'База клана'):'Подойдите ближе';
    if(action?.kind==='bench')text=selfPose==='sit'&&benchId===action.id?'Встать':scene==='city'?'Сесть на скамейку':'Сесть';
    else if(action?.kind==='exit')text='Выйти в город';
    else if(action?.kind==='counter'||action?.kind==='activity'||action?.kind==='boat'||action?.kind==='boat-fishing')text=action.label;
    else if(action){text={terrace:'Войти в гостиную',arena:'Войти в «Свою игру»',clans:'Открыть кланы',results:'Результаты',profile:'Изменить образ',messages:'Кафе / сообщения','shop-food':'Купить продукты','shop-clothes':'Магазин одежды','shop-furniture':'Магазин мебели',casino:'Войти в казино',smoking:'Курилка',railway:'Вокзал Бзикер'}[action.id]||(action.id.startsWith('base-')?(!world?.buildings?.find(h=>h.id===action.id)?.clan?'Построить клановый дом':world?.buildings?.find(h=>h.id===action.id)?.clan?.id===world?.my_clan?.id&&world?.my_clan?'Войти на базу':'Войти по приглашению'):'Войти');}
    if(selfBoat){const dock=worldMap.boats.find(b=>b.id===selfBoat.id)?.dock;const near=dock&&Math.hypot(position.x-dock.x,position.y-dock.y)<=85;$('.world-boat-exit').disabled=!near;$('.world-boat-exit').textContent=near?'Высадиться':'Вернитесь к причалу';}
    updateActionAvailability(action);
    if(text!==hint){hint=text;$('.world-enter').setAttribute('aria-label',text);$('.world-enter').textContent=text;$('.world-hint').textContent=touchInput?'Джойстик — идти · касание — действие':scene==='base'?(clan?.is_leader?'Обустраивайте базу · сохраняйте изменения':'Общая мастерская вашего клана'):(action?'Нажмите действие, E или коснитесь объекта':'Стрелки / WASD · E — действие · P — телефон');}
   }
   if(!restricted){drawMap($('.world-minimap'));if(mapExpanded)drawMap($('.world-map-large'),true);}
   if(loaded&&!phoneOpen&&!baseBusy&&!activityBusy&&time-lastSent>(moving?850:4000))sendPosition();
  }
  if(frameMetrics&&!document.hidden){if(frameMetrics.started===null)frameMetrics.started=time;else{frameMetrics.frames++;frameMetrics.frameMs+=frameMs;frameMetrics.renderMs+=Math.max(0,performance.now()-renderStarted);const elapsed=time-frameMetrics.started;if(elapsed>=1000){root.setAttribute('data-world-fps',(frameMetrics.frames*1000/elapsed).toFixed(1));root.setAttribute('data-world-frame-ms',(frameMetrics.frameMs/frameMetrics.frames).toFixed(2));root.setAttribute('data-world-render-ms',(frameMetrics.renderMs/frameMetrics.frames).toFixed(2));root.setAttribute('data-world-visible-actor-nodes',String(visibleActorNodes));frameMetrics.started=time;frameMetrics.frames=0;frameMetrics.frameMs=0;frameMetrics.renderMs=0;}}}

 }
 function resetControls(){pendingPickup=null;keys.clear();joystick={x:0,y:0};pointerId=null;drawKnob(0,0);}
 listen(window,'keydown',event=>{if(dead||controllerLost||restricted||!root.isConnected||document.querySelector('dialog[open]')||event.target.closest?.('input,textarea,select,[contenteditable=true]'))return;const k=worldKey(event);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(k)){event.preventDefault();pendingPickup=null;keys.add(k);}else if(k==='rotate'&&!event.repeat&&editorOpen&&!inventoryOpen){event.preventDefault();rotateFurniture();}else if(k==='interact'&&!event.repeat&&!inventoryOpen){event.preventDefault();interact();}else if(k==='inventory'&&!event.repeat){event.preventDefault();resetControls();onInventory();}else if(k==='phone'&&!event.repeat){event.preventDefault();resetControls();onPhone();}});
 listen(window,'keyup',event=>keys.delete(worldKey(event)));listen(window,'blur',resetControls);listen(document,'visibilitychange',()=>{resetControls();if(!document.hidden)refresh();});
 listen(root,'pointerdown',event=>{if(event.pointerType==='touch'){touchInput=true;$('.world-hint').textContent='Джойстик — идти · касание — действие';}});
 const stick=$('.world-stick');
 function drawKnob(dx,dy){const kc=$('.world-knob').getContext('2d');if(drawSourceJoystick(kc,{x:dx/32,y:dy/32}))return;const {width:w,height:h}=kc.canvas;kc.clearRect(0,0,w,h);kc.fillStyle=colors.ink;kc.beginPath();kc.arc(w/2+dx,h/2+dy,19,0,Math.PI*2);kc.fill();}
 drawKnob(0,0);
 preloadSourceUI().then(()=>{if(!dead)drawKnob(joystick.x*32,joystick.y*32);});
 const moduleRequests=worldMap.schema_version>=20?[...sourceCityModuleObjects(worldMap),...sourceCityGroundObjects(worldMap),...worldMap.district.buildings.map(entity=>sourceBuildingLayout(entity))].filter(Boolean).map(node=>({id:node.assetId,direction:node.direction||'front'})):sourceCityAssetIds.map(id=>({id,direction:'front'}));
 (isExactSourceCity(worldMap)?preloadExactSourceCity():preloadDesignViews([...moduleRequests,...sourceClanHouseAssets.map(id=>({id,direction:'front'})),{id:'construction-site-compact',direction:'front'},{id:'source-road-asphalt-tile',direction:'front'},{id:'city-parking-empty',direction:'top'},...sourceCityAreaLayouts(worldMap).map(area=>({id:area.assetId,direction:area.direction})),...sourceParkedVehicleLayouts(worldMap).map(car=>({id:car.assetId,direction:car.direction})),{id:'welcome-source-sign'}])).then(()=>{if(!dead){houseSprites.clear();art=createCityArt();artRevision++;mapVisualCache=null;}});
 listen(window,'bziker:actor-assets-ready',()=>{if(!dead)artRevision++;});
 listen(window,'bziker:house-materials-ready',()=>{if(!dead){houseSprites.clear();artRevision++;mapVisualCache=null;}});
 listen(window,'bziker:design-asset-ready',()=>{if(!dead){houseSprites.clear();art=createCityArt();artRevision++;mapVisualCache=null;}});
 (isExactSourceCity(worldMap)?Promise.resolve():preloadSourceHouseMaterials()).then(()=>{if(!dead){houseSprites.clear();artRevision++;mapVisualCache=null;}});
 preloadSourceWater().then(()=>{if(!dead){art=createCityArt();artRevision++;}});
 (isExactSourceCity(worldMap)||worldMap.schema_version>=20?Promise.resolve():preloadSupplementalEnvironment()).then(()=>{if(!dead){art=createCityArt();artRevision++;}});
 function updateJoystick(event){const r=stick.getBoundingClientRect(),dx=event.clientX-r.left-r.width/2,dy=event.clientY-r.top-r.height/2,len=Math.hypot(dx,dy),ratio=len>32?32/len:1;joystick={x:dx*ratio/32,y:dy*ratio/32};drawKnob(dx*ratio,dy*ratio);}
 listen(stick,'pointerdown',event=>{if(pointerId!==null)return;pendingPickup=null;pointerId=event.pointerId;stick.setPointerCapture(pointerId);updateJoystick(event);event.preventDefault();});listen(stick,'pointermove',event=>{if(event.pointerId===pointerId)updateJoystick(event);});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(stick,type,event=>{if(event.pointerId===pointerId)resetControls();});
 listen($('.world-enter'),'click',()=>{controlsLearned=true;$('.world-hint').hidden=true;interact();});listen($('.world-inventory'),'click',()=>{resetControls();onInventory();});listen($('.world-phone'),'click',()=>{resetControls();onPhone();});listen($('.world-wallet'),'click',()=>{resetControls();onInteract('wallet');});
 function toggleEditor(open){if(restricted||scene!=='base'||!clan?.is_leader)return;editorOpen=!!open;resetControls();if(editorOpen){mapExpanded=false;$('.world-map-toggle').setAttribute('aria-expanded','false');}updateChrome();if(!editorOpen)$('.world-editor-toggle').focus({preventScroll:true});}
 listen($('.world-editor-toggle'),'click',()=>toggleEditor(!editorOpen));listen($('.world-editor-close'),'click',()=>toggleEditor(false));
 function toggleMap(open){mapExpanded=!!open;if(mapExpanded)editorOpen=false;resetControls();$('.world-map-toggle').setAttribute('aria-expanded',String(open));updateChrome();}
 listen($('.world-map-toggle'),'click',()=>toggleMap(!mapExpanded));listen($('.world-map-close'),'click',()=>toggleMap(false));listen($('.world-back'),'click',()=>scene==='interior'?exitInterior():leaveBase());listen($('.world-boat-exit'),'click',()=>boatAction('boat-exit'));
 listen($('.world-map-destinations'),'click',event=>{const button=event.target.closest?.('[data-travel]');if(button&&!button.disabled)travel(button.getAttribute('data-travel'));});
 listen($('.world-map-large'),'pointerdown',event=>{
  const bounds=$('.world-map-large').getBoundingClientRect(),scale=Math.min(bounds.width/W,bounds.height/H),drawWidth=W*scale,drawHeight=H*scale;
  const x=(event.clientX-bounds.left-(bounds.width-drawWidth)/2)/scale,y=(event.clientY-bounds.top-(bounds.height-drawHeight)/2)/scale;
  const destination=travelDestinations.filter(d=>d.x!==undefined).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
  if(destination&&Math.hypot(destination.x-x,destination.y-y)<220)travel(destination.id);
 });
 listen($('.world-delete'),'click',()=>{removeMode=!removeMode;$('.world-delete').setAttribute('aria-pressed',String(removeMode));});
 function setFurnitureRotation(rotation){
  if(restricted||scene!=='base'||!clan?.is_leader||!editorOpen||baseBusy)return;
  const type=furnitureCatalog.types.find(t=>t.id===($('.world-item-type').value||'sofa'));if(!type?.rotations.includes(rotation))return;
  if(selected){const old=items.find(i=>i.id===selected);if(!old){selected=null;updateChrome();return;}const next={...old,rotation};
   if(canPlaceItem(items,next,selected)){items=items.map(i=>i.id===selected?next:i);dirty=true;}
   else{status('Для поворота нужно свободное место.');$('.world-item-rotation').value=String(old.rotation||0);updateChrome();return;}
  }
  $('.world-item-rotation').value=String(rotation);updateChrome();
 }
 function rotateFurniture(){setFurnitureRotation(((Number($('.world-item-rotation').value)||0)+90)%360);}
 listen($('.world-rotate'),'click',rotateFurniture);
 listen($('.world-item-type'),'change',()=>{selected=null;updateChrome();});listen($('.world-item-rotation'),'change',()=>setFurnitureRotation(Number($('.world-item-rotation').value)));
 for(const selector of ['.world-item-color','.world-item-variant','.world-item-theme'])listen($(selector),'change',updateChrome);
 for(const [selector,key] of [['.world-wall-color','wall_color'],['.world-floor-color','floor_color'],['.world-floor-material','surface_style'],['.world-wall-material','wall_material']])listen($(selector),'change',()=>{paint[key]=$(selector).value;dirty=true;updateChrome();});
 listen($('.world-paint'),'click',()=>{if(!clan?.is_leader||!selected)return;items=items.map(i=>i.id===selected?{...i,color:$('.world-item-color').value,source_theme:$('.world-item-theme').value||'modern'}:i);dirty=true;updateChrome();});
 listen(canvas,'pointerdown',event=>{
  canvas.focus({preventScroll:true});if(restricted||baseBusy||inventoryOpen)return;
  const bounds=canvas.getBoundingClientRect(),point={x:(event.clientX-bounds.left)/view.scale+view.x,y:(event.clientY-bounds.top)/view.scale+view.y};
  const petAction=ownPetAction();if(petAction&&Math.hypot(point.x-petAction.x,point.y-petAction.y)<=30){interact(petAction);return;}
  if(scene!=='base'){const action=selfBoat?currentAction():scene==='interior'?nearestInteriorAction(interior,point.x,point.y,world,profile?.id):nearestAction(point.x,point.y,animalActionSnapshot(),profile?.id);if(action){if(Math.hypot(position.x-action.x,position.y-action.y)<=(action.radius||58))interact(action);else status('Подойдите к этому объекту, чтобы взаимодействовать.');}return;}
  if(!clan?.is_leader||!editorOpen){const action=currentAction();if(action&&Math.hypot(point.x-action.x,point.y-action.y)<=45)interact(action);return;}
  const grid=worldMap.base.grid,x=Math.floor((point.x-grid.x)/grid.cell_width),y=Math.floor((point.y-grid.y)/grid.cell_height),existing=items.find(i=>{const s=furnitureFootprint(i);return s&&x>=i.x&&x<i.x+s.width&&y>=i.y&&y<i.y+s.height;});
  if(removeMode){const count=items.length;items=items.filter(i=>i.id!==existing?.id);dirty=dirty||items.length!==count;selected=null;}
  else if(existing){selected=existing.id;$('.world-item-type').value=existing.type;$('.world-item-color').value=existing.color||colors.paper;$('.world-item-variant').value=existing.variant||'standard';$('.world-item-theme').value=existing.source_theme||'modern';$('.world-item-rotation').value=String(existing.rotation||0);}
  else{const type=$('.world-item-type').value||'sofa',variant=$('.world-item-variant').value||'standard';if(variant==='premium'&&!premiumOwned(type)){status('Сначала купите этот премиум-предмет в мебельном магазине.');return;}const item={id:globalThis.crypto?.randomUUID?.()||`item-${Date.now()}-${Math.random().toString(16).slice(2)}`,type,x,y,rotation:Number($('.world-item-rotation').value)||0,color:$('.world-item-color').value||colors.paper,variant,source_theme:$('.world-item-theme').value||'modern'};if(canPlaceItem(items,item)){items.push(item);selected=item.id;dirty=true;}else status('Нужна свободная клетка внутри комнаты. Не более 30 предметов.');}
  updateChrome();
 });
 listen($('.world-save'),'click',async()=>{
  if(!clan?.is_leader||!dirty||baseBusy)return;const current=epoch;baseBusy=true;updateChrome();
  try{const result=await api(`/api/clans/${encodeURIComponent(clan.id)}/base`,{items,...paint});if(!dead&&current===epoch){if(result.base){clan={...clan,base:result.base};syncBase(result.base);}dirty=false;status('База сохранена.');}}
  catch(error){if(!dead&&current===epoch)reportWorldError(error);}finally{baseBusy=false;if(!dead)updateChrome();}
 });
 editorValues();$('.world-item-color').value=colors.paper;updateChrome();
 // Nearby peers must receive the two-second pet gesture before its timestamp expires.
 const interval=setInterval(refresh,1000);refresh();phaser=rendererFactory(canvas,{onFrame:draw,onError:error=>status(error.message)});phaser.resize(width,height,Math.min(window.devicePixelRatio||1,2));
 return {destroy(){dead=true;epoch++;phaser?.destroy();clearInterval(interval);clearTimeout(statusTimer);observer.disconnect();listeners.forEach(fn=>fn());root.remove();},setProfile(next){pendingPickup=null;profile=next;},setSettings,setScene,travel,enterBase,enterInterior,exitInterior,refresh,setWallet,setActionState,setPhone,setInventory,getState(){return {scene,controller_lost:controllerLost,interior_id:interior?.id||null,position:{...position},view:{...view},active_base:clan?{...clan,base:{...clan.base,items:items.map(i=>({...i}))}}:null,pose:selfPose,inventory_open:inventoryOpen,phone_open:selfPhone||phoneOpen,boat:selfBoat?{...selfBoat}:null,bench_id:benchId,action_effect:world?.action_effect||null,holding:world?.holding||null,loaded};}};
}
