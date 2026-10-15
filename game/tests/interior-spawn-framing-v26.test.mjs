import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {worldCamera,interiorCameraBounds} from '../web/world-camera.js';
import {sourceInteriorDetailLayout} from '../web/source-interiors.js';
const rooms=JSON.parse(readFileSync(new URL('../web/interiors-map.json',import.meta.url))).rooms;
const argsFor=(room,width,height,dpr)=>({width,height,dpr,zoom:1.25,sceneWidth:room.width,sceneHeight:room.height,position:room.spawn,sceneBounds:interiorCameraBounds(room)});
test('actual386x792 mobile canvas keeps at least85percent of the available public-room scale',()=>{
 for(const room of rooms)for(const dpr of[1,2]){
  const args=argsFor(room,386,792,dpr),v=worldCamera(args),bounds=args.sceneBounds,envelope=bounds.bottom-bounds.top;
  const requested=worldCamera({...args,sceneBounds:undefined}).scale,ideal=Math.min(requested,(792-114)/envelope);
  assert.ok(v.scale>=ideal*.85,`${room.id}/dpr${dpr}: ${v.scale} wastes the available ${ideal} fit`);
  assert.ok(v.scale*envelope<=792-114+1e-9,`${room.id}: scale must strictly fit the full physical height`);
 }
});
test('nearby actual mobile viewport heights do not halve people when a room crosses a zoom boundary',()=>{
 for(const id of['terrace','clans','casino'])for(const dpr of[1,2]){
  const room=rooms.find(r=>r.id===id);let previous;
  for(let height=784;height<=808;height++){
   const args=argsFor(room,386,height,dpr),v=worldCamera(args),envelope=args.sceneBounds.bottom-args.sceneBounds.top;
   assert.ok(v.scale>=.5);assert.ok(v.scale*envelope<=height-114+1e-9);
   if(previous!==undefined){assert.ok(v.scale>=previous);assert.ok(v.scale-previous<=1/(8*dpr)+1e-9,`${id}: one viewport pixel jumps from${previous} to${v.scale}`);}
   previous=v.scale;
  }
 }
});
test('all eleven actual public rooms fit the vertical rear, fixture and floor envelope above controls at spawn',()=>{
 assert.equal(rooms.length,11);
 for(const room of rooms)for(const [width,height]of[[390,798],[1204,880]])for(const dpr of[1,2]){
  const args=argsFor(room,width,height,dpr),v=worldCamera(args),visible=args.sceneBounds,usableBottom=v.y+(height-114)/v.scale;
  assert.ok(v.y<=visible.top+1/(v.scale*dpr),`${room.id}/${width}/${dpr}: rear top clipped by ${v.y-visible.top}`);
  assert.ok(usableBottom>=visible.bottom-1/(v.scale*dpr),`${room.id}: front cutaway sits behind controls`);
  for(const d of sourceInteriorDetailLayout(room).filter(d=>d.layer==='background'))assert.ok(d.bounds.y>=v.y-1/(v.scale*dpr),`${room.id}: mounted ${d.id} clipped at spawn`);
  const requested=worldCamera({...args,sceneBounds:undefined});assert.ok(v.scale<=requested.scale,'indoor fit never increases the requested city zoom');assert.ok(v.scale>=.5);
  assert.ok(Math.abs(v.scale*8*dpr-Math.round(v.scale*8*dpr))<1e-9,'fine discrete public zoom');
  for(const n of[v.x*v.scale*dpr,v.y*v.scale*dpr])assert.ok(Math.abs(n-Math.round(n))<1e-9,'origin stays aligned to physical pixels');
 }
});
test('public framing includes actual physical cutaways and authored fixture extents',()=>{
 const room={modular_source:true,width:800,height:800,surfaces:[{clip:{x:100,y:224,width:200,height:176}},{clip:{x:100,y:400,width:200,height:200}}],wall_cutaway:{regions:[{x:82,y:400,width:18,height:220},{x:300,y:400,width:18,height:220}]},details:[{layer:'background',visual:{x:200,y:224,width:20,height:70,anchorX:.5,anchorY:1}}]};
 assert.deepEqual(interiorCameraBounds(room),{left:58,right:342,top:130,bottom:644});
});
test('a tiny public viewport keeps a bounded minimum scale and can pan without moving world positions',()=>{
 const room=rooms.find(r=>r.id==='clans'),before=JSON.stringify(room),upper=worldCamera({...argsFor(room,390,180,2),position:{x:room.spawn.x,y:room.bounds.top+14}}),lower=worldCamera({...argsFor(room,390,180,2),position:{x:room.spawn.x,y:room.bounds.bottom-14}});
 assert.equal(upper.scale,.5);assert.equal(lower.scale,.5);assert.ok(upper.y<lower.y,'the room pans when it cannot fit at the minimum');assert.equal(JSON.stringify(room),before);
});
test('city and private base camera outputs retain their exact pre-change values',()=>{
 for(const [sceneWidth,sceneHeight,position,width,height,dpr,expected]of[
  [8400,5200,{x:5700.13,y:2650.27},390,798,2,{scale:1.5,width:260,height:532,x:5570,y:2352.3333333333335}],
  [8400,5200,{x:5700.13,y:2650.27},1204,880,1,{scale:2,width:602,height:440,x:5399,y:2404}],
  [900,700,{x:450,y:400},390,798,2,{scale:1.5,width:260,height:532,x:320,y:102}],
  [900,700,{x:450,y:400},1204,880,1,{scale:2,width:602,height:440,x:149,y:153.5}],
 ])assert.deepEqual(worldCamera({width,height,dpr,zoom:1.25,sceneWidth,sceneHeight,position}),expected);
});
