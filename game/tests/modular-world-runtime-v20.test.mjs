import test from 'node:test';
import assert from 'node:assert/strict';
import * as world from '../web/world.js';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {preloadSourceWater} from '../web/source-water.js';

test('city seat display preserves its claim while phone and labels use the front anchor',()=>{
 const map={benches:[{id:'test-seat',seat:{x:50,y:98},visual:{x:50,y:102},facing:'down'}]},p={id:'self',x:50,y:98,pose:'sit',bench_id:'test-seat',phone_open:true};
 assert.equal(typeof world.cityActorPlacement,'function');
 const placed=world.cityActorPlacement(p,map);
 assert.equal(placed.depth,102);assert.equal(placed.player.y,102);assert.equal(placed.player.phone_open,true);
 assert.deepEqual(p,{id:'self',x:50,y:98,pose:'sit',bench_id:'test-seat',phone_open:true},'display never changes persisted feet');
 assert.deepEqual(world.cityActorPlacement({...p,pose:'idle'},map),{player:{...p,pose:'idle'},depth:98});
 assert.deepEqual(world.cityActorPlacement({...p,bench_id:'missing'},map),{player:{...p,bench_id:'missing'},depth:98});
});

test('visible door action uses the same radius as the server',()=>{
 const door=world.cityBuildings.find(b=>b.id==='railway').door;
 assert.equal(world.nearestEntrance(door.x,door.y+85),'railway');
 assert.equal(world.worldInteractionRadii.door,110);
 assert.equal(world.worldInteractionRadii.bench,110);
});
test('animated water stays below an independently drawn dock throughout its wave cycle',async()=>{
 const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
 await preloadSourceWater(url=>loadImage(fileURLToPath(new URL(`..${url}`,import.meta.url))),{createCanvas});
 const point=world.worldMap.lake,view={x:point.x-100,y:point.y-100,width:200,height:200};
 let drawings=0;
 const art={drawGround(c,_view,options){assert.equal(options.nativeObjects,false);c.fillStyle='#76a053';c.fillRect(view.x,view.y,200,200);},groundObjects:[{bounds:{x:point.x-20,y:point.y-20,width:40,height:40},draw(c){drawings++;c.fillStyle='#f1b72b';c.fillRect(point.x-20,point.y-20,40,40);}}]};
 assert.equal(typeof world.drawCityGroundFrame,'function');
 for(const time of [0,333,666,999,1332,1665]){
  const c=createCanvas(200,200).getContext('2d');c.translate(-view.x,-view.y);
  world.drawCityGroundFrame(c,art,view,time,false);
  assert.deepEqual(Array.from(c.getImageData(100,100,1,1).data),[241,183,43,255],'water cannot erase the dry platform');
 }
 assert.equal(drawings,6,'the independent dock draws exactly once in each frame');
});
