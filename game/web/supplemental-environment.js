// Newly generated missing objects, separate from the approved native catalog.
// Sizes and source crops are measured from generated-environment-v17-manifest.
const assets=Object.freeze({
 fountain:{path:'assets/generated-environment-v17-fountain.png',crop:{x:16,y:16,w:398,h:318},physical:[.94,.66]},
 gazebo:{path:'assets/generated-environment-v17-gazebo.png',crop:{x:16,y:16,w:336,h:397},physical:[.88,.22]},
 'railway-track':{path:'assets/generated-environment-v17-railway-track.png',crop:{x:16,y:16,w:431,h:170}},
 'platform-canopy':{path:'assets/generated-environment-v17-platform-canopy.png',crop:{x:16,y:16,w:465,h:277},physical:[.94,.25]},
 'passenger-coach':{path:'assets/generated-environment-v17-passenger-coach.png',crop:{x:16,y:16,w:617,h:192},physical:[.93,.55]},
 'park-shrub':{path:'assets/generated-environment-v17-park-shrub.png',crop:{x:16,y:16,w:248,h:230},physical:[.72,.34]}
});
const images=new Map(),pending=new Map();let imageLoader=null;
const finite=values=>values.every(Number.isFinite);
const assetOf=kind=>typeof kind==='string'&&Object.hasOwn(assets,kind)?assets[kind]:null;
function browserImage(url){
 if(typeof Image==='undefined')return Promise.resolve(null);
 return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=url;});
}
function ensureImage(kind){
 if(images.has(kind))return Promise.resolve(images.get(kind));
 const asset=assetOf(kind);if(!asset)return Promise.resolve(null);
 if(!pending.has(kind)){
  const load=imageLoader||browserImage;
  // Call in a promise so a synchronous loader failure is also contained.
  pending.set(kind,Promise.resolve().then(()=>load('/'+asset.path)).then(im=>{if(im)images.set(kind,im);return im;}).catch(()=>null).finally(()=>pending.delete(kind)));
 }
 return pending.get(kind);
}
/** Load six isolated PNGs. The sheet and original city map never enter runtime. */
export async function preloadSupplementalEnvironment(loader){
 if(typeof loader==='function')imageLoader=loader;
 const kinds=Object.keys(assets),result=await Promise.all(kinds.map(ensureImage));
 return {loaded:kinds.filter((_,i)=>!!result[i]),failed:kinds.filter((_,i)=>!result[i])};
}
function rotatedBounds(anchor,rect,rotation,shearY=0){
 const cos=Math.cos(rotation),sin=Math.sin(rotation),points=[];
 for(const x of [rect.x,rect.x+rect.width])for(const y of [rect.y,rect.y+rect.height]){const projectedY=y+x*shearY;points.push({x:anchor.x+x*cos-projectedY*sin,y:anchor.y+x*sin+projectedY*cos});}
 const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));
 return {x:left,y:top,width:Math.max(...points.map(p=>p.x))-left,height:Math.max(...points.map(p=>p.y))-top};
}
function explicitFootprint(value){
 if(!value||!finite([value.x,value.y,value.width,value.height])||value.width<=0||value.height<=0)return null;
 return {...value};
}
function propLayout(prop,index,railway){
 const asset=assetOf(prop?.kind);if(!asset||prop.kind==='railway-track'||!finite([prop.x,prop.y,prop.width])||prop.width<=0)return null;
 const width=prop.width,height=prop.height??width*asset.crop.h/asset.crop.w,rotation=prop.rotation??0;
 if(!finite([height,rotation])||height<=0)return null;
 const anchor={x:prop.x,y:prop.y},body={x:-width/2,y:-height,width,height},physical=asset.physical;
 // Project horizontal train edges onto the track while keeping walls vertical.
 // Rotating the whole side-view sprite would make the carriage lean over.
 let shearY=0;
 if(prop.kind==='passenger-coach'&&prop.rotation==null){
  const rails=railway.filter(r=>Math.abs(r.end.x-r.anchor.x)>1e-6).map(r=>{
   const dx=r.end.x-r.anchor.x,dy=r.end.y-r.anchor.y,t=Math.max(0,Math.min(1,((anchor.x-r.anchor.x)*dx+(anchor.y-r.anchor.y)*dy)/(dx*dx+dy*dy)));
   return {distance:Math.hypot(anchor.x-r.anchor.x-t*dx,anchor.y-r.anchor.y-t*dy),slope:dy/dx};
  }).sort((a,b)=>a.distance-b.distance);
  if(rails[0]&&rails[0].distance<height) shearY=rails[0].slope;
 }
 const supplied=explicitFootprint(prop.footprint),defaultPhysical={x:-width*physical[0]/2,y:-height*physical[1],width:width*physical[0],height:height*physical[1]};
 return {id:prop.id||'supplemental-prop-'+index,kind:prop.kind,assetId:'generated-environment-'+prop.kind,
  anchor,width,height,rotation,shearY,sourceBounds:{...asset.crop},body,bounds:rotatedBounds(anchor,body,rotation,shearY),
  footprint:prop.footprint===null?null:supplied||rotatedBounds(anchor,defaultPhysical,rotation,shearY),depth:prop.y};
}
function railwayLayouts(strip){
 if(!Array.isArray(strip?.points)||strip.points.length<2)return [];
 const width=strip.width??85;if(!Number.isFinite(width)||width<=0)return [];
 const crop=assets['railway-track'].crop;
 // Rail tips and gravel at the two ends are not repeatable. Use the interior
 // strip, where both steel rails span the complete source rectangle.
 const repeatCrop={x:crop.x+10,y:crop.y,w:crop.w-20,h:crop.h},moduleLength=width*repeatCrop.w/repeatCrop.h;
 const segments=[],out=[];let travelled=0;
 for(let i=1;i<strip.points.length;i++){
  const a=strip.points[i-1],b=strip.points[i];if(!Array.isArray(a)||!Array.isArray(b)||!finite([a[0],a[1],b[0],b[1]]))continue;
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<=1e-6)continue;
  segments.push({i,a,b,dx,dy,length,normal:{x:-dy/length,y:dx/length}});
 }
 const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
 const joint=(normal,other)=>{
  if(!other)return {x:normal.x*width/2,y:normal.y*width/2};
  const x=normal.x+other.x,y=normal.y+other.y,den=x*normal.x+y*normal.y;
  if(Math.abs(den)<.1)return {x:normal.x*width/2,y:normal.y*width/2};
  const scale=Math.min(width/(2*den),width/Math.max(Math.hypot(x,y),1e-6));return {x:x*scale,y:y*scale};
 };
 for(let n=0;n<segments.length;n++){
  const {i,a,b,dx,dy,length,normal}=segments[n],previous=segments[n-1],next=segments[n+1];
  const rotation=Math.atan2(dy,dx),anchor={x:a[0],y:a[1]},body={x:0,y:-width/2,width:length,height:width};
  const start=joint(normal,previous&&same(previous.b,a)?previous.normal:null),end=joint(normal,next&&same(b,next.a)?next.normal:null);
  const polygon=[{x:a[0]+start.x,y:a[1]+start.y},{x:b[0]+end.x,y:b[1]+end.y},{x:b[0]-end.x,y:b[1]-end.y},{x:a[0]-start.x,y:a[1]-start.y}];
  const clipPolygon=polygon.map(p=>({x:(p.x-a[0])*dx/length+(p.y-a[1])*dy/length,y:-(p.x-a[0])*dy/length+(p.y-a[1])*dx/length}));
  const left=Math.min(...polygon.map(p=>p.x)),top=Math.min(...polygon.map(p=>p.y)),bounds={x:left,y:top,width:Math.max(...polygon.map(p=>p.x))-left,height:Math.max(...polygon.map(p=>p.y))-top};
  out.push({id:'supplemental-railway-'+(i-1),kind:'railway-track',assetId:'generated-environment-railway-track',
   anchor,end:{x:b[0],y:b[1]},width,height:width,length,rotation,sourceBounds:{...crop},repeatCrop:{...repeatCrop},moduleLength,
   phase:travelled%moduleLength,body,clipPolygon,bounds,footprint:null,depth:-1});
  travelled+=length;
 }
 return out;
}
/** Map x/y is a ground anchor at the object's bottom center. Width/height size
 * the actual visible body, while footprint is an independent world rectangle. */
export function supplementalEnvironmentLayouts(map){
 if(map?.design_source?.exact_scene)return [];
 const props=Array.isArray(map?.decor?.environment_props)?map.decor.environment_props:[];
 const railway=railwayLayouts(map?.architecture?.railway_strip||map?.railway_strip);
 return [...railway,...props.map((prop,index)=>propLayout(prop,index,railway)).filter(Boolean)];
}
export function drawSupplementalEnvironment(c,layout){
 const asset=assetOf(layout?.kind);if(!c?.drawImage||!asset||!layout.anchor||!finite([layout.anchor.x,layout.anchor.y,layout.rotation,layout.width,layout.height]))return false;
 const im=images.get(layout.kind);if(!im){ensureImage(layout.kind);return false;}
 c.save();c.imageSmoothingEnabled=false;c.translate(layout.anchor.x,layout.anchor.y);c.rotate(layout.rotation);
 if(layout.shearY)c.transform(1,layout.shearY,0,1,0,0);
 if(layout.kind==='railway-track'){
  const r=layout.repeatCrop;if(!r||!finite([layout.length,layout.moduleLength,layout.phase])||layout.moduleLength<=0||layout.length<=0){c.restore();return false;}
  const polygon=layout.clipPolygon||[{x:0,y:-layout.width/2},{x:layout.length,y:-layout.width/2},{x:layout.length,y:layout.width/2},{x:0,y:layout.width/2}];
  c.beginPath();c.moveTo(polygon[0].x,polygon[0].y);for(const p of polygon.slice(1))c.lineTo(p.x,p.y);c.closePath();c.clip();
  const minX=Math.min(...polygon.map(p=>p.x)),maxX=Math.max(...polygon.map(p=>p.x)),start=Math.floor((minX+layout.phase)/layout.moduleLength)*layout.moduleLength-layout.phase;
  for(let x=start;x<maxX;x+=layout.moduleLength)c.drawImage(im,r.x,r.y,r.w,r.h,x,-layout.width/2,layout.moduleLength,layout.width);
 }else{
  const r=asset.crop,b=layout.body;c.drawImage(im,r.x,r.y,r.w,r.h,b.x,b.y,b.width,b.height);
 }
 c.restore();return true;
}
