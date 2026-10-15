import test from 'node:test';
import {assertPublicRoomGeometry} from './helpers/public-room-geometry.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolveDesignAsset,designCrop,drawDesignAsset} from '../web/design-assets.js';
import {sourceInteriorPropLayout,sourceInteriorRoomAssetRequests,preloadSourceInteriorRoom,drawSourceInteriorSurfaces,drawSourceInteriorSurface,sourceInteriorDetailLayout,isExactSourceInterior} from '../web/source-interiors.js';
import {interiorObjects,nearestInteriorAction,moveInteriorPosition} from '../web/interiors.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const root=new URL('../',import.meta.url),map=JSON.parse(await readFile(new URL('../web/interiors-map.json',import.meta.url),'utf8'));
const ids=['railway','clans','arena','profile','results','messages','terrace','shop-food','shop-clothes','shop-furniture','casino'];
const clear=(r,p,pad=14)=>p.x>=r.bounds.left+pad&&p.x<=r.bounds.right-pad&&p.y>=r.bounds.top+pad&&p.y<=r.bounds.bottom-pad&&!r.solids.some(s=>p.x>s.x-pad&&p.x<s.x+s.width+pad&&p.y>s.y-pad&&p.y<s.y+s.height+pad);
test('public rooms are independent modular scenes with room for an 80-unit character',()=>{
 assert.ok(map.schema_version>=20);assert.deepEqual(map.rooms.map(r=>r.id),ids);
 const purposes={railway:'travel',clans:'clans',arena:'games',profile:'profile',results:'results',messages:'messages',terrace:'messages','shop-food':'shop-food','shop-clothes':'shop-clothes','shop-furniture':'shop-furniture',casino:'casino'};
 for(const room of map.rooms){assert.equal(room.modular_source,true);assert.notEqual(room.exact_source,true);assert.equal(room.source_scene,undefined);assert.ok(room.layout_version>=20);assertPublicRoomGeometry(room);assert.equal(room.action.id,purposes[room.id]);assert.equal(room.interaction_radius,110);assert.ok(room.staff?.source_asset);assert.notEqual(room.staff.baked,true);}
 assert.notEqual(map.rooms.find(r=>r.id==='shop-food').source_family,'bar-pivkovy-tuz');assert.notEqual(map.rooms.find(r=>r.id==='shop-furniture').source_family,'bar-pivkovy-tuz');
 const legacy={exact_source:true,source_scene:{url:'/assets/legacy-scene.png',native_size:[1536,1024]}};assert.equal(isExactSourceInterior({...legacy,modular_source:true}),false,'a stale whole-scene field cannot override an explicit modular room');
});
test('each visible object uses an explicit native asset with its physical front edge as the visual support',()=>{
 for(const room of map.rooms){assert.ok(room.props.length>=5);assert.equal(new Set(room.props.map(p=>p.id)).size,room.props.length);
  for(const prop of room.props){const asset=resolveDesignAsset(prop.source_asset,prop.source_direction);assert.ok(asset,`${room.id}:${prop.id}`);assert.ok(prop.visual);assert.equal(prop.visual.crop,'solid');assert.equal(prop.visual.anchorY,1);const layout=sourceInteriorPropLayout(prop,room);assert.ok(layout);assert.equal(layout.depth,prop.y+prop.height);assert.deepEqual(layout.footprint,{x:prop.x,y:prop.y,width:prop.width,height:prop.height});assert.ok(Math.abs(layout.bounds.y+layout.bounds.height-prop.y-prop.height)<1e-9);assert.ok(Math.abs(layout.bounds.x+layout.bounds.width/2-prop.x-prop.width/2)<1e-9);const crop=designCrop(asset,prop.visual);assert.ok(Math.abs(layout.bounds.width/layout.bounds.height-crop.width/crop.height)<1e-8,'native aspect must survive projection');assert.equal(layout.direction,prop.source_direction);}
  const supports=[...room.props.filter(p=>p.solid).map(p=>({prop_id:p.id,x:p.x,y:p.y,width:p.width,height:p.height})),{prop_id:'staff',...room.staff.footprint}];
  assert.deepEqual([...room.solids].sort((a,b)=>a.prop_id.localeCompare(b.prop_id)),supports.sort((a,b)=>a.prop_id.localeCompare(b.prop_id)));
 }
});
test('source floors, separate walls, furnishings and NPC participate in actual lazy rendering, never the composed reference',async()=>{
 const families={railway:'station',casino:'casino','shop-clothes':'clothing',messages:'bar-pivkovy-tuz',arena:'bzik-hub'};
 for(const [id,family] of Object.entries(families)){const room=map.rooms.find(r=>r.id===id),requests=sourceInteriorRoomAssetRequests(room);assert.ok(requests.length>8);assert.ok(requests.some(r=>r.id===`${family}-interior-floor`));assert.ok(requests.some(r=>r.id===room.staff.source_asset));assert.ok(room.surfaces.length>=4);assert.ok(!requests.some(r=>r.exact));assert.ok(!requests.some(r=>['station-interior','casino-interior','clothing-shop-interior','bar-pivkovy-tuz-interior','bzik-hub-interior'].includes(r.id)));
  await preloadSourceInteriorRoom(room,url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root))));
  const canvas=createCanvas(room.width,room.height),c=canvas.getContext('2d'),drawn=[],draw=c.drawImage.bind(c);c.drawImage=(...args)=>{drawn.push(args);return draw(...args);};
  assert.equal(drawSourceInteriorSurfaces(c,room),true);assert.equal(drawn.length,room.surfaces.length+1+(room.wall_cutaway?.regions.length||0),'native shell, normalized walking material and cutaway supports each draw once');const native=drawn.filter(args=>args.length===9);assert.equal(native.length,room.surfaces.length);for(const args of native){assert.ok(Math.abs(args[7]/args[8]-args[3]/args[4])<1e-8,'a surface must never be stretched');}
  const nodes=interiorObjects(room);assert.ok(nodes.length>=room.props.length+1,'native staff must be a scene node');for(const node of nodes)node.draw(c);assert.ok(drawn.length>=room.surfaces.length+room.props.length+1);
 }
});
test('all service and seat approaches remain physically reachable through the enlarged source rooms',()=>{
 for(const room of map.rooms){const targets=[room.exit,room.action,...room.seats.map(s=>s.approach)];for(const p of [room.spawn,...targets])assert.ok(clear(room,p),`${room.id} blocked ${JSON.stringify(p)}`);
  const step=20,queue=[room.spawn],seen=new Set([`${room.spawn.x}:${room.spawn.y}`]),found=new Set();for(let head=0;head<queue.length;head++){const p=queue[head];for(let i=0;i<targets.length;i++)if(Math.hypot(targets[i].x-p.x,targets[i].y-p.y)<=step*1.5)found.add(i);for(const [dx,dy] of [[step,0],[-step,0],[0,step],[0,-step]]){const n={x:p.x+dx,y:p.y+dy},key=`${n.x}:${n.y}`;if(!seen.has(key)&&clear(room,n)){seen.add(key);queue.push(n);}}}assert.equal(found.size,targets.length,`${room.id} unreachable target indices: ${targets.map((_,i)=>i).filter(i=>!found.has(i))}`);
  for(const seat of room.seats){const p=room.props.find(p=>p.id===seat.prop_id);assert.ok(p&&['chair','sofa','bench'].includes(p.type));assert.equal(seat.seat.y,p.y+p.height);assert.ok(seat.seat.x>p.x&&seat.seat.x<p.x+p.width);}
 }
});
test('public interaction radius uses the shared 110-unit contract and source lights stay out of floor collisions',()=>{
 for(const room of map.rooms){const occupied={players:room.seats.map((s,i)=>({id:i+1,bench_id:s.id}))};assert.equal(nearestInteriorAction(room,room.action.x,room.action.y+105,occupied,null)?.kind,'counter');assert.equal(nearestInteriorAction(room,room.exit.x,room.exit.y-105,occupied,null)?.kind,'exit');const lights=sourceInteriorDetailLayout(room).filter(d=>/wall-lamp|sconce/.test(d.assetId));assert.ok(lights.length>=1);for(const light of lights){assert.equal(light.collision,false);assert.equal(light.layer,'background');assert.ok(light.bounds.y+light.bounds.height<=room.bounds.top);assert.ok(!room.solids.some(s=>s.prop_id===light.id));}}
});
test('the complete walking rectangle occupies the native floor rather than transparent canvas or side-wall panels',async()=>{
 for(const room of map.rooms){
  await preloadSourceInteriorRoom(room,url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root))));
  const c=createCanvas(room.width,room.height).getContext('2d'),floor=room.surfaces.find(s=>s.id==='floor'),v=floor.visual;
  assert.equal(drawDesignAsset(c,floor.asset_id,v.x,v.y,v.width,v.height,v),true);
  const b=room.bounds;for(let y=b.top+14;y<=b.bottom-14;y+=40)for(let x=b.left+14;x<=b.right-14;x+=40){assert.ok(c.getImageData(Math.round(x),Math.round(y),1,1).data[3]>=160,`${room.id}: physical floor floats outside native floor at ${x},${y}`);}
  for(const side of room.surfaces.filter(s=>/^(left|right)-wall$/.test(s.id))){const a=resolveDesignAsset(side.asset_id),crop=designCrop(a,side.visual),scale=side.visual.height/crop.height,width=crop.width*scale,left=side.visual.x-width*side.visual.anchorX,right=left+width;assert.ok(side.id==='left-wall'?right<=b.left:left>=b.right,`${room.id}: wall enters a walking aisle`);}
 }
});
test('each separate native seller remains visible next to the service counter at human scale',async()=>{
 for(const room of map.rooms){
  await preloadSourceInteriorRoom(room,url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root))));
  const nodes=interiorObjects(room).sort((a,b)=>a.depth-b.depth),staff=nodes.find(n=>n.id===`${room.id}:mascot`);assert.ok(staff);assert.ok(staff.bounds.height>=80&&staff.bounds.height<=90);
  const paint=include=>{const c=createCanvas(room.width,room.height).getContext('2d');drawSourceInteriorSurfaces(c,room);for(const node of nodes)if(include||node!==staff)node.draw(c);return c;};
  const withStaff=paint(true),withoutStaff=paint(false),b=staff.bounds,x=Math.floor(b.x),y=Math.floor(b.y),w=Math.ceil(b.width)+1,h=Math.ceil(b.height)+1,a=withStaff.getImageData(x,y,w,h).data,z=withoutStaff.getImageData(x,y,w,h).data;let changed=0;
  for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-z[i])+Math.abs(a[i+1]-z[i+1])+Math.abs(a[i+2]-z[i+2])>40)changed++;
  assert.ok(changed>300,`${room.id}: the whole seller is occluded by its own counter`);
 }
});
test('native sellers have a small shared foot support that blocks crossing while the adjacent aisle stays open',()=>{
 for(const room of map.rooms){
  const staff=room.staff,feet=room.solids.find(s=>s.prop_id==='staff');
  assert.ok(feet,`${room.id}: seller has no physical foot support`);
  assert.deepEqual(staff.footprint,{x:feet.x,y:feet.y,width:feet.width,height:feet.height});
  assert.equal(feet.x+feet.width/2,staff.visual.x);assert.equal(feet.y+feet.height,staff.visual.y);
  assert.ok(feet.width>0&&feet.width<=32&&feet.height>0&&feet.height<=20,'only the feet occupy the walking plane');
  const start={x:staff.x,y:staff.y+30},above={x:staff.x,y:Math.max(room.bounds.top+14,feet.y-30)};
  assert.ok(clear(room,start,0));assert.ok(clear(room,above,0));
  const stopped=moveInteriorPosition(room,start,0,above.y-start.y);
  assert.equal(stopped.x,start.x);assert.ok(stopped.y>=feet.y+feet.height+14-1e-7,`${room.id}: player walks through the seller`);
  const side=moveInteriorPosition(room,start,40,0);assert.deepEqual(side,{x:start.x+40,y:start.y});
  assert.deepEqual(moveInteriorPosition(room,side,0,above.y-side.y),{x:side.x,y:above.y},`${room.id}: the seller closes the adjacent aisle`);
  assert.equal(nearestInteriorAction(room,room.action.x,room.action.y)?.kind,'counter');
 }
});
test('rear wall planes join native floor backs without the clothing wing-bounds gap',async()=>{
 const jointHasGap=(room,wallOverride=null)=>{
  const c=createCanvas(room.width,room.height).getContext('2d'),floor=room.surfaces.find(s=>s.id==='floor'),wall=wallOverride||room.surfaces.find(s=>s.id==='back-wall');
  drawSourceInteriorSurfaces(c,{...room,surfaces:room.surfaces.map(s=>s.id==='back-wall'?wall:s)});
  const seam=wall.source_join.floor_world_y;
  for(let x=room.bounds.left+24;x<=room.bounds.right-24;x+=25)for(let y=seam-25;y<=seam+10;y+=5){const p=c.getImageData(Math.round(x),Math.round(y),1,1).data;if(p[3]<160||(p[0]===23&&p[1]===26&&p[2]===28))return true;}
  return false;
 };
 for(const id of ['railway','casino','profile','shop-clothes','messages']){const room=map.rooms.find(r=>r.id===id);await preloadSourceInteriorRoom(room,url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root))));assert.equal(jointHasGap(room),false,`${id}: disconnected wall plane`);}
 const room=map.rooms.find(r=>r.id==='shop-clothes'),floor=room.surfaces.find(s=>s.id==='floor'),wall=room.surfaces.find(s=>s.id==='back-wall');
 const old={...wall,visual:{...wall.visual,y:floor.visual.y-floor.visual.height+10}};
 assert.equal(jointHasGap(room,old),true,'the regression must reject positioning by wing bounding-box bottom');
});
test('each visible native hub arch column meets the physical floor instead of floating over a black band',async()=>{
 // Measured opaque bottom pixels in the independent 768x365 back-wall PNG.
 // Its outer legs end at row360, while the two central legs end at321/322.
 const columns=[[30,361],[247,322],[534,323],[744,361]];
 for(const id of ['arena','results']){
  const room=map.rooms.find(r=>r.id===id);await preloadSourceInteriorRoom(room,url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root))));
  const walls=room.surfaces.filter(s=>s.id.startsWith('back-wall'));
  const contacts=wall=>{const asset=resolveDesignAsset(wall.asset_id),crop=designCrop(asset,wall.visual),v=wall.visual,scale=v.width/crop.width,left=v.x-v.width*v.anchorX,top=v.y-v.height*v.anchorY;return columns.map(([nativeX,nativeBottom])=>({nativeX,x:left+(nativeX-crop.x)*scale,y:Math.min(top+(nativeBottom-crop.y)*scale,wall.clip.y+wall.clip.height)})).filter(p=>p.x>=Math.max(room.bounds.left+2,wall.clip.x)&&p.x<=Math.min(room.bounds.right-2,wall.clip.x+wall.clip.width));};
  const c=createCanvas(room.width,room.height).getContext('2d');drawSourceInteriorSurfaces(c,room);
  let visible=0;for(const wall of walls)for(const p of contacts(wall)){
   const pixel=[...c.getImageData(Math.round(p.x),Math.round(p.y+3),1,1).data];
   assert.ok(pixel[3]>=160);assert.notDeepEqual(pixel,[23,26,28,255],`${id}: native column ${p.nativeX} floats above the actual floor at ${p.x},${p.y}`);visible++;
  }
  assert.ok(visible>=6,'the check must cover the actual repeated, visible column contacts');
  const raised=walls.map(w=>({...w,visual:{...w.visual,y:w.visual.y-45}})),bad=createCanvas(room.width,room.height).getContext('2d');
  drawSourceInteriorSurfaces(bad,{...room,surfaces:room.surfaces.map(s=>raised.find(w=>w.id===s.id)||s)});
  assert.ok(raised.some(w=>contacts(w).some(p=>{const pixel=bad.getImageData(Math.round(p.x),Math.round(p.y+3),1,1).data;return pixel[0]===23&&pixel[1]===26&&pixel[2]===28;})),'the regression must reject a native arch raised above its actual floor');
 }
});
