import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {preloadSourceInteriorRoom} from '../web/source-interiors.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const appRoot=new URL('../',import.meta.url);
import * as world from '../web/world.js';
const interiors=await import('../web/interiors.js').catch(()=>({}));
const rooms=JSON.parse(await readFile(new URL('../web/interiors-map.json',import.meta.url),'utf8')).rooms;
test('objects occlude a player behind them and yield to a player in front',()=>{
 assert.equal(typeof world.sortWorldDepth,'function');
 const tree={id:'tree',depth:300},building={id:'building',depth:500},back={id:'back',depth:280,actor:true},front={id:'front',depth:520,actor:true};
 assert.deepEqual(world.sortWorldDepth([front,building,tree,back]).map(x=>x.id),['back','tree','building','front']);
});
test('public room collision follows shared solid geometry and prevents tunnelling',()=>{
 assert.equal(typeof interiors.moveInteriorPosition,'function');const r=rooms[0];
 const p={x:r.action.x,y:r.counter.y+r.counter.height+14};assert.deepEqual(interiors.moveInteriorPosition(r,p,0,-200),p);
 const bounded={...r,solids:[]};
 assert.deepEqual(interiors.moveInteriorPosition(bounded,r.spawn,-10000,0),{x:r.bounds.left+14,y:r.spawn.y});
 assert.deepEqual(interiors.moveInteriorPosition(bounded,r.spawn,10000,0),{x:r.bounds.right-14,y:r.spawn.y});
});
test('public room furniture is independently painted above a modular floor',async()=>{
 const load=url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),appRoot)));
 for(const room of rooms){
  assert.notEqual(room.exact_source,true,room.id);
  await preloadSourceInteriorRoom(room,load);
  const scale=Math.min(1,1000/room.width,700/room.height),canvas=createCanvas(Math.ceil(room.width*scale),Math.ceil(room.height*scale)),c=canvas.getContext('2d');
  c.scale(scale,scale);c.imageSmoothingEnabled=false;
  interiors.drawInteriorGround(c,room);
  const sha=()=>createHash('sha256').update(c.getImageData(0,0,canvas.width,canvas.height).data).digest('hex');
  const ground=sha(),nodes=interiors.interiorObjects(room);
  assert.ok(nodes.length>=room.props.length,room.id+' must have independent furnishing nodes');
  assert.ok(nodes.every(node=>!node.id.startsWith('native-foreground-')));
  for(const node of nodes)node.draw(c);
  assert.notEqual(sha(),ground,room.id+' furnishings must actually render');
 }
});
test('terrace has a usable door while city collision footprints remain unchanged',()=>{
 const door=world.cityBuildings.find(b=>b.id==='terrace').door;assert.deepEqual(door,rooms.find(r=>r.id==='terrace').door);assert.equal(world.nearestEntrance(door.x,door.y),'terrace');
});
test('room mirrors and card tables occlude actors at their physical front edge',()=>{
 for(const [kind,type] of [['wardrobe','mirror'],['casino','poker-table']]){
  const room=rooms.find(r=>r.kind===kind),prop=room.props.find(p=>p.type===type),node=interiors.interiorObjects(room).find(n=>n.id===`${room.id}:${prop.id}`);
  assert.equal(node.depth,prop.y+prop.height);
  assert.deepEqual(world.sortWorldDepth([node,{id:'behind',actor:true,depth:node.depth-7},{id:'front',actor:true,depth:node.depth+7}]).map(n=>n.id),['behind',node.id,'front']);
 }
});
test('social tables remain separate depth objects rather than a room-sized foreground cache',()=>{
 for(const kind of ['cafe','terrace']){
  const room=rooms.find(r=>r.kind===kind),nodes=interiors.interiorObjects(room),tables=room.props.filter(p=>p.type==='table');
  assert.ok(tables.length>=2);
  for(const table of tables){const node=nodes.find(n=>n.id===`${room.id}:${table.id}`);assert.ok(node);assert.equal(node.depth,table.y+table.height);assert.ok(node.bounds.width<room.width/2);}
  assert.equal(new Set(nodes.map(n=>n.id)).size,nodes.length);
 }
});
test('all seated players draw in front of their actual sofa or chair',()=>{
 for(const room of rooms){const nodes=interiors.interiorObjects(room);for(const seat of room.seats){
  const furniture=nodes.find(n=>n.id===`${room.id}:${seat.prop_id}`);assert.ok(furniture);
  assert.deepEqual(world.sortWorldDepth([{id:seat.id,actor:true,depth:seat.seat.y},furniture]).map(n=>n.id),[furniture.id,seat.id]);
 }}
});
test('modular city has separate drawable objects and no whole-map foreground patches',()=>{
 const previous=globalThis.document;globalThis.document={createElement(){return createCanvas(1,1);}};
 try{
  const art=world.createCityArt();assert.equal(world.worldMap.design_source.exact_scene,false);
  assert.ok(art.objects.length>100,'city contains independent buildings and environment objects');
  assert.ok(art.objects.every(o=>!o.id.startsWith('native-foreground-')&&!o.id.startsWith('native-canopy-')));
  assert.ok(art.objects.every(o=>o.bounds.width<world.worldSize.width/2&&o.bounds.height<world.worldSize.height/2));
 }finally{globalThis.document=previous;}
});
test('the street cat and its usable approach remain outside foreground tree drawing bounds',()=>{
 globalThis.document={createElement(){return {getContext(){return new Proxy({measureText:s=>({width:s.length*6})},{get:(t,k)=>t[k]??(()=>{})});}};}};
 const cat=world.worldMap.activities.find(a=>a.action==='pet-cat'),trees=world.createCityArt().objects.filter(n=>n.id.startsWith('tree-')&&n.depth>=cat.y),approach={x:cat.x+40,y:cat.y};
 for(const p of [{x:cat.x,y:cat.y-14},{x:approach.x,y:approach.y-35}])for(const t of trees){const b=t.bounds;assert.ok(!(p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height),`${cat.id} or its player approach is covered by ${t.id}`);}
 assert.deepEqual(world.clampPosition(cat.x,cat.y),{x:cat.x,y:cat.y});assert.deepEqual(world.clampPosition(approach.x,approach.y),approach);assert.equal(world.nearestAction(approach.x,approach.y).id,cat.id);
});
