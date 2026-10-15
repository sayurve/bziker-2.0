import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceInteriorPropLayout,sourceInteriorDetailLayout} from '../web/source-interiors.js';
import {worldCamera,interiorCameraBounds} from '../web/world-camera.js';

const map=JSON.parse(readFileSync(new URL('../web/interiors-map.json',import.meta.url)));
const reference=JSON.parse(readFileSync(new URL('../web/interiors-map-v19.json',import.meta.url)));
const ids=['profile','shop-clothes','shop-food','shop-furniture'];
const rooms=ids.map(id=>map.rooms.find(r=>r.id===id));

test('the four integrated shop plans retain feature actions while profile is a separate consultation studio',()=>{
 for(const room of rooms){assert.ok(room.layout_version>=26,room.id);assert.equal(room.actor_height,80);assert.equal(room.action.id,reference.rooms.find(r=>r.id===room.id).action.id);}
 const profile=rooms[0],clothes=rooms[1];
 assert.ok(profile.props.some(p=>p.type==='sofa'));
 assert.equal(profile.props.filter(p=>p.type==='rack').length,0);
 assert.equal(profile.props.filter(p=>p.type==='fitting').length,1);
 assert.equal(clothes.props.filter(p=>p.type==='rack').length,2);
 assert.equal(clothes.props.filter(p=>p.type==='fitting').length,2);
 assert.equal(profile.seats.length,3);
 assert.ok(!sourceInteriorDetailLayout(profile).some(d=>d.assetId==='clothing-interior-sign-clothes'));
 const coffee=rooms[3].props.find(p=>p.id==='showroom-coffee-table');
 assert.equal(coffee.type,'coffee-table');assert.equal(coffee.visual.height,45);
 for(const room of rooms)for(const p of room.props.filter(p=>p.type==='bookcase'))assert.equal(p.visual.height,130);
});

test('shop entry exposes furnishings in the real mobile and wide camera instead of an empty central floor',()=>{
 for(const room of rooms)for(const viewport of [{width:390,height:800,dpr:2},{width:1204,height:880,dpr:2}]){
  const view=worldCamera({...viewport,zoom:1.25,sceneWidth:room.width,sceneHeight:room.height,position:room.spawn,sceneBounds:interiorCameraBounds(room)});
  const visible=room.props.filter(p=>{const b=sourceInteriorPropLayout(p,room).bounds;
   return (Math.min(b.x+b.width,view.x+view.width)-Math.max(b.x,view.x))*view.scale>=16&&
          (Math.min(b.y+b.height,view.y+view.height)-Math.max(b.y,view.y))*view.scale>=16;
  });
  assert.ok(visible.length>=(viewport.width===390?2:5),`${room.id}: ${viewport.width}px entry sees ${visible.length} furnishings`);
 }
});

test('clothing floor span remains calibrated to the two rails in its actual source reference',()=>{
 const room=rooms[1],old=reference.rooms.find(r=>r.id==='shop-clothes');
 const rails=room.props.filter(p=>p.type==='rack'),source=old.props.filter(p=>p.id==='rack-1'||p.id==='rack-2');
 const actual=(room.bounds.right-room.bounds.left)/(rails.reduce((n,p)=>n+sourceInteriorPropLayout(p,room).bounds.width,0)/2);
 const expected=(old.bounds.right-old.bounds.left)/old.source_scene.scale/(source.reduce((n,p)=>n+p.source_pixel_bbox[2],0)/2);
 assert.ok(actual/expected>=.85&&actual/expected<=1.15,`floor/rail span ${actual/expected} times the actual reference`);
});

test('food uses genuine glass and food pixels on empty supports rather than a garment counter or a whole kiosk',()=>{
 const room=rooms[2],details=sourceInteriorDetailLayout(room);
 assert.ok(room.source_gaps.some(g=>g.includes('No dedicated grocery interior')));
 assert.equal(room.props.filter(p=>p.type==='food-display').length,4);
 assert.ok(room.props.every(p=>!p.source_asset.startsWith('clothing-')));
 assert.equal(details.filter(d=>d.nativeProp==='sandwich').length,5);
 const glass=details.filter(d=>d.assetId==='food-kiosk');
 assert.equal(glass.length,5);assert.ok(glass.every(d=>d.sourceRect?.length===4&&d.supportId));
 assert.ok(!room.surfaces.some(s=>s.asset_id==='food-kiosk'));
});
