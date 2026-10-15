import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {worldCamera} from '../web/world-camera.js';

// Exercise the pinned Sprite TransformerImage and its Float32 transform math.
// Only RenderNode lifecycle hooks are stubbed; this is not a GPU/FPS test.
const vendor=fs.readFileSync(new URL('../web/vendor/phaser.min.js',import.meta.url),'utf8');
const starts=[...vendor.matchAll(/(?:^|\},)(\d+)\(t(?:,e)?(?:,i)?\)\{/g)];
const modules=new Map(starts.map((m,n)=>[+m[1],vendor.slice(m.index+(m[0].startsWith('},')?2:0),starts[n+1]?.index??vendor.length)]));
const cache=new Map();
function vendorModule(id){
 if(id===6141)return function(){this.onRunBegin=()=>{};this.onRunEnd=()=>{};};
 if(cache.has(id))return cache.get(id).exports;
 const body=modules.get(id);assert.ok(body,'pinned Phaser module '+id);
 const module={exports:{}};cache.set(id,module);
 new Function('t','e','i',body.slice(body.indexOf('{')+1))(module,module.exports,vendorModule);
 return module.exports;
}
const Matrix=vendorModule(61340),TransformerImage=vendorModule(86081);
const roundMethod=vendor.match(/willRoundVertices:function\(([^)]*)\)\{([\s\S]*?)\},setVertexRoundMode/);
assert.ok(roundMethod,'pinned Phaser vertex rounding contract');
const willRoundVertices=new Function(...roundMethod[1].split(','),roundMethod[2]);
function sourceFoot(view,dpr,position){
 const z=view.scale*dpr,matrix=new Matrix(z,0,0,z,-view.x*z,-view.y*z);
 const camera={roundPixels:true,scrollX:view.x,scrollY:view.y,getViewMatrix:()=>matrix};
 const transformer=new TransformerImage({});
 const sprite={x:position.x-120,y:position.y-110,displayOriginX:0,displayOriginY:0,rotation:0,scaleX:1,scaleY:1,
  flipX:false,flipY:false,scrollFactorX:1,scrollFactorY:1,vertexRoundMode:'safeAuto',willRoundVertices};
 transformer.run({camera,useCanvas:false},sprite,{frame:{customPivot:false,realWidth:241,realHeight:126},uvSource:{x:0,y:0},frameWidth:241,frameHeight:126});
 return {x:transformer.quad[0]+120*z,y:transformer.quad[1]+110*z,roundsVertices:willRoundVertices.call(sprite,camera,z===1)};
}
function samples(width,dpr,extra={}){
 return Array.from({length:121},(_,i)=>{
  const position={x:5744+i*.5,y:3472+i*.25};
  const view=worldCamera({width,height:876,dpr,zoom:1,sceneWidth:11488,sceneHeight:7424,position,...extra});
  return {position,view,foot:sourceFoot(view,dpr,position)};
 });
}

test('actual Phaser transform keeps a tracked foot fixed at odd/even viewport width at DPR1',()=>{
 for(const width of [703,704]){
  const rows=samples(width,1),target={x:Math.round(width/2),y:Math.round(876*.56)};
  for(const {foot} of rows){assert.equal(foot.roundsVertices,true);assert.equal(foot.x,target.x,'horizontal tracked foot');assert.equal(foot.y,target.y,'vertical tracked foot');}
 }
});

test('DPR2 limits rounded screen-foot drift without claiming identical fractional GPU vertices',()=>{
 for(const width of [703,704])for(const {position,view,foot} of samples(width,2)){
  assert.equal(foot.roundsVertices,false,'zoom3 uses Phaser safeAuto without vertex rounding');
  assert.equal(Math.round(foot.x),Math.round(width*2/2));assert.equal(Math.round(foot.y),Math.round(876*.56*2));
  assert.ok(view.x>=0&&view.y>=0);assert.ok(view.x+view.width<=11488+1/2);assert.ok(view.y+view.height<=7424+114/view.scale+1/2);
  assert.ok(Math.abs((position.x-view.x)*view.scale*2-Math.round(width))<=.501);
 }
});

test('fractional interior zoom retains horizontal tracking while a fitted room permits vertical movement',()=>{
 const sceneBounds={left:4000,right:8000,top:3000,bottom:4200};
 for(const width of [703,704])for(const dpr of [1,2]){
  const rows=samples(width,dpr,{sceneBounds});assert.equal(rows[0].view.scale,.625);
  for(const {view,foot} of rows){assert.equal(Math.round(foot.x),Math.round(width*dpr/2));assert.ok(view.x>=sceneBounds.left&&view.x+view.width<=sceneBounds.right);}
  assert.ok(rows.at(-1).foot.y-rows[0].foot.y>10,'clamped room camera must let the actor move vertically');
 }
});

test('world edge clamps and device-grid scroll remain valid rather than forcing a centred actor',()=>{
 for(const dpr of [1,2])for(const position of [{x:0,y:0},{x:11488,y:7424}]){
  const before={...position},input={width:703,height:876,dpr,zoom:1,sceneWidth:11488,sceneHeight:7424,position},v=worldCamera(input),z=v.scale*dpr;
  assert.equal(v.x*z,Math.round(v.x*z));assert.equal(v.y*z,Math.round(v.y*z));
  assert.ok(v.x>=0&&v.x<=11488-v.width+1/z);assert.ok(v.y>=0&&v.y<=7424-v.height+114/v.scale+1/z);
  if(position.x===0){assert.equal(v.x,0);assert.equal(v.y,0);}else assert.ok(sourceFoot(v,dpr,position).x>703*dpr/2,'scene edge is not artificially recentered');
  assert.deepEqual(input.position,before,'camera never changes saved actor position');
 }
});
