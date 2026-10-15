import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as interiors from '../web/source-interiors.js';
const root=new URL('../',import.meta.url),{rooms}=JSON.parse(await readFile(new URL('web/interiors-map-v19.json',root),'utf8'));
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const originalRoot=fileURLToPath(new URL('../source-reference/',import.meta.url));
const load=url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root)));
const clear=(room,p,radius=14)=>p.x>=room.bounds.left+radius&&p.x<=room.bounds.right-radius&&p.y>=room.bounds.top+radius&&p.y<=room.bounds.bottom-radius&&!room.solids.some(s=>p.x>s.x-radius&&p.x<s.x+s.width+radius&&p.y>s.y-radius&&p.y<s.y+s.height+radius);

test('frozen v19 reference rooms explicitly select five whole original scenes, without altering a private base',()=>{
 assert.equal(typeof interiors.isExactSourceInterior,'function');
 assert.equal(rooms.length,11);
 assert.equal(new Set(rooms.map(r=>r.source_scene?.asset_id)).size,5);
 for(const room of rooms){
  assert.equal(interiors.isExactSourceInterior(room),true,room.id);
  assert.equal(room.width,768);assert.equal(room.height,512);
  assert.deepEqual(room.source_scene.native_size,[1536,1024]);
  assert.equal(room.source_scene.scale,.5);
  assert.equal(room.source_scene.baked_staff,!['messages','terrace','shop-food','shop-furniture'].includes(room.id));
  assert.equal(room.source_scene.reused,!['railway','casino','shop-clothes','messages','arena'].includes(room.id));
 }
 assert.equal(interiors.isExactSourceInterior({id:'clans',width:1200,height:900}),false);
});

test('runtime PNGs are byte-for-byte copies of the current originals and draw with pixel equality',async()=>{
 assert.equal(typeof interiors.drawExactSourceInterior,'function');
 const scenes=[...new Map(rooms.map(r=>[r.source_scene?.asset_id,r])).values()];
 for(const room of scenes){
  const meta=room.source_scene;assert.ok(meta?.source_file);
  const original=await readFile(originalRoot+meta.source_file),runtime=await readFile(new URL(meta.url.replace(/^\//,''),root));
  assert.deepEqual(runtime,original,meta.asset_id);
  assert.equal(createHash('sha256').update(runtime).digest('hex'),meta.sha256);
  await interiors.preloadSourceInteriorRoom(room,load);
  const native=await loadImage(originalRoot+meta.source_file),expected=createCanvas(1536,1024),actual=createCanvas(1536,1024);
  const e=expected.getContext('2d');e.imageSmoothingEnabled=false;e.drawImage(native,0,0);
  const c=actual.getContext('2d');c.scale(2,2);assert.equal(interiors.drawExactSourceInterior(c,room),true);
  assert.ok(Buffer.from(c.getImageData(0,0,1536,1024).data).equals(Buffer.from(e.getImageData(0,0,1536,1024).data)),meta.asset_id);
 }
});

test('each source furnishing has matching physical bindings, clear entry/service and reachable seats',()=>{
 for(const room of rooms){
  assert.ok(clear(room,room.spawn),`${room.id}: spawn blocked`);
  assert.ok(clear(room,room.exit),`${room.id}: exit blocked`);
  assert.ok(clear(room,room.action),`${room.id}: service blocked`);
  const sourceObjects=interiors.sourceInteriorExactObjects(room);
  assert.equal(sourceObjects.length,room.props.filter(p=>p.occlusion_polygons?.length).length);
  for(const prop of room.props){
   assert.ok(prop.source_pixel_bbox,`${room.id}/${prop.id}: source equipment anchor missing`);
   if(prop.solid)assert.ok(room.solids.some(s=>s.prop_id===prop.id&&s.x===prop.x&&s.y===prop.y&&s.width===prop.width&&s.height===prop.height));
  }
  for(const seat of room.seats){
   const prop=room.props.find(p=>p.id===seat.prop_id);assert.ok(prop,seat.id);
   assert.ok(clear(room,seat.approach),`${seat.id}: approach blocked`);
   assert.equal(seat.seat.y,prop.y+prop.height);
  }
  // Four-neighbour navigation on the same collision geometry used by server.
  const step=4,queue=[room.spawn],seen=new Set([`${room.spawn.x}:${room.spawn.y}`]),targets=[room.exit,room.action,...room.seats.map(s=>s.approach)],found=new Set();
  for(let head=0;head<queue.length;head++){
   const p=queue[head];targets.forEach((t,i)=>{if(Math.hypot(t.x-p.x,t.y-p.y)<=step*1.6)found.add(i);});
   for(const [dx,dy] of [[step,0],[-step,0],[0,step],[0,-step]]){const next={x:p.x+dx,y:p.y+dy},key=`${next.x}:${next.y}`;if(!seen.has(key)&&clear(room,next)){seen.add(key);queue.push(next);}}
  }
  assert.equal(found.size,targets.length,`${room.id}: unreachable ${targets.filter((_,i)=>!found.has(i)).map(p=>`${p.x},${p.y}`).join('; ')}`);
 }
});

test('native casino preserves its exact sixteen chairs and two slots, without fictitious sofas',()=>{
 const room=rooms.find(r=>r.id==='casino');
 assert.equal(room.seats.length,16);
 assert.equal(room.props.filter(p=>p.type==='slot').length,2);
 assert.equal(room.props.filter(p=>p.type==='sofa').length,0);
 assert.equal(room.seats.filter(s=>s.table_id==='poker-one').length,6);
 assert.equal(room.seats.filter(s=>s.table_id==='roulette').length,6);
});

test('exact preload loads one source scene only and decorations never duplicate baked equipment',async()=>{
 const room=rooms.find(r=>r.id==='shop-clothes'),urls=[];
 await interiors.preloadSourceInteriorRoom(room,async url=>{urls.push(url);return load(url);});
 assert.ok(urls.length<=1);assert.ok(urls.every(url=>url===room.source_scene.url));
 assert.deepEqual(interiors.sourceInteriorDetailLayout(room),[]);
 const canvas=createCanvas(room.width,room.height),c=canvas.getContext('2d');
 assert.equal(interiors.drawSourceInteriorProp(c,room.props[0],room),true);
 assert.equal(c.getImageData(0,0,room.width,room.height).data.some(v=>v),false,'baked props must not be drawn a second time');
});

test('exact lazy loading fails softly in non-browser harnesses or on missing files, allowing a later retry',async()=>{
 const room={...rooms[0],source_scene:{...rooms[0].source_scene,url:'/assets/design-exact-interior-loader-fixture.png'}};
 const original=globalThis.Image;delete globalThis.Image;
 try{assert.equal(await interiors.preloadSourceInteriorRoom(room),false);}finally{if(original)globalThis.Image=original;}
 assert.equal(await interiors.preloadSourceInteriorRoom(room,async()=>{throw Error('missing asset');}),false);
 assert.equal(await interiors.preloadSourceInteriorRoom(room,()=>load(rooms[0].source_scene.url)),true);
});

test('source foreground masks preserve the native pixels when no actor stands behind equipment',async()=>{
 for(const room of [...new Map(rooms.map(r=>[r.source_scene.asset_id,r])).values()]){
  await interiors.preloadSourceInteriorRoom(room,load);
  const canvas=createCanvas(1536,1024),c=canvas.getContext('2d');c.scale(2,2);interiors.drawExactSourceInterior(c,room);
  const original=Buffer.from(c.getImageData(0,0,1536,1024).data);
  for(const object of interiors.sourceInteriorExactObjects(room))object.draw(c);
  interiors.drawExactSourceInteriorForeground(c,room);
  assert.ok(original.equals(Buffer.from(c.getImageData(0,0,1536,1024).data)),`${room.id}: native occlusion crop changes the actual illustration`);
 }
});
