import {drawDesignAsset,resolveDesignAsset} from './design-assets.js';
import {drawSourceStreet,isExactSourceCity,drawExactSourceCity,isModularCity,sourceCityGroundObjects} from './source-city.js';
import {drawSourceLake} from './source-water.js';
import {traceLakePath} from './water.js';
import {roadJunctions,crossingIntervals} from './road-topology.js';
/** Outdoor surface geometry. Ground and the overview share this plan; it never
 * changes saved footprints, doors, positions or collision authority. */
export const terrainMaterials=Object.freeze({
 grass:'#7e984e',grassLight:'#90ab5b',grassShade:'#718b43',grassBlade:'#64803e',
 asphalt:'#51545a',asphaltGrain:'#5b5d63',pavement:'#c8bea8',pavementLight:'#dfd4bb',
 curb:'#8d8d83',square:'#cabea6',crossing:'#f3f1e8',tactile:'#d8bd72',
 water:'#438796',shore:'#bcae88',soil:'#83765c',shrub:'#4d7240',shrubLight:'#82934d',
});
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const asphaltRoad=road=>road.kind==='road'||road.kind==='driveway';
const roadShoulder=(plan,road)=>road.kind==='driveway'?Number.isFinite(road.sidewalk_width)?Math.max(0,road.sidewalk_width):10:plan.sidewalk??27;
const sidewalkWidth=map=>isModularCity(map)?map.architecture?.sidewalk_width??map.design_source?.sidewalk_width??52:map.design_source?52:27;
const rectangleContains=(b,p)=>p[0]>b.x&&p[0]<b.x+b.width&&p[1]>b.y&&p[1]<b.y+b.height;
function roadSegments(roads){return roads.flatMap(r=>r.points.slice(1).flatMap((b,i)=>{
 const a=r.points[i],length=distance(a,b);if(!length)return [];
 const tangent=[(b[0]-a[0])/length,(b[1]-a[1])/length];
 return [{id:`${r.id}:${i}`,roadId:r.id,kind:r.kind,width:r.width,...(Number.isFinite(r.sidewalk_width)?{sidewalk_width:r.sidewalk_width}:{}),a:[...a],b:[...b],length,tangent,normal:[-tangent[1],tangent[0]]}];
}));}
function projected(segment,p,margin=0){
 const along=clamp((p[0]-segment.a[0])*segment.tangent[0]+(p[1]-segment.a[1])*segment.tangent[1],margin,segment.length-margin);
 return {along,point:[segment.a[0]+segment.tangent[0]*along,segment.a[1]+segment.tangent[1]*along]};
}
export function segmentEntersGroundObstacle(a,b,obstacle){
 if(rectangleContains(obstacle,a)||rectangleContains(obstacle,b))return true;
 let low=0,high=1;
 for(const [axis,key,span] of [[0,'x','width'],[1,'y','height']]){
  const delta=b[axis]-a[axis];if(!delta){if(a[axis]<=obstacle[key]||a[axis]>=obstacle[key]+obstacle[span])return false;continue;}
  const first=(obstacle[key]-a[axis])/delta,last=(obstacle[key]+obstacle[span]-a[axis])/delta;
  low=Math.max(low,Math.min(first,last));high=Math.min(high,Math.max(first,last));if(low>=high)return false;
 }
 return low<high;
}
// Test the complete visible support, rather than only the centre of a planter.
function segmentRectangleDistance(segment,box){
 if(segmentEntersGroundObstacle(segment.a,segment.b,box))return 0;
 const corners=[[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]];
 const toBox=p=>Math.hypot(Math.max(box.x-p[0],0,p[0]-box.x-box.width),Math.max(box.y-p[1],0,p[1]-box.y-box.height));
 return Math.min(toBox(segment.a),toBox(segment.b),...corners.map(p=>distance(p,projected(segment,p).point)));
}
function frontPlanting(b,side,corridor,segments,blockers=[],sidewalk=27){
 const initial=Math.min(66,(b.width-116)/2),street=segments;
 for(let width=initial;width>=30;width-=4){
  const outer=side<0?b.x+8:b.x+b.width-width-8;
  for(let y=b.y+b.height+51;y>=b.y+b.height+6;y-=2)for(let inset=0;inset<=48;inset+=4){
   const x=outer-side*inset,visible={x:x-2,y:y-16,width:width+8,height:47};
   if(visible.x<corridor.x+corridor.width&&visible.x+visible.width>corridor.x&&visible.y<corridor.y+corridor.height&&visible.y+visible.height>corridor.y)continue;
   if(blockers.some(r=>visible.x<r.x+r.width+12&&visible.x+visible.width>r.x-12&&visible.y<r.y+r.height+12&&visible.y+visible.height>r.y-12))continue;
   if(street.some(s=>segmentRectangleDistance(s,visible)<s.width/2+(s.kind==='road'?sidewalk:14)))continue;
   return {id:`garden-${b.id}-${side<0?'left':'right'}`,buildingId:b.id,x,y,width,height:23,flowers:(b.id==='shop-food'||b.id.startsWith('base-'))};
  }
 }
 return null;
}
function orientedRect(center,tangent,normal,along,across){return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[center[0]+x*along/2*tangent[0]+y*across/2*normal[0],center[1]+x*along/2*tangent[1]+y*across/2*normal[1]]);}
function crossingPlan(map,segments,junctions){
 const archive=map.landmarks?.archive,avoid=archive?[{x:archive.x-66,y:archive.y-68,width:132,height:105}]:[];
 return (map.decor?.crosswalks||[]).flatMap((cross,index)=>{
  const wantedVertical=cross.orientation==='vertical',choices=[];
  for(const segment of segments.filter(s=>s.kind==='road'&&(wantedVertical?Math.abs(s.tangent[1])>.85:Math.abs(s.tangent[0])>.85))){
   const clearance=segment.width/2+78,span=segment.width-12,total=110;
   const requested=projected(segment,[cross.x,cross.y]).along;
 for(const [min,max] of crossingIntervals(segment,junctions,{sidewalk:sidewalkWidth(map)})){
    const along=clamp(requested,min,max),point=[segment.a[0]+segment.tangent[0]*along,segment.a[1]+segment.tangent[1]*along];
    const area={x:point[0]-Math.abs(segment.normal[0])*span/2-Math.abs(segment.tangent[0])*total/2,y:point[1]-Math.abs(segment.normal[1])*span/2-Math.abs(segment.tangent[1])*total/2,width:Math.abs(segment.normal[0])*span+Math.abs(segment.tangent[0])*total,height:Math.abs(segment.normal[1])*span+Math.abs(segment.tangent[1])*total};
    if(avoid.some(b=>area.x<b.x+b.width&&area.x+area.width>b.x&&area.y<b.y+b.height&&area.y+area.height>b.y))continue;
    choices.push({segment,along,point,clearance,score:distance(point,[cross.x,cross.y])});
   }
  }
  const chosen=choices.sort((a,b)=>a.score-b.score)[0];if(!chosen)return [];
  const {segment,along,point:center,clearance}=chosen,span=segment.width-12;
  return [{id:`crossing-${index+1}`,segmentId:segment.id,roadId:segment.roadId,center,along,clearance,tangent:segment.tangent,normal:segment.normal,stripes:Array.from({length:7},(_,i)=>orientedRect([center[0]+(i-3)*17*segment.tangent[0],center[1]+(i-3)*17*segment.tangent[1]],segment.tangent,segment.normal,8,span)),pads:[-1,1].map(side=>orientedRect([center[0]+side*(segment.width/2+14)*segment.normal[0],center[1]+side*(segment.width/2+14)*segment.normal[1]],segment.tangent,segment.normal,110,10))}];
 });
}
function approachPlan(map,segments){
 const sidewalk=map.design_source?52:27;
 const buildings=[...map.buildings,...(map.district?.buildings||[])],solids=[...buildings,...(map.solids||[])],approaches=[],plantings=[];
 const blockers=[...(map.architecture?.bike_racks||[]),...(map.architecture?.props||[])].map(p=>p.footprint).filter(Boolean).concat((map.architecture?.frontages||[]).map(f=>f.parking).filter(Boolean));
 blockers.push(...(map.decor?.street_details||[]).map(p=>p.kind==='bin'?{x:p.x-23,y:p.y-59,width:46,height:76}:p.footprint).filter(Boolean));
 blockers.push(...(map.activities||[]).filter(a=>a.action==='trash-bin').map(a=>({x:a.x-23,y:a.y-61,width:46,height:80})),...(map.decor?.lamps||[]).map(l=>({x:l.x-33,y:l.y-104,width:66,height:124})),...(map.decor?.trees||[]).map(t=>({x:t.x-58*t.size,y:t.y-120*t.size,width:124*t.size,height:165*t.size})));
 for(const b of buildings){if(!b.door)continue;const door=[b.door.x,b.door.y],first=[door[0],door[1]+37],source=map.roads.find(r=>r.id===`door-${b.id}`||r.id===`access-${b.id}`),choices=[];
  const frontage=map.design_source&&map.architecture?.frontages?.find(f=>f.building_id===b.id);
  if(frontage){
   const path=frontage.path.map(p=>[...p]),road=map.roads.find(r=>r.id===frontage.connection.road_id),corridor={x:door[0]-48,y:door[1]-9,width:96,height:87};
   approaches.push({id:b.id,path,width:frontage.width,forecourt:{...frontage.forecourt},corridor,connection:{roadId:road?.id||null,roadWidth:road?.width||58,distanceFromCenter:0}});
   if(!['messages','terrace'].includes(b.id))for(const side of[-1,1]){const bed=frontPlanting(b,side,corridor,segments,blockers,sidewalk);if(bed)plantings.push(bed);}
   continue;
  }
  if(b.id==='railway'){
   const arrival=map.roads.find(r=>r.id==='arrival'),point=arrival?.points[0]||first;
   approaches.push({id:b.id,path:[door,[...point]],width:64,forecourt:{x:b.x-14,y:b.y+b.height+5,width:b.width+28,height:72},corridor:{x:door[0]-48,y:door[1]-8,width:96,height:80},connection:{roadId:arrival?.id||null,roadWidth:arrival?.width||64,distanceFromCenter:0}});continue;
  }
  for(const s of segments.filter(s=>s.kind==='road')){
   const {point:q}=projected(s,first),dot=(first[0]-q[0])*s.normal[0]+(first[1]-q[1])*s.normal[1],side=dot<0?-1:1,offset=s.width/2+13;
   const point=[q[0]+side*offset*s.normal[0],q[1]+side*offset*s.normal[1]];
   if(solids.some(obstacle=>segmentEntersGroundObstacle(first,point,{x:obstacle.x-32,y:obstacle.y-32,width:obstacle.width+64,height:obstacle.height+64})))continue;
   choices.push({point,path:[door,first,point],roadId:s.roadId,roadWidth:s.width,distanceFromCenter:offset,score:distance(door,first)+distance(first,point)});
  }
  // Authored bends can route around a storefront corner where a straight
  // connector would cut the visible pavement through its wall.
  if(source?.points.length>1){
   const authored=source.points.map(p=>[...p]),end=authored.at(-1);
   const clear=authored.slice(1).every((point,i)=>solids.every(obstacle=>{
    if(i===0&&obstacle.id===b.id)return true;
    return !segmentEntersGroundObstacle(authored[i],point,{x:obstacle.x-32,y:obstacle.y-32,width:obstacle.width+64,height:obstacle.height+64});
   }));
   const nearest=segments.filter(s=>s.kind==='road').map(s=>({s,d:distance(end,projected(s,end).point)})).sort((a,b)=>a.d-b.d)[0];
   if(clear&&nearest&&nearest.d<=nearest.s.width/2+27){choices.push({point:end,path:authored,roadId:nearest.s.roadId,roadWidth:nearest.s.width,distanceFromCenter:nearest.d,score:authored.slice(1).reduce((n,p,i)=>n+distance(authored[i],p),0)});}
  }
  const connection=choices.sort((a,b)=>a.score-b.score)[0]||{point:source?.points.at(-1)||first,roadId:null,roadWidth:source?.width||52,distanceFromCenter:0};
  let path=connection.path||[door,first];if(!connection.path&&distance(first,connection.point)>1)path.push([...connection.point]);
  // Lower district porches can already touch the sidewalk before the default
  // 37px landing ends. Remove the overshoot instead of making a return bend.
  if(path.length===3&&Math.abs(path[2][0]-door[0])<8&&path[2][1]>door[1]&&path[2][1]<path[1][1])path=[door,path[2]];
  const forecourt={x:b.x-12,y:b.y+b.height+6,width:b.width+24,height:85},corridor={x:door[0]-48,y:door[1]-9,width:96,height:87};
  approaches.push({id:b.id,path,width:b.id.startsWith('base-')?48:56,forecourt,corridor,connection});
  // Cafe terraces already hold tables. Keep their furniture and door approach clear.
  if(['messages','terrace'].includes(b.id))continue;
  const entrySegments=roadSegments([{id:`entry-${b.id}`,kind:'path',width:56,points:path}]);
  for(const side of [-1,1]){const bed=frontPlanting(b,side,corridor,[...segments,...entrySegments],blockers,sidewalk);if(bed)plantings.push(bed);}
 }
 return {approaches,plantings};
}
export function createCityGroundPlan(map){
 if(isModularCity(map)){
  const roads=(map.roads||[]).map(r=>({...r,points:r.points.map(p=>[...p])})),segments=roadSegments(roads),junctions=roadJunctions(segments),sidewalk=sidewalkWidth(map),crossings=crossingPlan(map,segments,junctions);
  return {modularScene:true,exactScene:false,map,width:map.width,height:map.height,materials:{...terrainMaterials,...map.terrain_materials},sidewalk,roads,roadSegments:segments,junctions,approaches:(map.architecture?.frontages||[]).map(f=>({id:f.building_id,path:f.path.map(p=>[...p]),width:f.width,forecourt:f.forecourt?{...f.forecourt}:null,connection:{roadId:f.connection?.road_id}})),plantings:[],blocks:(map.architecture?.block_paving||[]).map(p=>({...p})),pads:(map.decor?.fixture_pads||[]).map(p=>({...p})),crossings,laneMarkings:cityLaneMarkings(segments,junctions,crossings,sidewalk),parkingLots:(map.scene_objects||[]).filter(p=>p.kind==='parking'&&p.parking_layout==='modular').map(p=>({...p,native_slots:(p.native_slots||[]).map(s=>({...s,bounds:{...s.bounds}})),borders:(p.borders||[]).map(r=>({...r})),bumpers:(p.bumpers||[]).map(r=>({...r}))})),groundObjects:sourceCityGroundObjects(map),plaza:map.decor?.plaza?{...map.decor.plaza}:null,smoking:map.smoking?{...map.smoking}:null,lake:map.lake?{...map.lake}:null};
 }
 if(isExactSourceCity(map)){
  const roads=map.roads.map(r=>({...r,points:r.points.map(p=>[...p])})),segments=roadSegments(roads);
  return {exactScene:true,map,width:map.width,height:map.height,materials:terrainMaterials,sidewalk:0,roads,roadSegments:segments,junctions:roadJunctions(segments),approaches:(map.architecture?.frontages||[]).map(f=>({id:f.building_id,path:f.path,width:f.width})),plantings:[],blocks:[],pads:[],crossings:[],laneMarkings:[],plaza:{...map.decor.plaza},smoking:{...map.smoking},lake:{...map.lake}};
 }
 const roads=map.roads.map(r=>({...r,points:r.points.map(p=>[...p])})),segments=roadSegments(roads),junctions=roadJunctions(segments),{approaches,plantings}=approachPlan(map,segments);
 const crossings=crossingPlan(map,segments,junctions),sidewalk=map.design_source?52:27;
 return {width:map.width,height:map.height,materials:terrainMaterials,sidewalk,roads,roadSegments:segments,junctions,approaches,plantings,blocks:(map.architecture?.block_paving||[]).map(p=>({...p})),pads:(map.decor.fixture_pads||[]).map(p=>({...p})),crossings,laneMarkings:cityLaneMarkings(segments,junctions,crossings,sidewalk),plaza:{...map.decor.plaza},smoking:{...map.smoking},lake:{...map.lake}};
}
/** Broken centre lines stop before every junction and crossing, so a painted
 * ribbon never continues across another street or through a zebra. */
export function cityLaneMarkings(segments,junctions,crossings=[],sidewalk=52){
 return segments.filter(s=>s.kind==='road'&&s.width>=144).flatMap(s=>{
  const out=[],halfLength=30,excluded=junctions.filter(j=>j.segmentIds.includes(s.id)).map(j=>({along:(j.center[0]-s.a[0])*s.tangent[0]+(j.center[1]-s.a[1])*s.tangent[1],reach:Math.max(...Object.values(j.roadWidths))/2+sidewalk+halfLength+16}));
  excluded.push(...crossings.filter(x=>x.segmentId===s.id).map(x=>({along:x.along,reach:55+halfLength+25})));
  for(let along=100;along<s.length-100;along+=130){if(excluded.some(x=>Math.abs(along-x.along)<x.reach))continue;const center=[s.a[0]+along*s.tangent[0],s.a[1]+along*s.tangent[1]];out.push({segmentId:s.id,along,center,polygon:orientedRect(center,s.tangent,s.normal,halfLength*2,5)});}
  return out;
 });
}
function rect(c,x,y,width,height,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),width,height);}
function polygon(c,points,color){c.fillStyle=color;c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.closePath();c.fill();}
function stroke(c,points,width,color,cap='round'){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';c.lineCap=cap;c.stroke();}
const hash=(x,y)=>{let n=Math.imul(x,374761393)^Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;};
function grass(c,tile,m){
 rect(c,tile.x,tile.y,tile.width||1024,tile.height||1024,m.grass);
 const right=tile.x+(tile.width||1024),bottom=tile.y+(tile.height||1024);
 for(let gy=Math.floor(tile.y/34);gy<=Math.ceil(bottom/34);gy++)for(let gx=Math.floor(tile.x/42);gx<=Math.ceil(right/42);gx++){
  const n=hash(gx,gy),x=gx*42+(n%23),y=gy*34+((n>>>6)%19);if(x<tile.x||y<tile.y||x>right||y>bottom)continue;
  rect(c,x,y,7,2,n%3?m.grassLight:m.grassShade);rect(c,x+2,y-3,2,4,m.grassBlade);if(n%4===0)rect(c,x+9,y+5,4,2,m.grassShade);
  if(n%37===0){rect(c,x+12,y-2,3,3,'#d9d6a6');rect(c,x+16,y+3,2,2,'#b7c28e');}
 }
}
function pavingDetail(c,points,width,m){for(let i=1;i<points.length;i++){
 const a=points[i-1],b=points[i],length=distance(a,b);if(!length)continue;const tx=(b[0]-a[0])/length,ty=(b[1]-a[1])/length;
 for(let d=20;d<length;d+=28){const x=a[0]+tx*d,y=a[1]+ty*d;stroke(c,[[x+ty*(width/2-5),y-tx*(width/2-5)],[x-ty*(width/2-5),y+tx*(width/2-5)]],1,'#aaa18b');}
}}
function roadLayers(c,plan,detail){const m=plan.materials,plaza=plan.plaza,smoke=plan.smoking;
 const streets=plan.roads.filter(asphaltRoad),paths=plan.roads.filter(r=>!asphaltRoad(r)&&!r.id.startsWith('door-')&&!r.id.startsWith('access-'));
 // All connected pedestrian surfaces share one material pass. Drawing each
 // path's curb after a neighbouring fill used to leave a dark cap across the
 // sidewalk, and carried the smoking path's entire curb through its platform.
 for(const r of streets)stroke(c,r.points,r.width+roadShoulder(plan,r)*2,m.curb);
 for(const r of paths)stroke(c,r.points,r.width+8,m.curb);
 for(const a of plan.approaches){stroke(c,a.path,a.width+8,m.curb,'butt');const f=a.forecourt;if(f)rect(c,f.x,f.y,f.width,f.height,m.curb);}
 if(plaza)rect(c,plaza.x-4,plaza.y-4,plaza.width+8,plaza.height+8,m.curb);
 if(smoke)rect(c,smoke.x-4,smoke.y-4,smoke.width+8,smoke.height+8,m.curb);
 for(const p of plan.pads||[])rect(c,p.x-3,p.y-3,p.width+6,p.height+6,m.curb);
 for(const b of plan.blocks||[])rect(c,b.x,b.y,b.width,b.height,m.pavement);
 for(const r of streets)stroke(c,r.points,r.width+roadShoulder(plan,r)*2-6,m.pavement);
 // Existing public paths retain their map geometry; dedicated house access uses
 // the visible sidewalk connection rather than the old disconnected endpoints.
 for(const r of paths)stroke(c,r.points,r.width,m.pavement);
 for(const p of plan.pads||[])rect(c,p.x,p.y,p.width,p.height,m.pavement);
 for(const a of plan.approaches)stroke(c,a.path,a.width,m.pavement,'butt');
 // Modular paving has one world-aligned slab grid. A second segment-aligned
 // pattern turns at every bend and cuts diagonal seams through those slabs.
 if(detail&&!plan.modularScene){for(const r of paths)pavingDetail(c,r.points,r.width,m);for(const a of plan.approaches)pavingDetail(c,a.path,a.width,m);}
 // Courts and squares own their interior paving. Path detail stops at their
 // entrance rather than appearing as a second ribbon on top of the platform.
 for(const a of plan.approaches){const f=a.forecourt;if(f)rect(c,f.x+3,f.y+3,f.width-6,f.height-6,m.pavement);if(detail&&!plan.modularScene)rect(c,a.path[0][0]-35,a.path[0][1]-5,70,12,m.pavementLight);}
 if(plaza)rect(c,plaza.x,plaza.y,plaza.width,plaza.height,m.square);
 if(detail&&plaza)for(let y=plaza.y+32;y<plaza.y+plaza.height;y+=40)rect(c,plaza.x+5,y,plaza.width-10,1,'#b7c1b4');
 if(smoke)rect(c,smoke.x,smoke.y,smoke.width,smoke.height,m.pavement);
 if(detail)drawPavementTiles(c,plan,detail===true?null:detail);
 // Footpaths and front courts join the sidewalk. Their curb must never bridge
 // a carriageway, including at terminal paths and the furniture storefront.
 for(const r of streets)stroke(c,r.points,r.width+4,'#424e51');
 for(const r of streets)stroke(c,r.points,r.width,m.asphalt);
 if(detail)for(const s of plan.roadSegments.filter(asphaltRoad))for(let d=19;d<s.length-19;d+=29){const n=hash(Math.floor(s.a[0]+s.tangent[0]*d),Math.floor(s.a[1]+s.tangent[1]*d)),offset=(n%45)-22;rect(c,s.a[0]+s.tangent[0]*d+s.normal[0]*offset,s.a[1]+s.tangent[1]*d+s.normal[1]*offset,3,2,m.asphaltGrain);}
 if(detail)drawSourceRoadTextures(c,plan,detail===true?null:detail);
 for(const marking of plan.laneMarkings||[])polygon(c,marking.polygon,m.crossing);
 for(const crossing of plan.crossings){for(const pad of crossing.pads)polygon(c,pad,m.tactile);for(const stripe of crossing.stripes)polygon(c,stripe,m.crossing);}
}
function addCapsule(c,s,r){
 const angle=Math.atan2(s.tangent[1],s.tangent[0]),n=angle+Math.PI/2,dx=Math.cos(n)*r,dy=Math.sin(n)*r;
 c.moveTo(s.a[0]+dx,s.a[1]+dy);c.lineTo(s.b[0]+dx,s.b[1]+dy);c.arc(s.b[0],s.b[1],r,n,n+Math.PI,true);c.lineTo(s.a[0]-dx,s.a[1]-dy);c.arc(s.a[0],s.a[1],r,n+Math.PI,n+Math.PI*2,true);c.closePath();
}
/** Small stone slabs tie front courts and sidewalks into one urban surface.
 * They are clipped before asphalt is painted, retaining the same junction union. */
function drawPavementTiles(c,plan,tile){
 if(!c.clip||!c.arc||!c.rect)return;
 c.save();c.beginPath();
 for(const s of plan.roadSegments)if(!s.roadId.startsWith('door-')&&!s.roadId.startsWith('access-'))addCapsule(c,s,s.width/2+(asphaltRoad(s)?roadShoulder(plan,s)-4:0));
 for(const a of plan.approaches){const f=a.forecourt;if(f)c.rect(f.x+3,f.y+3,f.width-6,f.height-6);for(const s of roadSegments([{id:a.id,points:a.path,width:a.width,kind:'path'}]))addCapsule(c,s,a.width/2);}
 for(const p of [plan.plaza,plan.smoking,...(plan.pads||[]),...(plan.blocks||[])].filter(Boolean))c.rect(p.x,p.y,p.width,p.height);
 c.clip();const left=Math.floor((tile?.x||0)/48)*48,top=Math.floor((tile?.y||0)/40)*40,right=Math.min(plan.width,left+(tile?.width||plan.width)+48),bottom=Math.min(plan.height,top+(tile?.height||plan.height)+40);
 for(let y=top;y<bottom;y+=40){rect(c,left,y,right-left,1,'#a9a18d');for(let x=left+(Math.floor(y/40)%2)*24;x<right;x+=48)rect(c,x,y,1,40,'#aea690');}
 c.restore();
}
function water(c,plan,detail){if(!plan.lake)return;if(plan.modularScene)drawStoneShore(c,plan);if(detail&&drawSourceLake(c,plan.lake,0,{shore:!plan.modularScene,reducedMotion:true}))return;const lake=plan.lake,m=plan.materials;
 if(lake.outline?.length>=3||lake.islands?.length){traceLakePath(c,lake,{holes:false});if(!plan.modularScene){c.strokeStyle=m.grassShade;c.lineWidth=36;c.stroke();c.strokeStyle=m.shore;c.lineWidth=20;c.stroke();}c.fillStyle=m.water;c.fill();
  for(const island of lake.islands||[]){c.fillStyle=m.grass;c.beginPath();c.ellipse(island.x,island.y,island.radius_x,island.radius_y,island.rotation||0,0,Math.PI*2);c.fill();c.strokeStyle=m.shore;c.lineWidth=12;c.stroke();}return;
 }
 for(const [extra,color] of [[18,m.grassShade],[10,m.shore],[0,m.water],[-12,'#89afb4']]){c.fillStyle=color;c.beginPath();c.ellipse(lake.x,lake.y,lake.radius_x+extra,lake.radius_y+extra,lake.rotation,0,Math.PI*2);c.fill();}
 if(detail)for(let i=0;i<125;i++){const x=lake.x-lake.radius_x+(i*67)%(lake.radius_x*2),y=lake.y-lake.radius_y+(i*43)%(lake.radius_y*2);if(((x-lake.x)/(lake.radius_x-22))**2+((y-lake.y)/(lake.radius_y-20))**2<1){rect(c,x,y,12+(i%3)*10,2,i%3?'#b3c8c9':'#6d959f');if(i%6===0)rect(c,x+3,y+4,17,1,'#cbdad7');}}
}
/** Parcel-sized bays use the same independent native asphalt texture as the
 * street. Upright cars stay separate genuine source views above this ground. */
export function drawParkingGround(c,plan,tile=null){
 const m=plan.materials;
 for(const lot of plan.parkingLots||[]){
  if(tile&&(lot.x>=tile.x+tile.width||lot.x+lot.width<=tile.x||lot.y>=tile.y+tile.height||lot.y+lot.height<=tile.y))continue;
  rect(c,lot.x,lot.y,lot.width,lot.height,m.asphalt);
  const asset=resolveDesignAsset('source-road-asphalt-tile'),step=160,h=asset?step*asset.height/asset.width:104;
  if(asset&&c.clip){c.save();c.beginPath();c.rect(lot.x,lot.y,lot.width,lot.height);c.clip();
   const left=Math.floor(Math.max(lot.x,tile?.x??lot.x)/step)*step,top=Math.floor(Math.max(lot.y,tile?.y??lot.y)/h)*h,right=Math.min(lot.x+lot.width,tile?tile.x+tile.width:Infinity),bottom=Math.min(lot.y+lot.height,tile?tile.y+tile.height:Infinity);
   for(let y=top;y<bottom;y+=h)for(let x=left;x<right;x+=step)drawDesignAsset(c,'source-road-asphalt-tile',x,y,step,h,{anchorX:0,anchorY:0});
   c.restore();
  }
  // Each row is a real240×120 space. No line crosses the central vehicle aisle.
  for(const slot of lot.native_slots||[]){const b=slot.bounds;rect(c,b.x,b.y,b.width,3,m.crossing);rect(c,b.x,b.y+b.height-3,b.width,3,m.crossing);const outer=b.x<lot.entry.point.x?b.x:b.x+b.width-3;rect(c,outer,b.y,3,b.height,m.crossing);}
  for(const curb of lot.borders||[]){rect(c,curb.x,curb.y+4,curb.width,curb.height,'#363c40');rect(c,curb.x,curb.y,curb.width,curb.height,m.curb);rect(c,curb.x,curb.y,curb.width,Math.min(3,curb.height),'#d4d1c6');}
  for(const bumper of lot.bumpers||[]){rect(c,bumper.x+2,bumper.y+3,bumper.width,bumper.height,'#363c40');rect(c,bumper.x,bumper.y,bumper.width,bumper.height,'#adae9f');rect(c,bumper.x,bumper.y,Math.min(3,bumper.width),bumper.height,'#e2dfcc');}
 }
}
/** A flat stone bank follows the exact water contour; it does not add an
 * invisible collision wall or change boat and pedestrian water authority. */
function drawStoneShore(c,plan){
 const lake=plan.lake;if(!lake?.outline?.length)return;
 traceLakePath(c,lake,{holes:false});c.lineJoin='round';c.strokeStyle='#607441';c.lineWidth=36;c.stroke();c.strokeStyle='#756d58';c.lineWidth=22;c.stroke();c.strokeStyle='#a49a7d';c.lineWidth=16;c.stroke();
 const contours=[lake.outline];
 for(const island of lake.islands||[]){const points=[];for(let i=0;i<64;i++){const t=i*Math.PI/32,rot=island.rotation||0,x=island.radius_x*Math.cos(t),y=island.radius_y*Math.sin(t);points.push([island.x+x*Math.cos(rot)-y*Math.sin(rot),island.y+x*Math.sin(rot)+y*Math.cos(rot)]);}contours.push(points);stroke(c,[...points,points[0]],12,'#a49a7d');}
 for(const points of contours)for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],length=distance(a,b),tangent=[(b[0]-a[0])/length,(b[1]-a[1])/length],normal=[-tangent[1],tangent[0]];if(!length)continue;for(let d=16;d<length;d+=24){const center=[a[0]+tangent[0]*d,a[1]+tangent[1]*d];stroke(c,[[center[0]-normal[0]*7,center[1]-normal[1]*7],[center[0]+normal[0]*7,center[1]+normal[1]*7]],2,'#756d58','butt');}}
}
export function drawCityGround(c,plan,tile={x:0,y:0,width:plan.width,height:plan.height}){if(plan.exactScene)return drawExactSourceCity(c,plan.map,tile);grass(c,tile,plan.materials);roadLayers(c,plan,tile);water(c,plan,true);drawParkingGround(c,plan,tile);for(const node of plan.groundObjects||[]){const b=node.bounds;if(b.x<tile.x+tile.width&&b.x+b.width>tile.x&&b.y<tile.y+tile.height&&b.y+b.height>tile.y)node.draw(c);}}
export function drawMiniMapGround(c,plan){if(plan.exactScene)return drawExactSourceCity(c,plan.map);rect(c,0,0,plan.width,plan.height,plan.materials.grass);roadLayers(c,plan,false);water(c,plan,false);drawParkingGround(c,plan);for(const bed of plan.plantings)rect(c,bed.x,bed.y,bed.width,bed.height,plan.materials.shrub);for(const node of plan.groundObjects||[])node.draw(c);}
export function drawGroundPlanting(c,bed){const m=terrainMaterials,{x,y,width:w,height:h}=bed;
 if(drawSourceStreet(c,'flowerbed',x,y,{width:w}))return;
 rect(c,x+4,y+h+3,w,5,'#31452d24');rect(c,x-2,y-2,w+4,h+8,m.curb);rect(c,x,y,w,h,m.soil);rect(c,x,y+h,w,5,'#73806c');rect(c,x,y-2,w,3,'#dce1ce');
 for(let i=5;i<w-4;i+=12){const n=hash(Math.round(x+i),Math.round(y)),top=y-8-(n%4)*2;rect(c,x+i-2,top+4,14,17,m.shrub);rect(c,x+i,top,10,18,m.shrubLight);rect(c,x+i+2,top+2,5,3,'#a9bc8d');rect(c,x+i+9,top+10,3,6,'#536f4f');if(bed.flowers&&n%3===0){rect(c,x+i+4,top+2,4,4,n%5?'#e3c68a':'#c8a3a2');rect(c,x+i+5,top+3,2,2,'#f1dfba');}}
}

/** The repeating source asphalt is clipped to the union of street capsules.
 * Pixel grain continues through junctions without a second road painted on top. */
export function drawSourceRoadTextures(c,plan,tile=null){
 const segments=plan.roadSegments.filter(asphaltRoad);if(!segments.length)return;
 c.save();c.beginPath();
 for(const s of segments){const r=s.width/2,angle=Math.atan2(s.tangent[1],s.tangent[0]),n=angle+Math.PI/2,dx=Math.cos(n)*r,dy=Math.sin(n)*r;
  c.moveTo(s.a[0]+dx,s.a[1]+dy);c.lineTo(s.b[0]+dx,s.b[1]+dy);c.arc(s.b[0],s.b[1],r,n,n+Math.PI,true);c.lineTo(s.a[0]-dx,s.a[1]-dy);c.arc(s.a[0],s.a[1],r,n+Math.PI,n+Math.PI*2,true);c.closePath();
 }
 c.clip();
 const asset=resolveDesignAsset('source-road-asphalt-tile');if(!asset){c.restore();return;}
 // Repeat the painted rectangle, including its native aspect ratio. A square
 // repeat cell leaves a horizontal gap below this 200 × 130 source texture.
 const stepX=160,stepY=stepX*asset.height/asset.width;
 const left=Math.floor((tile?.x||0)/stepX)*stepX,top=Math.floor((tile?.y||0)/stepY)*stepY,right=Math.min(plan.width,left+(tile?.width||1024)+stepX),bottom=Math.min(plan.height,top+(tile?.height||1024)+stepY);
 for(let y=top;y<bottom;y+=stepY)for(let x=left;x<right;x+=stepX){
  const centre=[x+stepX/2,y+stepY/2];if(!segments.some(s=>distance(centre,projected(s,centre).point)<s.width/2+Math.max(stepX,stepY)))continue;
  drawDesignAsset(c,'source-road-asphalt-tile',x,y,stepX,stepY,{anchorX:0,anchorY:0});
 }
 c.restore();
}
