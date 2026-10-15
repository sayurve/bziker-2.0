import test from 'node:test';
import assert from 'node:assert/strict';
import {lakeWalkwayLayouts,drawLakeWalkway} from '../web/lake-walkways.js';

test('visible bridge deck uses the same centre line and width as the pedestrian strip',()=>{
 const [r]=lakeWalkwayLayouts({walkways:[{id:'island-bridge',width:80,points:[[100,200],[100,500]]}]});
 assert.deepEqual(r.a,[100,200]);assert.deepEqual(r.b,[100,500]);assert.equal(r.width,80);assert.equal(r.length,300);
 assert.deepEqual(r.bounds,{x:47,y:187,width:106,height:326});assert.equal(r.depth,-1);
});
test('invalid and zero-length bridge segments do not enter the draw list',()=>{
 assert.deepEqual(lakeWalkwayLayouts({walkways:[{width:80,points:[[10,10],[10,10]]},{width:-1,points:[[0,0],[30,0]]},{width:20,points:[[0,0],[NaN,0]]}]}),[]);
});
test('drawn bridge leaves a continuous deck between the land endpoints',()=>{
 const [r]=lakeWalkwayLayouts({walkways:[{width:80,points:[[100,200],[100,500]]}]}),calls=[];
 const c={save(){},restore(){},translate(){},rotate(){},fillRect(...args){calls.push(args);},set fillStyle(v){}};
 assert.equal(drawLakeWalkway(c,r),true);
 assert.ok(calls.some(([x,y,w,h])=>x===0&&y===-40&&w===300&&h===80));
});
