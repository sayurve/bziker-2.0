import test from 'node:test';
import assert from 'node:assert/strict';
import {avatarSVG,drawAvatarCanvas,headgearSVG,defaultAvatar,parts,avatarGeometry} from '../web/avatar.js';

import {render} from './helpers/character-core-native-fixture-v30.mjs';
function svgRects(svg){return [...svg.matchAll(/<rect x="([0-9.]+)" y="([0-9.]+)" width="([0-9.]+)" height="([0-9.]+)" fill="(#[0-9a-f]{6})"\/>/gi)]
  .map(([,x,y,w,h,color])=>({x:+x,y:+y,w:+w,h:+h,color}));}
const rgb=color=>[1,3,5].map(index=>parseInt(color.slice(index,index+2),16));
function materialColours(grid,base,fromY,toY,maxDistance){
  const b=rgb(base);
  return new Set(grid.slice(fromY,toY).flat().filter(Boolean).filter(colour=>rgb(colour).reduce((sum,value,index)=>sum+Math.abs(value-b[index]),0)<=maxDistance));
}

test('skin, hair and cloth contain material shades instead of single flat colour fills',()=>{
  const {grid}=render();
  assert.ok(materialColours(grid,parts.skin.colors[defaultAvatar.skin],20,65,170).size>=3,'Face needs a base, highlight and shaded plane');
  assert.ok(materialColours(grid,parts.hairColor.colors[defaultAvatar.hairColor],10,55,130).size>=3,'Hair needs visible shaded strand clusters');
  assert.ok(materialColours(grid,parts.shirtColor.colors[defaultAvatar.shirtColor],66,94,180).size>=3,'Clothes need material edges and volume');
});

test('shared SVG and canvas stay inside a complete 48 by 64 reference sprite envelope',()=>{
  const sample={...defaultAvatar,hairStyle:11,shirtStyle:2,headwear:3,outfit:3};
  const svg=avatarSVG(sample),{rectangles}=render(sample);
  assert.match(svg,/viewBox="0 0 48 64"/);
  assert.deepEqual(svgRects(svg),rectangles,'Catalog, cloud/card and city must use exactly the same pixel geometry');
  for(const facing of ['down','up','left','right'])for(const pose of ['idle','sit','phone','smoke']){
    for(const shape of render(sample,{facing,pose,walkFrame:3,poseFrame:1}).rectangles){
      assert.ok([shape.x,shape.y,shape.w,shape.h].every(v=>Number.isInteger(v*2)));
      assert.ok(shape.x>=0&&shape.y>=0&&shape.w>0&&shape.h>0&&shape.x+shape.w<=avatarGeometry.width&&shape.y+shape.h<=64,
        `${facing}/${pose}: sprite overflows its frame`);
      assert.match(shape.color,/^#[0-9a-f]{6}$/i);
    }
  }
});

test('four directions and walking phases remain distinct while catalog values stay deterministic',()=>{
  const sample={skin:6,hairStyle:7,shirtStyle:3,accessory:5,pantsStyle:3};
  assert.equal(new Set(['down','up','left','right'].map(facing=>JSON.stringify(render(sample,{facing}).grid))).size,4);
  assert.equal(new Set([0,2,4,6].map(walkFrame=>JSON.stringify(render(sample,{walkFrame,walking:true,running:true}).grid))).size,4);
  assert.equal(avatarSVG(sample),avatarSVG(sample));
  for(const [key,part] of Object.entries(parts)){
    const images=part.options.map((_,value)=>JSON.stringify(render({[key]:value}).grid));
    assert.equal(new Set(images).size,part.options.length,`${key}: catalog options lost their visual identity`);
  }
});

test('headwear previews contain only a face-free head and generic jury cannot reveal any customization or pose',()=>{
  const plain=headgearSVG({headwear:2}),wardrobe=headgearSVG({headwear:2,shirtStyle:3,pantsStyle:2,outfit:3,accessory:5});
  assert.equal(plain,wardrobe,'Head preview must not include torso, costume or accessory pixels');
  assert.match(plain,/viewBox="0 0 48 40"/);
  assert.notEqual(headgearSVG({headwear:1}),headgearSVG({headwear:4}));
  const facial=render({},{headOnly:true}).grid,faceFree=render({},{headOnly:true,face:false}).grid;
  assert.notDeepEqual(faceFree,facial,'Head preview masking must remove eyes and mouth');
  assert.ok(faceFree.flat().some(Boolean),'Head silhouette must remain after facial details are hidden');
  for(let headwear=0;headwear<parts.headwear.options.length;headwear++)assert.equal(headgearSVG({headwear,accessory:1}),headgearSVG({headwear,accessory:0}),'Headwear preview must omit face accessories');
  const anonymous=render({},{generic:true});
  for(const pose of ['idle','sit','phone','smoke']){
    assert.deepEqual(render({gender:1,skin:7,hairStyle:11,hairColor:8,shirtStyle:3,outfit:3,headwear:4,accessory:5},
      {generic:true,pose,poseFrame:1}).rectangles,anonymous.rectangles);
  }
});


test('reference head and body have shaped silhouettes and narrower independent side profiles',()=>{
  const front=render().grid,side=render({},{facing:'right'}).grid;
  const headWidths=front.slice(10,62).map(row=>row.filter(Boolean).length).filter(Boolean);
  assert.ok(new Set(headWidths).size>=5,'The supplied crown and jaw have deliberate stepped edges');
  const averageWidth=grid=>grid.slice(70,90).reduce((sum,row)=>sum+row.filter(Boolean).length,0)/20;
  assert.ok(averageWidth(side)<averageWidth(front),'Side view needs a narrower torso profile');
  assert.ok(front.slice(64,96).flat().filter(Boolean).length>front.slice(96,128).flat().filter(Boolean).length,'Shoulders, jacket and arms form a broader silhouette than the legs');
});
