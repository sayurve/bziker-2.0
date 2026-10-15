import test from 'node:test';
import assert from 'node:assert/strict';
import * as world from '../web/world.js';
import {furnitureCatalog,furnitureFootprint,canPlaceItem,baseSeats,baseSeatedActor,worldMap,worldKey} from '../web/world.js';

test('each furnishing offers four saved directions',()=>{
 for(const type of furnitureCatalog.types)assert.deepEqual(type.rotations,[0,90,180,270],type.id);
});
test('four directions use the whole rotated floor footprint and reject unsupported values',()=>{
 for(const rotation of [0,90,180,270]){
  const item={id:'sofa',type:'sofa',x:0,y:0,rotation};
  assert.deepEqual(furnitureFootprint(item),rotation===90||rotation===270?{width:1,height:2}:{width:2,height:1});
  assert.equal(canPlaceItem([],item),true,`accepted ${rotation}`);
 }
 for(const rotation of [-90,45,360,'90',true,null])assert.equal(canPlaceItem([],{id:'bad',type:'sofa',x:0,y:0,rotation}),false);
 assert.equal(canPlaceItem([],{id:'last-column',type:'sofa',x:11,y:0,rotation:270}),true);
 assert.equal(canPlaceItem([],{id:'last-row',type:'sofa',x:0,y:7,rotation:270}),false);
 const obstacle={id:'neighbor',type:'chair',x:0,y:1,rotation:0};
 assert.equal(canPlaceItem([obstacle],{id:'sofa',type:'sofa',x:0,y:0,rotation:180}),true);
 assert.equal(canPlaceItem([obstacle],{id:'sofa',type:'sofa',x:0,y:0,rotation:270}),false);
});
test('seats turn with furniture and keep stable identifiers and matching facing',()=>{
 const grid=worldMap.base.grid,origin={x:grid.x+2*grid.cell_width,y:grid.y+2*grid.cell_height};
 const expected={0:[[35,47],[105,47]],90:[[11,35],[11,105]],180:[[105,11],[35,11]],270:[[47,105],[47,35]]};
 const facings={0:'down',90:'left',180:'up',270:'right'};
 for(const rotation of [0,90,180,270]){
  const seats=baseSeats({id:'host',base:{items:[{id:'sofa',type:'sofa',x:2,y:2,rotation}]}});
  assert.deepEqual(seats.map(s=>[s.x-origin.x,s.y-origin.y]),expected[rotation]);
  assert.deepEqual(seats.map(s=>s.facing),[facings[rotation],facings[rotation]]);
  assert.deepEqual(seats.map(s=>s.id),['base:host:sofa:seat-1','base:host:sofa:seat-2']);
 }
});
test('legacy furniture stays compact and the R shortcut follows physical keyboard layout',()=>{
 assert.deepEqual(furnitureFootprint({type:'sofa'}),{width:1,height:1});
 assert.equal(canPlaceItem([],{id:'legacy',type:'sofa',x:11,y:7}),true);
 assert.equal(worldKey({key:'к',code:'KeyR'}),'rotate');
 assert.equal(worldKey({key:'r'}),'rotate');
});
test('seated local and neighboring avatars face the rotated seat while keeping their phone',()=>{
 const active={id:'host',base:{items:[{id:'sofa',type:'sofa',x:2,y:2,rotation:270}]}};
 const player={id:'neighbor',bench_id:'base:host:sofa:seat-1',pose:'sit',facing:'down',phone_open:true};
 assert.deepEqual(baseSeatedActor(active,player),{...player,facing:'right'});
 assert.deepEqual(baseSeatedActor(active,{...player,pose:'phone'}),{...player,facing:'right'});
 assert.deepEqual(baseSeatedActor(active,{...player,pose:'idle'}),{...player,pose:'idle'});
 assert.deepEqual(baseSeatedActor({...active,base:{...active.base,seats:[{id:player.bench_id,facing:'up'}]}},player),{...player,facing:'up'});
});
test('seated drawing is placed between the furniture body and its front edge without changing physical presence',()=>{
 assert.equal(typeof world.baseActorPlacement,'function');
 const player={id:'neighbor',bench_id:'base:host:sofa:seat-1',pose:'sit',facing:'down',phone_open:true,x:425,y:387};
 const active={id:'host',base:{items:[{id:'sofa',type:'sofa',x:2,y:2,rotation:180}]}};
 const placed=world.baseActorPlacement(active,player);
 assert.equal(placed.player.facing,'up');assert.equal(placed.player.y,423);assert.equal(placed.player.x,425);
 assert.equal(placed.depth,worldMap.base.grid.y+3*worldMap.base.grid.cell_height+.1);
 assert.equal(player.y,387);assert.equal(player.phone_open,true);
 assert.deepEqual(world.baseActorPlacement(active,{...player,pose:'idle'}),{player:{...player,pose:'idle'},depth:player.y});
});
