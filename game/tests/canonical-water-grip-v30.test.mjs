import test from 'node:test';
import assert from 'node:assert/strict';
import {interactionActorsData as A} from '../web/interaction-actors-data.js';
import {sourceActorFrame} from '../web/source-actors.js';
import {waterActionLayout} from '../web/action-effects.js';

test('new water equipment uses the reviewed pose palm, separate supporting grip and authored angle',()=>{
 const original=A.actors['human-male'];
 const review={checked:true,evidence:['water grip fixture']};
 A.actors['human-male']={status:'approved',artReview:review,families:{water:{right:{
  id:'water-grip-fixture',status:'approved',artReview:review,anchor:[24,63],sprite_size:[48,64],
  images:[{path:'water-grip-fixture',width:192,height:64}],
  frames:Array.from({length:4},(_,i)=>({x:i*48,y:0,w:48,h:64,hand:[28+i,38],head:{neckAnchor:[24,29],eyeAnchor:[26,20]},water:{rodHand:[26+i,36],rodAngle:-.7+i*.1,sourceScale:.305},detail:{path:'water-grip-fixture-fine',x:i*96,y:0,w:96,h:128,factor:2}}))
 }}}};
 try{
  for(const type of ['fishing','fish-catch'])for(const progress of [.1,.5])for(const phone_open of [false,true])for(const boat of [false,true]){
   const effect={id:'water',type,started_at:100,duration:2},actor={x:200,y:300,avatar:{gender:0},facing:'right',phone_open,boat};
   const layout=waterActionLayout(effect,actor,100+progress*2,{scale:1.25});
   assert.equal(layout.frame.poseFamily,'water');
   const shown=sourceActorFrame(actor.avatar,{action:type,actionProgress:progress,facing:'right',phoneOpen:phone_open,boat});
   assert.equal(layout.frame.id,shown.id);assert.equal(layout.frame.frameIndex,shown.frameIndex,'equipment and displayed body must select the same pose when the phone is open or aboard a boat');
   const data=layout.frame.rect.water;
   assert.deepEqual(layout.rod.grip,{x:actor.x+(data.rodHand[0]-24)*1.25,y:actor.y+(data.rodHand[1]-63)*1.25});
   const actual=Math.atan2(layout.rod.tip.y-layout.rod.grip.y,layout.rod.tip.x-layout.rod.grip.x);
   assert.ok(Math.abs(actual-data.rodAngle)<1e-9);
  }
 }finally{A.actors['human-male']=original;}
});
