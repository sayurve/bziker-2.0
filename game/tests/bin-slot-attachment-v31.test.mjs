import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import * as city from '../web/source-city.js';
import {resolveDesignAsset,designCrop,designDestination} from '../web/design-assets.js';
import {actionFlight} from '../web/action-effects.js';
import {drawAvatar,worldMap} from '../web/world.js';
import {preloadNativeAvatars} from './helpers/native-avatar-fixture-v30.mjs';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const bins=worldMap.activities.filter(x=>x.action==='trash-bin');
// Measured in the actual street-bin PNG: opaque dark opening, not its base.
const nativeOpening={x:291,y:272};
function expectedSlot(bin){const d=bin.design,a=resolveDesignAsset(d.assetId),crop=designCrop(a,{crop:d.crop}),dest=designDestination(a,d.x,d.y,d.width,d.height,{anchorX:d.anchorX,anchorY:d.anchorY,crop:d.crop});return {x:dest.x+(nativeOpening.x-crop.x)*dest.width/crop.width,y:dest.y+(nativeOpening.y-crop.y)*dest.height/crop.height};}
test('both live bins map the measured native opening through their real crop and anchor',async()=>{
 assert.equal(typeof city.sourceBinSlot,'function');assert.equal(bins.length,2);
 const asset=resolveDesignAsset('street-bin'),image=await loadImage(readFileSync(new URL('..'+asset.url,import.meta.url))),canvas=createCanvas(asset.width,asset.height),c=canvas.getContext('2d');c.drawImage(image,0,0);const pixel=c.getImageData(nativeOpening.x,nativeOpening.y,1,1).data;assert.ok(pixel[3]>250,'native opening pixel is effectively opaque (asset alpha 253)');assert.ok([...pixel.slice(0,3)].every(v=>v<70),'landmark is inside the native dark slot');
 for(const bin of bins){const saved=JSON.stringify(bin),actual=city.sourceBinSlot(bin),expected=expectedSlot(bin);assert.deepEqual(actual,expected);assert.ok(actual.y<bin.design.y-40,'opening is above the base');assert.ok(Math.abs(actual.y-(bin.y-34))>40,'interaction approach is not the artwork opening');assert.equal(JSON.stringify(bin),saved);}
 const moved={...bins[0],design:{...bins[0].design,x:200,y:300,width:70,height:138.6166,anchorX:0}};assert.deepEqual(city.sourceBinSlot(moved),expectedSlot(moved));assert.equal(city.sourceBinSlot({}),null);assert.equal(city.sourceBinSlot({...bins[0],design:{...bins[0].design,assetId:'tree-oak'}}),null);
});
test('paper reaches the supplied visible slot and preserves the existing release palm',()=>{
 const bin=bins[0],target=expectedSlot(bin),effect={id:'throw-native-bin',type:'throw-litter',started_at:100,duration:3,x:bin.x,y:bin.y},actor={x:bin.x-20,y:bin.y+40,facing:'up',avatar:{gender:0}};
 const ordinary=actionFlight(effect,actor,101.2),slotted=actionFlight(effect,actor,101.2,false,{target});assert.deepEqual(slotted,ordinary,'same source palm at the release instant');assert.deepEqual(actionFlight(effect,actor,102.25,false,{target}),{...target,progress:1});assert.equal(actionFlight(effect,{...actor,phone_open:true},102.25,false,{target}),null);
});
test('real world avatar painter sends the paper into the native bin opening',async()=>{
 await preloadNativeAvatars();const bin=bins[0],expected=expectedSlot(bin),canvas=createCanvas(220,240),c=canvas.getContext('2d');c.translate(110-bin.x,180-bin.y);
 const actor={id:'one-avatar-slot',x:bin.x-20,y:bin.y+40,facing:'up',avatar:{gender:0,hairStyle:7,hairColor:6,skin:3,shirtStyle:2,shirtColor:8},action_effect:{id:'native-bin',target_id:bin.id,type:'throw-litter',started_at:100,duration:3,x:bin.x,y:bin.y}};
 drawAvatar(c,actor,0,false,false,false,102.25,[],false);
 const x=Math.round(110+expected.x-bin.x),y=Math.round(180+expected.y-bin.y),pixels=c.getImageData(x-4,y-2,9,5).data;let paper=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>180&&pixels[i+1]>180&&pixels[i+2]>150&&pixels[i+3]>200)paper++;assert.ok(paper>=8,`no released paper at artwork slot (${paper} pixels)`);
});
