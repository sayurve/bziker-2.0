import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {designData} from '../web/design-data.js';
import {preloadSourceInteriorRoom,drawSourceInteriorSurfaces} from '../web/source-interiors.js';

const root=new URL('../',import.meta.url);
const rooms=JSON.parse(readFileSync(new URL('web/interiors-map.json',root))).rooms;
const woodIds=['clan-surface-floor-board-texture','clan-surface-floor-parquet-texture'];
const woodRooms=rooms.filter(r=>woodIds.includes(r.floor_material.asset_id));
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
globalThis.OffscreenCanvas=class{constructor(w,h){return createCanvas(w,h);}};

test('the generated wooden floors use the native swatch scale while other materials retain their existing scale',()=>{
 assert.deepEqual(woodRooms.map(r=>r.id).sort(),['messages','shop-furniture','terrace']);
 for(const id of woodIds){const a=designData.assets[id];
  assert.equal(a.representation,'flat-texture');assert.equal(a.native,true);
  assert.deepEqual([a.width,a.height],[1254,1254]);assert.deepEqual(a.tile_world_size,[192,192]);
 }
 for(const r of rooms){
  assert.equal(r.actor_height,80);
  assert.deepEqual(r.floor_material.tile_world_size,woodIds.includes(r.floor_material.asset_id)?designData.assets[r.floor_material.asset_id].tile_world_size:[320,320],r.id);
 }
 // Eight authored board rows must occupy24 world units each, rather than40.
 assert.equal(rooms.find(r=>r.id==='terrace').floor_material.tile_world_size[1]/8,24);
});

test('actual native floor pixels repeat after192 world units in both axes without scaling furniture or room geometry',async()=>{
 for(const room of woodRooms){
  await preloadSourceInteriorRoom(room,p=>loadImage(fileURLToPath(new URL(p.replace(/^\//,''),root))));
  const c=createCanvas(room.width,room.height).getContext('2d');
  assert.equal(drawSourceInteriorSurfaces(c,room),true);
  const pixels=c.getImageData(0,0,room.width,room.height).data;
  const at=(x,y)=>[...pixels.subarray((y*room.width+x)*4,(y*room.width+x)*4+4)];
  const left=Math.ceil(room.bounds.left)+24,top=Math.ceil(room.bounds.top)+24,colors=new Set();
  for(let dy=0;dy<90;dy+=9)for(let dx=0;dx<90;dx+=9){
   const x=left+dx,y=top+dy,base=at(x,y);colors.add(base.join(','));
   assert.equal(base[3],255,`${room.id}: real opaque floor sample`);
   assert.deepEqual(at(x+192,y),base,`${room.id}: horizontal native repeat at${x},${y}`);
   assert.deepEqual(at(x,y+192),base,`${room.id}: vertical native repeat at${x},${y}`);
  }
  assert.ok(colors.size>20,`${room.id}: a solid fallback cannot satisfy the repeat test`);
 }
});

test('Room reads the authored wood dimensions rather than hardcoding192',()=>{
 const script=`import importlib.util,json
from pathlib import Path
p=Path('scripts/build-modular-interiors.py')
s=importlib.util.spec_from_file_location('wood_scale_probe',p)
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
old=json.loads(Path('web/interiors-map-v19.json').read_text())
doors={b['id']:b['door'] for b in json.loads(Path('web/world-map.json').read_text())['buildings']}
for key in ['clan-surface-floor-board-texture','clan-surface-floor-parquet-texture']:
 m.ASSETS[key]['tile_world_size']=[160,224]
print(json.dumps({r['id']:m.scene(r,doors)['floor_material']['tile_world_size'] for r in old['rooms'] if r['id'] in ['messages','terrace','shop-furniture','clans']}))`;
 const run=spawnSync('python3',['-c',script],{cwd:fileURLToPath(root),encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 assert.deepEqual(JSON.parse(run.stdout),{clans:[320,320],messages:[160,224],terrace:[160,224],'shop-furniture':[160,224]});
});
