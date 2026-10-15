import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceInteriorPropLayout} from '../../web/source-interiors.js';

const reference=JSON.parse(readFileSync(new URL('../../web/interiors-map-v19.json',import.meta.url))).rooms.find(r=>r.id==='railway');

export function assertStationReferenceGeometry(room){
 assert.equal(room.id,'railway');
 const benches=room.props.filter(p=>p.id.startsWith('bench-'));
 const sourceBenches=reference.props.filter(p=>p.id==='sofa-1'||p.id==='sofa-2');
 assert.equal(benches.length,2);assert.equal(sourceBenches.length,2);
 const benchWidth=benches.reduce((sum,p)=>sum+sourceInteriorPropLayout(p,room).bounds.width,0)/benches.length;
 const sourceWidth=sourceBenches.reduce((sum,p)=>sum+p.source_pixel_bbox[2],0)/sourceBenches.length;
 const scale=benchWidth/sourceWidth;
 const sourceFloor=(reference.bounds.right-reference.bounds.left)/reference.source_scene.scale;
 const relativeSpan=(room.bounds.right-room.bounds.left)/benchWidth/(sourceFloor/sourceWidth);
 assert.ok(relativeSpan>=.85&&relativeSpan<=1.15,`station floor/bench span is ${relativeSpan} times the source composition`);
 // Preserve source depth at the same bench scale, allowing half an actor
 // of extra depth for body-radius clearances and seated approach points.
 const calibratedDepth=(reference.bounds.bottom-reference.bounds.top)/reference.source_scene.scale*scale;
 const depth=room.bounds.bottom-room.bounds.top;
 assert.equal(room.actor_height,80);
 assert.ok(depth>=calibratedDepth&&depth<=calibratedDepth+room.actor_height/2,
  `station depth ${depth} exceeds its source-calibrated ${calibratedDepth} plus approach clearance`);
}
