import test from 'node:test';
import assert from 'node:assert/strict';
import * as interiors from '../web/interiors.js';
const trace=()=>{const calls=[];return {calls,c:{fillStyle:'',fillRect(x,y,width,height){calls.push({x,y,width,height,color:this.fillStyle});}}};};
test('fine wood and stone texture stay inside the assigned floor plane',()=>{
 assert.equal(typeof interiors.drawFloorMaterial,'function');
 for(const kind of ['wood','stone']){const {calls,c}=trace(),b={x:28,y:78,width:844,height:574};interiors.drawFloorMaterial(c,b,'#bcb7a1',kind);assert.ok(calls.length>1);for(const n of calls){assert.ok(n.width>0&&n.height>0);assert.ok(n.x>=b.x&&n.y>=b.y&&n.x+n.width<=b.x+b.width&&n.y+n.height<=b.y+b.height,`${kind} texture outside room floor`);}}
});
test('floor material remains deterministic and supports stored dark and light custom palettes',()=>{
 assert.equal(typeof interiors.drawFloorMaterial,'function');
 for(const color of ['#141414','#faf8f2','#7d9de6']){const a=trace(),b=trace();interiors.drawFloorMaterial(a.c,{x:3,y:7,width:140,height:93},color);interiors.drawFloorMaterial(b.c,{x:3,y:7,width:140,height:93},color);assert.deepEqual(a.calls,b.calls);assert.equal(a.calls[0].color,color);assert.ok(a.calls.every(n=>/^#[0-9a-f]{6}$/i.test(n.color)));}
});

test('sofa cushions use local width at arbitrary world positions instead of painting negative spans',()=>{
 for(const x of [3,120,660,1450]){const {calls,c}=trace();const paint=new Proxy(c,{get:(t,k)=>t[k]??(()=>{})});interiors.drawFurnitureVolume(paint,{variant:'standard'},'sofa',x,420,140,58,'#7d9de6');for(const n of calls)assert.ok(n.width>=0&&n.height>=0,`Invalid cushion width ${n.width} at x ${x}`);}
});
