import test from 'node:test';
import assert from 'node:assert/strict';
import {nearestFreeCityPoint,moveBetweenObstacles,createCityObstacleIndex} from '../web/city-collision.js';
import {moveInteriorPosition} from '../web/interiors.js';
import {moveBasePosition,worldMap} from '../web/world.js';
import {readFileSync} from 'node:fs';

const bounds={left:0,right:300,top:0,bottom:300};
const obstacle={id:'lamp',x:100,y:100,width:20,height:20};
const safe=(p,b=obstacle)=>Math.hypot(Math.max(b.x-p.x,0,p.x-b.x-b.width),Math.max(b.y-p.y,0,p.y-b.y-b.height))>=14-1e-7;

test('the full body stops before a lamp and can slide along its free edge',()=>{
 const p=moveBetweenObstacles({x:80,y:100},20,30,[obstacle],bounds,14);
 assert.ok(safe(p),'the centre being outside the support is insufficient');
 assert.equal(p.y,130,'a blocked horizontal step still slides vertically');
 assert.ok(p.x<=86,'the complete body retains its clearance');
});

test('a long movement reaches first body contact rather than discarding the whole step',()=>{
 const p=moveBetweenObstacles({x:40,y:110},200,0,[obstacle],bounds,14);
 assert.deepEqual(p,{x:86,y:110});
 const segmented=moveBetweenObstacles(moveBetweenObstacles({x:40,y:110},30,0,[obstacle],bounds,14),170,0,[obstacle],bounds,14);
 assert.deepEqual(p,segmented,'collision stopping does not depend on frame duration');
 assert.deepEqual(moveBetweenObstacles({x:190,y:110},-200,0,[obstacle],bounds,14),{x:134,y:110});
});

test('free-point repair and outer edges leave clearance for the complete body',()=>{
 const repaired=nearestFreeCityPoint({x:99,y:110},[obstacle],bounds,14);
 assert.ok(safe(repaired),'saved positions near a support must also be repaired');
 assert.deepEqual(nearestFreeCityPoint({x:-10,y:100},[],bounds,14),{x:14,y:100});
 assert.deepEqual(nearestFreeCityPoint(repaired,[obstacle],bounds,14),repaired,'a repaired point is stable');
});

test('collision indexing includes a body crossing a neighbouring spatial bucket',()=>{
 const post={id:'post',x:162,y:100,width:5,height:20};
 const index=createCityObstacleIndex([post],160,14);
 assert.deepEqual(index.near({x:150,y:110}),[post],'the support is in the adjacent bucket, but the body overlaps it');
});

test('a passage narrower than a body is blocked, while an exact 28-unit opening is usable',()=>{
 const walls=[{id:'left',x:0,y:90,width:100,height:100},{id:'right',x:127,y:90,width:173,height:100}];
 const narrow=moveBetweenObstacles({x:113.5,y:60},0,160,walls,bounds,14);
 assert.ok(narrow.y<90&&walls.every(b=>safe(narrow,b)),'a 27-unit opening cannot admit a 28-unit body');
 walls[1]={...walls[1],x:128,width:172};
 assert.deepEqual(moveBetweenObstacles({x:114,y:60},0,160,walls,bounds,14),{x:114,y:220});
});

test('a circular foot support clears a diagonal corner without a square-collider snag',()=>{
 const start={x:81,y:94},target={x:91,y:82};
 assert.ok(safe(target));
 assert.deepEqual(moveBetweenObstacles(start,target.x-start.x,target.y-start.y,[obstacle],bounds,14),target);
 const nearCorner=nearestFreeCityPoint({x:91,y:91},[obstacle],bounds,14);
 assert.ok(safe(nearCorner));
 assert.ok(Math.hypot(nearCorner.x-91,nearCorner.y-91)<2,'repair follows the nearest rounded edge');
});

test('public interiors reject body overlap and preserve sliding around counters',()=>{
 const room={bounds,solids:[obstacle]};
 const p=moveInteriorPosition(room,{x:80,y:110},20,20);
 assert.ok(safe(p));assert.equal(p.y,130);
 assert.deepEqual(moveInteriorPosition({...room,solids:[]},{x:30,y:60},-100,0),{x:14,y:60});
});

test('base movement releases a chair into ground clear of its complete support',()=>{
 const grid=worldMap.base.grid,item={id:'chair',type:'chair',x:2,y:2,rotation:0};
 const active={id:'test',base:{items:[item]}};
 const x=grid.x+item.x*grid.cell_width,y=grid.y+item.y*grid.cell_height;
 const p=moveBasePosition(active,{x:x+20,y:y+20},0,7);
 assert.ok(!(p.x>x-14&&p.x<x+grid.cell_width+14&&p.y>y-14&&p.y<y+grid.cell_height+14),'leaving a claimed seat must clear the physical chair');
});

test('all 11 public exits, services and seat approaches are reachable by the real foot collider',()=>{
 const rooms=JSON.parse(readFileSync(new URL('../web/interiors-map.json',import.meta.url))).rooms;
 assert.equal(rooms.length,11);
 for(const room of rooms){
  const step=20,targets=[room.exit,room.action,...room.seats.map(s=>s.approach)],queue=[room.spawn],seen=new Set([`${room.spawn.x}:${room.spawn.y}`]),found=new Set();
  for(let head=0;head<queue.length;head++){
   const p=queue[head];
   for(let i=0;i<targets.length;i++)if(Math.hypot(p.x-targets[i].x,p.y-targets[i].y)<=30){
    const target=targets[i],reached=moveInteriorPosition(room,p,target.x-p.x,target.y-p.y);
    if(Math.hypot(reached.x-target.x,reached.y-target.y)<1e-7)found.add(i);
   }
   if(found.size===targets.length)break;
   for(const [dx,dy]of [[step,0],[-step,0],[0,step],[0,-step]]){
    const target={x:p.x+dx,y:p.y+dy},key=`${target.x}:${target.y}`;if(seen.has(key))continue;
    const reached=moveInteriorPosition(room,p,dx,dy);
    if(Math.hypot(reached.x-target.x,reached.y-target.y)<1e-7){seen.add(key);queue.push(target);}
   }
  }
  assert.equal(found.size,targets.length,`${room.id}: a service, seat approach or exit is disconnected`);
  for(const seat of room.seats)for(const [dx,dy]of [[7,0],[-7,0],[0,7],[0,-7]]){
   const p=moveInteriorPosition(room,seat.seat,dx,dy);
   assert.ok(room.solids.every(b=>safe(p,b)),`${room.id}/${seat.id}: leaving a seat overlaps a support`);
   assert.ok(p.x>=room.bounds.left+14&&p.x<=room.bounds.right-14&&p.y>=room.bounds.top+14&&p.y<=room.bounds.bottom-14);
  }
 }
});
