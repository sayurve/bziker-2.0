import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {drawAvatar} from '../web/world.js';
let createCanvas;
try{({createCanvas}=createRequire(import.meta.url)('@napi-rs/canvas'));}
catch{({createCanvas}=createRequire(process.execPath)('@napi-rs/canvas'));}

test('the shadow, nickname, clan flag and sprite follow one stable physical pixel anchor',()=>{
 for(const ratio of [1,2,3])for(const showNicknames of [false,true]){
  const render=phase=>{
   const c=createCanvas(280*ratio,200*ratio).getContext('2d'),x=500+phase,y=1000+phase;
   c.setTransform(ratio,0,0,ratio,-Math.round((x-140)*ratio),-Math.round((y-140)*ratio));c.imageSmoothingEnabled=false;
   drawAvatar(c,{x,y,name:'Михаил',facing:'down',avatar:{hairStyle:11},clan:{color:'#7fbaad'}},1000,true,showNicknames);
   return c.getImageData(0,0,280*ratio,200*ratio).data;
  };
  const first=render(0);
  for(const phase of [.1,.25,.49,.51,.75,.9])assert.deepEqual(render(phase),first,`Actor attachments shake at ${ratio}/${phase}`);
 }
});
