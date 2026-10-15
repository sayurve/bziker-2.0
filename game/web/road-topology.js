/** Shared road joins and safe zebra positions. All coordinates are world pixels;
 * roadWidths is a {roadId: width} map. Saved map geometry remains untouched. */
const EPS=1e-7;
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const subtract=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<EPS;
function joins(a,b){
 const u=subtract(a.b,a.a),v=subtract(b.b,b.a),q=subtract(b.a,a.a),denom=cross(u,v);
 if(Math.abs(denom)<EPS){
  if(Math.abs(cross(q,u))>=EPS)return [];
  // Collinear end connections also need consistent shoulders. Overlap ends
  // are grouped once; ordinary same-road bends never enter this function.
  return [a.a,a.b].filter(p=>same(p,b.a)||same(p,b.b));
 }
 const t=cross(q,v)/denom,s=cross(q,u)/denom;
 return t>=-EPS&&t<=1+EPS&&s>=-EPS&&s<=1+EPS?[[a.a[0]+t*u[0],a.a[1]+t*u[1]]]:[];
}
function drivewayEdgeJoins(drive,road){
 if(drive.kind!=='driveway'||road.kind!=='road')return [];
 const u=subtract(road.b,road.a),square=u[0]*u[0]+u[1]*u[1];if(square<=EPS)return [];
 return [drive.a,drive.b].flatMap(p=>{
  const t=((p[0]-road.a[0])*u[0]+(p[1]-road.a[1])*u[1])/square;
  if(t<-EPS||t>1+EPS)return [];
  const center=[road.a[0]+t*u[0],road.a[1]+t*u[1]];
  // A parking entry is authored just inside the carriageway edge. Its
  // centre line stops there, so ordinary line intersection misses the mouth.
  // Project only a real foot-level contact into the road's exclusion axis;
  // nearby pedestrian paths and detached asphalt remain separate.
  return Math.hypot(p[0]-center[0],p[1]-center[1])<=road.width/2+EPS?[center]:[];
 });
}
export function roadJunctions(segments){
 const roads=segments.filter(s=>(s.kind==='road'||s.kind==='driveway')&&s.length>EPS),groups=[];
 for(let i=0;i<roads.length;i++)for(let k=i+1;k<roads.length;k++){
  const a=roads[i],b=roads[k];if(a.roadId===b.roadId)continue;
  const intersections=joins(a,b),contacts=intersections.length?intersections:[...drivewayEdgeJoins(a,b),...drivewayEdgeJoins(b,a)];
  for(const center of contacts){
   let group=groups.find(j=>same(j.center,center));if(!group){group={center,segments:new Map()};groups.push(group);}
   group.segments.set(a.id,a);group.segments.set(b.id,b);
  }
 }
 return groups.map(j=>{
  const touching=[...j.segments.values()],roadIds=[...new Set(touching.map(s=>s.roadId))].sort();
  return {id:`junction-${j.center.map(n=>Math.round(n*1e6)/1e6).join('-')}`,center:[...j.center],segmentIds:touching.map(s=>s.id).sort(),roadIds,roadWidths:Object.fromEntries(roadIds.map(id=>[id,Math.max(...touching.filter(s=>s.roadId===id).map(s=>s.width))]))};
 });
}
/** Allowed [minAlong,maxAlong] intervals for the zebra centre. The default
 * reserves its 55 px half-length, the branch's 27 px shoulder and a 16 px
 * landing gap; segment ends keep the existing width/2 + 78 px clearance. */
export function crossingIntervals(segment,junctions,{halfLength=55,sidewalk=27,gap=16,endpointClearance=segment.width/2+78}={}){
 if(segment.kind!=='road'||segment.length<2*endpointClearance||!Number.isFinite(segment.length))return [];
 let intervals=[[endpointClearance,segment.length-endpointClearance]];
 for(const junction of junctions){
  if(!junction.segmentIds.includes(segment.id))continue;
  const otherWidths=Object.entries(junction.roadWidths).filter(([id])=>id!==segment.roadId).map(([,width])=>width),width=Math.max(...(otherWidths.length?otherWidths:[segment.width]));
  const reach=width/2+sidewalk+halfLength+gap;
  const along=(junction.center[0]-segment.a[0])*segment.tangent[0]+(junction.center[1]-segment.a[1])*segment.tangent[1],low=along-reach,high=along+reach;
  intervals=intervals.flatMap(([a,b])=>{
   if(high<=a||low>=b)return [[a,b]];
   const parts=[];if(low>a)parts.push([a,low]);if(high<b)parts.push([high,b]);return parts;
  });
 }
 return intervals;
}
