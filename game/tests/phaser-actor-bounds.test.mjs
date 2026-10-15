import test from 'node:test';
import assert from 'node:assert/strict';
import * as world from '../web/world.js';
import {avatarGeometry} from '../web/avatar.js';
import {waterActionLayout} from '../web/action-effects.js';

const geometry={scale:avatarGeometry.worldScale??1.25,anchorX:avatarGeometry.anchorX,anchorY:avatarGeometry.anchorY};

function assertInside(bounds,x,y,label){
 assert.ok(x>=bounds.x&&x<=bounds.x+bounds.width&&y>=bounds.y&&y<=bounds.y+bounds.height,
  `${label}: (${x}, ${y}) must fit ${JSON.stringify(bounds)}`);
}

test('native male and female fishing props fit their Phaser texture throughout cast and catch',()=>{
 for(const gender of [0,1])for(const type of ['fishing','fish-catch'])for(const reducedMotion of [false,true]){
  const actor={x:1234.25,y:987.75,avatar:{gender},facing:'right',action_effect:{id:'fishing-qa',type,started_at:100,duration:4}};
  let firstBounds;
  for(let sample=0;sample<100;sample++){
   const now=100+sample*.04,bounds=world.actorRenderBounds(actor,now),layout=waterActionLayout(actor.action_effect,actor,now,{...geometry,reducedMotion});
   if(firstBounds)assert.deepEqual(bounds,firstBounds,'One action keeps stable texture dimensions and ground alignment');else firstBounds=bounds;
   if(!layout?.rod)continue;
   const {rod,float,fish}=layout,label=`${gender}/${type}/${sample}/${reducedMotion}`;
   for(const x of [-rod.width*rod.anchorX,rod.width*(1-rod.anchorX)])for(const y of [-rod.height*rod.anchorY,rod.height*(1-rod.anchorY)])
    assertInside(bounds,rod.grip.x+x*Math.cos(rod.rotation)-y*Math.sin(rod.rotation),rod.grip.y+x*Math.sin(rod.rotation)+y*Math.cos(rod.rotation),label+' rod');
   for(const x of [float.x-float.width/2,float.x+float.width/2])for(const y of [float.y-float.height*.75,float.y+float.height*.25])assertInside(bounds,x,y,label+' float');
   assertInside(bounds,(rod.tip.x+float.x)/2,(rod.tip.y+float.y)/2+4,label+' line control');
   if(fish)for(const x of [fish.x-fish.width/2,fish.x+fish.width/2])for(const y of [fish.y-fish.height/2,fish.y+fish.height/2])assertInside(bounds,x,y,label+' fish');
  }
 }
});

test('ordinary and expired actors retain the compact texture bounds',()=>{
 const actor={x:1234.25,y:987.75},expected={x:1114.25,y:877.75,width:240,height:125};
 assert.deepEqual(world.actorRenderBounds(actor,100),expected);
 assert.deepEqual(world.actorRenderBounds({...actor,action_effect:{id:'other',type:'eat',started_at:100,duration:4}},101),expected);
 assert.deepEqual(world.actorRenderBounds({...actor,action_effect:{id:'expired',type:'fishing',started_at:100,duration:4}},104),expected);
});

test('actor visual revisions follow pose and identity changes independently of translation',()=>{
 const actor={x:100,y:200,facing:'down',pose:'idle',avatar:{gender:0},phone_open:false};
 const revision=world.actorVisualRevision(actor);
 assert.equal(world.actorVisualRevision({...actor,x:101,y:205}),revision);
 for(const change of [{facing:'right'},{pose:'sit'},{phone_open:true},{avatar:{gender:1}},{walking:true},{walkFrame:2},
  {action_effect:{id:'cast',type:'fishing',started_at:100,duration:4}},{pet_effect:{id:'pet'}},{holding:'litter'}])
  assert.notEqual(world.actorVisualRevision({...actor,...change}),revision,JSON.stringify(change));
});
