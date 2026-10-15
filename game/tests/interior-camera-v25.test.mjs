import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {worldCamera,interiorCameraBounds} from '../web/world-camera.js';
const railway=JSON.parse(readFileSync(new URL('../web/interiors-map.json',import.meta.url))).rooms.find(r=>r.id==='railway');
// Independent physical envelope: rear176 with2-unit seam, side18, front20,24margin.
const b=railway.bounds,sceneBounds={left:b.left-42,right:b.right+42,top:b.top-198,bottom:b.bottom+44};
const config={width:390,height:792,dpr:2,zoom:1,sceneWidth:railway.width,sceneHeight:railway.height,sceneBounds};

test('native station framing uses the visible room at left and right instead of blank canvas padding',()=>{
 const left=worldCamera({...config,position:{x:railway.bounds.left+14,y:500}}),right=worldCamera({...config,position:{x:railway.bounds.right-14,y:500}});
 assert.ok(left.x>=sceneBounds.left-1,`left frame ${left.x} includes empty source padding before ${sceneBounds.left}`);
 assert.ok(Math.abs(left.x-sceneBounds.left)<=1,'keep the left wall visible at the edge');
 assert.ok(Math.abs(right.x+right.width-sceneBounds.right)<=1,`right frame includes empty source padding beyond ${sceneBounds.right}`);
 assert.equal(left.scale,right.scale);
});
test('native station framing keeps the upper wall and lower cutaway with touch-control clearance',()=>{
 const upper=worldCamera({...config,position:{x:railway.spawn.x,y:railway.bounds.top+14}}),lower=worldCamera({...config,position:{x:railway.spawn.x,y:railway.bounds.bottom-14}});
 const usable=upper.height-114/upper.scale;
 if(usable>=sceneBounds.bottom-sceneBounds.top){
  assert.ok(upper.y<=sceneBounds.top&&upper.y+usable>=sceneBounds.bottom,'compact room fits above the controls');
  assert.ok(Math.abs(upper.y+usable/2-(sceneBounds.top+sceneBounds.bottom)/2)<=1,'compact room is centred in the usable frame');
 }else{
  assert.ok(Math.abs(upper.y-sceneBounds.top)<=1,'upper wall starts inside the frame');
  assert.ok(Math.abs(lower.y+lower.height-114/lower.scale-sceneBounds.bottom)<=1,'lower cutaway sits above the controls');
 }
 assert.ok((railway.bounds.bottom-14-lower.y)*lower.scale<=config.height-114);
 for(const v of [upper,lower]){assert.equal(v.x*v.scale*2,Math.round(v.x*v.scale*2));assert.equal(v.y*v.scale*2,Math.round(v.y*v.scale*2));}
});
test('a viewport larger than the visible room centers that room in the usable frame without changing zoom',()=>{
 const args={width:1000,height:900,dpr:2,zoom:1,sceneWidth:1600,sceneHeight:1000,position:{x:750,y:500}},sceneBounds={left:600,right:900,top:350,bottom:600};
 const legacy=worldCamera(args),v=worldCamera({...args,sceneBounds});
 assert.equal(v.scale,legacy.scale);
 assert.ok(Math.abs(v.x+v.width/2-750)<=1,'center the visible room horizontally');
 assert.ok(Math.abs(v.y+(v.height-114/v.scale)/2-475)<=1,'center the room above the touch controls');
});
test('city and private-base camera values are identical when no interior framing is supplied',()=>{
 assert.deepEqual(worldCamera({width:390,height:792,dpr:2,zoom:1,sceneWidth:8400,sceneHeight:5200,position:{x:5700.13,y:2650.27}}),{scale:1,width:390,height:792,x:5505,y:2207});
});

test('only modular public room surfaces supply framing bounds',()=>{assert.deepEqual(interiorCameraBounds(railway),sceneBounds);assert.equal(interiorCameraBounds({...railway,modular_source:false}),null);assert.equal(interiorCameraBounds({...railway,surfaces:[]}),null);});
