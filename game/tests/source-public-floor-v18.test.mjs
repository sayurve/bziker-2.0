import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolveDesignAsset} from '../web/design-assets.js';
import {sourceInteriorSurfaceAssets,sourceInteriorRoomAssetRequests,preloadSourceInteriorRoom,drawSourceInteriorSurfaces,sourceInteriorDetailLayout} from '../web/source-interiors.js';

const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const root=new URL('../',import.meta.url),{rooms:publicRooms}=JSON.parse(await readFile(new URL('../web/interiors-map-v19.json',import.meta.url),'utf8'));
const rooms=publicRooms.map(room=>({...room,exact_source:false,source_scene:null,width:900,height:680,bounds:{left:28,right:872,top:78,bottom:652}}));
const patch=(c,x,y)=>createHash('sha256').update(c.getImageData(x,y,25,20).data).digest('hex');

test('fallback rooms adapt real flat materials instead of repeating the perspective floor and baked light',()=>{
 const mapping={railway:'tile',profile:'tile','shop-clothes':'tile','shop-food':'tile',casino:'concrete',messages:'board',arena:'concrete',results:'concrete'};
 for(const [id,material] of Object.entries(mapping)){
  const room=rooms.find(r=>r.id===id),surface=sourceInteriorSurfaceAssets(room),expected=`clan-surface-floor-${material}-texture`;
  assert.equal(surface.floorTexture,expected,`${id}: must use the closest original flat material`);
  assert.equal(resolveDesignAsset(surface.floorTexture).representation,'flat-texture');
  assert.ok(surface.floor.startsWith(`${id==='shop-food'?'station':id==='profile'||id==='shop-clothes'?'clothing':id==='messages'?'bar-pivkovy-tuz':id==='arena'||id==='results'?'bzik-hub':id==='railway'?'station':'casino'}-interior-`),'the original public floor ID retains its provenance');
  const requested=sourceInteriorRoomAssetRequests(room).map(a=>a.id);
  assert.ok(requested.includes(expected));assert.ok(!requested.includes(surface.floor),'unused baked perspective floor should not be downloaded');
  const custom=sourceInteriorSurfaceAssets({...room,floor_color:'#32A8DA'});
  assert.equal(custom.floorTexture,expected);assert.equal(custom.floorTint,'#32a8da','saved colours take precedence over the adapted public palette');
 }
});

test('fallback floors keep native flat grain at one world scale across room sizes',async()=>{
 globalThis.OffscreenCanvas=class{constructor(w,h){return createCanvas(w,h);}};
 try{
  for(const id of ['railway','casino','profile','messages','arena']){
   const room={...rooms.find(r=>r.id===id),width:1100,height:900,bounds:{left:28,right:1072,top:78,bottom:872},props:[],exit:null};
   await preloadSourceInteriorRoom(room,url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root))));
   const render=r=>{const c=createCanvas(r.width,r.height).getContext('2d');assert.equal(drawSourceInteriorSurfaces(c,r),true);return c;};
   const c=render(room),large=render({...room,width:1400,bounds:{...room.bounds,right:1372}});
   assert.equal(patch(c,room.bounds.left+7,room.bounds.top+9),patch(large,room.bounds.left+7,room.bounds.top+9),`${id}: growing a room must not grow each tile`);
   assert.equal(patch(c,room.bounds.left+7,room.bounds.top+9),patch(c,room.bounds.left+199,room.bounds.top+9),`${id}: native material repeats every 192px`);
   assert.equal(patch(c,room.bounds.left+7,room.bounds.top+9),patch(c,room.bounds.left+7,room.bounds.top+201),`${id}: flat rows preserve their scale`);
   const seams=[];for(let yy=room.bounds.top+4;yy<room.bounds.top+188;yy+=4){const edge=c.getImageData(room.bounds.left+191,yy,2,1).data;seams.push(Math.max(...[0,1,2].map(channel=>Math.abs(edge[channel]-edge[channel+4]))));}
   assert.ok(seams.reduce((sum,value)=>sum+value,0)/seams.length<35,`${id}: repeating texture has a conspicuous bright edge`);
  }
 }finally{delete globalThis.OffscreenCanvas;}
});

test('clothing wall sconces have readable native bodies and leave no obsolete floor obstacle',()=>{
 for(const id of ['profile','shop-clothes']){
  const room=rooms.find(r=>r.id===id);
  assert.ok(!room.props.some(p=>p.id==='lamp'),`${id}: wall light must not be a tiny floor prop`);
  assert.ok(!room.solids.some(p=>p.prop_id==='lamp'),`${id}: removed light must not leave an invisible obstacle`);
  const detail=sourceInteriorDetailLayout(room).find(d=>d.assetId==='clothing-interior-sconce');
  assert.ok(detail,`${id}: native sconce belongs on the wall`);
  assert.equal(detail.interactive,false);assert.equal(detail.collision,false);
  assert.ok(detail.bounds.y+detail.bounds.height<=room.bounds.top);
  const asset=resolveDesignAsset(detail.assetId),visibleWidth=detail.bounds.width*(asset.solid_bbox[2]-asset.solid_bbox[0])/asset.width;
  assert.ok(visibleWidth>=12,`${id}: native sconce body is still unreadably small`);
 }
});
