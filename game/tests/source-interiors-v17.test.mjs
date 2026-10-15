import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const interiors=await import('../web/source-interiors.js').catch(()=>({}));
const {rooms:publicRooms}=JSON.parse(await readFile(new URL('../web/interiors-map-v19.json',import.meta.url),'utf8'));
// These unit fixtures exercise the retained editable/fallback renderer.
// The frozen v19 image fixtures remain historical; modular public rooms are verified by v20 tests.
const rooms=publicRooms.map(room=>({...room,exact_source:false,source_scene:null,width:900,height:680,bounds:{left:28,right:872,top:78,bottom:652}}));

test('room preload fetches only the native sides that its props actually display',async()=>{
 assert.equal(typeof interiors.sourceInteriorRoomAssetRequests,'function');
 const room={...rooms.find(r=>r.id==='clans'),props:[
  {id:'left-sofa',type:'sofa',x:100,y:250,width:140,height:58,rotation:90},
  {id:'back-sofa',type:'sofa',x:300,y:250,width:140,height:58,rotation:180},
  {id:'front-bookcase',type:'bookcase',x:550,y:150,width:100,height:70,rotation:0},
 ]};
 const {resolveDesignAsset}=await import('../web/design-assets.js'),requests=interiors.sourceInteriorRoomAssetRequests(room);
 assert.deepEqual(requests.filter(r=>r.id==='clan-furniture-sofa-modern').map(r=>r.direction).sort(),['back','left']);
 assert.deepEqual(new Set(requests.map(r=>r.id)),new Set(interiors.sourceInteriorRoomAssetIds(room)),'The public asset-ID contract must remain intact');
 const {createRequire}=await import('node:module'),{fileURLToPath}=await import('node:url'),{loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),loaded=[];
 await interiors.preloadSourceInteriorRoom(room,async url=>{loaded.push(url);return loadImage(fileURLToPath(new URL('..'+url,import.meta.url)));});
 const expected=[...new Set(requests.map(r=>resolveDesignAsset(r.id,r.direction).url))].sort();
 assert.deepEqual(loaded.sort(),expected,'Unseen front/right sofa views should stay lazy');
 assert.ok(!loaded.includes(resolveDesignAsset('clan-furniture-sofa-modern','front').url));assert.ok(!loaded.includes(resolveDesignAsset('clan-furniture-sofa-modern','right').url));
});

test('all fallback themes preserve native prop supports',()=>{
 assert.equal(typeof interiors.sourceInteriorSurfaceAssets,'function');
 assert.equal(typeof interiors.sourceInteriorPropLayout,'function');
 const saved=JSON.stringify(rooms);
 for(const room of rooms){const surfaces=interiors.sourceInteriorSurfaceAssets(room);assert.ok(surfaces.floor&&surfaces.wall);let count=0;for(const p of room.props){const r=interiors.sourceInteriorPropLayout(p,room);if(!r)continue;count++;assert.equal(r.depth,p.y+p.height);assert.deepEqual(r.footprint,{x:p.x,y:p.y,width:p.width,height:p.height});assert.ok(r.bounds.x>=p.x-.001);assert.ok(r.bounds.x+r.bounds.width<=p.x+p.width+.001);assert.ok(r.bounds.y+r.bounds.height<=p.y+p.height+.001);}const wallLights=interiors.sourceInteriorDetailLayout(room).filter(d=>/-(wall-lamp|sconce)$/.test(d.assetId));assert.ok(count+wallLights.length>=6,`${room.id} lacks its source props and mounted fixtures`);}
 for(const p of rooms.find(r=>r.id==='shop-food').props.filter(p=>['fridge','gondola','produce'].includes(p.type)))assert.equal(interiors.sourceInteriorPropLayout(p,rooms.find(r=>r.id==='shop-food')),null,'missing grocery artwork must not be replaced with unrelated furniture');
 assert.equal(JSON.stringify(rooms),saved);
});

test('clan furniture selects four distinct native views without rotating a flat picture',async()=>{
 assert.equal(typeof interiors.sourceFurnitureLayout,'function');
 const {resolveDesignAsset}=await import('../web/design-assets.js');
 for(const theme of ['modern','loft','tech','wood','stone'])for(const type of ['desk','dining-table','chair','sofa','bookcase','board','plant']){
  const urls=new Set();for(const rotation of [0,90,180,270]){const item={type,rotation,x:2,y:3},r=interiors.sourceFurnitureLayout(item,theme,{x:200,y:300,width:rotation%180?58:140,height:rotation%180?140:58});assert.ok(r);assert.equal(r.direction,({0:'front',90:'left',180:'back',270:'right'})[rotation]);const asset=resolveDesignAsset(r.assetId,r.direction);assert.ok(asset);urls.add(asset.url);assert.equal(r.anchor.y,rotation%180?440:358);}
  assert.equal(urls.size,4,`${theme} ${type} reuses a view`);
 }
 assert.equal(interiors.sourceFurnitureAssetId({type:'sofa',source_theme:'wood'},'modern'),'clan-furniture-sofa-wood');
 assert.equal(interiors.sourceFurnitureAssetId({type:'sofa',source_asset:'casino-interior-slot'},'modern'),'clan-furniture-sofa-modern','saved data cannot turn furniture into arbitrary source artwork');
});

test('loaded source props and surfaces paint native assets on a clipped room plane',async()=>{
 assert.equal(typeof interiors.preloadSourceInteriors,'function');
 const {createRequire}=await import('node:module'),require=createRequire(process.execPath),{createCanvas,loadImage}=require('@napi-rs/canvas'),{fileURLToPath}=await import('node:url'),root=new URL('../',import.meta.url);
 await interiors.preloadSourceInteriors(url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root))));
 for(const room of rooms){const canvas=createCanvas(room.width,room.height),c=canvas.getContext('2d');assert.equal(interiors.drawSourceInteriorSurfaces(c,room),true);assert.ok(c.getImageData(room.bounds.left+10,room.bounds.top+10,10,10).data.some((v,i)=>i%4===3&&v>0));let drawn=0;for(const p of room.props){if(interiors.sourceInteriorPropLayout(p,room)){assert.equal(interiors.drawSourceInteriorProp(c,p,room),true);drawn++;}}for(const light of interiors.sourceInteriorDetailLayout(room).filter(d=>/-(wall-lamp|sconce)$/.test(d.assetId))){assert.equal(interiors.drawSourceInteriorDetail(c,light),true);drawn++;}assert.ok(drawn>5);}
 const c=createCanvas(300,300).getContext('2d');c.rotate=()=>{throw Error('Flat sprite was rotated');};c.scale=()=>{throw Error('Flat sprite was mirrored');};assert.equal(interiors.drawSourceFurniture(c,{type:'sofa',rotation:90,color:'#7d9de6'},'loft',{x:60,y:160,width:58,height:140}),true);
 globalThis.OffscreenCanvas=class {constructor(w,h){return createCanvas(w,h);}};
 try {const original=createCanvas(300,300).getContext('2d'),blue=createCanvas(300,300).getContext('2d'),options={x:70,y:160,width:140,height:58};interiors.drawSourceFurniture(original,{type:'sofa',rotation:0},'modern',options);interiors.drawSourceFurniture(blue,{type:'sofa',rotation:0,color:'#7d9de6'},'modern',options);const a=original.getImageData(0,0,300,300).data,b=blue.getImageData(0,0,300,300).data;let changed=0;for(let i=0;i<a.length;i+=4){if(a[i+3]>200&&b[i+3]>200&&(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]))changed++;if(!a[i+3])assert.equal(b[i+3],0,'colour paint leaks outside the furniture silhouette');}assert.ok(changed>200,'saved colour did not change the native sofa');}finally {delete globalThis.OffscreenCanvas;}
});

test('native room details are attached to walls or existing supports, preserving every passage and interaction',async()=>{
 assert.equal(typeof interiors.sourceInteriorDetailLayout,'function');
 const {resolveDesignAsset}=await import('../web/design-assets.js'),required={railway:['cash-sign','clock','platform-door','platform-sign','pendant'],casino:['cash-sign','shelf','bar-stool','roulette','chandelier','entry-door','cup'],arena:['header','selector-sign','overhead-light','floor-light','front-rim','entry-steps','entry-door','backdrop-amber'],profile:['shoe-shelf','sign-clothes','sign-fitting','strip-light'],messages:['bottle-shelf','bar-stool','pendant','door','window']},saved=JSON.stringify(rooms);
 for(const [id,names] of Object.entries(required)){const room=rooms.find(r=>r.id===id),details=interiors.sourceInteriorDetailLayout(room),ids=new Set(details.map(d=>d.id));assert.equal(ids.size,details.length);for(const name of names)assert.ok(details.some(d=>d.assetId.endsWith(`-${name}`)),`${id} omits ${name}`);
  for(const d of details){assert.ok(resolveDesignAsset(d.assetId,d.direction));assert.equal(d.direction,'front');assert.equal(d.interactive,false);assert.equal(d.collision,false);assert.ok(['background','object','foreground'].includes(d.layer));assert.ok(Number.isFinite(d.depth));const r=d.bounds;assert.ok(r.width>0&&r.height>0);assert.ok(r.x>=-.01&&r.y>=-.01&&r.x+r.width<=room.width+.01&&r.y+r.height<=room.height+.01,`${d.id} leaves the room`);
   if(d.supportId){const p=room.props.find(p=>p.id===d.supportId);assert.ok(p,`${d.id} lacks its physical support`);assert.ok(r.x>=p.x-.01&&r.x+r.width<=p.x+p.width+.01);assert.ok(r.y+r.height<=p.y+p.height+.01);assert.ok(r.width<=p.width*.6,`${d.id} conceals the underlying interaction`);}
   else if(!d.floorAttachment)assert.ok(r.y+r.height<=room.bounds.top+.01||r.y>=room.bounds.bottom-.01,`${d.id} intrudes into an unsupported walking area`);
  }
 }
 assert.equal(JSON.stringify(rooms),saved);
 const food=interiors.sourceInteriorDetailLayout(rooms.find(r=>r.id==='shop-food'));assert.equal(food.some(d=>/platform|cash-sign|clock/.test(d.assetId)),false,'grocery shop must not receive railway signs');
});

test('room preload includes its real side walls and details without downloading unrelated rooms',async()=>{
 assert.equal(typeof interiors.sourceInteriorRoomAssetIds,'function');
 const {resolveDesignAsset}=await import('../web/design-assets.js');
 for(const id of ['railway','casino','arena','profile','messages']){const room=rooms.find(r=>r.id===id),s=interiors.sourceInteriorSurfaceAssets(room),ids=interiors.sourceInteriorRoomAssetIds(room);assert.ok(s.leftWall&&s.rightWall&&s.leftWall!==s.rightWall);assert.ok(ids.includes(s.leftWall)&&ids.includes(s.rightWall));for(const d of interiors.sourceInteriorDetailLayout(room))assert.ok(ids.includes(d.assetId));assert.equal(new Set(ids).size,ids.length);for(const assetId of ids)assert.ok(resolveDesignAsset(assetId));assert.ok(ids.length<40);}
});

test('full HEX palette reaches neutral native surfaces and black furniture while preserving alpha and shading',async()=>{
 assert.equal(typeof interiors.tintSourcePixels,'function');
 const original=new Uint8ClampedArray([0,0,0,255,64,64,64,255,128,128,128,255,255,255,255,255,90,120,20,0]),painted=new Uint8ClampedArray(original);assert.equal(interiors.tintSourcePixels(painted,'#F57B3C'),true);for(let i=0;i<16;i+=4){assert.ok(painted[i]>painted[i+1]&&painted[i+1]>painted[i+2]);assert.equal(painted[i+3],original[i+3]);}assert.ok(painted[0]<painted[4]&&painted[4]<painted[8]&&painted[8]<painted[12]);assert.deepEqual([...painted.slice(16)],[...original.slice(16)]);const bad=new Uint8ClampedArray(original);assert.equal(interiors.tintSourcePixels(bad,'#gg0000'),false);assert.deepEqual(bad,original);
 const room={...rooms.find(r=>r.id==='clans'),wall_color:'#E34589',floor_color:'#4CB482'},s=interiors.sourceInteriorSurfaceAssets(room);assert.equal(s.wallTint,'#e34589');assert.equal(s.floorTint,'#4cb482');
 const {createRequire}=await import('node:module'),require=createRequire(process.execPath),{createCanvas,loadImage}=require('@napi-rs/canvas'),{fileURLToPath}=await import('node:url'),root=new URL('../',import.meta.url);await interiors.preloadSourceInteriors(url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root))));globalThis.OffscreenCanvas=class {constructor(w,h){return createCanvas(w,h);}};
 try{const colors=['#edb845','#63b895','#5283dd','#de6184','#000000'],contexts=colors.map(color=>{const c=createCanvas(320,240).getContext('2d');assert.equal(interiors.drawSourceFurniture(c,{type:'sofa',rotation:0,color},'modern',{x:65,y:145,width:185,height:60}),true);return c.getImageData(0,0,320,240).data;});for(let index=1;index<contexts.length;index++){let changed=0;const a=contexts[0],b=contexts[index];for(let i=0;i<a.length;i+=4){assert.equal(a[i+3],b[i+3]);if(a[i+3]>200&&Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>30)changed++;}assert.ok(changed>500,`sofa cannot adopt ${colors[index]}`);}
  const render=colors=>{const c=createCanvas(900,680).getContext('2d');assert.equal(interiors.drawSourceInteriorSurfaces(c,{...room,...colors}),true);return c.getImageData(0,0,900,680).data;},a=render({wall_color:'#d8497c',floor_color:'#579c72'}),b=render({wall_color:'#5c83dd',floor_color:'#dfad55'});let wall=0,floor=0;for(let y=8;y<650;y++)for(let x=32;x<867;x++){const i=(y*900+x)*4;if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>40){if(y<70)wall++;if(y>90)floor++;}}assert.ok(wall>2000,'wall material ignores custom HEX');assert.ok(floor>10000,'floor material ignores custom HEX');
 }finally{delete globalThis.OffscreenCanvas;}
});

test('native props fit the room ceiling and detail renderer never rotates or mirrors their artwork',async()=>{
 assert.equal(typeof interiors.drawSourceInteriorDetail,'function');
 const {createRequire}=await import('node:module'),require=createRequire(process.execPath),{createCanvas,loadImage}=require('@napi-rs/canvas'),{fileURLToPath}=await import('node:url'),root=new URL('../',import.meta.url);await interiors.preloadSourceInteriors(url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root))));const c=createCanvas(900,680).getContext('2d');c.rotate=()=>{throw Error('detail rotated');};c.scale=()=>{throw Error('detail mirrored');};
 for(const room of rooms){for(const p of room.props){const r=interiors.sourceInteriorPropLayout(p,room);if(r)assert.ok(r.bounds.y>=6-.01,`${room.id}:${p.id} rises above the ceiling`);}for(const d of interiors.sourceInteriorDetailLayout(room))assert.equal(interiors.drawSourceInteriorDetail(c,d),true);}
});
