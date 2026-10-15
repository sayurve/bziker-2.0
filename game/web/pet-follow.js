/** Position only: the pet's distance clock remains in advancePetMotion. */
const sceneKey=actor=>JSON.stringify([actor.scene||'city',actor.scene_id||null,actor.interior_id||null]);
export function followPetPosition(owner,previous,dt=.04){
 const pet=owner.pet;if(!pet||!['dog','cat'].includes(pet.kind))return null;
 const behind={left:[41,15],right:[-41,15],up:[-30,35],down:[-30,-17]}[owner.facing||'down']||[-30,-17];
 const x=owner.x+behind[0],y=owner.y+behind[1],room=sceneKey(owner);
 const finitePrevious=previous&&[previous.x,previous.y].every(Number.isFinite);
 const sameIdentity=previous?.id===pet.id&&previous?.kind===pet.kind&&previous?.owner_id===owner.id;
 const sameRoom=previous&&(previous.motion_scene??sceneKey(previous))===room;
 const ownerJump=previous&&[previous.owner_x,previous.owner_y].every(Number.isFinite)&&Math.hypot(owner.x-previous.owner_x,owner.y-previous.owner_y)>64;
 const continuous=finitePrevious&&sameIdentity&&sameRoom&&!ownerJump&&Number.isFinite(dt)&&dt>=0;
 const ratio=continuous?Math.min(1,dt*8):1;
 return {owner_id:owner.id,id:pet.id,kind:pet.kind,x:continuous?previous.x+(x-previous.x)*ratio:x,y:continuous?previous.y+(y-previous.y)*ratio:y,owner_x:owner.x,owner_y:owner.y,scene:owner.scene||'city',scene_id:owner.scene_id||null,interior_id:owner.interior_id||null,motion_scene:room};
}
