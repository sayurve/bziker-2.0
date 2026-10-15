import {designData,drawDesignAsset,resolveDesignAsset,preloadDesignAssets,preloadDesignViews,designDestination} from './design-assets.js';
import {sourceActorsData} from './source-actors-data.js';
import {sourceFurnitureGrid} from './source-furniture-grid.js';

const themes=Object.freeze(['modern','loft','tech','wood','stone']);
const directions=Object.freeze({0:'front',90:'left',180:'back',270:'right'});
const furnitureFamilies=Object.freeze({desk:'computer-desk','display-desk':'computer-desk','dining-table':'table',table:'table',chair:'chair',sofa:'sofa',bookcase:'bookcase',shelf:'bookcase',board:'hologram',tv:'hologram',plant:'plant',cabinet:'bookcase'});
const publicThemes=Object.freeze({railway:'modern',clans:'modern',arena:'tech',profile:'modern',results:'stone',messages:'loft',terrace:'wood','shop-food':'modern','shop-clothes':'modern','shop-furniture':'modern',casino:'stone'});
const roomFamilies=Object.freeze({railway:'station',clans:'clan',arena:'bzik-hub',profile:'clothing',results:'bzik-hub',messages:'bar-pivkovy-tuz',terrace:'clan','shop-food':'station','shop-clothes':'clothing','shop-furniture':'clan',casino:'casino'});
// Public source floors include perspective borders and baked reflections.
// Adapt the pack's genuine flat materials, keeping each room's visual palette.
const publicFloorMaterials=Object.freeze({
 station:{material:'tile',color:'#c5c3b9'},
 clothing:{material:'tile',color:'#d5cdbc'},
 casino:{material:'concrete',color:'#8b2447'},
 'bar-pivkovy-tuz':{material:'board',color:null},
 'bzik-hub':{material:'concrete',color:'#b3bac5'},
});
const roomFallbacks=Object.freeze({station:'railway',clanhall:'clans',quizfoyer:'arena',wardrobe:'profile',gallery:'results',cafe:'messages',terrace:'terrace','food-store':'shop-food','clothing-store':'shop-clothes','furniture-store':'shop-furniture',casino:'casino'});
const roomId=room=>room?.id||roomFallbacks[room?.kind]||'clans';
const valid=n=>Number.isFinite(n)&&n>0;
const hexColor=color=>/^#[0-9a-f]{6}$/i.test(color||'')?color.toLowerCase():null;
const exactSceneImages=new Map(),exactScenePending=new Map(),displayPropImages=new Map();
/** An editable private clan room may share a public id. Only the explicit
 * shared geometry flag authorizes a composed source scene. */
export const isExactSourceInterior=room=>room?.modular_source!==true&&room?.exact_source===true&&typeof room.source_scene?.url==='string'&&Array.isArray(room.source_scene.native_size)&&room.source_scene.native_size.length===2;
async function preloadExactSourceInterior(room,loader){
 if(!isExactSourceInterior(room))return false;const url=room.source_scene.url;
 if(exactSceneImages.has(url))return true;
 if(!loader&&typeof Image==='undefined')return false;
 if(!exactScenePending.has(url)){
  const load=loader||((url)=>new Promise((resolve,reject)=>{if(typeof Image==='undefined'){reject(new Error('Image loader unavailable'));return;}const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Unable to load ${url}`));image.src=url;}));
  exactScenePending.set(url,Promise.resolve().then(()=>load(url)).then(image=>{if(!image)return false;exactSceneImages.set(url,image);return true;}).catch(()=>false).finally(()=>exactScenePending.delete(url)));
 }
 return exactScenePending.get(url);
}
/** One uniform scale, the complete authored canvas. No native object is
 * resampled separately, stretched, tinted or rearranged. */
export function drawExactSourceInterior(c,room){
 if(!isExactSourceInterior(room))return false;const image=exactSceneImages.get(room.source_scene.url);if(!image)return false;
 const [width,height]=room.source_scene.native_size,scale=room.source_scene.scale||room.width/width;
 c.save();c.imageSmoothingEnabled=false;c.drawImage(image,0,0,width,height,0,0,width*scale,height*scale);c.restore();return true;
}
export function drawExactSourceInteriorMiniMap(c,room,{x=0,y=0,width=room?.width,height=room?.height}={}){
 if(!isExactSourceInterior(room)||![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return false;
 const image=exactSceneImages.get(room.source_scene.url);if(!image)return false;
 const [nativeWidth,nativeHeight]=room.source_scene.native_size,scale=Math.min(width/nativeWidth,height/nativeHeight);
 c.save();c.imageSmoothingEnabled=false;c.drawImage(image,x+(width-nativeWidth*scale)/2,y+(height-nativeHeight*scale)/2,nativeWidth*scale,nativeHeight*scale);c.restore();return true;
}
function drawExactScenePatch(c,room,polygons){
 const image=exactSceneImages.get(room.source_scene.url);if(!image||!polygons?.length)return false;
 const scale=room.source_scene.scale||.5,points=polygons.flat(),left=Math.min(...points.map(p=>p[0])),top=Math.min(...points.map(p=>p[1])),right=Math.max(...points.map(p=>p[0])),bottom=Math.max(...points.map(p=>p[1]));
 c.save();c.beginPath();for(const polygon of polygons){c.moveTo(polygon[0][0]*scale,polygon[0][1]*scale);for(const [x,y] of polygon.slice(1))c.lineTo(x*scale,y*scale);c.closePath();}c.clip();c.imageSmoothingEnabled=false;
 c.globalCompositeOperation='copy';c.drawImage(image,left,top,right-left,bottom-top,left*scale,top*scale,(right-left)*scale,(bottom-top)*scale);c.restore();return true;
}
/** Source-coordinate masks restore only an existing foreground furnishing
 * above a player behind it; the scene itself already contains every object. */
export function sourceInteriorExactObjects(room){
 if(!isExactSourceInterior(room))return [];
 const scale=room.source_scene.scale||.5;
 return (room.props||[]).filter(p=>p.occlusion_polygons?.length).map(p=>{
  const [x,y,width,height]=p.source_pixel_bbox;
  return {id:`${room.id}:${p.id}`,depth:p.y+p.height,bounds:{x:x*scale,y:y*scale,width:width*scale,height:height*scale},footprint:{x:p.x,y:p.y,width:p.width,height:p.height},draw:c=>drawExactScenePatch(c,room,p.occlusion_polygons)};
 });
}
export function drawExactSourceInteriorForeground(c,room){
 return isExactSourceInterior(room)?drawExactScenePatch(c,room,room.source_scene.foreground_polygons):false;
}
export function sourceFurnitureTheme(theme='modern'){
 const requested=typeof theme==='string'?theme:typeof theme==='number'?themes[theme%themes.length]:theme?.source_theme||theme?.style||(theme?.exterior_style??'modern');
 return themes.includes(requested)?requested:typeof requested==='number'?themes[requested%themes.length]||'modern':'modern';
}
export function sourceFurnitureAssetId(item,theme='modern'){
 // Use the pack's actual upholstered armchair, not a themed work chair.
 if(item?.type==='armchair')return 'casino-interior-chair-front';
 const family=furnitureFamilies[item?.type];
 if(family)return `clan-furniture-${family}-${sourceFurnitureTheme(item?.source_theme||theme)}`;
 if(item?.type==='counter')return 'clothing-interior-counter';
 return null;
}
export function sourceFurnitureLayout(item,theme='modern',geometry={}){
 const assetId=sourceFurnitureAssetId(item,theme),x=geometry.x??item?.renderX,y=geometry.y??item?.renderY,width=geometry.width??item?.renderWidth,height=geometry.height??item?.renderHeight;
 if(!assetId||![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return null;
 const direction=directions[item?.rotation]||'front',asset=resolveDesignAsset(assetId,direction);if(!asset)return null;
 // A turn swaps floor cells, not the upright object's physical height. Native
 // side views also contain different transparent margins. Match the visible
 // height to the front view and ground the actual opaque feet in every view.
 const front=resolveDesignAsset(assetId,'front'),frontBox=front.solid_bbox||[0,0,front.width,front.height],box=asset.solid_bbox||[0,0,asset.width,asset.height];
 const referenceWidth=item?.rotation===90||item?.rotation===270?height*sourceFurnitureGrid.cell_width/sourceFurnitureGrid.cell_height:width;
 const visibleHeight=(referenceWidth-4)*(frontBox[3]-frontBox[1])/front.width,scale=visibleHeight/(box[3]-box[1]);
 const anchor={x:x+width/2,y:y+height},anchorX=(box[0]+box[2])/(2*asset.width),anchorY=box[3]/asset.height;
 const drawWidth=asset.width*scale,drawHeight=asset.height*scale,bounds=designDestination(asset,anchor.x,anchor.y,drawWidth,drawHeight,{anchorX,anchorY});
 return {assetId,anchor,anchorX,anchorY,width:drawWidth,height:drawHeight,direction,bounds,footprint:{x,y,width,height},depth:y+height,color:item?.color,selected:!!geometry.selected};
}

export function sourceInteriorSurfaceAssets(room){
 if(room?.modular_source){const surfaces=room.surfaces||[],id=name=>surfaces.find(s=>s.id===name)?.asset_id;return {floor:id('floor'),wall:id('back-wall'),leftWall:id('left-wall'),rightWall:id('right-wall'),floorTint:null,wallTint:null};}
 const id=roomId(room),family=roomFamilies[id]||'clan',floorTint=hexColor(room?.floor_color),wallTint=hexColor(room?.wall_color);
 if(family==='clan'){
  const style=room?.surface_style||({clans:'tile',terrace:'board','shop-furniture':'parquet'})[id]||'board';
  const floor=`clan-surface-floor-${style}`,wall=`clan-surface-wall-${room?.wall_material||'plaster'}`;
  const floorTexture=resolveDesignAsset(floor)?.texture_asset||null,wallTexture=resolveDesignAsset(wall)?.texture_asset||null;
  return {floor,wall,leftWall:wall,rightWall:wall,floorTexture,wallTexture,base:floorTint||(id==='terrace'?'#a18055':'#a3a19a'),wallColor:wallTint||'#e9e6de',floorTint,wallTint};
 }
 const material=publicFloorMaterials[family],floorTexture=material?`clan-surface-floor-${material.material}-texture`:null;
 return {floor:`${family}-interior-floor`,floorTexture,floorAdaptation:floorTexture?'native-flat-material':null,wall:`${family}-interior-${family==='bzik-hub'?'wall-back':'back-wall'}`,leftWall:`${family}-interior-${family==='bzik-hub'?'wall-left':'left-wall'}`,rightWall:`${family}-interior-${family==='bzik-hub'?'wall-right':'right-wall'}`,base:floorTint||material?.color||(family==='casino'?'#444444':family==='bar-pivkovy-tuz'?'#80684e':family==='clothing'?'#d0c1a7':'#b5a88e'),wallColor:wallTint||(family==='casino'?'#5c5c58':family==='bar-pivkovy-tuz'?'#765f46':'#dedbd1'),floorTint:floorTint||material?.color||null,wallTint};
}

function publicPropAsset(p,room){
 if(p.source_asset&&resolveDesignAsset(p.source_asset))return p.source_asset;
 const id=roomId(room),family=roomFamilies[id],type=p.type;
 const exact={
  station:{cashier:'ticket-module',kiosk:'terminal',board:'departure-board',bench:'bench',sofa:'bench',plant:'plant',lamp:'wall-lamp',bin:'bin',luggage:'suitcase'},
  casino:{cashier:'cash-module',slot:'slot','poker-table':'card-table',bar:'bar-counter',shelf:'shelf',chair:'chair-front',board:'emblem',plant:'plant',lamp:'wall-lamp'},
  clothing:{cashier:'counter',mirror:'mirror',fitting:'fitting-booth',rack:'rail',plant:'plant',lamp:'sconce'},
  'bar-pivkovy-tuz':{cashier:'counter',bar:'counter',table:'pub-table',chair:'chair',shelf:'bottle-shelf',board:'sign',lamp:'wall-lamp'},
  'bzik-hub':{board:p.category==='questions'?'battle-blue':p.category==='results'?'battle-violet':'selector-sign',plant:'plant',lamp:'sconce',trophy:'central-statue'},
 };
 if(exact[family]?.[type])return `${family}-interior-${exact[family][type]}`;
 if(type==='desk'||type==='display-desk')return `clan-furniture-computer-desk-${publicThemes[id]||'modern'}`;
 if(type==='workbench'||type==='table')return `clan-furniture-table-${publicThemes[id]||'modern'}`;
 if(type==='sofa'||type==='chair'||type==='bookcase'||type==='plant')return `clan-furniture-${type}-${publicThemes[id]||'modern'}`;
 if(type==='board'||type==='trophy')return `clan-furniture-hologram-${publicThemes[id]||'modern'}`;
 if(type==='kiosk')return 'station-interior-terminal';
 if(type==='bin')return 'station-interior-bin';
 if(type==='lamp')return 'station-interior-wall-lamp';
 if(type==='bench')return 'station-interior-bench';
 if(type==='lockers')return 'clan-furniture-bookcase-modern';
 if(type==='cashier'||type==='bar')return 'clothing-interior-counter';
 return null;
}

/** The bottom of the native image stays on the existing physical front edge.
 * Sprites can rise above their floor support; neither doors nor aisles move. */
export function sourceInteriorPropLayout(prop,room){
 if(isExactSourceInterior(room))return null;
 if(!prop||!['x','y','width','height'].every(k=>Number.isFinite(prop[k]))||prop.width<=0||prop.height<=0)return null;
 if(prop.source_asset&&prop.visual){
  const direction=prop.source_direction||'front',asset=resolveDesignAsset(prop.source_asset,direction),v=prop.visual;if(!asset)return null;
  const anchor={x:prop.x+prop.width/2,y:prop.y+prop.height},bounds=designDestination(asset,anchor.x,anchor.y,v.width,v.height,{...v,anchorX:.5,anchorY:1});if(!bounds)return null;
  return {assetId:prop.source_asset,direction,anchor,width:v.width,height:v.height,parts:[{...v,...anchor}],bounds,footprint:{x:prop.x,y:prop.y,width:prop.width,height:prop.height},depth:anchor.y,crop:v.crop,anchorX:.5,anchorY:1};
 }
 const assetId=publicPropAsset(prop,room),direction=directions[prop.rotation]||({up:'back',down:'front',left:'left',right:'right'})[prop.facing]||'front',asset=resolveDesignAsset(assetId,direction);if(!asset)return null;
 const anchor={x:prop.x+prop.width/2,y:prop.y+prop.height},width=prop.width,modules=prop.type==='table'&&width>270?Math.ceil(width/230):1,moduleWidth=width/modules;
 const mounted=['board','mirror','lamp'].includes(prop.type),ceiling=mounted?6:room?.bounds?.top||6,height=Math.max(1,Math.min(Math.max(prop.height+120,moduleWidth*asset.height/asset.width),anchor.y-ceiling));
 const parts=Array.from({length:modules},(_,i)=>({x:prop.x+moduleWidth*(i+.5),y:anchor.y,width:moduleWidth,height}));
 const destinations=parts.map(p=>designDestination(asset,p.x,p.y,p.width,p.height,{anchorX:.5,anchorY:1})),left=Math.min(...destinations.map(r=>r.x)),right=Math.max(...destinations.map(r=>r.x+r.width)),top=Math.min(...destinations.map(r=>r.y)),bounds={x:left,y:top,width:right-left,height:anchor.y-top};
 return {assetId,anchor,width,height,direction,parts,bounds,footprint:{x:prop.x,y:prop.y,width:prop.width,height:prop.height},depth:prop.y+prop.height};
}
export function drawSourceInteriorProp(c,prop,room){
 if(isExactSourceInterior(room))return true;
 const r=sourceInteriorPropLayout(prop,room);if(!r)return false;let painted=true;for(const p of r.parts)painted=drawDesignAsset(c,r.assetId,p.x,p.y,p.width,p.height,{anchorX:.5,anchorY:1,direction:r.direction,crop:r.crop})&&painted;return painted;
}

/** Non-interactive artwork only. Raised details have an existing physical
 * support; ceiling and threshold details never occupy an aisle or an exit. */
export function sourceInteriorDetailLayout(room){
 if(isExactSourceInterior(room))return [];
 if(room?.modular_source)return (room.details||[]).flatMap(detail=>{
  if(detail.source_rect){
   const asset=resolveDesignAsset(detail.asset_id),b=detail.source_rect;if(!asset||!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[0]<0||b[1]<0||b[2]>asset.width||b[3]>asset.height||b[2]<=b[0]||b[3]<=b[1])return [];
   const width=detail.width,height=width*(b[3]-b[1])/(b[2]-b[0]),anchor={x:detail.x,y:detail.y};
   return [{...detail,id:`${room.id}:source-detail:${detail.id}`,assetId:detail.asset_id,sourceRect:b,anchor,width,height,
    bounds:{x:anchor.x-width/2,y:anchor.y-height,width,height},direction:'front',anchorX:.5,anchorY:1}];
  }
  if(detail.source_prop){
   const native=sourceActorsData.props[detail.source_prop];if(!native)return [];
   const width=detail.width,height=width*native.size[1]/native.size[0],anchor={x:detail.x,y:detail.y};
   return [{...detail,nativeProp:detail.source_prop,url:'/'+native.path,anchor,width,height,
    bounds:{x:anchor.x-width/2,y:anchor.y-height,width,height},assetId:null,direction:'front',anchorX:.5,anchorY:1}];
  }
  const v=detail.visual,direction=detail.source_direction||'front',asset=resolveDesignAsset(detail.asset_id,direction),bounds=v&&designDestination(asset,v.x,v.y,v.width,v.height,v);if(!bounds)return [];
  return [{...detail,id:`${room.id}:source-detail:${detail.id}`,assetId:detail.asset_id,direction,anchor:{x:v.x,y:v.y},width:v.width,height:v.height,crop:v.crop,anchorX:v.anchorX,anchorY:v.anchorY,bounds,layer:detail.layer||'background',depth:detail.depth??v.y,interactive:false,collision:false}];
 });
 if(!room?.bounds||!valid(room.width)||!valid(room.height))return [];
 const id=roomId(room),family=roomFamilies[id],b=room.bounds,scale=room.width/900,details=[];
 const add=(name,suffix,x,y,width,height,options={})=>{
  const assetId=options.assetId||`${family}-interior-${suffix}`,direction='front',asset=resolveDesignAsset(assetId,direction);if(!asset)return;
  const anchor={x,y},bounds=designDestination(asset,x,y,width,height,{anchorX:.5,anchorY:1});
  details.push({id:`${id}:source-detail:${name}`,assetId,direction,anchor,width,height,bounds,layer:options.layer||'background',depth:options.depth??b.top-1,interactive:false,collision:false,...options});
 };
 const wall=(name,x,width,height,y=b.top-5)=>add(name,name,x*scale,y,width*scale,Math.min(height,b.top-6));
 const supported=(name,propId,position,widthFraction,height,frontOffset=4)=>{
  const p=room.props?.find(p=>p.id===propId);if(!p)return;
  add(name,name,p.x+p.width*position,p.y+p.height-frontOffset,p.width*widthFraction,height,{supportId:p.id,layer:'object',depth:p.y+p.height+.01});
 };
 if(id==='railway'){
  wall('cash-sign',215,150,42);wall('clock',390,46,46);wall('platform-door',804,90,42);wall('platform-sign',804,120,22,30);wall('pendant',390,150,14,20);
 }else if(family==='casino'){
  wall('cash-sign',737,132,40);wall('shelf',838,52,40);wall('chandelier',375,114,66);wall('entry-door',61,45,65);
  const bar=room.props?.find(p=>p.id==='guest-service');
  supported('bar-stool','guest-service',.15,.22,32);supported('roulette','guest-service',.61,.55,28,(bar?.height||42)+12);supported('cup','guest-service',.94,.09,13,(bar?.height||42)+12);
 }else if(family==='bzik-hub'){
  wall('header',450,155,63);wall('selector-sign',332,110,36);wall('overhead-light',555,70,35);wall('entry-door',66,42,42);wall('backdrop-amber',835,68,43);
  for(const [index,x] of [385,515].entries())add(`floor-light-${index}`,'floor-light',x*scale,b.bottom-16,16,16,{floorAttachment:true,depth:b.top-1});
  // Source steps and front rim live in the existing, unwalkable cutaway.
  for(const [index,x] of [170,730].entries())add(`front-rim-${index}`,'front-rim',x*scale,room.height-1,84,25,{layer:'foreground',depth:room.height});
  add('entry-steps','entry-steps',room.exit?.x||room.width/2,room.height-1,95,25,{layer:'foreground',depth:room.height});
 }else if(family==='clothing'){
  wall('shoe-shelf',66,68,63);wall('sign-clothes',325,171,49);wall('sign-fitting',750,142,40);wall('strip-light',520,138,26);
 }else if(family==='bar-pivkovy-tuz'){
  wall('bottle-shelf',685,98,69);wall('pendant',455,27,48);wall('door',63,43,65);wall('window',353,108,69);
  supported('bar-stool','service',.90,.14,43);
 }
 // Wall-mounted source lights occupy the rear wall, never a former floor
 // lamp's coordinates. These eleven public rooms are independent of the
 // player's editable base furniture. Clan public rooms reuse the station's
 // authored wall fixture because the pack has no separate clan wall lamp.
 const lightX=({railway:110,clans:555,arena:720,profile:175,results:720,messages:560,terrace:820,'shop-food':820,'shop-clothes':175,'shop-furniture':580,casino:550})[id];
 if(lightX!==undefined){
  const lightFamily=family==='clan'?'station':family,suffix=['clothing','bzik-hub'].includes(lightFamily)?'sconce':'wall-lamp';
  add('wall-light',suffix,lightX*scale,b.top-5,62*scale,Math.min(65,b.top-6),{assetId:`${lightFamily}-interior-${suffix}`});
 }
 return details;
}
export function drawSourceInteriorDetail(c,detail){
 if(detail?.nativeProp){const image=displayPropImages.get(detail.url);if(!image)return false;c.imageSmoothingEnabled=false;const b=detail.bounds;c.drawImage(image,Math.round(b.x),Math.round(b.y),b.width,b.height);return true;}
 if(detail?.sourceRect){
  const asset=resolveDesignAsset(detail.assetId),b=detail.bounds,r=detail.sourceRect,k=b.width/(r[2]-r[0]);if(!asset)return false;
  // Reuse only the separate glass cabinet from the registered source PNG;
  // clipping excludes its roof, facade and every other exterior element.
  c.save();c.beginPath();c.rect(b.x,b.y,b.width,b.height);c.clip();const drawn=drawDesignAsset(c,detail.assetId,b.x-r[0]*k,b.y-r[1]*k,asset.width*k,asset.height*k,{anchorX:0,anchorY:0});c.restore();return drawn;
 }
 if(!detail?.assetId||!detail.anchor||!valid(detail.width)||!valid(detail.height))return false;
 return drawDesignAsset(c,detail.assetId,detail.anchor.x,detail.anchor.y,detail.width,detail.height,{anchorX:detail.anchorX??.5,anchorY:detail.anchorY??1,direction:detail.direction||'front',crop:detail.crop});
}

/** Luminance supplies the native shadow map; RGB comes from the chosen colour.
 * Unlike a hue blend, this also colours neutral grey and black upholstery. */
export function tintSourcePixels(pixels,color,{width=1,startY=0}={}){
 const normalized=hexColor(color);if(!normalized||!pixels||pixels.length%4)return false;
 const target=[1,3,5].map(i=>parseInt(normalized.slice(i,i+2),16)),targetLuma=(target[0]*.2126+target[1]*.7152+target[2]*.0722)/255,start=Math.max(0,Math.floor(startY))*Math.max(1,width)*4;
 for(let i=start;i<pixels.length;i+=4){if(!pixels[i+3])continue;const luma=(pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722)/255,shade=.25+.75*luma,highlight=(1-targetLuma)*Math.max(0,luma-.65)*24;for(let channel=0;channel<3;channel++)pixels[i+channel]=Math.round(target[channel]*shade+highlight);}
 return true;
}
const surfaceTextures=new Map();
function sourceSurfaceTexture(id,color=null,wall=false,tileSize=null){
 const asset=resolveDesignAsset(id);if(!asset)return null;const key=`${id}:${color||'native'}:${wall?'wall':'floor'}:${tileSize?.join('x')||'default'}`;if(surfaceTextures.has(key))return surfaceTextures.get(key);
 const source=createBitmap(asset.width,asset.height);if(!source)return null;
 const native=source.getContext('2d');if(!drawDesignAsset(native,id,0,0,asset.width,asset.height,{anchorX:0,anchorY:0}))return null;
 const pixels=native.getImageData(0,0,asset.width,asset.height);
 if(color){tintSourcePixels(pixels.data,color);native.putImageData(pixels,0,0);}
 if(asset.representation==='flat-texture'){
  const [width,height]=tileSize||asset.tile_world_size||[192,192],tile=createBitmap(width,height);if(!tile)return null;
  const c=tile.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(source,0,0,tile.width,tile.height);
  if(surfaceTextures.size>=48)surfaceTextures.delete(surfaceTextures.keys().next().value);surfaceTextures.set(key,tile);return tile;
 }
 // An interior floor is a surface, not a raised platform. Its centre contains
 // the artist's material texture without the trapezoid's border and glow.
 let x=asset.width*.18,y=asset.height*.31,width=asset.width*.64,height=asset.height*.40;
 if(wall){
  // Imported wall canvases include a large transparent lighting halo. Crop
  // that padding, retaining the authored physical wall and its native view.
  let left=asset.width,top=asset.height,right=-1,bottom=-1;
  for(let py=0;py<asset.height;py++)for(let px=0;px<asset.width;px++)if(pixels.data[(py*asset.width+px)*4+3]>=160){left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);}
  if(right>=left){x=left;y=top;width=right-left+1;height=bottom-top+1;}
 }
 const tile=createBitmap(Math.round(width),Math.round(height));if(!tile)return null;
 const c=tile.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(source,x,y,width,height,0,0,tile.width,tile.height);if(surfaceTextures.size>=48)surfaceTextures.delete(surfaceTextures.keys().next().value);surfaceTextures.set(key,tile);return tile;
}
/** Source floor panels are independent, empty surface planes. Project their
 * material over the walkable rectangle; furniture never shares this projection. */
function drawSurfacePlane(c,id,rect,color=null,wall=false,multiplier=2.5,tileSize=null){
 c.save();c.beginPath();c.rect(rect.x,rect.y,rect.width,rect.height);c.clip();
 const texture=sourceSurfaceTexture(id,color,wall,tileSize);if(texture){
  c.imageSmoothingEnabled=false;
  if(resolveDesignAsset(id)?.representation==='flat-texture'){
   // Keep the authored grain at a fixed world scale, including when a room
   // changes size. Clipping, rather than stretching, handles the last tile.
   // Integer world-grid origins avoid transparent subpixel seams between
   // adjacent tiles; only the final room boundary uses a fractional clip.
   for(let y=Math.floor(rect.y/texture.height)*texture.height;y<rect.y+rect.height;y+=texture.height)for(let x=Math.floor(rect.x/texture.width)*texture.width;x<rect.x+rect.width;x+=texture.width)c.drawImage(texture,x,y);
  }else c.drawImage(texture,rect.x,rect.y,rect.width,rect.height);
  c.restore();return true;
 }
 const painted=drawDesignAsset(c,id,rect.x+rect.width/2,rect.y+rect.height+rect.height*.6,rect.width*multiplier,rect.height*2.8,{anchorX:.5,anchorY:1});
 c.restore();return painted;
}
export function drawSourceInteriorSurface(c,surface){
 const v=surface?.visual;if(!v)return false;
 c.save();const b=surface.clip;if(b){c.beginPath();c.rect(b.x,b.y,b.width,b.height);c.clip();}
 const drawn=drawDesignAsset(c,surface.asset_id,v.x,v.y,v.width,v.height,{...v,direction:surface.source_direction||'front'});c.restore();return drawn;
}
export function drawSourceInteriorSurfaces(c,room){
 if(isExactSourceInterior(room))return drawExactSourceInterior(c,room);
 if(room?.modular_source){
  c.save();c.imageSmoothingEnabled=false;c.fillStyle='#171a1c';c.fillRect(0,0,room.width,room.height);
  // Material supports sit under the independent perspective PNGs. Their
  // cutaway edges are exactly the collision rectangle, including where a
  // source panel's projecting corner contains transparent pixels.
  if(room.wall_cutaway?.regions?.length){const m=room.wall_cutaway;for(const region of m.regions)drawSurfacePlane(c,m.asset_id,region,m.color,false,2.5,m.tile_world_size);}
  for(const surface of room.surfaces||[])drawSourceInteriorSurface(c,surface);
  if(room.floor_material?.regions?.length){
   const m=room.floor_material,points=m.regions.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);
   c.save();c.beginPath();for(const polygon of m.regions){c.moveTo(...polygon[0]);for(const p of polygon.slice(1))c.lineTo(...p);c.closePath();}c.clip();
   drawSurfacePlane(c,m.asset_id,{x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y},m.color,false,2.5,m.tile_world_size);c.restore();
  }
  c.restore();return true;
 }
 if(!room?.bounds||!valid(room.width)||!valid(room.height))return false;
 const s=sourceInteriorSurfaceAssets(room),b=room.bounds;if(!resolveDesignAsset(s.floor)||!resolveDesignAsset(s.wall))return false;
 const floorAsset=s.floorTexture||s.floor,wallAsset=s.wallTexture||s.wall;
 const floor={x:b.left,y:b.top,width:b.right-b.left,height:b.bottom-b.top};
 c.fillStyle='#151617';c.fillRect(0,0,room.width,room.height);
 c.fillStyle=s.base;c.fillRect(floor.x,floor.y,floor.width,floor.height);
 const painted=drawSurfacePlane(c,floorAsset,floor,s.floorTint);
 // Keep a wall cutaway above the same collision boundary. Native wall details
 // appear behind the props instead of intruding into the walking plane.
 c.fillStyle=s.wallColor;c.fillRect(b.left,6,floor.width,b.top-6);
 drawSurfacePlane(c,wallAsset,{x:b.left,y:6,width:floor.width,height:b.top-6},s.wallTint,true);
 c.fillStyle=s.wallColor;c.fillRect(0,6,b.left,b.bottom-6);c.fillRect(b.right,6,room.width-b.right,b.bottom-6);c.fillRect(b.left,b.bottom,floor.width,room.height-b.bottom);
 drawSurfacePlane(c,s.wallTexture||s.leftWall,{x:0,y:6,width:b.left,height:b.bottom-6},s.wallTint,true);
 drawSurfacePlane(c,s.wallTexture||s.rightWall,{x:b.right,y:6,width:room.width-b.right,height:b.bottom-6},s.wallTint,true);
 drawSurfacePlane(c,wallAsset,{x:b.left,y:b.bottom,width:floor.width,height:room.height-b.bottom},s.wallTint,true);
 for(const cut of room.cutouts||[]){c.fillStyle='#151617';c.fillRect(cut.x,cut.y,cut.width,cut.height);}
 if(room.exit){const x=room.exit.x,y=room.exit.y;drawDesignAsset(c,'clothing-interior-entry-mat',x,y+10,85,32,{anchorX:.5,anchorY:1});c.fillStyle='#dfddd1';c.fillRect(x-34,b.bottom-10,68,17);}
 return painted;
}

export const sourceInteriorAssetIds=Object.freeze(Object.keys(designData.assets).filter(id=>/-interior-/.test(id)||/^clan-(furniture|surface)-/.test(id)||id==='food-kiosk'));
export const preloadSourceInteriors=loader=>preloadDesignAssets(sourceInteriorAssetIds,loader);
export function sourceInteriorRoomAssetRequests(room){
 if(isExactSourceInterior(room))return [{id:room.source_scene.asset_id,direction:'front',url:room.source_scene.url,exact:true}];
 if(room?.modular_source){
  const requests=new Map(),add=(id,direction='front')=>{if(resolveDesignAsset(id,direction))requests.set(`${id}:${direction}`,{id,direction});};
  for(const s of room.surfaces||[])add(s.asset_id,s.source_direction);
  if(room.floor_material)add(room.floor_material.asset_id);
  if(room.wall_cutaway)add(room.wall_cutaway.asset_id);
  for(const p of room.props||[])add(p.source_asset,p.source_direction);
  for(const d of room.details||[])add(d.asset_id,d.source_direction);
  if(room.staff)add(room.staff.source_asset,room.staff.source_direction);
  return [...requests.values()];
 }
 const surfaces=sourceInteriorSurfaceAssets(room),requests=new Map();
 const add=(id,direction='front')=>requests.set(`${id}:${direction}`,{id,direction});
 for(const id of [surfaces.floorTexture||surfaces.floor,surfaces.wallTexture||surfaces.wall,surfaces.wallTexture||surfaces.leftWall,surfaces.wallTexture||surfaces.rightWall,'clothing-interior-entry-mat'])add(id);
 for(const prop of room?.props||[]){const r=sourceInteriorPropLayout(prop,room);if(r)add(r.assetId,r.direction);}
 for(const detail of sourceInteriorDetailLayout(room))add(detail.assetId,detail.direction);
 return [...requests.values()];
}
export const sourceInteriorRoomAssetIds=room=>[...new Set(sourceInteriorRoomAssetRequests(room).map(r=>r.id))];
async function preloadDisplayProps(room,loader){
 const urls=[...new Set(sourceInteriorDetailLayout(room).filter(d=>d.nativeProp).map(d=>d.url))];
 return Promise.all(urls.map(async url=>{if(displayPropImages.has(url))return;const load=loader||((url)=>new Promise((resolve,reject)=>{if(typeof Image==='undefined'){reject(new Error('Image loader unavailable'));return;}const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=url;}));try{const image=await load(url);if(image)displayPropImages.set(url,image);}catch{}}));
}
export const preloadSourceInteriorRoom=async(room,loader)=>isExactSourceInterior(room)?preloadExactSourceInterior(room,loader):Promise.all([preloadDesignViews(sourceInteriorRoomAssetRequests(room),loader),preloadDisplayProps(room,loader)]);
export const preloadSourceInteriorDetails=(room,loader)=>preloadDesignViews(sourceInteriorDetailLayout(room).map(detail=>({id:detail.assetId,direction:detail.direction})),loader);
const furnitureBitmaps=new Map();
function createBitmap(width,height){
 if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(width,height);
 if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;}
 return null;
}
function drawFurnitureColour(c,r,item){
 if(!/^#[0-9a-f]{6}$/i.test(item?.color))return false;
 const asset=resolveDesignAsset(r.assetId,r.direction),width=Math.ceil(r.bounds.width),height=Math.ceil(r.bounds.height),key=`${asset.url}:${hexColor(item.color)}:${width}:${height}:${item.type}`;
 let bitmap=furnitureBitmaps.get(key);
 if(!bitmap){
  bitmap=createBitmap(width,height);if(!bitmap)return false;const paint=bitmap.getContext('2d');
  if(!drawDesignAsset(paint,r.assetId,width/2,height,width,height,{anchorX:.5,anchorY:1,direction:r.direction}))return false;
  // Only the pot changes on plants; foliage keeps its authored green.
  const top=item.type==='plant'?height*.68:0;
  const pixels=paint.getImageData(0,0,width,height);tintSourcePixels(pixels.data,item.color,{width,startY:top});paint.putImageData(pixels,0,0);
  if(furnitureBitmaps.size>=96)furnitureBitmaps.delete(furnitureBitmaps.keys().next().value);furnitureBitmaps.set(key,bitmap);
 }
 c.imageSmoothingEnabled=false;c.drawImage(bitmap,Math.round(r.bounds.x),Math.round(r.bounds.y),r.bounds.width,r.bounds.height);return true;
}
export function drawSourceFurniture(c,item,theme='modern',geometry={}){
 const r=sourceFurnitureLayout(item,theme,geometry);if(!r)return false;
 const painted=drawFurnitureColour(c,r,item)||drawDesignAsset(c,r.assetId,r.anchor.x,r.anchor.y,r.width,r.height,{anchorX:r.anchorX,anchorY:r.anchorY,direction:r.direction});
 if(painted&&r.selected){c.save();c.strokeStyle='#86b9c2';c.lineWidth=2;c.strokeRect(r.footprint.x+1,r.footprint.y+1,r.footprint.width-2,r.footprint.height-2);c.restore();}
 return painted;
}
