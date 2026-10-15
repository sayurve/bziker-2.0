import test from 'node:test';
import assert from 'node:assert/strict';
import {ambientAnimals,animalPosition,animalsAt,nearestAnimalAction,snapshotAnimalTime} from '../web/ambient-animals.js';
import {drawAnimal} from '../web/waterfront.js';
import {nearestAction,worldMap} from '../web/world.js';

const render=(animal,effect=null,reduced=false,now=1000)=>{const rects=[],c={fillRect(x,y,w,h){rects.push([x,y,w,h,this.fillStyle]);}};drawAnimal(c,animal,effect,reduced,now);return rects;};
test('twelve animals walk and pause along routes instead of staying at one coordinate',()=>{
 assert.equal(ambientAnimals.length,12);
 for(const a of ambientAnimals){const frames=Array.from({length:1000},(_,i)=>animalPosition(a,i/10));assert.ok(frames.some(p=>p.walking));assert.ok(frames.some(p=>!p.walking));assert.ok(new Set(frames.map(p=>`${Math.round(p.x)}:${Math.round(p.y)}`)).size>10);}
});
test('server time plus elapsed monotonic time drives motion even with a wrong device clock',()=>{
 assert.equal(snapshotAnimalTime({server_time:1000},3000),1003);
 assert.equal(snapshotAnimalTime({server_time:1000},-3000),1000);
 assert.equal(snapshotAnimalTime({server_time:NaN},3000),null);
});
test('a nearby dynamic animal target replaces its old static map position',()=>{
 const dog=ambientAnimals.find(a=>a.id==='plaza-dog'),point=animalPosition(dog,1000),snapshot={animals:[point]};
 assert.equal(nearestAnimalAction(snapshot.animals,point.x,point.y).id,dog.id);
 assert.equal(nearestAction(point.x,point.y,snapshot).id,dog.id);
 assert.equal(nearestAnimalAction(snapshot.animals,point.x+66,point.y),null);
 const legacy=worldMap.activities.find(a=>a.id==='park-dog');
 assert.notEqual(nearestAction(legacy.x,legacy.y,{animals:[]})?.id,'park-dog');
 assert.equal(nearestAction(legacy.x,legacy.y).id,'park-dog');
});
test('walking animals face both directions and move alternating paws; reduced motion leaves them visible',()=>{
 const p={kind:'dog',x:500,y:400,walking:true,facing:'right',walk_frame:0};
 assert.notDeepEqual(render(p),render({...p,walk_frame:1}));
 assert.notDeepEqual(render(p),render({...p,facing:'left'}));
 assert.notDeepEqual(render({...p,kind:'cat'}),render({...p,kind:'cat',walk_frame:1}));
 assert.deepEqual(render({...p,walking:false,walk_frame:0}),render({...p,walking:false,walk_frame:1}));
 assert.ok(render(p,null,true).length>10);
});
test('pet pause freezes at the actual route point and catches up continuously afterwards',()=>{
 const a=ambientAnimals[0],pause={started_at:3,duration:2},before=animalPosition(a,3),held=animalPosition(a,4,pause);
 assert.equal(held.x,before.x);assert.equal(held.y,before.y);assert.equal(held.walking,false);
 const p=animalsAt(4,{[a.id]:pause})[0];assert.deepEqual(p.pause,pause);
 const expired=animalsAt(8,{[a.id]:pause})[0];assert.equal(expired.pause,undefined);
});
test('an exact litter target wins over a roaming animal within the same interaction radius',()=>{
 const litter=worldMap.activities.find(a=>a.id==='litter-park-1'),animal={...animalPosition(ambientAnimals[0],1000),x:litter.x-25,y:litter.y};
 assert.equal(nearestAction(litter.x,litter.y,{animals:[animal]}).id,litter.id);
 assert.equal(nearestAction(animal.x,animal.y,{animals:[animal]}).id,animal.id);
});
test('all walking paths avoid the newly decorated entry beds as well as the old geometry',async()=>{
 const {createCityGroundPlan}=await import('../web/city-ground.js'),beds=createCityGroundPlan(worldMap).plantings;
 for(const animal of ambientAnimals)for(let j=0;j<animal.route.length;j++){const a=animal.route[j],b=animal.route[(j+1)%animal.route.length];for(let i=0;i<=40;i++){const x=a.x+(b.x-a.x)*i/40,y=a.y+(b.y-a.y)*i/40;for(const bed of beds)assert.ok(!(x>bed.x-18&&x<bed.x+bed.width+18&&y>bed.y-18&&y<bed.y+bed.height+18),animal.id+' crosses a planted bed');}}
});
