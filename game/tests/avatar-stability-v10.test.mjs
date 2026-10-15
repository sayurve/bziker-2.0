import test from 'node:test';
import assert from 'node:assert/strict';
import {avatarGeometry,drawAvatarCanvas} from '../web/avatar.js';

function screenHead(x,y,deviceScale=1) {
 const transform={a:deviceScale,b:0,c:0,d:deviceScale,e:-Math.round((x-195)*deviceScale),f:-Math.round((y-320)*deviceScale)};
 const rects=[],context={getTransform:()=>transform,fillStyle:'',fillRect(px,py,w,h){
  const physical=value=>Math.round(value*1e9)/1e9;
  rects.push({x:physical(px*transform.a+transform.e),y:physical(py*transform.d+transform.f),w:w*transform.a,h:h*transform.d,color:this.fillStyle});
 }};
 const scale=1.25,{anchorX,anchorY}=avatarGeometry;
 drawAvatarCanvas(context,{hairStyle:11,accessory:1},x-anchorX*scale,y-anchorY*scale,{scale,anchorX,anchorY});
 return rects;
}

test('the same head keeps its pixel widths while following fractional walking coordinates',()=>{
 const rects=(x,y)=>{const out=[];drawAvatarCanvas({fillStyle:'',fillRect(px,py,w,h){out.push({x:px-Math.round(x),y:py-Math.round(y),w,h,color:this.fillStyle});}}, {},x,y,{scale:1.5});return out;};
 const neutral=rects(0,0);
 for(const phase of [.1,.25,.49,.51,.75,.9])assert.deepEqual(rects(phase,phase),neutral,`Subpixel ${phase} must translate a fixed drawing, not deform it`);
});

test('self head and camera share the same physical pixel grid at phone and desktop pixel densities',()=>{
 for(const deviceScale of [1,2,3]){
  const first=screenHead(500,1000,deviceScale);
  for(const phase of [.05,.25,.49,.51,.75,.95])assert.deepEqual(screenHead(500+phase,1000+phase,deviceScale),first,`Physical grid ${deviceScale}/${phase}`);
 }
});
