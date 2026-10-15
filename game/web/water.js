/** One boundary contract for water artwork, pedestrians and authoritative boats.
 * Authored outlines use absolute world points; omitted outlines keep the original
 * rotated ellipse. Dry island ellipses are holes in either kind of lake. */
const EPS=1e-9,TAU=Math.PI*2;
const finitePoint=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function normalized(lake,point,inset=0){
 const rx=lake?.radius_x-inset,ry=lake?.radius_y-inset;
 if(!finitePoint(point)||![lake?.x,lake?.y,rx,ry,lake?.rotation||0].every(Number.isFinite)||rx<=0||ry<=0)return null;
 const cos=Math.cos(lake.rotation||0),sin=Math.sin(lake.rotation||0),dx=point.x-lake.x,dy=point.y-lake.y;
 return {x:(cos*dx+sin*dy)/rx,y:(-sin*dx+cos*dy)/ry};
}
function authoredOutline(lake){
 const points=lake?.outline;
 return Array.isArray(points)&&points.length>=3&&points.every(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]))?points:null;
}
function islands(lake){return (Array.isArray(lake?.islands)?lake.islands:[]).filter(i=>normalized(i,{x:i?.x,y:i?.y}));}
function edgeProjection(p,a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?clamp(((p.x-a[0])*dx+(p.y-a[1])*dy)/length,0,1):0;
 const x=a[0]+dx*t,y=a[1]+dy*t;return {x,y,distance:Math.hypot(p.x-x,p.y-y)};
}
function polygonMeasure(points,p){
 let inside=false,distance=Infinity;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[j],b=points[i];distance=Math.min(distance,edgeProjection(p,a,b).distance);
  if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return {inside,distance};
}
export function lakeContains(lake,point,inset=0){
 if(!finitePoint(point)||!Number.isFinite(inset))return false;
 const outline=authoredOutline(lake);let wet;
 if(outline){const m=polygonMeasure(outline,point);wet=inset>=0?m.inside&&m.distance>inset+EPS:m.inside||m.distance<-inset-EPS;}
 else{const p=normalized(lake,point,inset);wet=!!p&&p.x*p.x+p.y*p.y<1-1e-10;}
 return wet&&!islands(lake).some(i=>{const p=normalized(i,point,-inset);return p&&p.x*p.x+p.y*p.y<=1+1e-10;});
}
/** Exact parametric boundary intervals avoid both endpoint-only tunnelling and
 * distance-dependent sampling. Offset polygon edges also include their round
 * corner caps, so the same test applies to a boat's clearance margin. */
function quadraticRoots(a,b,c,out){
 if(Math.abs(a)<EPS){if(Math.abs(b)>EPS)out.push(-c/b);return;}
 const d=b*b-4*a*c;if(d<-EPS)return;
 const root=Math.sqrt(Math.max(0,d));out.push((-b-root)/(2*a),(-b+root)/(2*a));
}
function ellipseBreaks(ellipse,start,end,inset,out){
 const a=normalized(ellipse,start,inset),b=normalized(ellipse,end,inset);if(!a||!b)return;
 const dx=b.x-a.x,dy=b.y-a.y;quadraticRoots(dx*dx+dy*dy,2*(a.x*dx+a.y*dy),a.x*a.x+a.y*a.y-1,out);
}
function polygonBreaks(points,start,end,inset,out){
 const vx=end.x-start.x,vy=end.y-start.y,r=Math.abs(inset);
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)continue;
  const nx=-dy/length,ny=dx/length,d0=(start.x-a[0])*nx+(start.y-a[1])*ny,dv=vx*nx+vy*ny;
  if(Math.abs(dv)>EPS)for(const offset of r?[-r,r]:[0]){
   const t=(offset-d0)/dv,projection=((start.x+vx*t-a[0])*dx+(start.y+vy*t-a[1])*dy)/(length*length);
   if(projection>=-EPS&&projection<=1+EPS)out.push(t);
  }
  if(r){const ux=start.x-a[0],uy=start.y-a[1];quadraticRoots(vx*vx+vy*vy,2*(ux*vx+uy*vy),ux*ux+uy*uy-r*r,out);}
 }
}
function segmentBreaks(lake,start,end,inset){
 const values=[0,1],outline=authoredOutline(lake);
 if(outline)polygonBreaks(outline,start,end,inset,values);else ellipseBreaks(lake,start,end,inset,values);
 for(const island of islands(lake))ellipseBreaks(island,start,end,-inset,values);
 return values.filter(v=>Number.isFinite(v)&&v>=0&&v<=1).sort((a,b)=>a-b).filter((v,i,a)=>i===0||v-a[i-1]>1e-12);
}
const along=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export function segmentCrossesLake(lake,start,end,inset=0){
 if(!finitePoint(start)||!finitePoint(end)||!Number.isFinite(inset))return false;
 if(lakeContains(lake,start,inset)||lakeContains(lake,end,inset))return true;
 const breaks=segmentBreaks(lake,start,end,inset);
 return breaks.slice(1).some((t,i)=>lakeContains(lake,along(start,end,(breaks[i]+t)/2),inset));
}
export function segmentStaysInLake(lake,start,end,inset=12){
 if(!lakeContains(lake,start,inset)||!lakeContains(lake,end,inset))return false;
 const breaks=segmentBreaks(lake,start,end,inset);
 for(let i=1;i<breaks.length;i++)if(!lakeContains(lake,along(start,end,(breaks[i-1]+breaks[i])/2),inset))return false;
 // A tangent touch of a dry island is also a collision, not a traversable path.
 return breaks.slice(1,-1).every(t=>lakeContains(lake,along(start,end,t),inset));
}
function walkways(lake){
 return (Array.isArray(lake?.walkways)?lake.walkways:[]).filter(w=>Number.isFinite(w?.width)&&w.width>0&&Array.isArray(w.points)&&w.points.length>=2&&w.points.every(p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite)));
}
function walkwayContains(lake,point){
 return walkways(lake).some(w=>w.points.slice(1).some((b,i)=>edgeProjection(point,w.points[i],b).distance<=w.width/2+EPS));
}
// A foot circle must fit the union of dry ground and every bridge strip. Eroding
// each strip independently would reject a legal circle straddling a landing.
const pedestrianGeometry=new WeakMap();
function polynomialRoots(coefficients){
 const p=[...coefficients],scale=Math.max(...p.map(Math.abs),1e-30);while(p.length>1&&Math.abs(p.at(-1))<=scale*1e-12)p.pop();
 if(p.length<=1)return [];if(p.length===2)return [-p[0]/p[1]];
 const value=x=>p.reduceRight((sum,n)=>sum*x+n,0),limit=1+Math.max(...p.slice(0,-1).map(n=>Math.abs(n/p.at(-1)))),critical=polynomialRoots(p.slice(1).map((n,i)=>n*(i+1))).filter(x=>x>-limit&&x<limit).sort((a,b)=>a-b),cuts=[-limit,...critical,limit],roots=[];
 for(const x of critical)if(Math.abs(value(x))<=scale*1e-9)roots.push(x);
 for(let i=1;i<cuts.length;i++){
  let low=cuts[i-1],high=cuts[i],a=value(low),b=value(high);if(!Number.isFinite(a)||!Number.isFinite(b)||a*b>0)continue;
  for(let n=0;n<80;n++){const mid=(low+high)/2,v=value(mid);if(a*v<=0){high=mid;b=v;}else{low=mid;a=v;}}
  roots.push((low+high)/2);
 }
 return roots;
}
function curvePoint(e,theta){const cos=Math.cos(e.rotation||0),sin=Math.sin(e.rotation||0),u=e.radius_x*Math.cos(theta),v=e.radius_y*Math.sin(theta);return {x:e.x+cos*u-sin*v,y:e.y+sin*u+cos*v};}
function curveEllipseAngles(curve,ellipse,out){
 const c=normalized(ellipse,curvePoint(curve,0)),opposite=normalized(ellipse,curvePoint(curve,Math.PI)),quarter=normalized(ellipse,curvePoint(curve,Math.PI/2));if(!c||!opposite||!quarter)return;
 const centre={x:(c.x+opposite.x)/2,y:(c.y+opposite.y)/2},u={x:(c.x-opposite.x)/2,y:(c.y-opposite.y)/2},v={x:quarter.x-centre.x,y:quarter.y-centre.y};
 const a=u.x*u.x+u.y*u.y,b=v.x*v.x+v.y*v.y,cross=2*(u.x*v.x+u.y*v.y),d=2*(centre.x*u.x+centre.y*u.y),e=2*(centre.x*v.x+centre.y*v.y),f=centre.x*centre.x+centre.y*centre.y-1;
 for(const t of polynomialRoots([a+d+f,2*(cross+e),-2*a+4*b+2*f,2*(e-cross),a-d+f]))out.push((2*Math.atan(t)+TAU)%TAU);
}
function curveLineAngles(curve,a,b,out){
 const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)return;
 const p=curvePoint(curve,0),q=curvePoint(curve,Math.PI/2),nx=-dy/length,ny=dx/length,d=(curve.x-a[0])*nx+(curve.y-a[1])*ny,u=(p.x-curve.x)*nx+(p.y-curve.y)*ny,v=(q.x-curve.x)*nx+(q.y-curve.y)*ny,h=Math.hypot(u,v);
 if(!h||Math.abs(d)>h+EPS)return;const phi=Math.atan2(v,u),angle=Math.acos(clamp(-d/h,-1,1));
 for(const theta of [phi-angle,phi+angle]){const p=curvePoint(curve,theta),t=((p.x-a[0])*dx+(p.y-a[1])*dy)/(length*length);if(t>=-EPS&&t<=1+EPS)out.push((theta+TAU)%TAU);}
}
const sortedAngles=values=>values.filter(Number.isFinite).sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>1e-10);
function curveCuts(curve,geometry){const values=[0,Math.PI,TAU];for(const [a,b]of geometry.lines)curveLineAngles(curve,a,b,values);for(const e of geometry.curves)if(e!==curve)curveEllipseAngles(curve,e,values);return sortedAngles(values);}
function lineCuts(a,b,geometry){
 const values=[0,1],start={x:a[0],y:a[1]},end={x:b[0],y:b[1]};
 for(const [p,q]of geometry.lines)polygonBreaks([p,q],start,end,0,values);
 for(const e of geometry.curves)ellipseBreaks(e,start,end,0,values);
 return values.filter(v=>Number.isFinite(v)&&v>=0&&v<=1).sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>1e-10);
}
function footGeometry(lake){
 let geometry=pedestrianGeometry.get(lake);if(geometry)return geometry;
 const lines=[],curves=[],outline=authoredOutline(lake),bounds=lakeBounds(lake);
 if(outline)for(let i=0;i<outline.length;i++)lines.push([outline[i],outline[(i+1)%outline.length]]);else if(normalized(lake,{x:lake?.x,y:lake?.y}))curves.push(lake);
 curves.push(...islands(lake));
 for(const walkway of walkways(lake))for(let i=1;i<walkway.points.length;i++){
  const a=walkway.points[i-1],b=walkway.points[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),r=walkway.width/2;if(!length)continue;const nx=-dy*r/length,ny=dx*r/length;
  lines.push([[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny]],[[a[0]-nx,a[1]-ny],[b[0]-nx,b[1]-ny]]);
  for(const p of [a,b])curves.push({x:p[0],y:p[1],radius_x:r,radius_y:r,rotation:0});
 }
 geometry={lines,curves,bounds,seeds:[]};pedestrianGeometry.set(lake,geometry);
 // One wet-side point per boundary fragment also detects a tiny enclosed pond
 // wholly inside a footprint or swept capsule, with no perimeter crossing.
 const seed=(p,nx,ny)=>{for(const sign of [-1,1]){const q={x:p.x+nx*sign*1e-5,y:p.y+ny*sign*1e-5};if(lakeContains(lake,q)&&!walkwayContains(lake,q))geometry.seeds.push(q);}};
 for(const [a,b]of lines){const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)continue;const cuts=lineCuts(a,b,geometry);for(let i=1;i<cuts.length;i++){const t=(cuts[i-1]+cuts[i])/2;seed({x:a[0]+dx*t,y:a[1]+dy*t},-dy/length,dx/length);}}
 for(const curve of curves){const cuts=curveCuts(curve,geometry);for(let i=1;i<cuts.length;i++){const theta=(cuts[i-1]+cuts[i])/2,p=curvePoint(curve,theta),next=curvePoint(curve,theta+1e-5),dx=next.x-p.x,dy=next.y-p.y,length=Math.hypot(dx,dy);if(length)seed(p,-dy/length,dx/length);}}
 return geometry;
}
function footCircleCrossesWater(lake,point,radius){
 const geometry=footGeometry(lake),b=geometry.bounds;if(!b||point.x+radius<b.x||point.x-radius>b.x+b.width||point.y+radius<b.y||point.y-radius>b.y+b.height)return false;
 const wet=p=>lakeContains(lake,p)&&!walkwayContains(lake,p);if(wet(point))return true;
 const curve={x:point.x,y:point.y,radius_x:radius,radius_y:radius,rotation:0},cuts=curveCuts(curve,geometry);
 for(let i=1;i<cuts.length;i++)if(wet(curvePoint(curve,(cuts[i-1]+cuts[i])/2)))return true;
 return geometry.seeds.some(p=>(p.x-point.x)**2+(p.y-point.y)**2<(radius-1e-7)**2);
}
/** A bridge changes pedestrian access only. Boats retain the original water
 * boundary and dry-island clearance, independently of the overlay above them. */
export function pedestrianLakeContains(lake,point,radius=0){return finitePoint(point)&&Number.isFinite(radius)&&radius>0?footCircleCrossesWater(lake,point,radius):lakeContains(lake,point)&&!walkwayContains(lake,point);}
export function pedestrianSegmentCrossesLake(lake,start,end,radius=0){
 if(!finitePoint(start)||!finitePoint(end))return false;
 if(radius>0){
  if(pedestrianLakeContains(lake,start,radius)||pedestrianLakeContains(lake,end,radius)||pedestrianSegmentCrossesLake(lake,start,end))return true;
  const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);if(!length)return false;const nx=-dy*radius/length,ny=dx*radius/length;
  for(const sign of [-1,1])if(pedestrianSegmentCrossesLake(lake,{x:start.x+nx*sign,y:start.y+ny*sign},{x:end.x+nx*sign,y:end.y+ny*sign}))return true;
  return footGeometry(lake).seeds.some(p=>edgeProjection(p,[start.x,start.y],[end.x,end.y]).distance<radius-1e-7);
 }
 if(pedestrianLakeContains(lake,start)||pedestrianLakeContains(lake,end))return true;
 const values=segmentBreaks(lake,start,end,0);
 for(const walkway of walkways(lake))for(let i=1;i<walkway.points.length;i++)polygonBreaks([walkway.points[i-1],walkway.points[i]],start,end,walkway.width/2,values);
 const breaks=values.filter(v=>Number.isFinite(v)&&v>=0&&v<=1).sort((a,b)=>a-b).filter((v,i,a)=>i===0||v-a[i-1]>1e-12);
 return breaks.slice(1).some((t,i)=>pedestrianLakeContains(lake,along(start,end,(breaks[i]+t)/2)));
}
function ellipsePoint(ellipse,theta){
 const cos=Math.cos(ellipse.rotation||0),sin=Math.sin(ellipse.rotation||0),u=ellipse.radius_x*Math.cos(theta),v=ellipse.radius_y*Math.sin(theta);
 return {x:ellipse.x+cos*u-sin*v,y:ellipse.y+sin*u+cos*v};
}
function nearestEllipseBoundary(ellipse,point){
 const step=TAU/64;let best=0,bestDistance=Infinity;
 const distance=t=>{const p=ellipsePoint(ellipse,t);return (p.x-point.x)**2+(p.y-point.y)**2;};
 for(let i=0;i<64;i++){const d=distance(i*step);if(d<bestDistance){bestDistance=d;best=i*step;}}
 let low=best-step,high=best+step;
 for(let i=0;i<45;i++){const a=(2*low+high)/3,b=(low+2*high)/3;if(distance(a)<=distance(b))high=b;else low=a;}
 const theta=(low+high)/2,p=ellipsePoint(ellipse,theta),cos=Math.cos(ellipse.rotation||0),sin=Math.sin(ellipse.rotation||0),u=Math.cos(theta)/ellipse.radius_x,v=Math.sin(theta)/ellipse.radius_y,length=Math.hypot(u,v);
 return {...p,nx:(cos*u-sin*v)/length,ny:(sin*u+cos*v)/length,distance:Math.hypot(point.x-p.x,point.y-p.y)};
}
export function nearestShore(lake,point,padding=18){
 if(!finitePoint(point)||!Number.isFinite(padding))return {...point};
 const outline=authoredOutline(lake),holes=islands(lake);
 // Preserve the old radial recovery for old maps with no optional geometry.
 if(!outline&&!holes.length){
  const p=normalized(lake,point);if(!p)return {...point};const length=Math.hypot(p.x,p.y),u=length?p.x/length:0,v=length?p.y/length:1;
  const x=u*(lake.radius_x+padding),y=v*(lake.radius_y+padding),cos=Math.cos(lake.rotation||0),sin=Math.sin(lake.rotation||0);
  return {x:lake.x+cos*x-sin*y,y:lake.y+sin*x+cos*y};
 }
 const candidates=[];
 if(outline){
  const area=outline.reduce((sum,a,i)=>{const b=outline[(i+1)%outline.length];return sum+a[0]*b[1]-b[0]*a[1];},0),sign=area>=0?1:-1;
  for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length)candidates.push({...edgeProjection(point,a,b),nx:sign*dy/length,ny:-sign*dx/length});}
 }else if(normalized(lake,point))candidates.push(nearestEllipseBoundary(lake,point));
 for(const island of holes){const p=nearestEllipseBoundary(island,point);candidates.push({...p,nx:-p.nx,ny:-p.ny});}
 candidates.sort((a,b)=>a.distance-b.distance);
 for(const edge of candidates){
  const next={x:edge.x+edge.nx*padding,y:edge.y+edge.ny*padding};
  if(padding>=0?!lakeContains(lake,next):lakeContains(lake,next))return next;
 }
 return {...point};
}
export function nearestPedestrianShore(lake,point,radius=14,allowed=()=>true){
 if(!pedestrianLakeContains(lake,point,radius)&&allowed(point))return {...point};
 const candidates=[],padding=radius+4,outline=authoredOutline(lake);
 if(outline){
  const area=outline.reduce((sum,a,i)=>{const b=outline[(i+1)%outline.length];return sum+a[0]*b[1]-b[0]*a[1];},0),sign=area>=0?1:-1;
  for(let i=0;i<outline.length;i++){
   const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)continue;const p=edgeProjection(point,a,b);
   candidates.push({x:p.x+sign*dy*padding/length,y:p.y-sign*dx*padding/length});
   const distance=Math.hypot(point.x-a[0],point.y-a[1]);if(distance)candidates.push({x:a[0]+(point.x-a[0])*padding/distance,y:a[1]+(point.y-a[1])*padding/distance});
  }
 }else if(normalized(lake,point)){const p=nearestEllipseBoundary(lake,point);candidates.push({x:p.x+p.nx*padding,y:p.y+p.ny*padding});}
 for(const island of islands(lake)){const p=nearestEllipseBoundary(island,point);candidates.push({x:p.x-p.nx*padding,y:p.y-p.ny*padding});}
 for(const walkway of walkways(lake))for(let i=1;i<walkway.points.length;i++){
  const a=walkway.points[i-1],b=walkway.points[i],p=edgeProjection(point,a,b),margin=walkway.width/2-radius;
  if(margin<0)continue;const distance=Math.hypot(point.x-p.x,point.y-p.y),scale=distance?Math.min(1,margin/distance):0;
  candidates.push({x:p.x+(point.x-p.x)*scale,y:p.y+(point.y-p.y)*scale},{x:p.x,y:p.y});
 }
 return candidates.filter(p=>!pedestrianLakeContains(lake,p,radius)&&allowed(p)).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y)||a.y-b.y||a.x-b.x)[0]||nearestShore(lake,point,padding);
}
export function movePedestrianPosition(lake,start,end,radius=14){
 if(!pedestrianSegmentCrossesLake(lake,start,end,radius))return {...end};
 const clip=(a,b)=>{
  if(!pedestrianSegmentCrossesLake(lake,a,b,radius))return b;
  let low=0,high=1;for(let i=0;i<35;i++){const t=(low+high)/2;if(pedestrianSegmentCrossesLake(lake,a,along(a,b,t),radius))high=t;else low=t;}
  return along(a,b,low);
 };
 const horizontal=clip(start,{x:end.x,y:start.y});
 return clip(horizontal,{x:horizontal.x,y:end.y});
}
/** An absolute contour for paths, minimaps and deterministic shore placement. */
export function lakeOutline(lake,steps=96){
 const outline=authoredOutline(lake);if(outline)return outline.map(p=>[p[0],p[1]]);
 if(!normalized(lake,{x:lake?.x,y:lake?.y}))return [];
 return Array.from({length:Math.max(12,Math.floor(steps))},(_,i)=>{const p=ellipsePoint(lake,i*TAU/Math.max(12,Math.floor(steps)));return [p.x,p.y];});
}
export function lakeBounds(lake){
 if(!authoredOutline(lake)){
  if(!normalized(lake,{x:lake?.x,y:lake?.y}))return null;
  const cos=Math.cos(lake.rotation||0),sin=Math.sin(lake.rotation||0),rx=Math.hypot(lake.radius_x*cos,lake.radius_y*sin),ry=Math.hypot(lake.radius_x*sin,lake.radius_y*cos);
  return {x:lake.x-rx,y:lake.y-ry,width:rx*2,height:ry*2};
 }
 const points=lakeOutline(lake);if(!points.length)return null;
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);
 return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
}
/** Begin a compound Canvas path; callers fill/clip it with the evenodd rule. */
export function traceLakePath(context,lake,{holes=true}={}){
 const outline=authoredOutline(lake);if(!outline&&!normalized(lake,{x:lake?.x,y:lake?.y}))return false;
 context.beginPath();
 if(outline){context.moveTo(outline[0][0],outline[0][1]);for(const point of outline.slice(1))context.lineTo(point[0],point[1]);context.closePath();}
 else{context.ellipse(lake.x,lake.y,lake.radius_x,lake.radius_y,lake.rotation||0,0,TAU);context.closePath();}
 if(holes)for(const island of islands(lake)){
  const first=ellipsePoint(island,0);context.moveTo(first.x,first.y);context.ellipse(island.x,island.y,island.radius_x,island.radius_y,island.rotation||0,0,TAU);context.closePath();
 }
 return true;
}
export function moveBoatPosition(lake,position,dx,dy,inset=12){
 let start=lakeContains(lake,position,inset)?position:nearestShore(lake,position,-inset-.1);
 if(!lakeContains(lake,start,inset)){
  const center={x:lake?.x,y:lake?.y};start=lakeContains(lake,center,inset)?center:null;
  // Recovery of an old layout must never place a boat on a new central island.
  if(!start){const bounds=lakeBounds(lake);if(bounds)for(let y=1;y<10&&!start;y++)for(let x=1;x<10&&!start;x++){const p={x:bounds.x+bounds.width*x/10,y:bounds.y+bounds.height*y/10};if(lakeContains(lake,p,inset))start=p;}}
  if(!start)return {...position};
 }
 const target={x:start.x+(Number.isFinite(dx)?dx:0),y:start.y+(Number.isFinite(dy)?dy:0)};
 if(segmentStaysInLake(lake,start,target,inset))return target;
 let low=0,high=1;for(let i=0;i<35;i++){const t=(low+high)/2,p=along(start,target,t);if(segmentStaysInLake(lake,start,p,inset))low=t;else high=t;}
 return along(start,target,low);
}
export function petEffectState(effect,now=Date.now()/1000){
 if(!effect||!['dog','cat'].includes(effect.kind)||!Number.isFinite(effect.started_at)||!Number.isFinite(effect.duration)||effect.duration<=0)return null;
 const elapsed=now-effect.started_at;if(elapsed<0||elapsed>=effect.duration)return null;
 return {...effect,progress:elapsed/effect.duration,reach:Math.sin(Math.PI*Math.min(1,elapsed/.5)),bounce:Math.sin(elapsed*17)*2};
}
