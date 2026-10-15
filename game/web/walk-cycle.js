import {advanceDistancePhase} from './character-system/clock.js';
const cycleDistance=128,frameCount=8;

/** Return one grounded gait sample. Stops and scene jumps start at rest. */
export function advanceWalkCycle(previous,actor,reducedMotion=false){
 const x=actor.x,y=actor.y,sceneKey=JSON.stringify([actor.scene||'city',actor.scene_id||null,actor.interior_id||null]);
 const walking=!!actor.walking&&!actor.boat&&!actor.phone_open&&actor.pose!=='sit';
 const moved=previous?Math.hypot(x-previous.x,y-previous.y):0;
 const distance=walking&&!reducedMotion&&previous?.sceneKey===sceneKey&&moved<=64?advanceDistancePhase(previous.distance||0,moved,cycleDistance):0;
 return {x,y,sceneKey,walking,distance,frame:Math.floor(distance/(cycleDistance/frameCount))};
}

/** A following pet has its own travel, facing and paw rhythm after its owner stops. */
export function advancePetMotion(previous,pet,dt,reducedMotion=false){
 const sceneKey=JSON.stringify([pet.scene||'city',pet.scene_id||null,pet.interior_id||null]);
 const valid=!!previous&&previous.id===pet.id&&previous.motion_scene===sceneKey&&[pet.x,pet.y,previous.x,previous.y,dt].every(Number.isFinite)&&dt>0;
 const dx=valid?pet.x-previous.x:0,dy=valid?pet.y-previous.y:0,moved=Math.hypot(dx,dy),ordinary=valid&&moved<=Math.max(64,Math.min(.25,dt)*320);
 const walking=ordinary&&moved>.08,facing=walking?(Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down'):['up','down','left','right'].includes(previous?.facing)?previous.facing:['up','down','left','right'].includes(pet.facing)?pet.facing:'down';
 const distance=walking&&!reducedMotion?advanceDistancePhase(previous.motion_distance||0,moved,40):0;
 return {...pet,walking,facing,walk_frame:Math.floor(distance/10),motion_distance:distance,motion_scene:sceneKey};
}
