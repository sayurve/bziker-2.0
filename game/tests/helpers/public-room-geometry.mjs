import assert from 'node:assert/strict';
import {assertStationReferenceGeometry} from './station-reference-geometry.mjs';

/** Room size is constrained relative to the real actor, not an arbitrary vast floor. */
export function assertPublicRoomGeometry(room){
 if(room.id==='railway'){assertStationReferenceGeometry(room);return;}
 const actor=room.actor_height,b=room.bounds,depth=b.bottom-b.top,width=b.right-b.left;
 assert.equal(actor,80);
 assert.ok(depth>=actor*3&&depth<=actor*6,`${room.id}: depth ${depth} must provide 3–6 actor heights of usable space`);
 assert.ok(width>=actor*7&&width<=actor*15,`${room.id}: width ${width} must remain a compact public room`);
 assert.ok(room.circulation.entry.width>=120,`${room.id}: main entry aisle`);
 for(const p of [room.spawn,room.exit])assert.ok(p.x>=b.left+14&&p.x<=b.right-14&&p.y>=b.top+14&&p.y<=b.bottom-14,`${room.id}: grounded entry/exit`);
}
