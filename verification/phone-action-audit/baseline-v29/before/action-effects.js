import {drawDesignAsset,preloadDesignViews,resolveDesignAsset} from './design-assets.js';
import {sourceActorFrame} from './source-actors.js';

const timelines=Object.freeze({
 eat:[[.15,'retrieve'],[.30,'raise'],[.47,'bite'],[.70,'chew'],[.87,'lower'],[1,'finish']],
 drink:[[.15,'retrieve'],[.30,'raise'],[.47,'sip'],[.70,'sip-hold'],[.87,'lower'],[1,'finish']],
 'pick-litter':[[.18,'reach'],[.38,'crouch'],[.56,'gather'],[.73,'rise'],[.90,'hold'],[1,'finish']],
 'throw-litter':[[.18,'gather'],[.34,'windup'],[.40,'release'],[.75,'flight'],[.90,'recover'],[1,'finish']],
 pet:[[.18,'reach'],[.34,'touch'],[.50,'stroke-down'],[.66,'stroke-up'],[.84,'stroke-down'],[1,'withdraw']],
 smoke:[[.12,'retrieve'],[.24,'raise'],[.38,'inhale'],[.58,'hold'],[.74,'exhale'],[.86,'lower'],[.94,'rest'],[1,'finish']],
 fishing:[[.18,'retrieve'],[.43,'cast'],[.76,'wait'],[1,'settle']],
 'fish-catch':[[.18,'reel'],[.40,'raise'],[.70,'show-catch'],[.88,'stow'],[1,'finish']]
});
/** Discrete drawn poses share an authoritative timeline; mouth contact is held. */
export function actionPoseState(type,progress){
 const timeline=Object.hasOwn(timelines,type)?timelines[type]:null;if(!timeline||!Number.isFinite(progress))return null;
 const p=Math.max(0,Math.min(1,progress)),poseFrame=Math.max(0,timeline.findIndex(([until])=>p<until));
 const index=p===1?timeline.length-1:poseFrame;
 return {type,progress:p,poseFrame:index,stage:timeline[index][1]};
}
/** Short authoritative action gestures, without changing the actor's real position. */
export function actionEffectState(effect,now){
 if(!effect||typeof effect.id!=='string'||!Object.hasOwn(timelines,effect.type)||!Number.isFinite(effect.started_at)||!Number.isFinite(effect.duration)||effect.duration<=0||effect.duration>10||!Number.isFinite(now))return null;
 const elapsed=now-effect.started_at;if(elapsed<0||elapsed>=effect.duration)return null;
 const progress=elapsed/effect.duration;
 return {...effect,...actionPoseState(effect.type,progress),frame:Math.min(3,Math.floor(progress*4))};
}
/** Paper leaves the hand once, follows an arc and finishes in the target bin slot. */
export function actionFlight(effect,actor,now,reducedMotion=false){
 const action=actionEffectState(effect,now);
 if(reducedMotion||action?.type!=='throw-litter'||action.progress<.4||action.progress>.75||![actor?.x,actor?.y,effect.x,effect.y].every(Number.isFinite))return null;
 const t=Math.max(0,Math.min(1,(action.progress-.4)/.35)),side=actor.facing==='left'?-1:1;
 const start={x:actor.x+side*18,y:actor.y-39},end={x:effect.x,y:effect.y-34},height=Math.min(40,Math.max(18,Math.hypot(end.x-start.x,end.y-start.y)*.24));
 return {x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t-Math.sin(Math.PI*t)*height,progress:t};
}
export function drawActionFlight(context,effect,actor,now,reducedMotion=false){
 const point=actionFlight(effect,actor,now,reducedMotion);if(!point)return;
 const x=Math.round(point.x),y=Math.round(point.y),rect=(dx,dy,w,h,color)=>{context.fillStyle=color;context.fillRect(x+dx,y+dy,w,h);};
 rect(-3,-2,6,1,'#f6f3e7');rect(-4,-1,8,3,'#e7eadf');rect(-2,0,3,1,'#b4b7a6');rect(2,1,3,2,'#748978');rect(-2,2,4,1,'#9baa99');
}

const waterEquipment=Object.freeze({rod:'bziker-water-fishing-rod',float:'bziker-water-large-fishing-float',fish:'bziker-water-freshwater-fish-catch'});
/** Only three independent objects; no water scene or animation film is loaded. */
export function preloadWaterActions(loader){return preloadDesignViews(Object.values(waterEquipment).map(id=>({id})),loader);}
const mix=(a,b,t)=>a+(b-a)*t;
// These actor-only male sheets have no exported hand annotations. Coordinates
// were measured on their native 48×64 cells; the backswing uses the upper hand.
const maleWaterHands=Object.freeze({
 'male-fishing':[[33.4,41.5],[37.1,31.8],[17,25],[37.4,28.9],[32.3,39],[33.5,39.6],[27.4,33.9],[40.9,30.2],[36.4,34.9],[37.3,35],[37.6,34.8],[35.4,35.9]],
 'male-fish-pocket':[[38,35],[24,38],[21,38],[21,38],[16,40],[17,40],[15,24],[17,44]]
});
/** The source engine grips the 1428×1000 rod at (430,760). Its runtime
 * PNG is cropped from the original 1536×1024 image, so retain that grip
 * through the crop instead of centering the entire rod on the character. */
function rodSourceGeometry(asset){
 const [left,top,right,bottom]=asset.source_bbox;
 const grip={x:(430/1428*1536-left)/(right-left),y:(760/1000*1024-top)/(bottom-top)};
 const tip={x:(1390/1428*1536-left)/(right-left),y:(80/1000*1024-top)/(bottom-top)};
 return {grip,tip,angle:Math.atan2((tip.y-grip.y)*asset.height,(tip.x-grip.x)*asset.width)};
}
/** Equipment follows exactly the same whole pose and ground anchor as the
 * avatar. The supplied water poses face right; they are never mirrored. */
export function waterActionLayout(effect,actor,now,options={}){
 const state=actionEffectState(effect,now);
 if(!state||!['fishing','fish-catch'].includes(state.type)||![actor?.x,actor?.y].every(Number.isFinite))return null;
 const progress=options.reducedMotion?.5:state.progress,scale=options.scale??1.25;
 if(!Number.isFinite(scale)||scale<=0)return null;
 const frame=sourceActorFrame(actor.avatar||{},{action:state.type,actionProgress:progress,facing:'right',pose:actor.pose,boat:!!actor.boat});
 // The native male pocket sequence already draws the caught fish and uses
 // both arms to store it; adding a rod here would invent an unsupported grip.
 if(frame.id==='male-fish-pocket')return {type:state.type,progress,stage:state.stage,direction:'right',frame,rod:null,float:null,fish:null};
 const authoredHand=frame.hand||maleWaterHands[frame.id]?.[frame.frameIndex];
 if(!authoredHand?.every(Number.isFinite))return null;
 const anchorX=options.anchorX??frame.anchor[0],anchorY=options.anchorY??frame.anchor[1];
 const point=hand=>({x:actor.x+(hand[0]-anchorX)*scale,y:actor.y+(hand[1]-anchorY)*scale});
 const hand=point(authoredHand),sourceScale=frame.rect.sourceScale??.305,unit=sourceScale*scale;
 // After the catch the source rod is supported on the lap while the free
 // hand carries the fish to the pocket (engine.js waterScene lap offset).
 const grip=state.type==='fish-catch'?point(frame.rect.rod_hand||[frame.anchor[0]-4*sourceScale,frame.anchor[1]-71*sourceScale]):hand;
 const asset=resolveDesignAsset(waterEquipment.rod);if(!asset?.source_bbox)return null;
 const source=rodSourceGeometry(asset),width=1428*.19*unit*(asset.source_bbox[2]-asset.source_bbox[0])/1536,height=width*asset.height/asset.width;
 const castAngles=frame.id==='male-fishing'?[-.3,-.6,-2.05,-.14]:[-.3,-1.5,-.85,-.14];
 const angle=state.type==='fishing'&&progress<.5?castAngles[frame.frameIndex%4]:state.type==='fish-catch'?-.1:-.14;
 const rotation=angle-source.angle,dx=(source.tip.x-source.grip.x)*width,dy=(source.tip.y-source.grip.y)*height;
 const tip={x:grip.x+dx*Math.cos(rotation)-dy*Math.sin(rotation),y:grip.y+dx*Math.sin(rotation)+dy*Math.cos(rotation)};
 const cast=Math.min(1,progress/.43),float=state.type==='fishing'?{
  x:mix(actor.x+58*unit,actor.x+491*unit,cast),y:mix(actor.y-90*unit,actor.y+33*unit,cast)-Math.sin(Math.PI*cast)*130*unit
 }:{x:actor.x+491*unit,y:actor.y+33*unit};
 const fishVisible=state.type==='fish-catch'&&progress<.7-1e-9&&!frame.embeddedProps;
 const travel=Math.min(1,progress/.4),fish=fishVisible?{assetId:waterEquipment.fish,x:mix(float.x,hand.x,travel),y:mix(float.y+30*unit,hand.y,travel),width:52*unit,height:52*unit}:null;
 if(state.type==='fish-catch'){
  // The float follows the reeled catch, then returns to the water as the
  // fish is held and pocketed. No root movement is borrowed from the film.
  const returning=Math.max(0,Math.min(1,(progress-.4)/.1)),lift=travel*(1-returning);
  float.x=mix(float.x,hand.x,lift);float.y=mix(float.y,hand.y-55*unit,lift);
 }
 return {type:state.type,progress,stage:state.stage,direction:'right',frame,
  rod:{assetId:waterEquipment.rod,grip,tip,width,height,rotation,anchorX:source.grip.x,anchorY:source.grip.y},
  float:{...float,assetId:waterEquipment.float,width:43*unit,height:43*unit,anchorY:.75},fish};
}
/** Layer these native props after the avatar, before nameplates. */
export function drawWaterAction(c,effect,actor,now,options={}){
 const layout=waterActionLayout(effect,actor,now,options);if(!layout?.rod)return false;
 const {rod,float,fish}=layout;let drawn=false;
 c.save();c.translate(rod.grip.x,rod.grip.y);c.rotate(rod.rotation);
 // The source rod image also contains a tiny hanging float at its far edge;
 // crop that edge because the independently supplied float moves on the line.
 c.beginPath();c.rect(-rod.width*rod.anchorX,-rod.height*rod.anchorY,rod.width*.972,rod.height);c.clip();
 drawn=drawDesignAsset(c,rod.assetId,0,0,rod.width,rod.height,{anchorX:rod.anchorX,anchorY:rod.anchorY})||drawn;c.restore();
 c.save();c.strokeStyle='#e7e0c6';c.lineWidth=.65;c.beginPath();c.moveTo(rod.tip.x,rod.tip.y);c.quadraticCurveTo((rod.tip.x+float.x)/2,(rod.tip.y+float.y)/2+4,float.x,float.y-float.height*.71);c.stroke();c.restore();
 drawn=drawDesignAsset(c,float.assetId,float.x,float.y,float.width,float.height,{anchorY:float.anchorY})||drawn;
 if(fish){
  if(layout.progress<.4){c.save();c.strokeStyle='#e7e0c6';c.lineWidth=.65;c.beginPath();c.moveTo(float.x,float.y+float.height*.2);c.lineTo(fish.x,fish.y-fish.height*.35);c.stroke();c.restore();}
  drawn=drawDesignAsset(c,fish.assetId,fish.x,fish.y,fish.width,fish.height,{anchorY:.5})||drawn;
 }
 return drawn;
}
