import test from 'node:test';
import assert from 'node:assert/strict';
import * as interiors from '../web/interiors.js';
const {drawInteriorGround,nearestInteriorAction}=interiors;

const fixture={id:'test',kind:'food-store',label:'Магазин',width:900,height:680,bounds:{left:28,right:872,top:78,bottom:652},spawn:{x:450,y:568},exit:{x:450,y:625},action:{id:'shop-food',x:500,y:470},seats:[{id:'seat',seat:{x:540,y:470}}],zones:[{id:'market',label:'Продукты',x:100,y:120,width:200,height:150,material:'tile'}]};
function trace(){const calls=[];return {calls,c:new Proxy({measureText:s=>({width:s.length*6})},{get:(t,k)=>t[k]??((...a)=>calls.push([k,...a])),set:(t,k,v)=>(t[k]=v,true)})};}

test('floor zones are drawn from the room plan rather than a universal entrance rug',()=>{
 const a=trace(),b=trace();drawInteriorGround(a.c,fixture);drawInteriorGround(b.c,{...fixture,zones:[]});
 assert.notDeepEqual(a.calls,b.calls);
 assert.ok(a.calls.some(n=>n[0]==='fillRect'&&n[1]===100&&n[2]===120&&n[3]===200&&n[4]===150));
 assert.ok(!b.calls.some(n=>n[0]==='fillRect'&&n[1]===fixture.exit.x-77&&n[2]===495&&n[3]===154&&n[4]===106),'old oversized rug must not remain in every room');
});
test('nearby checkout beats a farther available seat, while claimed seats stay unavailable',()=>{
 assert.equal(nearestInteriorAction(fixture,500,470).kind,'counter');
 assert.equal(nearestInteriorAction(fixture,550,470).kind,'bench');
 assert.equal(nearestInteriorAction(fixture,550,470,{players:[{id:'other',bench_id:'seat'}]},'self').kind,'counter');
});
test('the exact doorway always remains an exit when a nearby seat is available',()=>{
 const room={...fixture,seats:[{id:'door-seat',seat:{x:500,y:625}}]};
 assert.equal(nearestInteriorAction(room,450,625).kind,'exit');
});
test('room minimap shows local furniture and the real local player position',()=>{
 assert.equal(typeof interiors.drawInteriorMiniMap,'function');
 const a=trace(),room={...fixture,solids:[{x:100,y:120,width:200,height:150}]};
 a.c.canvas={width:192,height:119};interiors.drawInteriorMiniMap(a.c,room,{x:450,y:568});
 assert.ok(a.calls.some(n=>n[0]==='fillRect'&&n[1]===100&&n[2]===120&&n[3]===200&&n[4]===150));
 const marker=a.calls.filter(n=>n[0]==='arc').at(-1);assert.ok(Math.abs(marker[1]-450/900*192)<1e-8);assert.ok(Math.abs(marker[2]-568/680*119)<1e-8);
});
test('seat orientation comes from authoritative chair geometry for sitting and restoring',()=>{
 const room={...fixture,seats:[{...fixture.seats[0],facing:'up'}]};
 assert.equal(nearestInteriorAction(room,540,470).facing,'up');
 assert.equal(interiors.interiorSeatFacing(room,'seat'),'up');
 assert.equal(interiors.interiorSeatFacing(room,'unknown'),null);
 const legacy={x:540,y:470,bench_id:'seat',pose:'phone',facing:'down',phone_open:true};
 assert.deepEqual(interiors.interiorSeatedActor(room,legacy),{...legacy,pose:'sit',facing:'up'});
 assert.deepEqual(interiors.interiorSeatedActor(room,{...legacy,bench_id:'unknown'}),{...legacy,bench_id:'unknown'});
});
