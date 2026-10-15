import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {designData,resolveDesignAsset} from '../web/design-assets.js';
import {sourceInteriorSurfaceAssets,sourceInteriorRoomAssetRequests,preloadSourceInteriorRoom,drawSourceInteriorSurfaces} from '../web/source-interiors.js';

const root=new URL('../',import.meta.url),sourceRoot=fileURLToPath(new URL('../source-reference/',import.meta.url));
const room={id:'clans',width:850,height:530,bounds:{left:30,top:90,right:820,bottom:500},props:[],surface_style:'board',wall_material:'plaster'};

test('all twelve flat native surface textures retain their original file and provenance',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../docs/design-source-v17.json',import.meta.url),'utf8'));
 const ids=['floor-board','floor-parquet','floor-concrete','floor-tile','floor-stone','floor-metal','wall-plaster','wall-brick','wall-concrete','wall-wood','wall-stone','wall-metal'];
 for(const suffix of ids){
  const material='clan-surface-'+suffix,id=material+'-texture',asset=resolveDesignAsset(id);
  assert.ok(asset,`${id} is missing; a perspective panel is not a flat tile`);
  assert.equal(designData.assets[material].texture_asset,id);
  assert.deepEqual(asset,manifest.assets[id]);assert.equal(asset.representation,'flat-texture');assert.equal(asset.native,true);
  assert.equal(asset.resampling,'none');assert.deepEqual(asset.tile_world_size,[192,192]);
  const native=await readFile(sourceRoot+asset.source),imported=await readFile(new URL(asset.url.replace(/^\//,''),root));
  assert.equal(createHash('sha256').update(native).digest('hex'),asset.source_sha256);
  assert.deepEqual(imported,native,'flat texture must be copied byte for byte');
  assert.ok(asset.solid_bbox[2]<=asset.width&&asset.solid_bbox[3]<=asset.height);
 }
});

test('a clan room preloads the selected flat tiles instead of the perspective panels',()=>{
 const surfaces=sourceInteriorSurfaceAssets(room),requests=sourceInteriorRoomAssetRequests(room),ids=requests.map(r=>r.id);
 assert.equal(surfaces.floorTexture,'clan-surface-floor-board-texture');
 assert.equal(surfaces.wallTexture,'clan-surface-wall-plaster-texture');
 assert.ok(ids.includes(surfaces.floorTexture));assert.ok(ids.includes(surfaces.wallTexture));
 assert.ok(!ids.includes(surfaces.floor),'unused perspective floor should remain lazy');
 assert.ok(!ids.includes(surfaces.wall),'unused perspective wall should remain lazy');
});

test('native floor pixels repeat at a fixed world period without stretching when a room grows',async()=>{
 const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
 globalThis.OffscreenCanvas=class{constructor(w,h){return createCanvas(w,h);}};
 try{
  await preloadSourceInteriorRoom(room,url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root))));
  const render=r=>{const c=createCanvas(r.width,r.height).getContext('2d');assert.equal(drawSourceInteriorSurfaces(c,r),true);return c;};
  const c=render(room),patch=(ctx,x,y)=>createHash('sha256').update(ctx.getImageData(x,y,40,45).data).digest('hex');
  assert.deepEqual(patch(c,room.bounds.left+7,room.bounds.top+9),patch(c,room.bounds.left+199,room.bounds.top+9),'a second 192px tile must repeat exact native grain');
  assert.deepEqual(patch(c,room.bounds.left+7,room.bounds.top+9),patch(c,room.bounds.left+7,room.bounds.top+201),'floor repetition must work in both axes');
  const grown=render({...room,width:1050,bounds:{...room.bounds,right:1020}});
  assert.deepEqual(patch(c,room.bounds.left+7,room.bounds.top+9),patch(grown,room.bounds.left+7,room.bounds.top+9),'room resizing must not change material scale');
  const reference=createCanvas(192,192).getContext('2d'),asset=resolveDesignAsset('clan-surface-floor-board-texture');
  reference.imageSmoothingEnabled=false;reference.drawImage(await loadImage(fileURLToPath(new URL(asset.url.replace(/^\//,''),root))),0,0,192,192);
  // The material grid has a world origin. Moving a fractional clipping edge
  // must not shift the source grain or leave transparent tile seams.
  const worldX=room.bounds.left+7,worldY=room.bounds.top+9;
  assert.deepEqual(patch(c,worldX,worldY),patch(reference,worldX%192,worldY%192),'surface uses the full authored texture at its world phase, not a crop of another picture');
  const fractional=render({...room,bounds:{...room.bounds,left:room.bounds.left+.375,top:room.bounds.top+.125}});
  assert.deepEqual(patch(c,worldX,worldY),patch(fractional,worldX,worldY),'fractional room boundaries must not shift the world material grid');
  for(const x of [191,192,193])for(const y of [191,192,193])assert.equal(fractional.getImageData(x,y,1,1).data[3],255,'native tile joins stay fully opaque');
  const tinted=render({...room,floor_color:'#318cda'});assert.notDeepEqual(patch(c,room.bounds.left+7,room.bounds.top+9),patch(tinted,room.bounds.left+7,room.bounds.top+9));
  assert.deepEqual(patch(tinted,room.bounds.left+7,room.bounds.top+9),patch(tinted,room.bounds.left+199,room.bounds.top+9),'custom colours keep exact tiling');
 }finally{delete globalThis.OffscreenCanvas;}
});
