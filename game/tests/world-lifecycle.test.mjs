import {preloadNativeAvatars,readyAvatarRaster,recordNativeAvatarImage} from './helpers/native-avatar-fixture-v30.mjs';
await preloadNativeAvatars();
import {fixtureRenderer} from './helpers/phaser-renderer-fixture.mjs';
const mountWorld=(container,options)=>nativeMountWorld(container,{...options,rendererFactory:fixtureRenderer});
import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWorld as nativeMountWorld,worldMap,worldSpawn,cityBuildings,districtHouses,worldBenches,worldInteractionRadii,clampPosition,movePosition} from '../web/world.js';
import {drawAvatarCanvas,avatarGeometry,avatarRaster} from '../web/avatar.js';
import {readFileSync} from 'node:fs';
import {lakeContains,segmentStaysInLake} from '../web/water.js';
import {interiorCameraBounds} from '../web/world-camera.js';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {preloadSourceInteriorRoom} from '../web/source-interiors.js';
const publicRooms=JSON.parse(readFileSync(new URL('../web/interiors-map.json',import.meta.url))).rooms;
const publicRoom=publicRooms.find(r=>r.id==='shop-food'),seatedRoom=publicRooms.find(r=>r.id==='messages');
const foodDoor=cityBuildings.find(b=>b.id==='shop-food').door,citySeat=worldBenches[0];

function harness(bounds={width:390,height:600,left:0,top:0}){
 // RAF timestamps and performance.now share a deterministic clock. A slower
 // rendering suite must not make its first synthetic 1000ms frame go backwards.
 let frameTime=0;globalThis.performance={now:()=>frameTime};
 const texts=[],textPositions=[],rects=[];const context=()=>new Proxy({measureText:s=>({width:s.length*6}),drawImage(image,...args){recordNativeAvatarImage(rects,image,...args);},fillText(t,x,y){texts.push(t);textPositions.push({text:t,x,y});},fillRect(x,y,w,h){rects.push({x,y,w,h,color:this.fillStyle});}},{get:(t,k)=>t[k]??(()=>{})});
 class Element {
  constructor(){this.dataset={};this.handlers={};this.children=new Map();this.attributes=new Map();this.isConnected=true;this.classList={toggle(){}};}
  addEventListener(k,fn){(this.handlers[k]??=[]).push(fn);}
  removeEventListener(k,fn){this.handlers[k]=(this.handlers[k]||[]).filter(f=>f!==fn);}
  querySelector(k){if(!this.children.has(k))this.children.set(k,new Element());return this.children.get(k);}
  setAttribute(key,value){this.attributes.set(key,String(value));} append(child){this.appended=child;} remove(){this.isConnected=false;}
  getBoundingClientRect(){return {...bounds};}
  getContext(){return context();} closest(){return null;} focus(){}
 }
 const win=new Element();globalThis.window=win;win.devicePixelRatio=1;
 const doc=new Element();doc.hidden=false;doc.head=new Element();doc.getElementById=()=>true;doc.createElement=()=>new Element();
 let modal=false;doc.querySelector=k=>k==='dialog[open]'&&modal?new Element():null;globalThis.document=doc;
 globalThis.ResizeObserver=class {observe(){} disconnect(){}};
 let frame;globalThis.requestAnimationFrame=fn=>(frame=fn,1);globalThis.cancelAnimationFrame=()=>{};
 const event=(key,code)=>({key,code,repeat:false,target:new Element(),preventDefault(){}});
 const container=new Element();
 return {container,texts,textPositions,rects,click(selector){for(const fn of container.appended.querySelector(selector).handlers.click||[])fn({});},modal(value){modal=value;},key(key,code){for(const fn of win.handlers.keydown||[])fn(event(key,code));},keyUp(key,code){for(const fn of win.handlers.keyup||[])fn(event(key,code));},element(selector){return container.appended.querySelector(selector);},frame(time){frameTime=time;frame(time);}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('actual public-room ground callbacks paint opaque dark pixels above and below the room canvas',async()=>{
 const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),root=new URL('../',import.meta.url),room=publicRooms.find(r=>r.id==='railway');
 const oldOffscreen=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=class{constructor(w,h){return createCanvas(w,h);}};
 const h=harness({width:386,height:792,left:0,top:0}),tiles=[];
 await preloadSourceInteriorRoom(room,path=>loadImage(fileURLToPath(new URL(path.replace(/^\//,''),root))));
 const view=nativeMountWorld(h.container,{profile:{id:'outside-ground-pixels'},api:async()=>({scene:'interior',interior:room,interior_id:room.id,position:room.spawn,players:[]}),rendererFactory(canvas,options){
  const renderer=fixtureRenderer(canvas,options),paint=renderer.paint;
  renderer.paint=(key,bounds,draw,options)=>{
   if(key.startsWith('interior:railway:ground:')){
    const c=createCanvas(bounds.width,bounds.height).getContext('2d');c.translate(-bounds.x,-bounds.y);draw(c);
    tiles.push({bounds,pixels:c.getImageData(0,0,bounds.width,bounds.height).data});
   }else paint(key,bounds,draw,options);
  };return renderer;
 }});
 try{
  await settle();h.frame(1000);assert.ok(tiles.length>0,'the actual mount must submit visible ground tiles');
  let above=0,below=0;const floorColors=new Set();
  for(const {bounds:b,pixels} of tiles)for(let y=9;y<b.height;y+=31)for(let x=9;x<b.width;x+=31){
   const wx=b.x+x,wy=b.y+y,i=(y*b.width+x)*4,rgba=[...pixels.subarray(i,i+4)];
   if(wy<0||wy>=room.height||wx<0||wx>=room.width){
    assert.deepEqual(rgba,[23,26,28,255],`public ground is transparent at world${wx},${wy}`);
    if(wy<0)above++;if(wy>=room.height)below++;
   }else if(wx>room.bounds.left+24&&wx<room.bounds.right-24&&wy>room.bounds.top+24&&wy<room.bounds.bottom-24){assert.equal(rgba[3],255);floorColors.add(rgba.join(','));}
  }
  assert.ok(above>20&&below>20,'both exposed ends of the actual room canvas must be sampled');
  assert.ok(floorColors.size>10,'the native floor must still paint over the dark backing');
 }finally{view.destroy();if(oldOffscreen===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=oldOffscreen;}
});
test('movement publication retains the actual turn rather than replacing it with an endpoint chord',async()=>{
 const h=harness(),calls=[];let snap={scene:'base',position:{x:600,y:500},active_base:{id:'path-base',base:{items:[]}},players:[]};
 const view=mountWorld(h.container,{profile:{id:'path-player'},api:async(path,data)=>{if(path==='/api/world/move'){calls.push(data);snap={...snap,position:{x:data.x,y:data.y}};}return snap;}});
 try{
  await settle();h.key('d');h.frame(100);h.frame(200);const turn=view.getState().position;
  h.keyUp('d');h.key('w');h.frame(300);h.frame(900);await settle();
  const sent=calls.at(-1);assert.ok(sent.path?.length>=2,'the server needs intermediate frame positions around a turn');
  assert.ok(sent.path.some(p=>p.x===turn.x&&p.y===turn.y),'the actual corner must survive publication');
  assert.deepEqual(sent.path.at(-1),{x:sent.x,y:sent.y});assert.equal(sent.scene,'base');assert.equal(sent.clan_id,'path-base');
 }finally{view.destroy();}
});
test('a movement ack preserves later frames and the next publication starts after the acknowledged prefix',async()=>{
 const h=harness(),calls=[];let release;let snap={scene:'base',position:{x:600,y:500},active_base:{id:'pending-path',base:{items:[]}},players:[]};
 const view=mountWorld(h.container,{profile:{id:'pending-path-player'},api:async(path,data)=>{
  if(path==='/api/world/move'){calls.push(data);if(calls.length===1)return new Promise(resolve=>{release=()=>{snap={...snap,position:{x:data.x,y:data.y}};resolve(snap);};});snap={...snap,position:{x:data.x,y:data.y}};}return snap;
 }});
 try{
  await settle();h.key('d');h.frame(900);await settle();const first=calls[0];
  h.keyUp('d');h.key('w');h.frame(1000);h.frame(1100);const later=view.getState().position;
  release();await settle();assert.deepEqual(view.getState().position,later,'an earlier ack must not discard later local frames');
  await view.setInventory(true);const next=calls.slice(1).find(data=>data.path);
  assert.ok(next.path?.length>=1);assert.ok(next.path.every(p=>p.y<first.y),'acknowledged points must not replay in the next request');
  assert.deepEqual(next.path.at(-1),later);assert.deepEqual(view.getState().position,later);
 }finally{view.destroy();}
});
test('peer animation snaps when its endpoint chord cuts the foot radius around an obstacle',async()=>{
 const h=harness(),origin={x:(publicRoom.bounds.left+publicRoom.bounds.right)/2,y:(publicRoom.bounds.top+publicRoom.bounds.bottom)/2},room={...publicRoom,solids:[{...origin,width:20,height:20}]},peer={id:'round-corner-peer',name:'Round corner peer',scene:'interior',interior_id:room.id,x:origin.x-14,y:origin.y+10};
 // Keep this synthetic corner inside the real floor so room-framing culling
 // cannot hide the peer before the interpolation contract is inspected.
 let snap={scene:'interior',interior_id:room.id,interior:room,position:{x:origin.x+50,y:origin.y+50},players:[peer]};
 const view=mountWorld(h.container,{profile:{id:'round-corner-viewer'},api:async()=>snap});
 const shown=t=>{h.textPositions.length=0;h.frame(t);return h.textPositions.find(p=>p.text===peer.name);};
 try{await settle();shown(1000);snap={...snap,players:[{...peer,x:origin.x+10,y:origin.y-14}]};await view.refresh();assert.equal(shown(1060).x,origin.x+10,'a chord grazing the support still overlaps the complete foot circle');}finally{view.destroy();}
});
test('a neighbouring boat snaps when its sampled chord would cross the actual dry island',async()=>{
 const h=harness({width:1200,height:600,left:0,top:0}),island=worldMap.lake.islands[0],angle=-Math.PI/2,point=theta=>{const cos=Math.cos(island.rotation),sin=Math.sin(island.rotation),u=(island.radius_x+14)*Math.cos(theta),v=(island.radius_y+14)*Math.sin(theta);return {x:island.x+cos*u-sin*v,y:island.y+sin*u+cos*v};},a=point(angle-.25),b=point(angle+.25);
 assert.ok(lakeContains(worldMap.lake,a,12)&&lakeContains(worldMap.lake,b,12));assert.equal(segmentStaysInLake(worldMap.lake,a,b,12),false);
 const peer={id:'island-boat-peer',name:'Island boat peer',scene:'city',...a,boat:{id:'island-boat',...a}};
 let snap={scene:'city',position:a,boat:{id:'viewer-boat',...a},players:[peer]};
 const view=mountWorld(h.container,{profile:{id:'island-boat-viewer'},api:async()=>snap});
 const shown=t=>{h.textPositions.length=0;h.frame(t);return h.textPositions.find(p=>p.text===peer.name);};
 try{await settle();shown(1000);snap={...snap,players:[{...peer,...b,boat:{id:'island-boat',...b}}]};await view.refresh();assert.equal(shown(1060).x,b.x,'boat interpolation must preserve the island clearance contract');}finally{view.destroy();}
});
test('long pending straight walks compact only collinear frames before opening an interaction',async()=>{
 const h=harness(),calls=[];let release;let snap={scene:'base',position:{x:600,y:500},active_base:{id:'long-path',base:{items:[]}},players:[]};
 const view=mountWorld(h.container,{profile:{id:'long-path-player'},api:async(path,data)=>{
  if(path==='/api/world/move'){calls.push(data);if(calls.length===1)return new Promise(resolve=>{release=()=>{snap={...snap,position:{x:data.x,y:data.y}};resolve(snap);};});snap={...snap,position:{x:data.x,y:data.y}};}return snap;
 }});
 try{
  await settle();h.key('d');h.frame(900);await settle();
  for(let i=0;i<150;i++)h.frame(910+i*10);const end=view.getState().position;
  const opening=view.setInventory(true);release();await opening;
  assert.ok(calls.length<=3);assert.ok(calls.every(data=>!data.path||data.path.length>=1&&data.path.length<=128));
  assert.ok(calls.reduce((n,data)=>n+(data.path?.length||0),0)<=3,'a straight path needs only its retained endpoints');
  assert.deepEqual(calls.filter(data=>data.path).at(-1).path.at(-1),end);assert.deepEqual(view.getState().position,end);
 }finally{view.destroy();}
});
test('a clipped authoritative step corrects the player and clears the unreachable pending tail',async()=>{
 const h=harness(),calls=[];let release;let snap={scene:'base',position:{x:600,y:500},active_base:{id:'clipped-path',base:{items:[]}},players:[]};
 const view=mountWorld(h.container,{profile:{id:'clipped-path-player'},api:async(path,data)=>{
  if(path==='/api/world/move'){calls.push(data);if(calls.length===1)return new Promise(resolve=>{release=()=>{snap={...snap,position:{x:data.x-5,y:data.y}};resolve(snap);};});snap={...snap,position:{x:data.x,y:data.y}};}return snap;
 }});
 try{
  await settle();h.key('d');h.frame(900);await settle();h.frame(1000);release();await settle();
  assert.deepEqual(view.getState().position,snap.position);await view.setInventory(true);
  assert.equal(calls.at(-1).path,undefined,'the clipped route must not replay after correction');
  assert.deepEqual({x:calls.at(-1).x,y:calls.at(-1).y},snap.position);
 }finally{view.destroy();}
});
test('all public seated snapshots retain their assigned contact while the phone opens and closes',async()=>{
 for(const room of publicRooms)for(const seat of room.seats){
  const h=harness();let snapshot={scene:'interior',interior:room,interior_id:room.id,position:{...seat.seat},pose:'sit',bench_id:seat.id,phone_open:false,players:[]};
  const view=mountWorld(h.container,{profile:{id:'seated-radius-audit'},api:async(path,data)=>{
   if(path==='/api/world/activity'&&data?.action==='phone')snapshot={...snapshot,phone_open:data.open};return snapshot;
  }});
  try{
   await settle();assert.deepEqual(view.getState().position,seat.seat,`${room.id}/${seat.id}: mounting a designated seat must not repair it as walking ground`);
   await view.setPhone(true);assert.deepEqual(view.getState().position,seat.seat);
   await view.setPhone(false);assert.deepEqual(view.getState().position,seat.seat);assert.equal(view.getState().pose,'sit');
  }finally{view.destroy();}
 }
});
test('losing server control stops city writes and phone cleanup without automatic recovery',async()=>{
 const h=harness(),calls=[],lost=[];let stolen=false;
 const snap={scene:'city',position:{...worldSpawn},players:[]};
 const view=mountWorld(h.container,{profile:{id:'stale-client'},onControllerLost:message=>lost.push(message),api:async(path,data)=>{
  calls.push([path,data]);if(stolen&&data){const error=new Error('Игра открыта в другой вкладке');error.code='world_controller_lost';error.status=409;throw error;}return snap;
 }});
 try{
  await settle();stolen=true;await view.setInventory(true);
  assert.equal(view.getState().controller_lost,true);assert.deepEqual(lost,['Игра открыта в другой вкладке']);
  const count=calls.length;h.key('d');h.frame(9000);await view.setPhone(true);await view.setPhone(false);await view.travel('park');await view.refresh();await settle();
  assert.equal(calls.length,count,'A stale mount must not recover GET and resume its position writes');
  assert.deepEqual(view.getState().position,worldSpawn);
 }finally{view.destroy();}
});
test('selecting and repainting a furnishing preserves its wood, loft or tech source theme',async()=>{
 for(const theme of ['wood','loft','tech',undefined]){
  const h=harness(),calls=[],item={id:'theme-sofa',type:'sofa',x:5,y:3,rotation:0,color:'#7d9de6',...(theme?{source_theme:theme}:{})},clan={id:'theme-home',is_leader:true,base:{building_id:'base-1',items:[item]}};
  let snap={scene:'base',position:{x:600,y:670},active_base:clan,players:[]};
  const view=mountWorld(h.container,{profile:{id:'theme-owner'},api:async(path,data)=>{if(data)calls.push([path,data]);if(path.endsWith('/base')){snap={...snap,active_base:{...clan,base:{...clan.base,...data}}};return snap.active_base;}return snap;}});
  try{
   await settle();h.click('.world-editor-toggle');h.element('.world-item-theme').value=theme==='wood'?'modern':'wood';h.frame(1000);
   const v=view.getState().view,grid=worldMap.base.grid;
   for(const fn of h.element('.world-canvas').handlers.pointerdown)fn({clientX:(grid.x+item.x*grid.cell_width+15-v.x)*v.scale,clientY:(grid.y+item.y*grid.cell_height+15-v.y)*v.scale});
   assert.equal(h.element('.world-item-theme').value,theme||'modern','Selecting an existing item must show that item’s theme');
   h.element('.world-item-color').value='#cdf17c';h.click('.world-paint');h.click('.world-save');await settle();
   const saved=calls.find(([path])=>path.endsWith('/base'))[1].items[0];
   assert.equal(saved.source_theme,theme||'modern','Repainting must retain the selected source model');assert.equal(saved.color,'#cdf17c');
  }finally{view.destroy();}
 }
});
test('base editor rotates the selected furnishing four ways using touch and R and saves the final facing',async()=>{
 const h=harness(),calls=[],item={id:'turn-sofa',type:'sofa',x:5,y:3,rotation:0,color:'#7d9de6'},clan={id:'turn-home',is_leader:true,base:{building_id:'base-1',items:[item]}};
 let snap={scene:'base',position:{x:600,y:670},active_base:clan,players:[]};
 const view=mountWorld(h.container,{profile:{id:'rotation-owner'},api:async(path,data)=>{if(data)calls.push([path,data]);if(path.endsWith('/base')){snap={...snap,active_base:{...clan,base:{...clan.base,...data}}};return snap.active_base;}return snap;}});
 try{await settle();h.click('.world-editor-toggle');h.frame(1000);const v=view.getState().view,grid=worldMap.base.grid;
  for(const fn of h.element('.world-canvas').handlers.pointerdown)fn({clientX:(grid.x+item.x*grid.cell_width+15-v.x)*v.scale,clientY:(grid.y+item.y*grid.cell_height+15-v.y)*v.scale});
  for(const rotation of [90,180,270,0]){h.click('.world-rotate');assert.equal(view.getState().active_base.base.items[0].rotation,rotation);assert.equal(Number(h.element('.world-item-rotation').value),rotation);}
  h.key('к','KeyR');assert.equal(view.getState().active_base.base.items[0].rotation,90);
  h.element('.world-item-rotation').value='270';for(const fn of h.element('.world-item-rotation').handlers.change)fn({});
  assert.equal(view.getState().active_base.base.items[0].rotation,270);h.click('.world-save');await settle();
  assert.equal(calls.find(([path])=>path.endsWith('/base'))[1].items[0].rotation,270);
  assert.match(h.element('.world-item-preview').attributes.get('aria-label'),/правым боком/);
  h.click('.world-editor-close');h.key('r','KeyR');assert.equal(view.getState().active_base.base.items[0].rotation,270);
 }finally{view.destroy();}
});
test('blocked furniture turn keeps the last valid direction and a guest cannot rotate via hidden controls',async()=>{
 const h=harness(),item={id:'last-row-sofa',type:'sofa',x:3,y:7,rotation:180},clan={id:'edge-home',is_leader:true,base:{building_id:'base-1',items:[item]}};
 let snap={scene:'base',position:{x:600,y:670},active_base:clan,players:[]};const view=mountWorld(h.container,{profile:{id:'edge-owner'},api:async()=>snap});
 try{await settle();h.click('.world-editor-toggle');h.frame(1000);const v=view.getState().view,grid=worldMap.base.grid;
  for(const fn of h.element('.world-canvas').handlers.pointerdown)fn({clientX:(grid.x+item.x*grid.cell_width+15-v.x)*v.scale,clientY:(grid.y+item.y*grid.cell_height+15-v.y)*v.scale});
  h.click('.world-rotate');assert.equal(view.getState().active_base.base.items[0].rotation,180);assert.equal(h.element('.world-item-rotation').value,'180');assert.match(h.element('.world-status').textContent,/свободное место/);
  snap={...snap,active_base:{...clan,is_leader:false,is_guest:true}};await view.refresh();h.click('.world-rotate');h.element('.world-item-rotation').value='0';for(const fn of h.element('.world-item-rotation').handlers.change)fn({});
  assert.equal(view.getState().active_base.base.items[0].rotation,180);
 }finally{view.destroy();}
});
// Capture actual textured contact pixels rather than one obsolete flat shoe
// color. Both nonempty assertions below prevent a vacuous [] === [] pass.
const actorScale=()=>avatarGeometry.worldScale??1.25;
function actorFootRects(rects,avatar,point,options={}){
 const scale=actorScale(),origin={x:Math.round(point.x-avatarGeometry.anchorX*scale),y:Math.round(point.y-avatarGeometry.anchorY*scale)};
 const firstShoeRow=avatarGeometry.height-5,sprite=readyAvatarRaster(avatar,options);
 const ink=new Set(sprite.grid.slice(firstShoeRow*sprite.factor*sprite.width).filter(Boolean));
 return rects.filter(r=>ink.has(r.color)&&r.x>=origin.x&&r.x+r.w<=origin.x+Math.round(avatarGeometry.width*scale)&&r.y>=origin.y+Math.round(firstShoeRow*scale)&&r.y<origin.y+Math.round(avatarGeometry.height*scale));
}
function expectedActorRects(avatar,point,options={}){
 const expected=[],scale=actorScale();
 drawAvatarCanvas({save(){},restore(){},drawImage(image,...args){recordNativeAvatarImage(expected,image,...args);},fillRect(x,y,w,h){expected.push({x,y,w,h,color:this.fillStyle});}},avatar,point.x-avatarGeometry.anchorX*scale,point.y-avatarGeometry.anchorY*scale,{scale,...options});
 return expected;
}
test('opening the separate bag preserves legal fractional feet beside native ground supports',async()=>{
 const trees=JSON.parse(readFileSync(new URL('../web/city-collisions.json',import.meta.url))).obstacles;
 let point;
 for(const tree of trees){
  for(const offset of [.01,.1,.2,.4]){
   const candidate={x:tree.x+tree.width/2,y:tree.y-14-offset};
   if(JSON.stringify(clampPosition(candidate.x,candidate.y))===JSON.stringify(candidate)&&(!Number.isInteger(candidate.x)||!Number.isInteger(candidate.y))){point=candidate;break;}
  }
  if(point)break;
 }
 assert.ok(point,'The fixture must have legal fractional feet immediately beside an actual native ground support');
 const h=harness(),calls=[],snapshot={scene:'city',position:point,players:[]};
 const view=mountWorld(h.container,{profile:{id:'fractional-bag'},api:async(path,data)=>{if(data)calls.push([path,data]);return snapshot;}});
 try{await settle();await view.setInventory(true);assert.equal(view.getState().inventory_open,true);assert.equal(view.getState().phone_open,false);assert.deepEqual(calls.at(-1),['/api/world/move',{...point,scene:'city'}]);assert.deepEqual(view.getState().position,point);await view.setInventory(false);}finally{view.destroy();}
});
test('successful action is visible immediately and an older in-flight world response cannot undo it',async()=>{
 const h=harness(),sounds=[];let release,pending=false;
 const old={scene:'city',server_time:1000,position:{...worldSpawn},players:[],action_effect:null,holding:null};
 const view=mountWorld(h.container,{profile:{id:'instant-action'},onSound:s=>sounds.push(s),api:async()=>pending?new Promise(r=>release=r):old});
 try{await settle();pending=true;const read=view.refresh();await settle();const result={server_time:1000.5,holding:'litter',action_effect:{id:'instant-pick',type:'pick-litter',started_at:1000.5,duration:3}};
  assert.equal(view.setActionState(result),true);assert.equal(view.getState().action_effect.id,'instant-pick');assert.equal(view.getState().holding,'litter');assert.deepEqual(sounds,['pick-litter']);
  release(old);await read;assert.equal(view.getState().action_effect.id,'instant-pick');assert.equal(view.getState().holding,'litter');h.key('d');h.frame(500);assert.deepEqual(view.getState().position,old.position,'Old server time must not place a new action in the future');
  assert.equal(view.setActionState({...result,server_time:999,holding:null}),false);assert.equal(view.getState().holding,'litter');assert.deepEqual(sounds,['pick-litter']);
 }finally{view.destroy();}
});
test('food gesture preserves a real seat and emits its sound once per authoritative event',async()=>{
 const h=harness(),sounds=[],seat=citySeat.seat;
 const snap={scene:'city',server_time:1000,position:{...seat},pose:'sit',bench_id:citySeat.id,phone_open:false,players:[],action_effect:{id:'eat-one',type:'eat',started_at:1000,duration:3}};
 const view=mountWorld(h.container,{profile:{id:'eater'},api:async()=>snap,onSound:s=>sounds.push(s)});
 try{await settle();h.key('d');h.frame(400);assert.deepEqual(view.getState().position,seat);assert.equal(view.getState().pose,'sit');assert.equal(view.getState().bench_id,citySeat.id);await view.refresh();assert.deepEqual(sounds,['eat']);}finally{view.destroy();}
});
test('expired action resumes movement without relocating the player or repeating the sound',async()=>{
 const h=harness(),sounds=[];let snap={scene:'city',server_time:1000,position:{...worldSpawn},pose:'idle',players:[],holding:'litter',action_effect:{id:'pickup-one',type:'pick-litter',started_at:1000,duration:3}};
 const view=mountWorld(h.container,{profile:{id:'picker'},api:async(path,data)=>{if(path==='/api/world/move')snap={...snap,position:{x:data.x,y:data.y}};return snap;},onSound:s=>sounds.push(s)});
 try{await settle();h.key('d');h.frame(500);assert.deepEqual(view.getState().position,snap.position);snap={...snap,server_time:1004,action_effect:null};await view.refresh();h.key('d');h.frame(800);assert.ok(view.getState().position.x>worldSpawn.x);assert.equal(sounds.filter(s=>s==='pick-litter').length,1);}finally{view.destroy();}
});
test('a neighbor action arriving with a position sample stops interpolation at that action point',async()=>{
 const h=harness(),sounds=[],peer={id:'neighbor-eater',name:'Сосед ест',scene:'city',x:1100,y:3060};
 let snap={scene:'city',server_time:1000,position:{x:1000,y:3060},players:[peer]};
 const view=mountWorld(h.container,{profile:{id:'action-viewer'},api:async()=>snap,onSound:s=>sounds.push(s)});
 const shown=t=>{h.textPositions.length=0;h.frame(t);return h.textPositions.find(p=>p.text===peer.name);};
 try{await settle();shown(1000);snap={...snap,server_time:2000,players:[{...peer,x:1140,action_effect:{id:'peer-eat',type:'eat',started_at:2000,duration:3}}]};await view.refresh();assert.equal(shown(1100).x,1140);assert.equal(shown(1200).x,1140);await view.refresh();assert.equal(sounds.filter(s=>s==='eat').length,1);}finally{view.destroy();}
});
test('boarding keeps an authoritative water position, uses ordinary movement and phone never releases the boat',async()=>{
 const h=harness(),calls=[],boat=worldMap.boats[0];let snap={scene:'city',position:{...boat.boarding},boat:null,boats:worldMap.boats,players:[]};
 const view=mountWorld(h.container,{profile:{id:'sailor'},api:async(path,data)=>{if(data)calls.push([path,data]);if(path==='/api/world/action')snap={...snap,position:{x:boat.x,y:boat.y},boat:{id:boat.id,x:boat.x,y:boat.y}};if(path==='/api/world/move')snap={...snap,position:{x:data.x,y:data.y},boat:snap.boat?{...snap.boat,x:data.x,y:data.y}:null};if(path==='/api/world/activity')snap={...snap,phone_open:data.open};return snap;}});
 try{await settle();h.click('.world-enter');await settle();assert.equal(calls.at(-1)[0],'/api/world/action');assert.equal(calls.at(-1)[1].action,'boat-board');assert.deepEqual(view.getState().position,{x:boat.x,y:boat.y});assert.equal(view.getState().boat.id,boat.id);h.key('d');h.frame(9000);await settle();assert.equal(calls.at(-1)[1].boat_id,boat.id);assert.equal(calls.at(-1)[1].teleport,undefined);assert.ok(view.getState().position.x>boat.x);const before=view.getState().position;await view.setPhone(true);await view.setPhone(false);assert.ok(Math.hypot(view.getState().position.x-before.x,view.getState().position.y-before.y)<1,'only canonical pixel rounding is permitted');assert.equal(view.getState().boat.id,boat.id);}finally{view.destroy();}
});
test('boat fishing passes its authorized spot and travel requires returning to the dock',async()=>{
 const h=harness(),calls=[],opened=[],boat=worldMap.boats[1],snap={scene:'city',position:{x:boat.x,y:boat.y},boat:{id:boat.id,x:boat.x,y:boat.y},boats:worldMap.boats,players:[]};
 const view=mountWorld(h.container,{profile:{id:'fish-sailor'},onInteract:(id,data)=>opened.push([id,data]),api:async(path,data)=>{if(data)calls.push([path,data]);return snap;}});
 try{await settle();h.click('.world-enter');await settle();assert.deepEqual(opened,[['fishing',{spot_id:`boat:${boat.id}`}]]);const count=calls.length;await view.travel('station');assert.equal(calls.length,count);assert.equal(view.getState().boat.id,boat.id);}finally{view.destroy();}
});
test('boarding rejection stays on shore without success audio and a dock exit restores its dry approach',async()=>{
 const h=harness(),sounds=[],calls=[],boat=worldMap.boats[0];let snap={scene:'city',position:{x:boat.boarding.x,y:boat.boarding.y},boat:null,boats:worldMap.boats,players:[]},rejected=true;
 const view=mountWorld(h.container,{profile:{id:'dock-exit'},onSound:s=>sounds.push(s),api:async(path,data)=>{if(data)calls.push([path,data]);if(path==='/api/world/action'){if(rejected)throw new Error('Лодка занята');snap=data.action==='boat-board'?{...snap,position:{x:boat.x,y:boat.y},boat:{id:boat.id,x:boat.x,y:boat.y}}:{...snap,position:{x:boat.boarding.x,y:boat.boarding.y},boat:null};}return snap;}});
 try{await settle();h.click('.world-enter');await settle();assert.equal(view.getState().boat,null);assert.deepEqual(view.getState().position,snap.position);assert.deepEqual(sounds,[]);rejected=false;h.click('.world-enter');await settle();assert.equal(view.getState().boat.id,boat.id);h.click('.world-boat-exit');await settle();assert.equal(calls.at(-1)[1].action,'boat-exit');assert.equal(view.getState().boat,null);assert.deepEqual(view.getState().position,{x:boat.boarding.x,y:boat.boarding.y});assert.deepEqual(sounds,['boat-board','boat-exit']);await view.refresh();assert.deepEqual(sounds,['boat-board','boat-exit']);}finally{view.destroy();}
});
test('pet reactions sound once per server effect while own-pet and street-cat actions remain distinct',async()=>{
 const h=harness(),sounds=[],opened=[],cat=worldMap.activities.find(a=>a.action==='pet-cat');let snap={scene:'city',position:{x:cat.x,y:cat.y},players:[],pet:{id:'pet-dog',kind:'dog'},pet_effect:null};
 const view=mountWorld(h.container,{profile:{id:'petter'},onSound:s=>sounds.push(s),onInteract:(id,data)=>opened.push([id,data]),api:async()=>snap});
 try{await settle();h.click('.world-enter');await settle();assert.deepEqual(opened,[['pet-cat',{target_id:cat.id}]]);snap={...snap,pet_effect:{id:'pet-once',kind:'cat',target_id:cat.id,started_at:Date.now()/1000-.1,duration:2}};await view.refresh();await view.refresh();assert.deepEqual(sounds,['cat-meow']);snap={...snap,position:{x:600,y:3200},pet_effect:null};await view.setPhone(false);h.click('.world-enter');await settle();assert.deepEqual(opened.at(-1),['pet',{target_id:'pet-dog'}]);}finally{view.destroy();}
});
test('an authoritative boat release reconciles immediately to dry boarding without a station jump',async()=>{
 const h=harness(),boat=worldMap.boats[0];let snap={scene:'city',position:{x:boat.x,y:boat.y},boat:{id:boat.id,x:boat.x,y:boat.y},players:[]};const view=mountWorld(h.container,{profile:{id:'release-sailor'},api:async()=>snap});
 try{await settle();snap={...snap,boat:null,position:{x:boat.boarding.x,y:boat.boarding.y}};await view.refresh();assert.equal(view.getState().boat,null);assert.deepEqual(view.getState().position,snap.position);assert.notDeepEqual(view.getState().position,worldSpawn);}finally{view.destroy();}
});
test('an own pet can be patted with the action button inside a public room and a clan base',async()=>{
 // The entrance spawn intentionally offers the exit action. A pet interaction
 // starts in the actual clear central aisle, beyond the door/service radius.
 const roomPoint={x:publicRoom.spawn.x,y:publicRoom.spawn.y-180};
 assert.ok(!publicRoom.solids.some(s=>roomPoint.x>s.x&&roomPoint.x<s.x+s.width&&roomPoint.y>s.y&&roomPoint.y<s.y+s.height));
 for(const scene of ['interior','base']){const h=harness(),opened=[],snap={scene,position:scene==='interior'?roomPoint:{x:600,y:500},interior:publicRoom,interior_id:publicRoom.id,active_base:{id:'pet-base',base:{items:[]}},pet:{id:'own-cat',kind:'cat'},players:[]};const view=mountWorld(h.container,{profile:{id:`pet-${scene}`},api:async()=>snap,onInteract:(id,data)=>opened.push([id,data])});
  try{await settle();assert.deepEqual(view.getState().position,snap.position,'A real legal fixture must not be recovered to the entrance');h.click('.world-enter');await settle();assert.deepEqual(opened,[['pet',{target_id:'own-cat'}]],scene);}finally{view.destroy();}}
});
test('an owned pet does not replace the base exit action',async()=>{
 const h=harness(),calls=[],house=districtHouses[0];let snap={scene:'base',position:{x:600,y:750},active_base:{id:'pet-home',base:{building_id:house.id,items:[]}},pet:{id:'home-dog',kind:'dog'},players:[]};const view=mountWorld(h.container,{profile:{id:'exit-petter'},api:async(path,data)=>{if(data)calls.push([path,data]);if(path==='/api/world/move')snap={...snap,scene:data.scene,position:{x:data.x,y:data.y}};return snap;}});
 try{await settle();h.click('.world-enter');await settle();assert.equal(view.getState().scene,'city');assert.deepEqual(calls.at(-1),['/api/world/move',{scene:'city',x:house.door.x,y:house.door.y+28}]);}finally{view.destroy();}
});
test('tapping an own pet preserves seated phone state and a live pet gesture prevents walking',async()=>{
 const h=harness(),opened=[],calls=[],pet={id:'own-dog',kind:'dog'},snap={scene:'city',position:{...citySeat.seat},pose:'sit',phone_open:true,bench_id:citySeat.id,pet,players:[]};let current=snap;const view=mountWorld(h.container,{profile:{id:'seated-petter'},api:async(path,data)=>{if(data)calls.push([path,data]);return current;},onInteract:(id,data)=>opened.push([id,data])});
 try{await settle();h.frame(1000);const v=view.getState().view;for(const fn of h.element('.world-canvas').handlers.pointerdown)fn({clientX:(snap.position.x-30-v.x)*v.scale,clientY:(snap.position.y-17-v.y)*v.scale});await settle();assert.deepEqual(opened,[['pet',{target_id:pet.id}]]);current={...snap,pet_effect:{id:'seat-pat',target_id:pet.id,kind:'dog',started_at:Date.now()/1000-.1,duration:2}};await view.refresh();h.key('d');h.frame(9000);await settle();assert.deepEqual(view.getState().position,snap.position);assert.equal(view.getState().pose,'sit');assert.equal(view.getState().phone_open,true);assert.equal(view.getState().bench_id,citySeat.id);assert.ok(!calls.some(([,d])=>d.action==='stand'));}finally{view.destroy();}
});
test('pet notification audio is local to the current room and nearby players',async()=>{
 const h=harness(),sounds=[],position={...publicRoom.spawn},now=Date.now()/1000-.1,effect=id=>({id,kind:'cat',target_id:'pet-cat',started_at:now,duration:2}),snap={scene:'interior',interior_id:publicRoom.id,interior:publicRoom,position,players:[{id:'foreign',scene:'interior',interior_id:'other-room',x:position.x+10,y:position.y,pet_effect:effect('foreign-effect')},{id:'far',scene:'interior',interior_id:publicRoom.id,x:publicRoom.bounds.left+20,y:publicRoom.bounds.top+20,pet_effect:effect('far-effect')},{id:'near',scene:'interior',interior_id:publicRoom.id,x:position.x+20,y:position.y+20,pet_effect:effect('near-effect')}]};const view=mountWorld(h.container,{profile:{id:'audio-local'},api:async()=>snap,onSound:s=>sounds.push(s)});
 try{await settle();await view.refresh();assert.deepEqual(sounds,['cat-meow']);}finally{view.destroy();}
});
test('presence refresh runs within one second so peers can observe a two-second pet reaction',async()=>{
 const h=harness(),delays=[],original=globalThis.setInterval;let view;globalThis.setInterval=(callback,delay)=>{delays.push(delay);return original(callback,delay);};
 try{view=mountWorld(h.container,{profile:{id:'pet-timing'},api:async()=>({scene:'city',position:{...worldSpawn},players:[]})});await settle();assert.equal(delays.length,1);assert.ok(delays[0]<=1000&&delays[0]>0);}finally{globalThis.setInterval=original;view?.destroy();}
});
test('a live pet gesture pauses an idle player until it expires without changing the stored pose',async()=>{
 const h=harness();let snap={scene:'city',position:{...worldSpawn},pose:'idle',pet_effect:{id:'idle-pat',kind:'dog',target_id:'pet-dog',started_at:Date.now()/1000-.1,duration:2},players:[]};const view=mountWorld(h.container,{profile:{id:'idle-petter'},api:async(path,data)=>{if(path==='/api/world/move')snap={...snap,position:{x:data.x,y:data.y}};return snap;}});
 try{await settle();h.key('d');h.frame(1000);await settle();assert.deepEqual(view.getState().position,worldSpawn);snap={...snap,pet_effect:{...snap.pet_effect,started_at:Date.now()/1000-3}};await view.refresh();h.key('d');h.frame(2000);await settle();assert.ok(view.getState().position.x>worldSpawn.x);assert.equal(view.getState().pose,'idle');}finally{view.destroy();}
});
test('empty clan plots open construction only after flushing the displayed approach position',async()=>{
 const h=harness(),calls=[],opened=[],plot=districtHouses[0],snap={scene:'city',position:{...plot.door},players:[],buildings:[{id:plot.id,clan:null}]};
 const view=mountWorld(h.container,{profile:{id:'builder'},api:async(path,data)=>{if(data)calls.push(path);return snap;},onInteract:(id,data)=>{calls.push('open');opened.push([id,data]);}});
 try{await settle();h.click('.world-enter');await settle();assert.deepEqual(calls,['/api/world/move','open']);assert.deepEqual(opened,[['clans',{building_id:plot.id,clan_id:null}]]);}finally{view.destroy();}
});
test('door audio fires once after authoritative entry and never for a rejected door',async()=>{
 const h=harness(),sounds=[];let reject=false,snap={scene:'city',position:{...foodDoor},players:[]};
 const view=mountWorld(h.container,{profile:{id:'door-sound'},onSound:name=>sounds.push(name),api:async(path)=>{if(path==='/api/world/enter'){if(reject)throw new Error('Дверь закрыта');snap={scene:'interior',interior_id:publicRoom.id,interior:publicRoom,position:publicRoom.spawn,players:[]};}return snap;}});
 try{await settle();reject=true;h.click('.world-enter');await settle();assert.deepEqual(sounds,[]);reject=false;h.click('.world-enter');await settle();assert.deepEqual(sounds,['door-open']);await view.refresh();await view.refresh();assert.deepEqual(sounds,['door-open']);}finally{view.destroy();}
});
test('base interior controls do not offer an exterior rebuild after construction',async()=>{
 const h=harness(),snap={scene:'city',position:{...worldSpawn},players:[]};const view=mountWorld(h.container,{profile:{id:'immutable-home'},api:async()=>snap});
 try{await settle();assert.doesNotMatch(h.container.appended.innerHTML,/class="world-exterior"/);}finally{view.destroy();}
});
test('sit and stand audio follows accepted state and a phone overlay is silent to the world',async()=>{
 const h=harness(),sounds=[];let rejected=true,snap={scene:'city',position:{...citySeat.seat},pose:'idle',players:[]};
 const view=mountWorld(h.container,{profile:{id:'seat-sound'},onSound:name=>sounds.push(name),api:async(path,data)=>{if(path==='/api/world/activity'){if(rejected)throw new Error('Место занято');snap={...snap,pose:data.action==='sit'?'sit':data.action==='stand'?'idle':snap.pose,bench_id:data.action==='sit'?citySeat.id:data.action==='stand'?null:snap.bench_id,phone_open:data.action==='phone'?data.open:snap.phone_open};}return snap;}});
 try{await settle();h.click('.world-enter');await settle();assert.deepEqual(sounds,[]);rejected=false;h.click('.world-enter');await settle();assert.deepEqual(sounds,['sit']);await view.setPhone(true);await view.setPhone(false);assert.deepEqual(sounds,['sit']);h.click('.world-enter');await settle();assert.deepEqual(sounds,['sit','stand']);await view.refresh();assert.deepEqual(sounds,['sit','stand']);}finally{view.destroy();}
});
test('footsteps require actual movement and stop when a phone is open',async()=>{
 const h=harness(),sounds=[];let snap={scene:'city',position:{...worldSpawn},players:[]};
 const view=mountWorld(h.container,{profile:{id:'step-sound'},onSound:name=>sounds.push(name),api:async(path,data)=>{if(path==='/api/world/activity')snap={...snap,phone_open:data.open};return snap;}});
 try{await settle();h.frame(1000);assert.deepEqual(sounds,[]);h.key('a');h.frame(1300);h.frame(1350);assert.deepEqual(sounds,['step']);h.frame(1600);assert.deepEqual(sounds,['step','step']);await view.setPhone(true);h.key('a');h.frame(1900);assert.deepEqual(sounds,['step','step']);}finally{view.destroy();}
});
test('phone modal clears held walking and closing it requires fresh input',async()=>{
 const h=harness(),moves=[];let snap={restricted:false,scene:'city',position:{x:600,y:510},players:[],my_clan:null};
 const view=mountWorld(h.container,{profile:{id:'me',name:'Test'},api:async(p,data)=>{if(data)moves.push(data);if(p==='/api/world/move')snap={...snap,position:{x:data.x,y:data.y}};return snap;},onPhone:()=>h.modal(true)});
 try{await settle();h.key('a');h.frame(1000);await settle();const before=moves.at(-1).x;
  h.key('p');h.frame(2000);await settle();h.modal(false);h.frame(6000);await settle();assert.equal(moves.at(-1).x,before);
  h.key('a');h.frame(7000);await settle();assert.ok(moves.at(-1).x<before);
 }finally{view.destroy();}
});
test('authoritative arena snapshot redirects once and stops city position writes',async()=>{
 const h=harness(),moves=[],targets=[];let snap={restricted:false,scene:'city',position:{x:600,y:510},players:[],my_clan:null};
 const view=mountWorld(h.container,{profile:{id:'me',name:'Test'},api:async(p,data)=>{if(data)moves.push(data);return snap;},onArena:id=>targets.push(id)});
 try{await settle();snap={...snap,scene:'arena',arena_lobby_id:'authorized-match'};await view.refresh();await view.refresh();h.key('a');h.frame(8000);await settle();
  assert.deepEqual(targets,['authorized-match']);assert.equal(moves.length,0);
 }finally{view.destroy();}
});

test('district navigation uses real scene moves and base returns to its house',async()=>{
 const h=harness(),moves=[];let snapshot={restricted:false,scene:'city',position:{x:900,y:850},players:[],my_clan:{id:'clan',base:{building_id:'base-2'}},buildings:[]};
 const view=mountWorld(h.container,{profile:{id:'me'},api:async(path,data)=>{if(path==='/api/clans/clan')return {id:'clan',name:'Actual clan',is_leader:true,base:{building_id:'base-2',items:[]}};if(data){moves.push(data);snapshot={...snapshot,scene:data.scene,position:data};}return snapshot;}});
 try{await settle();assert.equal(typeof view.setScene,'function');await view.setScene('district');assert.equal(moves.at(-1).scene,'city');
  await view.setScene('base');assert.equal(moves.at(-1).scene,'base');h.click('.world-back');await settle();assert.deepEqual(moves.at(-1),{scene:'city',x:districtHouses[1].door.x,y:districtHouses[1].door.y+28});
  await view.travel('railway');assert.deepEqual(moves.at(-1),{scene:'city',...worldSpawn,teleport:true});
 }finally{view.destroy();}
});
test('settings remain mount scoped and background scenes release every listener',async()=>{
 const h=harness();const view=mountWorld(h.container,{profile:{id:'me'},settings:{zoom:1.15,showNicknames:true},api:async()=>({restricted:false,scene:'city',position:{x:900,y:850},players:[]})});
 try{await settle();assert.equal(typeof view.setSettings,'function');view.setSettings({zoom:1.6,showNicknames:false});h.frame(1000);}
 finally{view.destroy();}
 assert.equal(Object.values(window.handlers).flat().length,0);assert.equal(Object.values(document.handlers).flat().length,0);assert.equal(h.container.appended.isConnected,false);
});
test('scene transition during refresh still writes district after stale response',async()=>{
 const h=harness(),moves=[];let waiting=false,resolveRefresh;const snap={restricted:false,scene:'city',position:{x:900,y:850},players:[]};
 const view=mountWorld(h.container,{profile:{id:'me'},api:async(path,data)=>{if(data){moves.push(data);return {...snap,scene:data.scene,position:data};}if(waiting)return new Promise(resolve=>{resolveRefresh=resolve;});return snap;}});
 try{await settle();waiting=true;const refreshing=view.refresh();await settle();await view.setScene('district');resolveRefresh(snap);await refreshing;await settle();assert.equal(moves.at(-1)?.scene,'city');assert.equal(moves.at(-1)?.x,worldMap.landmarks.district.x);}
 finally{view.destroy();}
});

test('initial unified quarter position survives reload without an unsolicited move',async()=>{
 const h=harness(),moves=[],snap={restricted:false,scene:'city',position:{...worldMap.landmarks.district},players:[]};
 const view=mountWorld(h.container,{profile:{id:'me'},initialScene:'district',api:async(p,data)=>{if(data)moves.push(data);return snap;}});
 try{await settle();assert.deepEqual(view.getState().position,snap.position);assert.equal(moves.length,0);}finally{view.destroy();}
});
test('button and physical E on Russian layout both enter the nearest public building',async()=>{
 const h=harness(),opened=[],snap={restricted:false,scene:'city',position:{...foodDoor},players:[]};
 const view=mountWorld(h.container,{profile:{id:'me'},api:async(path,data)=>{if(path==='/api/world/enter')opened.push(data.building_id);return snap;}});
 try{await settle();h.frame(1000);h.click('.world-enter');await settle();h.key('у','KeyE');await settle();assert.deepEqual(opened,['shop-food','shop-food']);}finally{view.destroy();}
});
test('phone and seating write server activities while movement releases a seated pose',async()=>{
 const h=harness(),calls=[];let snap={restricted:false,scene:'city',position:{...citySeat.seat},players:[{id:'me',pose:'idle'}]};
 const view=mountWorld(h.container,{profile:{id:'me'},api:async(path,data)=>{if(data)calls.push([path,data]);if(path==='/api/world/activity')snap={...snap,players:[{id:'me',pose:data.action==='sit'?'sit':data.action==='phone'&&data.open?'phone':'idle'}],pose:data.action==='sit'?'sit':'idle'};return snap;}});
 try{await settle();h.click('.world-enter');await settle();assert.deepEqual(calls.find(c=>c[0]==='/api/world/activity'),['/api/world/activity',{action:'sit',bench_id:citySeat.id}]);await view.setPhone(true);assert.deepEqual(calls.at(-1),['/api/world/activity',{action:'phone',open:true}]);await view.setPhone(false);h.key('a');h.frame(9000);await settle();assert.equal(view.getState().pose,'idle');}finally{view.destroy();}
});
test('card takeover follows authority once and prevents fast travel',async()=>{
 const h=harness(),tables=[],calls=[],snap={restricted:false,scene:'cards',card_table_id:'table-real',players:[]};
 const view=mountWorld(h.container,{profile:{id:'me'},onCards:id=>tables.push(id),api:async(p,data)=>{if(data)calls.push(data);return snap;}});
 try{await settle();await view.refresh();await view.travel('casino');assert.deepEqual(tables,['table-real']);assert.equal(calls.length,0);}finally{view.destroy();}
});
test('canvas door taps enter the same public room as the physical action key',async()=>{
 const h=harness(),opened=[],snap={restricted:false,scene:'city',position:{...foodDoor},players:[]};
 const view=mountWorld(h.container,{profile:{id:'me'},api:async(path,data)=>{if(path==='/api/world/enter')opened.push(data.building_id);return snap;}});
 try{await settle();h.frame(1000);const v=view.getState().view;for(const fn of h.element('.world-canvas').handlers.pointerdown)fn({clientX:(foodDoor.x-v.x)*v.scale,clientY:(foodDoor.y-v.y)*v.scale});await settle();assert.deepEqual(opened,['shop-food']);}finally{view.destroy();}
});
test('a denied fast travel restores the authoritative scene and position',async()=>{
 const h=harness(),snap={restricted:false,scene:'city',position:{...foodDoor},my_clan:{id:'clan',base:{building_id:'base-2'}},players:[]};
 const view=mountWorld(h.container,{profile:{id:'me'},api:async(path,data)=>{if(path==='/api/clans/clan')return {...snap.my_clan,is_leader:true};if(data)throw new Error('Нет доступа');return snap;}});
 try{await settle();await view.travel('base');assert.equal(view.getState().scene,'city');assert.deepEqual(view.getState().position,snap.position);}finally{view.destroy();}
});
test('closing the phone during an in-flight opening sends the final closed state',async()=>{
 const h=harness(),calls=[];let snap={restricted:false,scene:'city',position:{...foodDoor},players:[]},resolveOpen;
 const view=mountWorld(h.container,{profile:{id:'me'},api:async(path,data)=>{if(path==='/api/world/activity'){calls.push(data);if(data.open)return new Promise(resolve=>resolveOpen=()=>resolve({...snap,pose:'phone'}));return {...snap,pose:'idle'};}return snap;}});
 try{await settle();const opening=view.setPhone(true);await settle();const closing=view.setPhone(false);resolveOpen();await opening;await closing;await settle();assert.deepEqual(calls,[{action:'phone',open:true},{action:'phone',open:false}]);assert.equal(view.getState().pose,'idle');}finally{view.destroy();}
});
test('leader base changes submit interior palettes without modifying the built exterior',async()=>{
 const h=harness(),saved=[],base={building_id:'base-1',items:[{id:'desk-real',type:'desk',x:6,y:5,color:'#faf8f2',variant:'standard'}],wall_color:'#faf8f2',floor_color:'#141414',exterior_style:0},clan={id:'clan',is_leader:true,base};
 const snap={restricted:false,scene:'base',position:{x:600,y:670},players:[],my_clan:clan};
 const view=mountWorld(h.container,{profile:{id:'me'},api:async(path,data)=>{if(path==='/api/clans/clan/base'){saved.push(data);return {...clan,base:{...base,...data}};}return snap;}});
 try{await settle();h.click('.world-editor-toggle');h.frame(1000);const v=view.getState().view;for(const fn of h.element('.world-canvas').handlers.pointerdown)fn({clientX:(635-v.x)*v.scale,clientY:(578-v.y)*v.scale});
  h.element('.world-item-color').value='#7d9de6';h.click('.world-paint');
  for(const [selector,value] of [['.world-wall-color','#b697d7'],['.world-floor-color','#62cdb9']]){h.element(selector).value=value;for(const fn of h.element(selector).handlers.change)fn({});}
  h.click('.world-save');await settle();assert.equal(saved.length,1);assert.equal(saved[0].items[0].color,'#7d9de6');assert.equal(saved[0].wall_color,'#b697d7');assert.equal(saved[0].floor_color,'#62cdb9');assert.equal(Object.hasOwn(saved[0],'exterior_style'),false);assert.equal(Object.hasOwn(saved[0],'exterior_color'),false);
 }finally{view.destroy();}
});
test('premium placement requires an owned purchase even if the control is changed manually',async()=>{
 const h=harness(),saved=[],base={building_id:'base-1',items:[]},clan={id:'clan',is_leader:true,base},snap={restricted:false,scene:'base',position:{x:600,y:670},players:[],my_clan:clan};
 const view=mountWorld(h.container,{profile:{id:'me'},api:async(path,data)=>{if(path==='/api/clans/clan/base'){saved.push(data);return {...clan,base:data};}return snap;}});
 try{await settle();h.click('.world-editor-toggle');h.frame(1000);const v=view.getState().view,tap=()=>{for(const fn of h.element('.world-canvas').handlers.pointerdown)fn({clientX:(705-v.x)*v.scale,clientY:(578-v.y)*v.scale});};
  h.element('.world-item-type').value='sofa';h.element('.world-item-variant').value='premium';tap();h.click('.world-save');await settle();assert.equal(saved.length,0);
  view.setWallet({balance:100,inventory:[{item_id:'furniture-sofa',quantity:1}]});h.element('.world-item-variant').value='premium';tap();h.click('.world-save');await settle();assert.equal(saved.length,1);assert.equal(saved[0].items[0].variant,'premium');
 }finally{view.destroy();}
});
test('closing phone survives immediate scene teardown and runs after an opening in flight',async()=>{
 const h=harness(),calls=[],snap={restricted:false,scene:'city',position:{...foodDoor},players:[]};let resolveOpen;
 const view=mountWorld(h.container,{profile:{id:'me'},api:async(path,data)=>{if(path==='/api/world/activity'){calls.push(data);if(data.open)return new Promise(resolve=>resolveOpen=()=>resolve({...snap,pose:'phone'}));return {...snap,pose:'idle'};}return snap;}});
 await settle();const opening=view.setPhone(true);await settle();const closing=view.setPhone(false);view.destroy();resolveOpen();await opening;await closing;await settle();assert.deepEqual(calls,[{action:'phone',open:true},{action:'phone',open:false}]);assert.equal(h.container.appended.isConnected,false);
});
test('an opening queued by a destroyed mount cannot reopen the server phone pose',async()=>{
 const h=harness(),calls=[],snap={restricted:false,scene:'city',position:{...foodDoor},players:[]};
 const view=mountWorld(h.container,{profile:{id:'me'},api:async(path,data)=>{if(path==='/api/world/activity')calls.push(data);return snap;}});
 await settle();const opening=view.setPhone(true),closing=view.setPhone(false);view.destroy();await opening;await closing;assert.deepEqual(calls,[{action:'phone',open:false}]);
});
test('phone pose requests stay ordered across a replaced world mount',async()=>{
 const h=harness(),calls=[],snap={restricted:false,scene:'city',position:{...foodDoor},players:[]};let resolveFirst;
 const api=async(path,data)=>{if(path==='/api/world/activity'){calls.push(data.open);if(calls.length===1)return new Promise(resolve=>resolveFirst=()=>resolve({...snap,pose:'phone'}));return {...snap,pose:data.open?'phone':'idle'};}return snap;};
 const old=mountWorld(h.container,{profile:{id:'me'},api});await settle();const first=old.setPhone(true);await settle();const closing=old.setPhone(false);old.destroy();
 const next=mountWorld(h.container,{profile:{id:'me'},api});await settle();try{const reopened=next.setPhone(true);resolveFirst();await first;await closing;await reopened;await settle();assert.deepEqual(calls,[true,false,true]);assert.equal(next.getState().pose,'phone');}finally{next.destroy();}
});

// Public interiors use the server's room identity and geometry.

test('public city door enters a physical room without opening the phone feature',async()=>{
 const h=harness(),calls=[],opened=[];let snap={scene:'city',position:{...foodDoor},players:[]};
 const view=mountWorld(h.container,{profile:{id:'me'},api:async(path,data)=>{if(data)calls.push([path,data]);if(path==='/api/world/enter')snap={...snap,scene:'interior',interior_id:publicRoom.id,interior:publicRoom,position:publicRoom.spawn};return snap;},onInteract:id=>opened.push(id)});
 try{await settle();h.key('у','KeyE');await settle();assert.deepEqual(calls.find(c=>c[0]==='/api/world/enter'),['/api/world/enter',{building_id:'shop-food'}]);assert.equal(calls[0][0],'/api/world/move');assert.equal(view.getState().scene,'interior');assert.deepEqual(view.getState().position,publicRoom.spawn);assert.deepEqual(opened,[]);}finally{view.destroy();}
});
test('interior reload retains authoritative room and sends room identity on walking',async()=>{
 const h=harness(),calls=[],snap={scene:'interior',interior_id:publicRoom.id,interior:publicRoom,position:{...publicRoom.spawn},players:[]};
 const view=mountWorld(h.container,{profile:{id:'me'},initialScene:'interior',api:async(path,data)=>{if(data)calls.push([path,data]);return snap;}});
 try{await settle();assert.equal(view.getState().scene,'interior');assert.equal(view.getState().interior_id,publicRoom.id);assert.deepEqual(view.getState().position,snap.position);h.key('a');h.frame(9000);await settle();assert.equal(calls.at(-1)[1].interior_id,'shop-food');assert.equal(calls.at(-1)[1].scene,'interior');const camera=view.getState().view,envelope=interiorCameraBounds(publicRoom);assert.ok(camera.scale>=.5);assert.ok(camera.y<=envelope.top+1/camera.scale,'reload keeps the rear wall visible');assert.ok(camera.y+(600-114)/camera.scale>=envelope.bottom-1/camera.scale,'reload keeps the front cutaway above controls');}finally{view.destroy();}
});
test('interior counter invokes its feature while its seat and exit use authoritative endpoints',async()=>{
 const publicRoom=seatedRoom,foodDoor=cityBuildings.find(b=>b.id===publicRoom.id).door;
 const h=harness(),calls=[],opened=[];let snap={scene:'interior',interior_id:publicRoom.id,interior:publicRoom,position:{x:publicRoom.action.x,y:publicRoom.action.y},players:[]};
 const view=mountWorld(h.container,{profile:{id:'me'},api:async(path,data)=>{if(data)calls.push([path,data]);if(path==='/api/world/exit')snap={scene:'city',position:{x:foodDoor.x,y:foodDoor.y+24},players:[]};return snap;},onInteract:id=>opened.push(id)});
 try{await settle();h.click('.world-enter');await settle();assert.deepEqual(opened,[publicRoom.action.id]);snap={...snap,position:{...publicRoom.seats[0].seat},pose:'sit',bench_id:publicRoom.seats[0].id};await view.setPhone(false);h.click('.world-enter');await settle();assert.deepEqual(calls.at(-1),['/api/world/activity',{action:'stand'}]);snap={...snap,position:{...publicRoom.exit},pose:'idle'};await view.setPhone(false);h.click('.world-enter');await settle();assert.deepEqual(calls.at(-1),['/api/world/exit',{}]);assert.equal(view.getState().scene,'city');}finally{view.destroy();}
});

test('camera and zoom align to physical pixels to keep small labels and sprites clear',async()=>{
 const h=harness();window.devicePixelRatio=2;const snap={scene:'city',position:{x:557.25,y:287.75},players:[]};const view=mountWorld(h.container,{profile:{id:'me'},settings:{zoom:1.15},api:async()=>snap});
 try{await settle();h.frame(1000);const v=view.getState().view;assert.equal(v.scale*2,Math.round(v.scale*2));assert.equal(v.x*v.scale*2,Math.round(v.x*v.scale*2));assert.equal(v.y*v.scale*2,Math.round(v.y*v.scale*2));}finally{view.destroy();}
});
test('same-room real peers are rendered and explicit foreign-room peers are excluded',async()=>{
 const h=harness(),snap={scene:'interior',interior_id:publicRoom.id,interior:publicRoom,position:{...publicRoom.spawn},players:[{id:'peer',scene:'interior',interior_id:'shop-food',scene_id:'shop-food',name:'Реальный сосед',x:publicRoom.spawn.x+10,y:publicRoom.spawn.y},{id:'foreign',scene:'interior',interior_id:'casino',name:'Другая комната',x:publicRoom.spawn.x+10,y:publicRoom.spawn.y}]};
 const view=mountWorld(h.container,{profile:{id:'me'},api:async()=>snap});try{await settle();h.frame(1000);assert.ok(h.texts.includes('Реальный сосед'));assert.ok(!h.texts.includes('Другая комната'));}finally{view.destroy();}
});

test('door entry waits for an in-flight city move and flushes the displayed position',async()=>{
 const h=harness(),calls=[];let resolveMove,snap={scene:'city',position:{...foodDoor},players:[]};
 const api=async(path,data)=>{if(data)calls.push([path,data]);if(path==='/api/world/move'&&!resolveMove)return new Promise(resolve=>resolveMove=()=>resolve({...snap,position:{x:data.x,y:data.y}}));if(path==='/api/world/enter')snap={scene:'interior',interior_id:publicRoom.id,interior:publicRoom,position:publicRoom.spawn,players:[]};return snap;};
 const view=mountWorld(h.container,{profile:{id:'sync-me'},api});try{await settle();h.frame(9000);await settle();h.click('.world-enter');await settle();assert.equal(calls.filter(c=>c[0]==='/api/world/enter').length,0);resolveMove();await settle();await settle();const paths=calls.map(c=>c[0]);assert.deepEqual(paths,['/api/world/move','/api/world/move','/api/world/enter']);assert.deepEqual(calls[1][1],{...foodDoor,scene:'city'});}finally{view.destroy();}
});

test('a pending room entry cannot queue an idle city write behind the transition',async()=>{
 const h=harness(),calls=[];let resolveEntry,snap={scene:'city',position:{...foodDoor},players:[]};
 const view=mountWorld(h.container,{profile:{id:'entry-race'},api:async(path,data)=>{if(data)calls.push([path,data]);if(path==='/api/world/enter')return new Promise(resolve=>resolveEntry=()=>resolve({scene:'interior',interior_id:publicRoom.id,interior:publicRoom,position:publicRoom.spawn,players:[]}));return snap;}});
 try{await settle();h.click('.world-enter');await settle();h.frame(15000);await settle();resolveEntry();await settle();await settle();assert.deepEqual(calls.map(c=>c[0]),['/api/world/move','/api/world/enter']);assert.equal(view.getState().scene,'interior');}finally{view.destroy();}
});
test('the archive board remains a working results action outside the gallery door',async()=>{
 const h=harness(),opened=[],calls=[],snap={scene:'city',position:{...worldMap.landmarks.archive},players:[]};const view=mountWorld(h.container,{profile:{id:'board-user'},api:async(path,data)=>{if(data)calls.push(path);return snap;},onInteract:id=>opened.push(id)});
 try{await settle();h.key('e','KeyE');await settle();assert.deepEqual(opened,['results']);assert.ok(!calls.includes('/api/world/enter'));}finally{view.destroy();}
});
test('canvas counter taps use the same allowed approach radius as E and the action button',async()=>{
 const h=harness(),opened=[],snap={scene:'interior',interior_id:publicRoom.id,interior:publicRoom,position:{x:publicRoom.action.x+publicRoom.action.radius-1,y:publicRoom.action.y},players:[]};const view=mountWorld(h.container,{profile:{id:'tap-radius'},api:async()=>snap,onInteract:id=>opened.push(id)});
 try{await settle();h.frame(1000);const v=view.getState().view;for(const fn of h.element('.world-canvas').handlers.pointerdown)fn({clientX:(publicRoom.action.x-v.x)*v.scale,clientY:(publicRoom.action.y-v.y)*v.scale});await settle();assert.deepEqual(opened,['shop-food']);}finally{view.destroy();}
});
test('a pending sit claim cannot be cancelled by a queued idle position write',async()=>{
 const publicRoom=seatedRoom;
 const h=harness(),calls=[];let resolveSit,snap={scene:'interior',interior_id:publicRoom.id,interior:publicRoom,position:{x:publicRoom.seats[0].seat.x,y:publicRoom.seats[0].seat.y+40},pose:'idle',players:[]};
 const view=mountWorld(h.container,{profile:{id:'sit-race'},api:async(path,data)=>{if(data)calls.push([path,data]);if(path==='/api/world/activity'&&data.action==='sit')return new Promise(resolve=>resolveSit=()=>resolve({...snap,position:{...publicRoom.seats[0].seat},pose:'sit',bench_id:publicRoom.seats[0].id}));return snap;}});
 try{await settle();h.click('.world-enter');await settle();h.frame(15000);await settle();resolveSit();await settle();await settle();assert.deepEqual(calls.map(c=>c[0]),['/api/world/move','/api/world/activity']);assert.equal(view.getState().pose,'sit');assert.equal(view.getState().bench_id,publicRoom.seats[0].id);}finally{view.destroy();}
});
test('an accepted guest base refreshes host furniture and revocation returns to authority immediately',async()=>{
 const h=harness(),calls=[],host={id:'host',is_leader:false,is_guest:true,base:{building_id:'base-3',items:[],seats:[]}};let snap={scene:'city',position:{x:760,y:2610},players:[],my_clan:null};
 const view=mountWorld(h.container,{profile:{id:'guest'},api:async(path,data)=>{if(data)calls.push(data);if(data?.scene==='base')snap={...snap,scene:'base',position:{x:600,y:670},active_base:host};return snap;}});
 try{await settle();await view.travel('base',{clan_id:'host'});assert.equal(calls.at(-1).clan_id,'host');assert.equal(view.getState().scene,'base');assert.equal(h.element('.world-editor').hidden,true);
  snap={...snap,active_base:{...host,base:{...host.base,items:[{id:'chair-new',type:'chair',x:6,y:5,rotation:0}],seats:[{id:'base:host:chair-new:seat-1',seat:{x:635,y:597}}]}},position:{x:635,y:610}};await view.setPhone(false);assert.equal(view.getState().active_base.base.items[0].id,'chair-new');h.click('.world-enter');await settle();assert.equal(calls.at(-1).bench_id,'base:host:chair-new:seat-1');
  snap={scene:'city',position:{x:7560,y:1900},players:[],my_clan:{id:'own',base:{building_id:'base-1'}}};await view.refresh();assert.equal(view.getState().scene,'city');assert.deepEqual(view.getState().position,snap.position);assert.equal(h.element('.world-editor').hidden,true);
 }finally{view.destroy();}
});
test('a phone opened while sitting preserves the real seat and settings cannot move it',async()=>{
 const h=harness(),calls=[],seat=citySeat;let snap={scene:'city',position:{...seat.seat},pose:'sit',bench_id:seat.id,phone_open:false,players:[]};
 const name='Сидящий игрок';
 const view=mountWorld(h.container,{profile:{id:'seated',name},onSettings:()=>h.modal(true),api:async(path,data)=>{if(data)calls.push([path,data]);if(path==='/api/world/activity'&&data.action==='phone')snap={...snap,phone_open:data.open};return snap;}});
 const assertSeatDisplay=time=>{h.textPositions.length=0;h.frame(time);const marker=h.textPositions.find(p=>p.text===name);assert.ok(marker,'The local seated player must actually be drawn');assert.equal(marker.x,seat.visual.x);assert.equal(marker.y,seat.visual.y-86,'The local sprite and nickname must share the visible seat anchor');};
 try{await settle();assertSeatDisplay(100);await view.setPhone(true);assertSeatDisplay(200);assert.equal(view.getState().pose,'sit');assert.equal(view.getState().phone_open,true);assert.equal(view.getState().bench_id,seat.id);await view.setPhone(false);assertSeatDisplay(300);assert.equal(view.getState().phone_open,false);assert.equal(view.getState().bench_id,seat.id);h.modal(true);h.key('a');h.frame(9000);await settle();assert.deepEqual(view.getState().position,seat.seat);assert.equal(view.getState().pose,'sit');}finally{view.destroy();}
});
test('two-slot benches choose the nearest free real seat instead of an occupied centre',async()=>{
 const h=harness(),calls=[],first=worldBenches[0],second=worldBenches[1],snap={scene:'city',position:{...first.seat},players:[{id:'other',scene:'city',bench_id:first.id,x:first.seat.x,y:first.seat.y}]};
 const view=mountWorld(h.container,{profile:{id:'seat-user'},api:async(path,data)=>{if(path==='/api/world/activity')calls.push(data);return snap;}});try{await settle();h.click('.world-enter');await settle();assert.deepEqual(calls,[{action:'sit',bench_id:second.id}]);}finally{view.destroy();}
});
test('park fishing, dog, litter and bin actions flush position and pass authoritative IDs',async()=>{
 for(const a of worldMap.activities){const h=harness(),calls=[],opened=[];let snap={scene:'city',position:{x:a.x,y:a.y},players:[]};const view=mountWorld(h.container,{profile:{id:`activity-${a.id}`,avatar:{gender:0}},api:async(path,data)=>{if(data)calls.push([path,data]);if(path==='/api/world/move')snap={...snap,position:{x:data.x,y:data.y}};return snap;},onInteract:(id,detail)=>opened.push([id,detail])});try{await settle();h.frame(0);h.click('.world-enter');await settle();if(a.action==='pick-litter'){assert.equal(opened.length,0,'pickup waits for its physical stance');for(let time=16;time<=400;time+=16){h.frame(time);await settle();}assert.ok(calls[0][1].path?.length,'actual pickup approach is published as a real movement path');}assert.equal(calls[0][0],'/api/world/move');assert.deepEqual(opened,[[a.action,a.action==='fishing'?{spot_id:a.id}:{target_id:a.id}]]);}finally{view.destroy();}}
});
test('the first animation frame survives a pending initial world snapshot and resumes when loaded',async()=>{
 const h=harness();let resolveInitial;const snap={scene:'city',position:{...worldSpawn},players:[]};const view=mountWorld(h.container,{profile:{id:'first-frame'},api:()=>new Promise(resolve=>resolveInitial=resolve)});
 try{assert.doesNotThrow(()=>h.frame(1));assert.equal(view.getState().loaded,false);resolveInitial(snap);await settle();h.frame(1000);assert.equal(view.getState().loaded,true);assert.deepEqual(view.getState().position,worldSpawn);}finally{view.destroy();}
});

test('a player pushing against a solid keeps grounded idle feet instead of walking in place',async()=>{
 const h=harness(),supports=JSON.parse(readFileSync(new URL('../web/city-collisions.json',import.meta.url))).obstacles;
 // The shared canonical obstacle already includes its physical support. Start
 // on its legal boundary, so even the smallest rightward step is blocked.
 const position=supports.map(s=>({x:s.x-14,y:Math.round(s.y+s.height/2)})).find(p=>JSON.stringify(clampPosition(p.x,p.y))===JSON.stringify(p)&&JSON.stringify(movePosition(p,1,0))===JSON.stringify(p)&&JSON.stringify(movePosition(p,20,0))===JSON.stringify(p));assert.ok(position,'A real support must expose a clear contact edge that blocks every attempted step');const snap={scene:'city',position,players:[]};
 assert.deepEqual(clampPosition(snap.position.x,snap.position.y),snap.position,'The walker starts outside the actual building footprint');
 assert.deepEqual(movePosition(snap.position,20,0),snap.position,'The fixture must physically block a step toward the facade');
 const view=mountWorld(h.container,{profile:{id:'blocked-walker'},settings:{lightingMode:'day',showNicknames:false},api:async()=>snap});
 const idleOptions={facing:'right'},feet=()=>actorFootRects(h.rects,{},snap.position,idleOptions);
 try{await settle();h.key('d');h.rects.length=0;h.frame(9000);const first=feet();assert.ok(first.length>0,'The test must observe textured foot contacts');assert.deepEqual(first,actorFootRects(expectedActorRects({},snap.position,idleOptions),{},snap.position,idleOptions),'A blocked player must use the grounded directional idle sprite');h.rects.length=0;h.frame(9090);assert.deepEqual(view.getState().position,snap.position);assert.ok(feet().length>0,'The second frame must still contain real feet');assert.deepEqual(feet(),first,'Blocked movement must not advance the walk cycle');}finally{view.destroy();}
});

test('one hundred same-scene peers preserve online presence while off-camera sprites are culled',async()=>{
 const h=harness(),players=Array.from({length:100},(_,i)=>({id:`crowd-${i}`,name:`Offscreen ${i}`,scene:'city',x:7200+i,y:4300,pet:{id:`pet-${i}`,kind:'dog'}}));
 players[0]={...players[0],name:'Nearby real player',x:worldSpawn.x+45,y:worldSpawn.y};
 const snap={scene:'city',position:{...worldSpawn},players,online_count:101};const view=mountWorld(h.container,{profile:{id:'crowd-viewer'},api:async()=>snap});
 try{await settle();h.texts.length=0;h.frame(1000);assert.ok(h.texts.includes('Nearby real player'));assert.ok(!h.texts.some(t=>String(t).startsWith('Offscreen ')),'Off-camera nickname drawing must be skipped together with its sprite');assert.equal(h.element('.world-online-count').textContent,'101');}finally{view.destroy();}
});

test('remote snapshot movement turns and animates a peer, then settles at its server position',async()=>{
 const h=harness(),originalPerformance=globalThis.performance;let now=1000;globalThis.performance={now:()=>now};
 const peer={id:'moving-peer',name:'Moving peer',scene:'city',x:worldSpawn.x+45,y:worldSpawn.y,avatar:{shoesColor:3}},start=peer.x;let snap={scene:'city',position:{...worldSpawn},players:[peer]};
 const view=mountWorld(h.container,{profile:{id:'peer-viewer'},settings:{lightingMode:'day'},api:async()=>snap});
 const redraw=time=>{now=time;h.rects.length=0;h.textPositions.length=0;h.frame(time);return h.textPositions.find(t=>t.text===peer.name);};
 let shownPoint={x:start,y:peer.y},shownOptions={facing:'down'};
 const shoes=(rects=h.rects)=>actorFootRects(rects,peer.avatar,shownPoint,shownOptions);
 try{await settle();redraw(1000);now=2000;snap={...snap,players:[{...peer,x:start+40}]};await view.refresh();const halfway=redraw(2100);assert.ok(halfway.x>start&&halfway.x<start+40,'Nearby ordinary movement should bridge the two authoritative samples');
  shownPoint={x:halfway.x,y:peer.y};shownOptions={facing:'right',walking:true,running:true,walkFrame:Math.floor((halfway.x-start)/16)%avatarGeometry.walkFrames};const expected=expectedActorRects(peer.avatar,shownPoint,shownOptions);assert.ok(shoes().length>0,'The observed peer must have textured foot contacts');assert.ok(shoes(expected).length>0,'The directional reference must contain foot contacts');assert.deepEqual(shoes(),shoes(expected),'Peer feet must follow travelled distance using the same directional sprite as the owner');
  const arrival=redraw(3250);assert.equal(arrival.x,start+40);shownPoint={x:arrival.x,y:peer.y};shownOptions={facing:'right'};const idle=shoes();assert.ok(idle.length>0,'Arrival must show real grounded idle feet');assert.deepEqual(idle,shoes(expectedActorRects(peer.avatar,shownPoint,shownOptions)),'The arriving peer must settle on its directional idle pose');redraw(3340);assert.ok(shoes().length>0);assert.deepEqual(shoes(),idle,'A peer must stop animating at its authoritative target');assert.deepEqual(view.getState().position,worldSpawn,'Peer interpolation never moves the local player');
 }finally{view.destroy();globalThis.performance=originalPerformance;}
});

test('peer motion retargets from the displayed position and seats or phone overlays snap to authority',async()=>{
 const room=seatedRoom,seat=room.seats[0],h=harness({width:960,height:720,left:0,top:0}),originalPerformance=globalThis.performance;let now=1000;globalThis.performance={now:()=>now};
 const start=seat.approach.x-45,y=seat.approach.y;
 const peer={id:'interrupt-peer',name:'Interruptible peer',scene:'interior',interior_id:room.id,scene_id:room.id,x:start,y};let snap={scene:'interior',interior_id:room.id,interior:room,position:{x:seat.approach.x+120,y:seat.approach.y+60},players:[peer]};
 const view=mountWorld(h.container,{profile:{id:'interrupt-viewer'},api:async()=>snap});
 const redraw=time=>{now=time;h.textPositions.length=0;h.frame(time);return h.textPositions.find(t=>t.text===peer.name);};
 const update=async(time,changes)=>{now=time;snap={...snap,players:[{...snap.players[0],...changes}]};await view.refresh();};
 try{await settle();assert.ok(redraw(1000),'The initial peer must be in this actual room viewport');await update(2000,{x:start+40});const shown=redraw(2100).x;await update(2100,{x:start-20});assert.equal(redraw(2100).x,shown,'Retargeting must not restart from the last server sample');assert.ok(redraw(2200).x<shown);assert.equal(redraw(2350).x,start-20);
  await update(3000,{x:seat.seat.x});redraw(3050);await update(3050,{...seat.seat,pose:'sit',bench_id:seat.id});assert.equal(redraw(3050).x,seat.seat.x,'A claimed seat must appear exactly at the real seat immediately');
  await update(4000,{x:seat.approach.x+20,y:seat.approach.y,pose:'idle',bench_id:null});redraw(4050);await update(4050,{x:seat.approach.x+20,phone_open:true});assert.equal(redraw(4050).x,seat.approach.x+20,'Opening the phone must not leave a moving visual ghost');assert.equal(snap.players[0].phone_open,true);
 }finally{view.destroy();globalThis.performance=originalPerformance;}
});

test('peer interpolation never walks across an interior solid or blends a room transfer',async()=>{
 const h=harness({width:960,height:720,left:0,top:0}),originalPerformance=globalThis.performance;let now=1000;globalThis.performance={now:()=>now};
 const counter=publicRoom.counter,left=counter.x-20,right=counter.x+counter.width+20,y=counter.y+counter.height/2,returnPoint={x:publicRoom.action.x,y:publicRoom.action.y+20};
 const peer={id:'obstacle-peer',name:'Obstacle peer',scene:'interior',interior_id:publicRoom.id,scene_id:publicRoom.id,x:left,y};let snap={scene:'interior',interior_id:publicRoom.id,interior:publicRoom,position:{...publicRoom.action},players:[peer]};
 const view=mountWorld(h.container,{profile:{id:'obstacle-viewer'},settings:{zoom:.8},api:async()=>snap});
 const redraw=time=>{now=time;h.textPositions.length=0;h.frame(time);return h.textPositions.find(t=>t.text===peer.name);};
 try{await settle();assert.ok(redraw(1000),'The real support and both peer endpoints must be visible');now=2000;snap={...snap,players:[{...peer,x:right}]};await view.refresh();assert.equal(redraw(2100).x,right,'The actual native counter cannot be crossed by a visual tween');
  now=3000;snap={...snap,players:[{...peer,x:returnPoint.x,interior_id:'casino',scene_id:'casino'}]};await view.refresh();assert.equal(redraw(3100),undefined,'A transferred peer leaves immediately');
  now=4000;snap={...snap,players:[{...peer,...returnPoint}]};await view.refresh();assert.equal(redraw(4100).x,returnPoint.x,'Returning peers begin at their new authoritative position');
 }finally{view.destroy();globalThis.performance=originalPerformance;}
});

test('canvas follows changes to reduced motion and removes its preference listener on teardown',async()=>{
 const h=harness(),preference=window.querySelector('.motion-preference');preference.matches=true;window.matchMedia=()=>preference;
 const boat=worldMap.boats[0],snap={scene:'city',position:{x:boat.x,y:boat.y},boat:{id:boat.id,x:boat.x,y:boat.y},boats:worldMap.boats,players:[]};
 const view=mountWorld(h.container,{profile:{id:'reduced-sailor'},settings:{lightingMode:'day'},api:async()=>snap});
 const plane=time=>{h.rects.length=0;h.frame(time);return h.rects.filter(r=>r.color==='#ad9871');};
 try{await settle();const first=plane(1000);assert.deepEqual(plane(2250),first,'A reduced-motion preference holds the seated boat drawing steady');assert.equal(preference.handlers.change?.length,1);preference.matches=false;for(const fn of preference.handlers.change)fn({matches:false});assert.notDeepEqual(plane(2500),plane(3000),'Ordinary bobbing resumes after the system preference changes');}finally{view.destroy();}
 assert.equal(preference.handlers.change.length,0);
});

test('a world response started before a purchase cannot roll the wallet HUD back',async()=>{
 const h=harness();let resolveRefresh,waiting=false;const snap={scene:'city',position:{...worldSpawn},players:[],wallet:{balance:20}};
 const view=mountWorld(h.container,{profile:{id:'wallet-race'},api:async()=>waiting?new Promise(resolve=>resolveRefresh=resolve):snap});
 try{await settle();waiting=true;const pending=view.refresh();await settle();view.setWallet({balance:5,inventory:[{item_id:'furniture-sofa',quantity:1}]});resolveRefresh(snap);await pending;assert.equal(h.element('.world-balance').textContent,'5','A late snapshot must not overwrite a newer purchase balance');}finally{view.destroy();}
});

test('opt-in world diagnostics publish observed frame timing in DOM at most once a second',async()=>{
 const h=harness(),snap={scene:'city',position:{...worldSpawn},players:[]},view=mountWorld(h.container,{profile:{id:'timing-viewer'},diagnostics:true,api:async()=>snap});
 try{await settle();h.frame(1000);assert.equal(h.container.appended.attributes.has('data-world-fps'),false);for(let t=1016;t<=2016;t+=16)h.frame(t);const attrs=h.container.appended.attributes;assert.ok(Number(attrs.get('data-world-fps'))>50&&Number(attrs.get('data-world-fps'))<70);assert.ok(Number(attrs.get('data-world-frame-ms'))>=0);assert.ok(Number(attrs.get('data-world-render-ms'))>=0);assert.ok(Number(attrs.get('data-world-visible-actor-nodes'))>=1);const before=attrs.get('data-world-fps');h.frame(2400);assert.equal(attrs.get('data-world-fps'),before,'Diagnostics must not rewrite DOM on every frame');}finally{view.destroy();}
 const quiet=harness(),quietView=mountWorld(quiet.container,{profile:{id:'quiet-timing-viewer'},api:async()=>snap});try{await settle();quiet.frame(1000);quiet.frame(3000);assert.equal(quiet.container.appended.attributes.has('data-world-fps'),false);}finally{quietView.destroy();}
});

test('a clan leader enters a playable base with a closed editor and canvas taps claim real seats',async()=>{
 const h=harness(),calls=[],item={id:'chair-real',type:'chair',x:6,y:5,rotation:0},seat={id:'base:editable:chair-real:seat-1',seat:{x:635,y:597}},clan={id:'editable',is_leader:true,base:{building_id:'base-1',items:[item],seats:[seat]}};let snap={scene:'base',position:{x:635,y:610},active_base:clan,players:[]};
 const view=mountWorld(h.container,{profile:{id:'leader-player'},api:async(path,data)=>{if(data)calls.push([path,data]);if(path==='/api/world/move')snap={...snap,position:{x:data.x,y:data.y}};if(path==='/api/world/activity'&&data.action==='sit')snap={...snap,position:{...seat.seat},pose:'sit',bench_id:seat.id};return snap;}});
 try{await settle();assert.equal(h.element('.world-editor').hidden,true,'Room play must remain visible when a leader enters');assert.equal(h.element('.world-editor-toggle').hidden,false);assert.equal(h.element('.world-editor-toggle').attributes.get('aria-expanded'),'false');h.key('a');h.frame(1000);assert.ok(view.getState().position.x<635,'Collapsed editing must allow ordinary walking');
  const v=view.getState().view;for(const fn of h.element('.world-canvas').handlers.pointerdown)fn({clientX:(seat.seat.x-v.x)*v.scale,clientY:(seat.seat.y-v.y)*v.scale});await settle();assert.equal(view.getState().pose,'sit');assert.equal(view.getState().bench_id,seat.id);assert.deepEqual(view.getState().active_base.base.items,[item]);assert.equal(h.element('.world-save').disabled,true,'Seat taps must not mutate furniture');assert.ok(!calls.some(([path])=>path.includes('/base')));
 }finally{view.destroy();}
});

test('editor toggling preserves unsaved base paint and role loss closes it without submitting',async()=>{
 const h=harness(),calls=[],clan={id:'paint-base',is_leader:true,base:{building_id:'base-1',items:[]}};let snap={scene:'base',position:{x:600,y:670},active_base:clan,players:[]};
 const view=mountWorld(h.container,{profile:{id:'paint-leader'},api:async(path,data)=>{if(data)calls.push(path);return snap;}});
 try{await settle();h.click('.world-editor-toggle');assert.equal(h.element('.world-editor').hidden,false);assert.equal(h.element('.world-editor-toggle').attributes.get('aria-expanded'),'true');h.element('.world-wall-color').value='#b697d7';for(const fn of h.element('.world-wall-color').handlers.change)fn({});h.click('.world-editor-close');assert.equal(h.element('.world-editor').hidden,true);assert.equal(h.element('.world-save').disabled,false,'Closing must retain pending edits');h.click('.world-editor-toggle');assert.equal(h.element('.world-wall-color').value,'#b697d7');
  snap={...snap,active_base:{...clan,is_leader:false,is_guest:true}};await view.refresh();assert.equal(h.element('.world-editor').hidden,true);assert.equal(h.element('.world-editor-toggle').hidden,true);assert.equal(h.element('.world-editor-toggle').attributes.get('aria-expanded'),'false');h.click('.world-editor-toggle');assert.equal(h.element('.world-editor').hidden,true,'Hidden toggle cannot grant editing to a guest');assert.deepEqual(calls,[]);
 }finally{view.destroy();}
});

test('fractional mobile canvas height maps sofa center and foot taps to the real legacy seat',async()=>{
 const h=harness({left:2,top:56.5,width:316,height:509.5}),calls=[],seat={id:'base:tap-base:legacy-sofa:seat-1',seat:{x:565,y:655}},clan={id:'tap-base',is_leader:true,base:{building_id:'base-1',items:[{id:'legacy-sofa',type:'sofa',x:5,y:6}],seats:[seat]}};let snap={scene:'base',position:{...seat.seat},pose:'idle',active_base:clan,players:[]};
 const view=mountWorld(h.container,{profile:{id:'fractional-mobile'},api:async(path,data)=>{if(data)calls.push([path,data]);if(path==='/api/world/activity')snap={...snap,pose:data.action==='sit'?'sit':'idle',bench_id:data.action==='sit'?seat.id:null};return snap;}});
 const tap=clientY=>{for(const fn of h.element('.world-canvas').handlers.pointerdown)fn({clientX:160,clientY});};
 try{await settle();h.frame(1000);assert.equal(h.element('.world-canvas').height,510);assert.equal(view.getState().view.scale,1);assert.equal(view.getState().view.x,407);assert.equal(view.getState().view.y,369);assert.equal(h.element('.world-editor').hidden,true);
  tap(326);await settle();assert.equal(view.getState().pose,'sit');assert.equal(view.getState().bench_id,seat.id);tap(354);await settle();assert.equal(view.getState().pose,'idle');assert.deepEqual(calls.filter(([path])=>path==='/api/world/activity').map(([,data])=>data),[{action:'sit',bench_id:seat.id},{action:'stand'}]);assert.deepEqual(view.getState().position,seat.seat);assert.equal(h.element('.world-save').disabled,true);
 }finally{view.destroy();}
});


test('one second of remote walking is not compressed into a quarter-second sprint',async()=>{
 const h=harness(),originalPerformance=globalThis.performance;let now=1000;globalThis.performance={now:()=>now};
 // The current station frontage has buildings and trees. Exercise ordinary
 // walking on a genuinely clear horizontal corridor, rather than a teleport
 // sample crossing the old station's obsolete coordinates.
 let origin;
 for(let y=300;y<worldMap.height-300&&!origin;y+=100)for(let x=300;x<worldMap.width-500&&!origin;x+=100){const p={x,y},end=movePosition(p,worldMap.movement_speed,0);if(JSON.stringify(clampPosition(x,y))===JSON.stringify(p)&&end.x===x+worldMap.movement_speed&&end.y===y)origin=p;}
 assert.ok(origin,'A body-sized walking corridor must exist');
 const peer={id:'steady-peer',name:'Steady peer',scene:'city',...origin},start=peer.x;
 let snap={scene:'city',position:{x:origin.x+worldMap.movement_speed/2,y:origin.y},players:[peer]};
 const view=mountWorld(h.container,{profile:{id:'steady-viewer'},settings:{lightingMode:'day'},api:async()=>snap});
 const redraw=time=>{now=time;h.textPositions.length=0;h.frame(time);return h.textPositions.find(t=>t.text===peer.name).x;};
 try{await settle();redraw(1000);now=2000;snap={...snap,players:[{...peer,x:start+worldMap.movement_speed}]};await view.refresh();
  const quarter=redraw(2250);assert.ok(quarter>start&&quarter<=start+worldMap.movement_speed*.25+1,'A remote player must not sprint at four times the ordinary speed');
  const half=redraw(2500);assert.ok(half>quarter&&half<start+worldMap.movement_speed);
  assert.equal(redraw(3000),start+worldMap.movement_speed);
 }finally{view.destroy();globalThis.performance=originalPerformance;}
});


test('inventory has its own button and physical keyboard shortcut without moving the player',async()=>{
 const h=harness(),opened=[],snap={scene:'city',position:{...worldSpawn},players:[]};
 const view=mountWorld(h.container,{profile:{id:'inventory-shortcut'},api:async()=>snap,onInventory:()=>opened.push('inventory')});
 try{await settle();h.click('.world-inventory');h.key('ш','KeyI');assert.deepEqual(opened,['inventory','inventory']);assert.deepEqual(view.getState().position,worldSpawn);assert.equal(view.getState().phone_open,false);}finally{view.destroy();}
});

test('the hand keeps its place in free city space and only enables by an actionable object',async()=>{
 const h=harness(),calls=[];let snap={scene:'city',position:{...foodDoor},players:[]};
 const view=mountWorld(h.container,{profile:{id:'context-hand'},api:async(path,data)=>{if(data)calls.push([path,data]);return snap;}});
 try{await settle();h.frame(1000);assert.equal(h.element('.world-enter').hidden,false);assert.equal(h.element('.world-enter').disabled,false);
  assert.doesNotMatch(h.container.appended.innerHTML,/class="world-(travel|settings|base-button)"/,'The three obsolete HUD shortcuts must be removed, not merely covered by CSS');
  snap={...snap,position:{x:100,y:100}};await view.setPhone(false);h.frame(1050);
  assert.equal(h.element('.world-enter').hidden,false);assert.equal(h.element('.world-enter').disabled,true);
  const count=calls.length;h.click('.world-enter');h.key('e','KeyE');await settle();assert.equal(calls.length,count,'A disabled hand must not perform an action or move the player');
 }finally{view.destroy();}
});
test('contextual hand is available in a public room and a clan base, and hidden while controls are paused',async()=>{
 for(const scene of ['interior','base']){
  const h=harness(),clan={id:'hud-home',is_leader:true,base:{building_id:'base-1',items:[]}};
  const snap=scene==='interior'?{scene,interior_id:publicRoom.id,interior:publicRoom,position:{x:publicRoom.action.x,y:publicRoom.action.y},players:[]}:{scene,active_base:clan,position:{x:600,y:740},players:[]};
  const view=mountWorld(h.container,{profile:{id:'hud-player'},api:async()=>snap});
  try{await settle();h.frame(1000);assert.equal(h.element('.world-enter').hidden,false,scene);
   h.modal(true);h.frame(1050);assert.equal(h.element('.world-enter').hidden,true,'A menu must hide the contextual action');
   h.modal(false);h.frame(1100);assert.equal(h.element('.world-enter').hidden,false);
   await view.setInventory(true);h.frame(1150);assert.equal(h.element('.world-enter').hidden,true);
   await view.setInventory(false);h.frame(1200);assert.equal(h.element('.world-enter').hidden,false);
   await view.setPhone(true);h.frame(1250);assert.equal(h.element('.world-enter').hidden,true);
   await view.setPhone(false);h.frame(1300);assert.equal(h.element('.world-enter').hidden,false);
  }finally{view.destroy();}
 }
});
test('an occupied seat retains the disabled hand without offering an invalid action',async()=>{
 const h=harness(),point={...citySeat.seat};
 const occupied=worldBenches.filter(seat=>Math.hypot(seat.seat.x-point.x,seat.seat.y-point.y)<=worldInteractionRadii.bench).map((seat,index)=>({id:`seat-peer-${index}`,bench_id:seat.id,pose:'sit',...seat.seat,scene:'city'}));
 const snap={scene:'city',position:point,players:occupied,animals:[],boats:[]};
 const view=mountWorld(h.container,{profile:{id:'occupied-hud'},api:async()=>snap});
 try{await settle();h.frame(1000);assert.equal(h.element('.world-enter').hidden,false);assert.equal(h.element('.world-enter').disabled,true);}finally{view.destroy();}
});
