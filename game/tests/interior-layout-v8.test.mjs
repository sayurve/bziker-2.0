import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertPublicRoomGeometry} from './helpers/public-room-geometry.mjs';
const map=JSON.parse(readFileSync(new URL('../web/interiors-map.json',import.meta.url)));
const roomIds=['railway','clans','arena','profile','results','messages','terrace','shop-food','shop-clothes','shop-furniture','casino'];
const city=JSON.parse(readFileSync(new URL('../web/world-map.json',import.meta.url)));
const doors=Object.fromEntries(city.buildings.map(b=>[b.id,[b.door.x,b.door.y]]));
const actions={railway:'travel',clans:'clans',arena:'games',profile:'profile',results:'results',messages:'messages',terrace:'messages','shop-food':'shop-food','shop-clothes':'shop-clothes','shop-furniture':'shop-furniture',casino:'casino'};
const geometry=p=>({x:p.x,y:p.y,width:p.width,height:p.height});
function clear(room,x,y,radius=14){const b=room.bounds;return x>=b.left+radius&&x<=b.right-radius&&y>=b.top+radius&&y<=b.bottom-radius&&!room.solids.some(s=>x>s.x-radius&&x<s.x+s.width+radius&&y>s.y-radius&&y<s.y+s.height+radius);}
function reachable(room,targets){const step=4,queue=[room.spawn],seen=new Set([`${room.spawn.x}:${room.spawn.y}`]),found=new Set();for(let head=0;head<queue.length;head++){const p=queue[head];targets.forEach((target,i)=>{if(Math.hypot(target.x-p.x,target.y-p.y)<=step*1.6&&clear(room,target.x,target.y))found.add(i);});for(const [dx,dy] of [[step,0],[-step,0],[0,step],[0,-step]]){const x=p.x+dx,y=p.y+dy,key=`${x}:${y}`;if(!seen.has(key)&&clear(room,x,y)){seen.add(key);queue.push({x,y});}}}return found;}

test('modular layouts retain all physical city doors, room identities and existing feature actions',()=>{
 assert.ok(map.schema_version>=20);assert.deepEqual(map.rooms.map(r=>r.id),roomIds);
 for(const room of map.rooms){assert.ok(room.layout_version>=20);assert.deepEqual([room.door.x,room.door.y],doors[room.id]);assert.equal(room.action.id,actions[room.id]);assert.equal(room.modular_source,true);assert.equal(room.source_scene,undefined);assertPublicRoomGeometry(room);}
});

test('every modular source furnishing and seller has exactly its authoritative physical support',()=>{
 for(const room of map.rooms){assert.equal(new Set(room.props.map(p=>p.id)).size,room.props.length);for(const p of room.props){assert.equal(typeof p.solid,'boolean');for(const key of ['x','y','width','height'])assert.ok(Number.isFinite(p[key]));assert.ok(p.width>0&&p.height>0);assert.ok(p.source_asset&&p.source_direction);assert.equal(p.visual.crop,'solid');assert.ok(Math.abs(p.visual.x-p.x-p.width/2)<.00001);assert.equal(p.visual.y,p.y+p.height);assert.ok(p.x>=0&&p.y>=0&&p.x+p.width<=room.width&&p.y+p.height<=room.height);assert.equal(p.depth,p.y+p.height);}
  const staff=room.staff;assert.ok(staff.source_asset&&staff.visual&&staff.footprint);assert.equal(staff.footprint.x+staff.footprint.width/2,staff.visual.x);assert.equal(staff.footprint.y+staff.footprint.height,staff.visual.y);
  const expected=[...room.props.filter(p=>p.solid).map(p=>({prop_id:p.id,...geometry(p)})),{prop_id:'staff',...geometry(staff.footprint)}];
  assert.deepEqual([...room.solids].sort((a,b)=>a.prop_id.localeCompare(b.prop_id)),expected.sort((a,b)=>a.prop_id.localeCompare(b.prop_id)),`${room.id}: invisible or absent obstacle`);
 }
});

test('service bindings belong to authored counters or the native hub statue, with clear exits',()=>{
 for(const room of map.rooms){const service=room.props.find(p=>p.id===room.action.prop_id);assert.ok(service);assert.deepEqual(geometry(room.counter),geometry(service));assert.ok(['cashier','bar','trophy','table'].includes(service.type));assert.ok(room.action.x>=service.x&&room.action.x<=service.x+service.width);assert.ok(room.action.y>=service.y+service.height+14&&room.action.y<=service.y+service.height+60);for(const p of [room.spawn,room.exit,room.action])assert.ok(clear(room,p.x,p.y),`${room.id}: binding not physically usable`);}
});

test('all seats bind actual source chairs, stools or three-seat sections with clear approaches',()=>{
 for(const room of map.rooms){assert.equal(new Set(room.seats.map(s=>s.id)).size,room.seats.length);for(const seat of room.seats){const p=room.props.find(p=>p.id===seat.prop_id);assert.ok(p&&['chair','sofa','bench'].includes(p.type));assert.deepEqual(geometry(seat),geometry(p));assert.ok(seat.seat.x>p.x&&seat.seat.x<p.x+p.width);assert.equal(seat.seat.y,p.y+p.height);const distance=Math.hypot(seat.approach.x-seat.seat.x,seat.approach.y-seat.seat.y);assert.ok(distance>=14&&distance<=80);assert.ok(clear(room,seat.approach.x,seat.approach.y),seat.id);}for(const p of room.props.filter(p=>['chair','sofa','bench'].includes(p.type)))assert.ok(room.seats.some(s=>s.prop_id===p.id));}
});

test('casino modular scene preserves six roulette chairs, six card chairs, two slots and two bar stools',()=>{
 const room=map.rooms.find(r=>r.id==='casino');assert.equal(room.seats.length,16);for(const table of ['roulette','poker-one']){const seats=room.seats.filter(s=>s.table_id===table);assert.equal(seats.length,6);assert.equal(seats.filter(s=>s.facing==='down').length,3);assert.equal(seats.filter(s=>s.facing==='up').length,3);}assert.equal(room.props.filter(p=>p.type==='slot').length,2);assert.equal(room.seats.filter(s=>!s.table_id).length,4);assert.ok(!room.props.some(p=>p.type==='sofa'));
});

test('body-radius navigation reaches every authored entry, service, exit and seat approach',()=>{
 for(const room of map.rooms){const targets=[room.exit,room.action,...room.seats.map(s=>s.approach)],found=reachable(room,targets);assert.equal(found.size,targets.length,`${room.id}: unreachable ${targets.map((_,i)=>i).filter(i=>!found.has(i)).join(',')}`);}
});

test('missing dedicated scenes compose documented native modules instead of reusing a whole bar',()=>{
 for(const id of ['clans','terrace','shop-food','shop-furniture']){const room=map.rooms.find(r=>r.id===id);assert.equal(room.source_scene,undefined);assert.ok(room.surfaces.every(s=>s.asset_id.startsWith('clan-surface-')||s.asset_id.startsWith('station-interior-')));assert.ok(room.props.every(p=>p.source_asset.startsWith('clan-furniture-')||p.type==='cashier'&&p.source_asset==='clothing-interior-counter'));}
 const food=map.rooms.find(r=>r.id==='shop-food');assert.ok(food.source_gaps.some(g=>g.includes('gondola')));assert.equal(food.staff.source_asset,'mascot-location-food');
 const furniture=map.rooms.find(r=>r.id==='shop-furniture');assert.equal(furniture.staff.source_asset,'mascot-location-furniture');assert.ok(furniture.props.some(p=>p.source_asset.endsWith('-loft')));assert.ok(furniture.props.some(p=>p.source_asset.endsWith('-tech')));
 const clothing=map.rooms.find(r=>r.id==='shop-clothes');assert.equal(clothing.props.filter(p=>p.type==='rack').length,2);assert.equal(clothing.props.filter(p=>p.type==='fitting').length,2);assert.equal(clothing.props.filter(p=>p.id.startsWith('shoe-shelf')).length,2);assert.ok(clothing.props.some(p=>p.type==='mirror'));for(const id of ['arena','results']){const room=map.rooms.find(r=>r.id===id);assert.ok(room.seats.length>=4,'public waiting areas need actual seating');for(const seat of room.seats){const prop=room.props.find(p=>p.id===seat.prop_id);assert.ok(prop&&['sofa','chair','bench'].includes(prop.type)&&prop.source_asset.startsWith('clan-furniture-'),'new waiting seats use genuine modular furniture');}}const studio=map.rooms.find(r=>r.id==='profile');assert.equal(studio.props.filter(p=>p.type==='rack').length,0,'studio is a consultation room, not a duplicate retail shop');assert.ok(!map.rooms.find(r=>r.id==='results').props.some(p=>p.source_asset.includes('battle-')),'gallery does not duplicate the game dioramas');
});
