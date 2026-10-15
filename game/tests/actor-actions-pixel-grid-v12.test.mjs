import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {drawAvatar} from '../web/world.js';
let createCanvas;
try{({createCanvas}=createRequire(import.meta.url)('@napi-rs/canvas'));}catch{({createCanvas}=createRequire(process.execPath)('@napi-rs/canvas'));}

test('every v12 pose stays on the actor and camera physical grid at fractional positions',()=>{
 const kinds=['smoke','eat','drink','pick-litter','throw-litter','pet'],samples=[.04,.18,.32,.48,.66,.8,.9,.98];
 for(const ratio of [1,2,3])for(const facing of ['down','up','right','left'])for(const kind of kinds)for(const progress of samples){
  const render=phase=>{
   const c=createCanvas(180*ratio,130*ratio).getContext('2d'),x=500+phase,y=1000+phase;
   c.setTransform(ratio,0,0,ratio,-Math.round((x-80)*ratio),-Math.round((y-100)*ratio));c.imageSmoothingEnabled=false;
   const action=kind==='pet'?{pet_effect:{id:'pet',kind:'dog',started_at:100,duration:3,target_id:'dog'}}:{action_effect:{id:kind,type:kind,started_at:100,duration:3}};
   drawAvatar(c,{x,y,facing,name:'Actor',avatar:{hairStyle:5},...action},0,false,false,false,100+progress*3);
   return c.getImageData(0,0,180*ratio,130*ratio).data;
  };
  const first=render(0);
  for(const phase of [.1,.25,.49,.51,.75,.9])assert.deepEqual(render(phase),first,`${ratio}/${facing}/${kind}/${progress}: action deformed against a moving physical anchor`);
 }
});
test('seated phone and action preserve the actual planted raster feet',()=>{
 for(const facing of ['down','up','right','left'])for(const kind of ['smoke','eat','drink','pick-litter','throw-litter','pet']){
  const render=progress=>{
   const c=createCanvas(180,130).getContext('2d');c.imageSmoothingEnabled=false;
   const action=kind==='pet'?{pet_effect:{id:'pet',kind:'dog',started_at:100,duration:3,target_id:'dog'}}:{action_effect:{id:kind,type:kind,started_at:100,duration:3}};
   drawAvatar(c,{x:80,y:100,pose:'sit',phone_open:true,facing,name:'Actor',...action},0,false,false,false,100+progress*3);
   return c.getImageData(48,94,62,10).data;
  };
  const first=render(.04);for(const progress of [.18,.32,.48,.66,.8,.9,.98])assert.deepEqual(render(progress),first,`${facing}/${kind}: seated ground contact moved`);
 }
});
test('reduced motion keeps the actor action still throughout each active server timeline',()=>{
 for(const kind of ['smoke','eat','drink','pick-litter','throw-litter','pet']){
  const render=progress=>{
   const c=createCanvas(180,130).getContext('2d');c.imageSmoothingEnabled=false;
   const action=kind==='pet'?{pet_effect:{id:'pet',kind:'cat',started_at:100,duration:3,target_id:'cat'}}:{action_effect:{id:kind,type:kind,started_at:100,duration:3}};
   drawAvatar(c,{x:80,y:100,facing:'right',pose:'sit',phone_open:true,...action},0,false,false,true,100+progress*3);
   return c.getImageData(0,0,180,130).data;
  };
  const first=render(.04);for(const progress of [.18,.32,.48,.66,.8,.9,.98])assert.deepEqual(render(progress),first,`${kind}: reduced motion still animates`);
 }
});
