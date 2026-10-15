import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import * as world from '../web/world.js';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {preloadSourceWater} from '../web/source-water.js';
import {preloadDesignViews} from '../web/design-assets.js';
import {assertPublicRoomGeometry} from './helpers/public-room-geometry.mjs';
const read=async name=>JSON.parse(await readFile(new URL(`../web/${name}`,import.meta.url),'utf8'));
test('modular world retains the source composition and a traversable pedestrian arrival',async()=>{
 const map=await read('world-map.json');assert.deepEqual(world.worldSpawn,map.spawn);assert.deepEqual(world.worldSize,{width:map.width,height:map.height});
 const route=map.arrival_route.points,length=route.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-route[i][0],p[1]-route[i][1]),0);assert.equal(map.design_source.exact_scene,false);assert.ok(length>0&&Number.isFinite(map.movement_speed)&&map.movement_speed>0);assert.deepEqual(route[0],[map.spawn.x,map.spawn.y]);assert.ok(Math.abs(map.arrival_route.walking_seconds-length/map.movement_speed)<.01,'the published duration follows the native path and actual movement speed');
 let position={...map.spawn};for(let edge=1;edge<route.length;edge++){const a=route[edge-1],b=route[edge],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/8);for(let k=1;k<=steps;k++){const target={x:a[0]+(b[0]-a[0])*k/steps,y:a[1]+(b[1]-a[1])*k/steps};assert.deepEqual(world.clampPosition(target.x,target.y),target);position=world.movePosition(position,target.x-position.x,target.y-position.y);assert.ok(Math.hypot(position.x-target.x,position.y-target.y)<1e-7,'the native arrival route can be walked without collision repair');}}
});
test('every outdoor bench has two real distinct seats and no tree covers a road or door',async()=>{
 const map=await read('world-map.json');assert.ok(map.bench_groups.length>=8);for(const b of map.bench_groups){const seats=map.benches.filter(s=>s.group_id===b.id);assert.equal(seats.length,2);assert.notDeepEqual(seats[0].seat,seats[1].seat);}
 const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a[0]-t*dx,p.y-a[1]-t*dy);};
 for(const tree of map.decor.trees){const f=tree.footprint;assert.ok(f&&f.width>0&&f.height>0);const foot={x:f.x+f.width/2,y:f.y+f.height/2},radius=Math.hypot(f.width,f.height)/2;for(const road of map.roads)for(let i=1;i<road.points.length;i++)assert.ok(distance(foot,road.points[i-1],road.points[i])>road.width/2+radius,`${tree.id} has its actual trunk in ${road.id}`);for(const b of [...map.buildings,...map.district.buildings])assert.ok(Math.hypot(foot.x-b.door.x,foot.y-b.door.y)>radius+65,`${tree.id} blocks ${b.id}'s door`);}
});
test('all modular public rooms use shared doors, real seat slots and feature counters',async()=>{
 const map=await read('world-map.json'),rooms=(await read('interiors-map.json')).rooms;assert.equal(rooms.length,11);for(const r of rooms){assert.deepEqual(r.door,map.buildings.find(b=>b.id===r.id).door);assert.notEqual(r.exact_source,true);assertPublicRoomGeometry(r);assert.ok(r.props.length>0);assert.equal(new Set(r.seats.map(s=>s.id)).size,r.seats.length);assert.ok(r.action.label&&r.action.id);}
});
test('shared furniture declares footprints, rotations and genuine sitting offsets',async()=>{
 const catalog=await read('furniture-map.json');assert.ok(catalog.types.length>=11);const sofa=catalog.types.find(t=>t.id==='sofa');assert.deepEqual(sofa.footprint,{width:2,height:1});assert.equal(sofa.seats.length,2);assert.ok(catalog.types.every(t=>t.rotations.includes(0)&&t.footprint.width>0&&t.footprint.height>0));
});
test('day and night preview share a twenty-minute periodic cycle',()=>{
 assert.equal(typeof world.worldLight,'function');assert.equal(world.worldLight(0,'day'),1);assert.equal(world.worldLight(0,'night'),0);assert.equal(world.worldLight(150000,'auto'),world.worldLight(1350000,'auto'));
});
test('modular ground keeps native resolution in a bounded mobile cache',async()=>{
 const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),allocations=[];
 await preloadSourceWater(url=>loadImage(fileURLToPath(new URL(`..${url}`,import.meta.url))),{createCanvas});
 const previous=globalThis.document;
 globalThis.document={createElement(){const canvas=createCanvas(1,1);allocations.push(canvas);return canvas;}};
 try{
  const art=world.createCityArt(),canvas=createCanvas(700,600),c=canvas.getContext('2d');
  await preloadDesignViews(art.groundObjects.map(n=>({id:n.assetId,direction:n.direction})),url=>loadImage(fileURLToPath(new URL(`..${url}`,import.meta.url))));
  for(const node of art.groundObjects)node.draw(c); // Native component bitmaps are independent of the terrain cache.
  const count=allocations.length;
  assert.equal(typeof art.drawGround,'function');assert.ok(art.objects.length>0);
  for(let i=0;i<30;i++)art.drawGround(c,{x:(i%8)*700,y:Math.floor(i/8)*700,width:700,height:600});
  const tiles=allocations.slice(count);assert.ok(tiles.length>12,'traversal must actually exercise eviction');
  assert.ok(tiles.every(tile=>tile.width===512&&tile.height===512),'512 world units use 512 source pixels');
  assert.ok(art.cacheSize()<=12,'mobile scene has a bounded cache');
  assert.ok(art.objects.every(node=>!node.id.startsWith('native-foreground-')&&!node.id.startsWith('native-canopy-')));
 }finally{globalThis.document=previous;}
});
test('new base furniture placement respects its full footprint while old compact saves remain valid',()=>{
 assert.equal(world.canPlaceItem([],{id:'sofa-new',type:'sofa',x:11,y:0,rotation:0}),false);assert.equal(world.canPlaceItem([],{id:'sofa-old',type:'sofa',x:11,y:0}),true);assert.equal(world.canPlaceItem([{id:'chair',type:'chair',x:1,y:0}],{id:'sofa',type:'sofa',x:0,y:0,rotation:0}),false);assert.equal(world.canPlaceItem([],{id:'sofa',type:'sofa',x:11,y:0,rotation:90}),true);
});
test('solid placement accepts rugs underneath furniture and requires rotation on expanded types',()=>{
 const rug={id:'rug',type:'rug',x:1,y:1,rotation:0},chair={id:'chair',type:'chair',x:1,y:1,rotation:0};
 assert.equal(world.canPlaceItem([rug],chair),true);assert.equal(world.canPlaceItem([chair],rug),true);assert.equal(world.canPlaceItem([],{id:'shelf',type:'shelf',x:1,y:1}),false);
});
test('base movement obeys furniture footprints and can leave a real seated position',()=>{
 const active={id:'host',base:{items:[{id:'sofa',type:'sofa',x:2,y:2,rotation:0}]}};const grid=world.worldMap.base.grid,x=grid.x+140,y=grid.y+116;
 assert.equal(typeof world.moveBasePosition,'function');assert.deepEqual(world.moveBasePosition(active,{x:x-14,y:y+20},200,0),{x:x-14,y:y+20});
 const seat=world.baseSeats(active)[0];const released=world.moveBasePosition(active,{x:seat.x,y:seat.y},0,7);assert.ok(released.y>=y+58);assert.ok(released.x>=x&&released.x<=x+140);
});
test('pet following uses only a purchased companion snapshot and tracks its real owner',()=>{
 assert.equal(typeof world.petFollower,'function');assert.equal(world.petFollower({x:100,y:200},null,.04),null);assert.equal(world.petFollower({x:100,y:200,pet:{kind:'dragon'}},null,.04),null);
 const owner={id:'real',x:400,y:300,facing:'right',pet:{id:'pet-dog',kind:'dog'}},first=world.petFollower(owner,null,.04),next=world.petFollower({...owner,x:450},first,.04);assert.equal(first.kind,'dog');assert.ok(next.x>first.x);assert.ok(next.x<450);assert.equal(next.owner_id,'real');
});
