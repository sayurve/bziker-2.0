import {isModularCity,citySceneEntities,citySupport} from './city-scene.js';
/** Foot-level geometry. Tall sprites occlude actors but only their ground
 * supports block movement. The generated JSON is shared with the server. */
const epsilon=1e-7;
const boxDistance=(p,b)=>Math.hypot(Math.max(b.x-p.x,0,p.x-b.x-b.width),Math.max(b.y-p.y,0,p.y-b.y-b.height));
const inside=(p,b,radius=0)=>radius?boxDistance(p,b)<radius-epsilon:p.x>b.x&&p.x<b.x+b.width&&p.y>b.y&&p.y<b.y+b.height;
export const playerBodyRadius=14;
export function segmentBoxDistance(a,z,b){
 let lo=0,hi=1;
 for(const [v,d,left,right]of [[a.x,z.x-a.x,b.x,b.x+b.width],[a.y,z.y-a.y,b.y,b.y+b.height]]){
  if(Math.abs(d)<epsilon){if(v<left||v>right){lo=2;break;}}
  else{const start=(left-v)/d,end=(right-v)/d;lo=Math.max(lo,Math.min(start,end));hi=Math.min(hi,Math.max(start,end));}
 }
 if(lo<=hi)return 0;
 let distance=Math.min(boxDistance(a,b),boxDistance(z,b));
 const dx=z.x-a.x,dy=z.y-a.y,length=dx*dx+dy*dy;
 for(const [x,y]of [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]){
  const t=length?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/length)):0;
  distance=Math.min(distance,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));
 }
 return distance;
}
export function cityPhysicalObstacles(map,shapes,extra=[]){
 const result=[],seen=new Set();
 const add=(id,b,kind)=>{if(!b||seen.has(id)||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<=0||b.height<=0)return;seen.add(id);result.push({id,kind,x:b.x,y:b.y,width:b.width,height:b.height});};
 const shape=(item,kind)=>{const b=shapes[kind];if(!b)return;const scale=b.scaled?item.size||1:1;add(item.id,{x:item.x+b.x*scale,y:item.y+b.y*scale,width:b.width*scale,height:b.height*scale},kind);};
 if(isModularCity(map)){
  const treeIds=new Set((map.decor?.trees||[]).map(t=>t.id));
  for(const item of citySceneEntities(map,{privateBases:true}))add(item.id,citySupport(item),treeIds.has(item.id)?'tree':item.kind||'building');
  for(const [i,b] of (map.solids||[]).entries())add(b.id||`solid-${i}`,b.footprint||b,b.kind||'building');
  return result;
 }
 for(const b of map.buildings||[])add(b.id,{...b,width:b.width+18,height:b.height+10},'building');
 for(const b of [...map.district?.buildings||[],...map.background_buildings||[]])add(b.id,b,'building');
 for(const [i,b] of (map.solids||[]).entries())add(`solid-${i}`,b,'building');
 for(const b of map.bench_groups||[])shape(b,'bench');
 for(const b of map.decor?.trees||[])shape(b,'tree');
 for(const b of map.decor?.lamps||[])shape(b,'lamp');
 for(const b of map.decor?.street_details||[]){if(b.footprint)add(b.id,b.footprint,b.kind);else shape(b,b.kind);}
 for(const b of map.activities||[])if(b.action==='trash-bin')shape(b,'bin');
 for(const b of map.architecture?.props||[])add(b.id,b.footprint,b.kind);
 for(const b of extra)add(b.id,b.footprint||b,b.kind||'furniture');
 return result;
}
export function nearestFreeCityPoint(position,obstacles,bounds,radius=0,allowed=()=>true){
 const point={x:Math.max(bounds.left+radius,Math.min(bounds.right-radius,position.x)),y:Math.max(bounds.top+radius,Math.min(bounds.bottom-radius,position.y))};
 if(!obstacles.some(b=>inside(point,b,radius))&&allowed(point))return point;
 const candidates=[point],seen=new Set();
 for(let i=0;i<candidates.length&&i<250;i++){
  const p=candidates[i],blocked=obstacles.filter(b=>inside(p,b,radius));if(!blocked.length)continue;
  const clearance=radius||1;
  for(const b of blocked){
   const choices=[{x:b.x-clearance,y:p.y},{x:b.x+b.width+clearance,y:p.y},{x:p.x,y:b.y-clearance},{x:p.x,y:b.y+b.height+clearance}];
   const x=Math.max(b.x,Math.min(b.x+b.width,p.x)),y=Math.max(b.y,Math.min(b.y+b.height,p.y)),distance=Math.hypot(p.x-x,p.y-y);
   if(radius&&distance>epsilon)choices.push({x:x+(p.x-x)*radius/distance,y:y+(p.y-y)*radius/distance});
   for(const q of choices){
   q.x=Math.max(bounds.left+radius,Math.min(bounds.right-radius,q.x));q.y=Math.max(bounds.top+radius,Math.min(bounds.bottom-radius,q.y));const key=`${q.x}:${q.y}`;if(!seen.has(key)){seen.add(key);candidates.push(q);}
   }
  }
 }
 return candidates.filter(p=>!obstacles.some(b=>inside(p,b,radius))&&allowed(p)).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y)||a.y-b.y||a.x-b.x)[0]||point;
}
export function moveBetweenObstacles(position,dx,dy,obstacles,bounds,radius=0){
 const p={...position},x=Math.max(bounds.left+radius,Math.min(bounds.right-radius,p.x+(Number.isFinite(dx)?dx:0))),targetY=Math.max(bounds.top+radius,Math.min(bounds.bottom-radius,p.y+(Number.isFinite(dy)?dy:0)));
 // A straight diagonal can clear a rounded corner even when the artificial
 // intermediate X/Y corner cannot. Sweep the actual circle first.
 if(radius&&x!==p.x&&targetY!==p.y&&!obstacles.some(b=>segmentBoxDistance(p,{x,y:targetY},b)<radius-epsilon))return {x,y:targetY};
 if(radius){
  const clip=(start,target,fixed,key,other,size,otherSize)=>{
   let next=target;
   for(const b of obstacles){
    const gap=Math.max(b[other]-fixed,0,fixed-b[other]-b[otherSize]);if(gap>=radius)continue;
    const extent=Math.sqrt(radius*radius-gap*gap),left=b[key]-extent,right=b[key]+b[size]+extent;
    if(Math.max(start,next)<=left+epsilon||Math.min(start,next)>=right-epsilon)continue;
    next=start<=left+epsilon&&next>start?Math.min(next,left):start>=right-epsilon&&next<start?Math.max(next,right):start;
   }
   return next;
  };
  p.x=clip(p.x,x,p.y,'x','y','width','height');
  p.y=clip(p.y,targetY,p.x,'y','x','height','width');
  return p;
 }
 if(!obstacles.some(b=>{
  const gap=Math.max(b.y-p.y,0,p.y-b.y-b.height);if(radius?gap>=radius:p.y<=b.y||p.y>=b.y+b.height)return false;
  const extent=radius?Math.sqrt(radius*radius-gap*gap):0;
  return Math.max(p.x,x)>b.x-extent+epsilon&&Math.min(p.x,x)<b.x+b.width+extent-epsilon;
 }))p.x=x;
 const y=Math.max(bounds.top+radius,Math.min(bounds.bottom-radius,p.y+(Number.isFinite(dy)?dy:0)));
 if(!obstacles.some(b=>{
  const gap=Math.max(b.x-p.x,0,p.x-b.x-b.width);if(radius?gap>=radius:p.x<=b.x||p.x>=b.x+b.width)return false;
  const extent=radius?Math.sqrt(radius*radius-gap*gap):0;
  return Math.max(p.y,y)>b.y-extent+epsilon&&Math.min(p.y,y)<b.y+b.height+extent-epsilon;
 }))p.y=y;
 return p;
}
export function createCityObstacleIndex(obstacles,cell=160,radius=0){
 const buckets=new Map();for(const b of obstacles)for(let y=Math.floor((b.y-radius)/cell);y<=Math.floor((b.y+b.height+radius)/cell);y++)for(let x=Math.floor((b.x-radius)/cell);x<=Math.floor((b.x+b.width+radius)/cell);x++){const key=`${x}:${y}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(b);}
 return {near(a,b=a){const result=new Set();for(let y=Math.floor(Math.min(a.y,b.y)/cell);y<=Math.floor(Math.max(a.y,b.y)/cell);y++)for(let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)for(const obstacle of buckets.get(`${x}:${y}`)||[])result.add(obstacle);return [...result];}};
}
