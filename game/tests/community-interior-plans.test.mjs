import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nearestInteriorAction,interiorSeatedActor} from '../web/interiors.js';
import {sourceInteriorPropLayout} from '../web/source-interiors.js';
import {resolveDesignAsset} from '../web/design-assets.js';
import {sourceActorFrame} from '../web/source-actors.js';
const ids=['arena','results','clans','terrace'],actions={arena:'games',results:'results',clans:'clans',terrace:'messages'},rooms=JSON.parse(readFileSync(new URL('../web/interiors-map.json',import.meta.url))).rooms.filter(r=>ids.includes(r.id));
test('all community service points invoke their existing feature and the exit remains usable',()=>{
 assert.equal(rooms.length,4);
 for(const room of rooms){assert.equal(nearestInteriorAction(room,room.action.x,room.action.y).id,actions[room.id]);assert.equal(nearestInteriorAction(room,room.exit.x,room.exit.y).kind,'exit');}
});
test('every newly placed community seat is a selectable real directional furnishing and an occupied seat is excluded',()=>{
 for(const room of rooms){assert.ok(room.seats.length>=4);for(const seat of room.seats){const prop=room.props.find(p=>p.id===seat.prop_id),layout=sourceInteriorPropLayout(prop,room);assert.ok(layout);assert.equal(layout.direction,seat.facing==='up'?'back':'front');assert.ok(resolveDesignAsset(prop.source_asset,layout.direction));assert.deepEqual(layout.anchor,{x:prop.x+prop.width/2,y:prop.y+prop.height});const at=seat.approach;assert.equal(nearestInteriorAction(room,at.x,at.y).id,seat.id,`${room.id}/${seat.id}: approach invokes this actual seat`);assert.notEqual(nearestInteriorAction(room,at.x,at.y,{players:[{id:'other',bench_id:seat.id}]},'self')?.id,seat.id);}}
});
test('all community seats retain their actual ground, facing and seated source clip when the phone opens',()=>{
 for(const room of rooms)for(const seat of room.seats)for(const gender of[0,1]){
  const player={id:'seat-proof',...seat.seat,bench_id:seat.id,pose:'phone',facing:seat.facing==='up'?'down':'up',phone_open:true},actor=interiorSeatedActor(room,player);
  assert.equal(actor.x,seat.seat.x);assert.equal(actor.y,seat.seat.y);assert.equal(actor.bench_id,seat.id);assert.equal(actor.facing,seat.facing);assert.equal(actor.pose,'sit');assert.equal(actor.phone_open,true);
  const frame=sourceActorFrame({gender},{pose:actor.pose,facing:actor.facing,phoneOpen:actor.phone_open});assert.equal(frame.context,'seated');assert.equal(frame.poseFamily,'seated');assert.equal(frame.frameIndex,0);assert.equal(frame.prop,'phone');assert.equal(frame.facing,seat.facing);const neutral=sourceActorFrame({gender},{pose:'sit',facing:seat.facing});assert.equal(frame.id,neutral.id);assert.deepEqual(frame.rect,neutral.rect);assert.deepEqual(frame.anchor,[24,63]);assert.deepEqual(frame.spriteSize,[48,64]);
 }
});
