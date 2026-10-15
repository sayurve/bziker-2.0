import test from 'node:test';
import assert from 'node:assert/strict';
import {interactionActorsData as A} from '../web/interaction-actors-data.js';
import {sourceActorFrame} from '../web/source-actors.js';
import {actionFlight} from '../web/action-effects.js';

const review={checked:true,evidence:['authored attachment test fixture']};
test('paper release uses the selected model and direction palm, including nondefault world scale',()=>{
 const originals={...A.actors};
 try {
  for(const gender of [0,1]){
   const id=gender?'human-female':'human-male',families={hand:{}};
   for(const [n,dir] of ['down','right','up','left'].entries())families.hand[dir]={
    id:`release-fixture-${gender}-${dir}`,status:'approved',artReview:review,
    images:[{path:'release-fixture',width:192,height:64}],anchor:[24,63],sprite_size:[48,64],
    frames:Array.from({length:4},(_,i)=>({x:i*48,y:0,w:48,h:64,hand:[12+n*4+gender,40+i],head:{neckAnchor:[24,30],eyeAnchor:[25,20]},detail:{path:'release-fixture-fine',x:i*96,y:0,w:96,h:128,factor:2}}))
   };
   A.actors[id]={status:'approved',artReview:review,families};
   for(const facing of ['down','right','up','left'])for(const scale of [1.25,2]){
    const actor={x:120,y:220,avatar:{gender},facing};
    const effect={id:'release',type:'throw-litter',started_at:100,duration:3,x:300,y:230};
    const frame=sourceActorFrame(actor.avatar,{action:'throw-litter',facing,actionProgress:.4});
    const point=actionFlight(effect,actor,101.2,false,{scale});
    assert.ok(Math.abs(point.x-(actor.x+(frame.hand[0]-frame.anchor[0])*scale))<1e-8,`${gender}/${facing}: x at actual release palm`);
    assert.ok(Math.abs(point.y-(actor.y+(frame.hand[1]-frame.anchor[1])*scale))<1e-8,`${gender}/${facing}: y at actual release palm`);
    const end=actionFlight(effect,actor,102.25,false,{scale});
    assert.equal(end.x,effect.x);assert.equal(end.y,effect.y-34);
    assert.equal(actionFlight(effect,{...actor,phone_open:true},101.2,false,{scale}),null,'static phone pose must not emit a paper from another gesture hand');
   }
  }
 }finally{A.actors={...originals};}
});
