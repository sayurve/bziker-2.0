import test from 'node:test';
import assert from 'node:assert/strict';
import {drawAvatarCanvas,avatarSVG,parts,avatarGeometry} from '../web/avatar.js';

import {render as nativeRender} from './helpers/character-core-native-fixture-v30.mjs';
const render=(input={},options={})=>nativeRender(input,options).grid;
test('source-derived character retains detailed head materials and two separate bright eye areas',()=>{
 const front=render(),side=render({},{facing:'right'});
 assert.equal(front.length,128);assert.equal(front[0].length,96);
 assert.ok(new Set(front.slice(0,64).flat().filter(Boolean)).size>=30,'Source hair, face, outline and eyes retain their material shades');
 const bright=colour=>colour&&[1,3,5].every(i=>parseInt(colour.slice(i,i+2),16)>180);
 const eyeArea=(grid,from,to)=>grid.slice(36,62).flatMap(row=>row.slice(from,to)).filter(bright).length;
 assert.ok(eyeArea(front,0,avatarGeometry.anchorX*2)>0,'Front view has a bright eye area on the left');
 assert.ok(eyeArea(front,avatarGeometry.anchorX*2,avatarGeometry.width*2)>0,'Front view has a separate bright eye area on the right');
 assert.ok(eyeArea(side,0,avatarGeometry.width*2)>0,'Independently supplied profile retains its visible eye');
});
test('all saved parts still produce unique redraws; no unsafe or external raster is embedded',()=>{
 for(const [key,part] of Object.entries(parts))assert.equal(new Set(part.options.map((_,value)=>avatarSVG({[key]:value}))).size,part.options.length,key);
 assert.doesNotMatch(avatarSVG({}),/<image|filter=|https?:|data:/);
});
test('customized movement holds each complete pose twice and retains distinct independent direction art',()=>{
 for(const gender of [0,1])for(const hairStyle of parts.hairStyle.options.keys())for(const facing of ['down','up','left','right']){
  const frames=Array.from({length:8},(_,walkFrame)=>render({gender,hairStyle},{facing,walkFrame,walking:true,running:true}));
  assert.equal(new Set(frames.map(frame=>JSON.stringify(frame))).size,4,`${gender}/${hairStyle}/${facing}: four discrete poses are required`);
  for(let walkFrame=0;walkFrame<8;walkFrame+=2)assert.deepEqual(frames[walkFrame],frames[walkFrame+1],`${gender}/${hairStyle}/${facing}: a held source frame must not interpolate`);
 }
 for(const hairStyle of parts.hairStyle.options.keys()){
  const left=render({hairStyle},{facing:'left'}),right=render({hairStyle},{facing:'right'});
  assert.notDeepEqual(left,right);
  assert.notDeepEqual(left,right.map(row=>[...row].reverse()),'The supplied left sprite is authored independently');
  assert.notDeepEqual(render({hairStyle},{facing:'up'}).slice(0,64),render({hairStyle}).slice(0,64));
 }
});
