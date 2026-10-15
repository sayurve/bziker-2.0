import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceInteriorDetailLayout} from '../web/source-interiors.js';

test('indoor mats and floor lights stay on the actual walking floor, above the front cutaway',()=>{
 const rooms=JSON.parse(readFileSync(new URL('../web/interiors-map.json',import.meta.url))).rooms;
 let checked=0;
 for(const room of rooms)for(const item of sourceInteriorDetailLayout(room).filter(d=>['clothing-interior-entry-mat','bzik-hub-interior-floor-light'].includes(d.assetId))){
  const b=item.bounds,r=room.bounds;
  assert.ok(b.x>=r.left&&b.x+b.width<=r.right,`${room.id}:${item.id} outside the side boundary`);
  assert.ok(b.y>=r.top&&b.y+b.height<=r.bottom,`${room.id}:${item.id} floats past the physical floor`);checked++;
 }
 assert.ok(checked>=5,'cover real mats and hub floor fixtures');
});
