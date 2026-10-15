import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCityGroundPlan,drawCityGround,drawMiniMapGround} from '../web/city-ground.js';
const map=JSON.parse(await readFile(new URL('../web/world-layout-v18.json',import.meta.url),'utf8'));
const pointDistance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)||0));return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);};
function recordGround(plan,mini=false){
 const calls=[];let path=[];const c={fillStyle:'',strokeStyle:'',lineWidth:1,lineCap:'round',save(){},restore(){},clip(){},arc(){},beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},fillRect(x,y,w,h){calls.push({kind:'rect',x,y,w,h,color:this.fillStyle});},stroke(){calls.push({kind:'stroke',points:[...path],width:this.lineWidth,cap:this.lineCap,color:this.strokeStyle});},ellipse(x,y,rx,ry,angle){path=[{x,y,rx,ry,angle}];},fill(){calls.push({kind:typeof path[0]?.x==='number'?'ellipse':'polygon',points:[...path],color:this.fillStyle});}};
 if(mini)drawMiniMapGround(c,plan);else drawCityGround(c,plan,{x:0,y:0,width:map.width,height:map.height});
 return p=>{let color=null;for(const n of calls){let hit=false;if(n.kind==='rect')hit=p[0]>=n.x&&p[0]<n.x+n.w&&p[1]>=n.y&&p[1]<n.y+n.h;else if(n.kind==='stroke')for(let i=1;i<n.points.length;i++){const a=n.points[i-1],b=n.points[i];if(pointDistance(p,a,b)<=n.width/2){const dx=b[0]-a[0],dy=b[1]-a[1],dot=(p[0]-a[0])*dx+(p[1]-a[1])*dy;if(n.cap!=='butt'||(dot>=0&&dot<=dx*dx+dy*dy))hit=true;}}else if(n.kind==='ellipse'){const e=n.points[0],dx=p[0]-e.x,dy=p[1]-e.y,x=dx*Math.cos(e.angle)+dy*Math.sin(e.angle),y=-dx*Math.sin(e.angle)+dy*Math.cos(e.angle);hit=(x/e.rx)**2+(y/e.ry)**2<=1;}else for(let i=0,j=n.points.length-1;i<n.points.length;j=i++){const a=n.points[i],b=n.points[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}if(hit)color=n.color;}return color;};
}
const plan=createCityGroundPlan(map),streetSegments=plan.roadSegments.filter(s=>s.kind==='road');
const roadAt=(p,margin=0)=>streetSegments.some(s=>pointDistance(p,s.a,s.b)<=s.width/2-margin);
const asphaltColors=new Set([plan.materials.asphalt,plan.materials.asphaltGrain,plan.materials.crossing]);
for(const mini of [false,true])test(`${mini?'overview':'city'} preserves both arms of all real intersections`,()=>{
 const paint=recordGround(plan,mini),centers=plan.junctions.map(j=>j.center);assert.ok(centers.length>=3);
 let checked=0;for(const [x,y]of centers)for(let dy=-100;dy<=100;dy+=10)for(let dx=-100;dx<=100;dx+=10){const p=[x+dx,y+dy];if(!roadAt(p,6))continue;checked++;assert.ok(asphaltColors.has(paint(p)),`asphalt covered at ${p} by ${paint(p)}`);}assert.ok(checked>1000);
});
test('footpaths and forecourts cannot erase an asphalt lane anywhere along the network',()=>{
 const paint=recordGround(plan);let checked=0;for(const s of streetSegments)for(let d=15;d<s.length;d+=35)for(const side of [-1,0,1]){const p=[s.a[0]+s.tangent[0]*d+s.normal[0]*side*(s.width/2-10),s.a[1]+s.tangent[1]*d+s.normal[1]*side*(s.width/2-10)];checked++;assert.ok(asphaltColors.has(paint(p)),`${s.id}: lane covered at ${p} by ${paint(p)}`);}assert.ok(checked>1000);
});
test('street asphalt ownership is independent of road list order',()=>{
 const a=recordGround(plan,true),b=recordGround(createCityGroundPlan({...map,roads:[...map.roads].reverse()}),true);for(const s of streetSegments)for(let d=15;d<s.length;d+=75){const p=[s.a[0]+s.tangent[0]*d,s.a[1]+s.tangent[1]*d];assert.equal(a(p),b(p),`${s.id} changes material when reordered`);}
});
test('all visible front planters remain outside asphalt and clear of entrances',()=>{
 for(const bed of plan.plantings){const a=plan.approaches.find(a=>a.id===bed.buildingId),box={x:bed.x-2,y:bed.y-16,width:bed.width+8,height:47};assert.ok(!(box.x<a.corridor.x+a.corridor.width&&box.x+box.width>a.corridor.x&&box.y<a.corridor.y+a.corridor.height&&box.y+box.height>a.corridor.y),`${bed.id} obstructs entrance`);
  for(let y=box.y;y<=box.y+box.height;y+=2)for(let x=box.x;x<=box.x+box.width;x+=2)assert.equal(streetSegments.some(s=>pointDistance([x,y],s.a,s.b)<s.width/2+5),false,`${bed.id} visible support enters asphalt at ${x},${y}`);
 }
 for(const house of map.district.buildings){const frontage=map.architecture.frontages.find(f=>f.building_id===house.id);assert.ok(frontage?.forecourt&&frontage?.parking,`${house.id} has a paved courtyard and parking without forcing a planter into a sidewalk`);} assert.ok(plan.plantings.filter(b=>b.buildingId.startsWith('base-')).length>=6,'clan courtyards retain front gardens where physical space permits');
 assert.ok(plan.plantings.filter(b=>!b.buildingId.startsWith('base-')).length>=6,'Source public front gardens remain where complete sidewalk bands and terrace furniture leave room');
});
test('zebras keep their complete paint and landings clear of every branch',()=>{
 for(const crossing of plan.crossings){const s=plan.roadSegments.find(s=>s.id===crossing.segmentId);for(const j of plan.junctions.filter(j=>j.segmentIds.includes(s.id))){const along=(j.center[0]-s.a[0])*s.tangent[0]+(j.center[1]-s.a[1])*s.tangent[1],otherWidth=Math.max(...Object.entries(j.roadWidths).filter(([id])=>id!==s.roadId).map(([,w])=>w));assert.ok(Math.abs(crossing.along-along)>=otherWidth/2+27+55+16-1e-6,`${crossing.id} covers the branch at ${j.center}`);}}
});
test('short front approaches reach the sidewalk without overshooting and doubling back',()=>{
 for(const a of plan.approaches.filter(a=>a.path.length===3)){const [door,bend,end]=a.path;if(Math.abs(end[0]-door[0])<8&&end[1]>door[1])assert.ok(bend[1]<=end[1]+1e-6,`${a.id} doubles back from ${bend[1]} to ${end[1]}`);}
});
