import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as effects from '../web/action-effects.js';
import {sourceActorFrame} from '../web/source-actors.js';
import {interactionActorsData as A} from '../web/interaction-actors-data.js';
import {resolveDesignAsset} from '../web/design-assets.js';

const cast=Object.freeze({id:'cast',type:'fishing',item_id:'rod',started_at:100,duration:2});
const caught=Object.freeze({id:'caught',type:'fish-catch',item_id:'fish',started_at:110,duration:3});
const actor=Object.freeze({x:5300,y:2000,facing:'left',avatar:Object.freeze({gender:1}),boat:Object.freeze({id:'boat'})});

test('native water equipment follows the authored hand without moving or mirroring the actor',()=>{
 assert.equal(typeof effects.waterActionLayout,'function');
 const saved=JSON.stringify(actor),scale=1.25;
 for(const progress of [0,.1,.25,.45,.6,.85]){
  const now=100+2*progress,frame=sourceActorFrame(actor.avatar,{action:'fishing',actionProgress:progress,facing:actor.facing,pose:actor.pose,boat:!!actor.boat});
  const layout=effects.waterActionLayout(cast,actor,now,{scale,anchorX:24,anchorY:63});
  assert.ok(layout.rod&&layout.float);assert.equal(layout.direction,'right');assert.equal(layout.fish,null);
  assert.equal(layout.rod.grip.x,actor.x+((frame.water?.rodHand||frame.hand)[0]-24)*scale);
  assert.equal(layout.rod.grip.y,actor.y+((frame.water?.rodHand||frame.hand)[1]-63)*scale);
  assert.ok(layout.rod.width>70&&layout.rod.width<120);
  assert.ok(layout.float.x>actor.x,'the supplied fishing poses face right');
 }
 assert.equal(JSON.stringify(actor),saved);
});

test('an uncaught cast cannot show a fish; the successful catch is pocketed once',()=>{
 assert.equal(typeof effects.waterActionLayout,'function');
 for(const progress of [0,.2,.5,.8,.999])assert.equal(effects.waterActionLayout(cast,actor,100+2*progress).fish,null);
 for(const progress of [0,.2,.5,.69])assert.equal(effects.waterActionLayout(caught,actor,110+3*progress).fish.assetId,'bziker-water-freshwater-fish-catch');
 for(const progress of [.7,.85,.99])assert.equal(effects.waterActionLayout(caught,actor,110+3*progress).fish,null);
 assert.equal(effects.waterActionLayout(cast,actor,99),null);
 assert.equal(effects.waterActionLayout(cast,actor,102),null);
 assert.equal(effects.waterActionLayout({...cast,duration:0},actor,100),null);
 assert.equal(effects.waterActionLayout({...cast,type:'eat'},actor,100),null);
 assert.equal(effects.waterActionLayout(cast,{...actor,x:NaN},101),null);
});

test('male actor-only frames use their measured hands without duplicating the embedded catch',()=>{
 const previous=A.actors['human-male'];A.actors['human-male']={...previous,families:{...previous.families,water:{}}};try{
 const male={...actor,avatar:{gender:0}};
 for(const progress of [0,.15,.25,.4,.6,.9])assert.ok(effects.waterActionLayout(cast,male,100+2*progress).rod);
 const backswing=effects.waterActionLayout(cast,male,100.5);
 assert.deepEqual(backswing.rod.grip,{x:male.x+(17-24)*1.25,y:male.y+(25-63)*1.25});
 assert.ok(backswing.rod.tip.x<backswing.rod.grip.x,'backswing remains behind the native raised hand');
 for(const progress of [0,.2,.5,.9]){const layout=effects.waterActionLayout(caught,male,110+3*progress);assert.equal(layout.fish,null,'native male fish already belongs to the supplied pose');assert.equal(layout.rod,null,'the pocket sequence has no free hand for an invented rod');}
 }finally{A.actors['human-male']=previous}
});

test('only the three independent native equipment PNGs are decoded and drawn',async()=>{
 assert.equal(typeof effects.preloadWaterActions,'function');assert.equal(typeof effects.drawWaterAction,'function');
 const require=createRequire(process.execPath),{createCanvas,loadImage}=require('@napi-rs/canvas'),decoded=[];
 const roots=new URL('../',import.meta.url);
 await effects.preloadWaterActions(url=>{decoded.push(url);return loadImage(fileURLToPath(new URL(url.replace(/^\//,''),roots)));});
 assert.deepEqual(new Set(decoded),new Set(['bziker-water-fishing-rod','bziker-water-large-fishing-float','bziker-water-freshwater-fish-catch'].map(id=>resolveDesignAsset(id).url)));
 const local={...actor,x:150,y:200},canvas=createCanvas(380,300),c=canvas.getContext('2d'),calls=[],draw=c.drawImage.bind(c);
 c.drawImage=(im,...args)=>{calls.push(im);draw(im,...args);};
 assert.equal(effects.drawWaterAction(c,cast,local,101.2),true);
 assert.equal(calls.length,2,'cast must draw a rod and a float, without a fish');
 assert.ok(c.getImageData(0,0,380,300).data.some((v,i)=>i%4===3&&v>127));
 calls.length=0;
 assert.equal(effects.drawWaterAction(c,caught,local,111.5),true);
 assert.equal(calls.length,3,'successful catch draws its native fish');
 assert.equal(effects.drawWaterAction(c,cast,local,103),false);
});
