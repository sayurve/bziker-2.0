import {drawDesignAsset,resolveDesignAsset,preloadDesignAssets} from './design-assets.js';
import {lakeOutline,lakeBounds,traceLakePath,lakeContains} from './water.js';

const prefix='bziker-water-',waterFrames=['water-texture','water-frame-02','water-frame-03','water-frame-04'];
export const sourceWaterAssetIds=Object.freeze([...waterFrames,'lake','pier','boat-empty-seat-v3','motor-wake-sheet','reeds','shore-grass','shore-stones','shore-pebbles','shore-boulders'].map(id=>prefix+id));
const images=new Map();let factory=null;
const canvas=(w,h)=>factory?factory(w,h):typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):typeof document!=='undefined'?Object.assign(document.createElement('canvas'),{width:w,height:h}):null;
const finite=values=>values.every(Number.isFinite);

/** Decode through the common asset loader, then retain only each actual object
 * or one wake cell. Tiny alpha halos are excluded from sizing, not repainted. */
function sourceBitmap(id,area=null,tight=true){
 const key=id+':'+JSON.stringify(area)+':'+tight;if(images.has(key))return images.get(key);
 const asset=resolveDesignAsset(id);if(!asset)return null;
 const rawKey=id+':native';let raw=images.get(rawKey);
 if(!raw){raw=canvas(asset.width,asset.height);if(!raw)return null;const c=raw.getContext('2d');if(!drawDesignAsset(c,id,0,0,asset.width,asset.height,{anchorX:0,anchorY:0}))return null;images.set(rawKey,raw);}
 let [x,y,width,height]=area||[0,0,raw.width,raw.height];
 if(!area&&!tight){images.set(key,raw);return raw;}
 if(tight){const pixels=raw.getContext('2d').getImageData(x,y,width,height).data;let left=width,top=height,right=-1,bottom=-1;
  for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++)if(pixels[(yy*width+xx)*4+3]>=8){left=Math.min(left,xx);top=Math.min(top,yy);right=Math.max(right,xx);bottom=Math.max(bottom,yy);}
  if(right<left)return null;x+=left;y+=top;width=right-left+1;height=bottom-top+1;
 }
 const cropped=canvas(width,height);if(!cropped)return null;const c=cropped.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(raw,x,y,width,height,0,0,width,height);images.set(key,cropped);if(!area)images.delete(rawKey);return cropped;
}
export async function preloadSourceWater(loader,environment={}){
 if(environment.createCanvas)factory=environment.createCanvas;
 await preloadDesignAssets(sourceWaterAssetIds,loader);
 for(const id of sourceWaterAssetIds)if(id!==prefix+'motor-wake-sheet')sourceBitmap(id,null,!waterFrames.includes(id.slice(prefix.length)));
 for(let i=0;i<4;i++){wakeBitmap(i);sourceWaterTexture(i*333);}
 images.delete(prefix+'motor-wake-sheet:native');
}
export function sourceWaterFrame(time=0,reducedMotion=false){
 const t=Number.isFinite(time)?Math.max(0,time):0;
 return {water:reducedMotion?0:[0,1,2,3,2,1][Math.floor(t/333)%6],wake:reducedMotion?0:Math.floor(t/150)%4};
}
function wakeBitmap(frame){
 const id=prefix+'motor-wake-sheet',asset=resolveDesignAsset(id);if(!asset)return null;
 const width=Math.floor(asset.width/2),height=Math.floor(asset.height/2),n=Math.abs(Math.floor(frame))%4;
 // Retain common fixed cell bounds; independently tightening the phases would
 // move the crest tip and make the wake jump relative to its motor.
 return sourceBitmap(id,[(n%2)*width,Math.floor(n/2)*height,width,height],false);
}
export function sourceBoatLayout(boat,time=0,reducedMotion=false){
 if(!boat||!finite([boat.x,boat.y]))return null;
 const body={x:Math.round(boat.x-89),y:Math.round(boat.y-58),width:250,height:83},cut=body.y+Math.floor(body.height*.72);
 const front={x:body.x,y:cut,width:body.width,height:body.y+body.height-cut},wake={x:body.x-88,y:body.y+20,width:98,height:66};
 const moving=!!boat.moving;
 return {body,front,wake,moving,seat:{x:boat.x,y:boat.y},frame:sourceWaterFrame(time,reducedMotion),
  bounds:moving?{x:wake.x,y:Math.min(body.y,wake.y),width:body.x+body.width-wake.x,height:Math.max(body.y+body.height,wake.y+wake.height)-Math.min(body.y,wake.y)}:{...body}};
}
export function drawSourceBoat(c,boat,time=0,front=false,reducedMotion=false){
 if(boat?.exact_scene&&!boat.occupant_id&&!boat.moving)return true;
 if(!c.drawImage)return false;const r=sourceBoatLayout(boat,time,reducedMotion),native=sourceBitmap(prefix+'boat-empty-seat-v3');if(!r||!native)return false;
 c.save();c.imageSmoothingEnabled=false;
 if(!front&&r.moving){const wake=wakeBitmap(r.frame.wake);if(wake){c.globalAlpha=.70;c.drawImage(wake,r.wake.x,r.wake.y,r.wake.width,r.wake.height);c.globalAlpha=1;}}
 const clipped=front?r.front:{x:r.body.x,y:r.body.y,width:r.body.width,height:r.front.y-r.body.y};
 c.beginPath();c.rect(clipped.x,clipped.y,clipped.width,clipped.height);c.clip();c.drawImage(native,r.body.x,r.body.y,r.body.width,r.body.height);c.restore();return true;
}
export function sourceDockLayout(boat){
 if(!boat?.boarding||!boat?.dock||!finite([boat.boarding.x,boat.boarding.y,boat.dock.x,boat.dock.y]))return null;
 const height=Math.max(80,boat.dock.y-boat.boarding.y+20),width=height*.82;
 return {assetId:prefix+'pier',boarding:{x:boat.boarding.x,y:boat.boarding.y},anchor:{x:boat.boarding.x,y:boat.boarding.y-13},
  bounds:{x:boat.boarding.x-width/2,y:boat.boarding.y-13,width,height},depth:-1};
}
export function drawSourceDock(c,boat){
 if(boat?.exact_scene)return true;
 if(!c.drawImage)return false;const r=sourceDockLayout(boat),native=sourceBitmap(prefix+'pier');if(!r||!native)return false;
 // The supplied water viewer itself turns the T-shaped pier toward the lake.
 // Its narrow stem remains at the saved dry boarding point.
 const b=r.bounds;c.save();c.imageSmoothingEnabled=false;c.translate(Math.round(b.x+b.width/2),Math.round(b.y+b.height/2));c.rotate(Math.PI);c.drawImage(native,-b.width/2,-b.height/2,b.width,b.height);c.restore();return true;
}
/** The four source PNGs stay unchanged. A single cached luminance palette
 * maps their charcoal-green water to the master city's deep blue/cyan while
 * retaining each wave, shadow and alpha value. `native:true` exposes the exact
 * supplied texture for provenance checks or a caller's explicit native view. */
export function sourceWaterTexture(time=0,{native=false,reducedMotion=false}={}){
 const id=prefix+waterFrames[sourceWaterFrame(time,reducedMotion).water],raw=sourceBitmap(id,null,false);if(!raw||native)return raw;
 const key=id+':master-water-palette';if(images.has(key))return images.get(key);
 const tinted=canvas(raw.width,raw.height);if(!tinted)return raw;
 const c=tinted.getContext('2d');c.drawImage(raw,0,0);const pixels=c.getImageData(0,0,raw.width,raw.height),data=pixels.data;
 for(let i=0;i<data.length;i+=4){
  const light=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722,low=light<=74,
   a=low?[3,38,61]:[7,105,134],b=low?[7,105,134]:[97,200,218],t=Math.max(0,Math.min(1,low?light/74:(light-74)/111));
  for(let k=0;k<3;k++)data[i+k]=Math.round(a[k]+(b[k]-a[k])*t);
 }
 c.putImageData(pixels,0,0);images.set(key,tinted);return tinted;
}
export function drawSourceLake(c,lake,time=0,{shore=true,reducedMotion=false,native=false}={}){
 if(lake?.exact_scene)return true;
 const bounds=lakeBounds(lake);if(!c.drawImage||!bounds||bounds.width<=0||bounds.height<=0)return false;
 const texture=sourceWaterTexture(time,{native,reducedMotion});if(!texture)return false;
 c.save();c.imageSmoothingEnabled=false;
 // The supplied whole ellipse includes land outside its water. Preserve it
 // only on legacy elliptical maps; authored shores use independent native
 // grass/stone/reed elements placed along their exact polygon and island rim.
 if(shore&&!lake.outline&&!(lake.islands||[]).length){
  const background=sourceBitmap(prefix+'lake');if(background){c.save();c.translate(lake.x,lake.y);c.rotate(lake.rotation||0);c.drawImage(background,-lake.radius_x-24,-lake.radius_y-24,lake.radius_x*2+48,lake.radius_y*2+48);c.restore();}
 }
 traceLakePath(c,lake);c.clip('evenodd');c.drawImage(texture,bounds.x,bounds.y,bounds.width,bounds.height);c.restore();return true;
}
const pointDistance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/d)):0;return Math.hypot(p.x-a[0]-dx*t,p.y-a[1]-dy*t);};
function contourSamples(points,count,inward=false){
 const area=points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1];},0),sign=(area>=0?1:-1)*(inward?-1:1),lengths=points.map((a,i)=>{const b=points[(i+1)%points.length];return Math.hypot(b[0]-a[0],b[1]-a[1]);}),total=lengths.reduce((a,b)=>a+b,0),out=[];
 for(let i=0;i<count;i++){
  let distance=(i+.35)*total/count,edge=0;while(edge<lengths.length-1&&distance>lengths[edge])distance-=lengths[edge++];
  const a=points[edge],b=points[(edge+1)%points.length],length=lengths[edge],t=length?distance/length:0;
  if(length)out.push({x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,nx:sign*(b[1]-a[1])/length,ny:-sign*(b[0]-a[0])/length});
 }
 return out;
}
export function sourceShoreLayouts(map){
 if(map?.design_source?.exact_scene)return [];
 const lake=map?.lake,outline=lakeOutline(lake);if(!outline.length)return [];
 const groups=['reeds','shore-grass','shore-stones','shore-pebbles','shore-boulders'],out=[],perimeter=points=>points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+Math.hypot(a[0]-b[0],a[1]-b[1]);},0);
 const contours=[{id:'outer',points:outline,count:lake.outline?Math.max(36,Math.min(192,Math.ceil(perimeter(outline)/72))):36,inward:false,scale:1}];
 for(const [i,island] of (lake.islands||[]).entries()){
  const points=lakeOutline(island,64);if(points.length)contours.push({id:'island-'+i,points,count:Math.max(8,Math.min(48,Math.ceil(perimeter(points)/72))),inward:true,scale:Math.min(1,Math.min(island.radius_x,island.radius_y)/45)});
 }
 let number=0;
 const placements=contours.flatMap(contour=>{
  const rim=lake.outline?contourSamples(contour.points,Math.max(12,Math.min(256,Math.ceil(perimeter(contour.points)/42))),contour.inward).map(edge=>({contour,edge,bank:true})):[];
  return [...rim,...contourSamples(contour.points,contour.count,contour.inward).map(edge=>({contour,edge,bank:false}))];
 });
 for(const {contour,edge,bank} of placements){
  const i=number++,offset=(bank?[7,11,4,8,6,10][i%6]:17+[8,-3,14,1,-5,5][i%6])*contour.scale,anchor={x:Math.round(edge.x+edge.nx*offset),y:Math.round(edge.y+edge.ny*offset)};
  if(lakeContains(lake,anchor))continue;
  if((map.boats||[]).some(b=>Math.hypot(anchor.x-b.boarding.x,anchor.y-b.boarding.y)<165||Math.hypot(anchor.x-b.dock.x,anchor.y-b.dock.y)<190))continue;
  // Preserve the actual stone/pebble/boulder PNGs, varying only their authored
  // world scale and dry-side offset. A uniform repeated bead ring reads as a
  // fence; mixed coarse clusters give the natural master shoreline rhythm.
  const kind=bank?['shore-stones','shore-pebbles','shore-stones','shore-boulders','shore-stones','shore-pebbles','shore-stones'][i%7]:groups[i%groups.length],
   bankWidth=[108,84,124,78,100,94][i%6]*(kind==='shore-boulders'?1.18:1),
   width=(bank?bankWidth:kind==='reeds'?44:kind==='shore-grass'?48:kind==='shore-boulders'?55:43)*contour.scale,
   height=(bank?bankWidth*.52:kind==='reeds'?68:kind==='shore-grass'?42:kind==='shore-boulders'?40:31)*contour.scale;
  const center={x:anchor.x,y:anchor.y-height/2},radius=Math.hypot(width,height)/2;
  if((map.roads||[]).some(r=>(r.points||[]).slice(1).some((b,n)=>pointDistance(center,r.points[n],b)<(r.width||50)/2+radius+12)))continue;
  if((lake.walkways||[]).some(w=>(w.points||[]).slice(1).some((b,n)=>pointDistance(center,w.points[n],b)<w.width/2+radius+12)))continue;
  if((map.activities||[]).some(a=>Math.hypot(anchor.x-a.x,anchor.y-a.y)<90))continue;
  if([...(map.buildings||[]),...(map.background_buildings||[])].some(b=>anchor.x>b.x-45&&anchor.x<b.x+b.width+45&&anchor.y>b.y-70&&anchor.y<b.y+b.height+40))continue;
  out.push({id:'source-shore-'+i,assetId:prefix+kind,layer:bank?'bank':'accent',contour:contour.id,shorePoint:{x:edge.x,y:edge.y},anchor,width,height,bounds:{x:anchor.x-width/2,y:anchor.y-height,width,height},depth:anchor.y});
 }
 return out;
}
export function drawSourceShore(c,layout){
 if(!c.drawImage||!layout)return false;const native=sourceBitmap(layout.assetId);if(!native)return false;
 const b=layout.bounds;c.save();c.imageSmoothingEnabled=false;c.drawImage(native,Math.round(b.x),Math.round(b.y),b.width,b.height);c.restore();return true;
}
