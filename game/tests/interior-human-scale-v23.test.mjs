import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolveDesignAsset,designCrop} from '../web/design-assets.js';
import {sourceInteriorDetailLayout,drawSourceInteriorSurfaces,preloadSourceInteriorRoom,drawSourceInteriorDetail} from '../web/source-interiors.js';

const map=JSON.parse(await readFile(new URL('../web/interiors-map.json',import.meta.url),'utf8'));
const limits={bench:[60,80],plant:[65,90],bin:[40,60],luggage:[40,60],kiosk:[100,125],cashier:[100,150],rack:[105,130],shelf:[105,150],bookcase:[125,150],fitting:[115,140],mirror:[100,125],chair:[50,75],sofa:[60,80],table:[50,90],'coffee-table':[35,55],bar:[70,110],'poker-table':[80,105],'roulette-table':[80,105],'display-desk':[55,85]};

test('public furnishings share the 80-unit human scale rather than sizing height from a huge width',()=>{
 assert.equal(map.rooms.length,11);
 for(const room of map.rooms)for(const p of room.props){
  const range=limits[p.type];if(!range)continue;
  assert.ok(p.visual.height>=range[0]&&p.visual.height<=range[1],`${room.id}:${p.id} is ${p.visual.height} high beside an 80-high person; expected ${range}`);
  const crop=designCrop(resolveDesignAsset(p.source_asset,p.source_direction),p.visual);
  assert.ok(Math.abs(p.visual.width/p.visual.height-crop.width/crop.height)<1e-6,'native sprite aspect is retained');
 }
});

test('all eleven walking floors use an existing flat material at a fixed tile size',()=>{
 for(const room of map.rooms){const material=room.floor_material;assert.ok(material,`${room.id} still walks on a stretched perspective floor`);assert.equal(resolveDesignAsset(material.asset_id)?.representation,'flat-texture');assert.ok(material.tile_world_size.every(n=>n>=192&&n<=384));}
});

test('food displays contain native food props and do not show books as groceries',()=>{
 const room=map.rooms.find(r=>r.id==='shop-food');assert.ok(!room.props.some(p=>p.type==='bookcase'));
 const goods=sourceInteriorDetailLayout(room).filter(d=>d.nativeProp);assert.ok(goods.length>=8);assert.ok(goods.every(d=>['sandwich','food-packet','mug'].includes(d.nativeProp)));
 for(const g of goods){const support=room.props.find(p=>p.id===g.supportId);assert.ok(support);assert.ok(g.bounds.x>=support.x&&g.bounds.x+g.bounds.width<=support.x+support.width);assert.ok(g.depth>support.depth);assert.equal(g.collision,false);}
});

test('compact groceries keep two stocked rows, clear inspection aisles and real glass sections',()=>{
 const room=map.rooms.find(r=>r.id==='shop-food'),displays=room.props.filter(p=>p.type==='food-display');assert.equal(displays.length,4);
 const rows=[...new Set(displays.map(p=>p.y))].sort((a,b)=>a-b);assert.equal(rows.length,2);assert.ok(rows[1]-rows[0]-40>=70);
 for(const y of rows){const row=displays.filter(p=>p.y===y).sort((a,b)=>a.x-b.x);assert.equal(row.length,2);assert.ok(row[0].x-room.bounds.left>=80);assert.ok(room.bounds.right-row[1].x-row[1].width>=80);assert.ok(row[1].x-row[0].x-row[0].width>=120,'clear central aisle');}
 const cases=sourceInteriorDetailLayout(room).filter(d=>d.sourceRect);assert.equal(cases.length,5,'checkout and four stocked display islands');
 for(const d of cases){const support=room.props.find(p=>p.id===d.supportId);assert.ok(support);assert.equal(d.assetId,'food-kiosk');assert.deepEqual(d.sourceRect,[209,291,373,357]);assert.ok(d.height<=60);assert.ok(d.bounds.x>=support.x&&d.bounds.x+d.bounds.width<=support.x+support.width);assert.equal(d.collision,false);}
});

test('all room entrances retain a clear 120-unit central approach to the service area',()=>{
 for(const room of map.rooms){const corridor=room.circulation?.entry;assert.ok(corridor,room.id);assert.ok(corridor.width>=120);for(const s of room.solids){const overlap=s.x<corridor.x+corridor.width&&s.x+s.width>corridor.x&&s.y<corridor.y+corridor.height&&s.y+s.height>corridor.y;assert.equal(overlap,false,`${room.id}:${s.prop_id} obstructs the entry corridor`);}}
});

test('ordinary rear wall modules have a human-sized height without stretching their source aspect',()=>{
 for(const room of map.rooms.filter(r=>r.source_family!=='bzik-hub')){
  const walls=room.surfaces.filter(s=>s.id.startsWith('back-wall'));assert.ok(walls.length>=2);
  for(const wall of walls){const upright=wall.wall_body_height??wall.visual.height;assert.ok(upright>=140&&upright<=220,`${room.id} rear wall body is ${upright} high`);const crop=designCrop(resolveDesignAsset(wall.asset_id),wall.visual);assert.ok(Math.abs(wall.visual.width/wall.visual.height-crop.width/crop.height)<1e-6);}
 }
});

test('native standing doors are taller than the person and retain their floor support and source aspect',()=>{
 const targets=[['railway','platform-door'],['arena','entry-door'],['results','entry-door'],['messages','door'],['casino','entry-door']];
 for(const [id,name] of targets){const room=map.rooms.find(r=>r.id===id),door=room.details.find(d=>d.id===name),v=door.visual;assert.equal(v.height,125,`${id}:${name} must admit an 80-high person`);assert.equal(v.y,room.bounds.top+2,'the standing door must meet the actual floor boundary');const a=resolveDesignAsset(door.asset_id),crop=designCrop(a,v);assert.ok(Math.abs(v.width/v.height-crop.width/crop.height)<1e-6);}
 const station=map.rooms.find(r=>r.id==='railway'),door=station.details.find(d=>d.id==='platform-door').visual,sign=station.details.find(d=>d.id==='platform-sign').visual;assert.ok(sign.y<=door.y-door.height-10,'the platform sign belongs above the enlarged door');
});

test('wall lamps leave the native signs and other mounted details readable',()=>{
 for(const room of map.rooms){const details=sourceInteriorDetailLayout(room),lamps=details.filter(d=>d.id.includes('wall-light-'));
  for(const lamp of lamps)for(const other of details.filter(d=>d!==lamp&&d.layer==='background')){const a=lamp.bounds,b=other.bounds;assert.equal(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y,false,`${room.id}: ${lamp.id} covers ${other.id}`);}
 }
});

test('the rendered walking plane repeats each material at its assigned native tile size instead of enlarged perspective lines',async()=>{
 const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
 const root=new URL('../',import.meta.url),load=url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root)));
 globalThis.OffscreenCanvas=class{constructor(w,h){return createCanvas(w,h);}};
 try{for(const room of map.rooms){
  await preloadSourceInteriorRoom(room,load);const c=createCanvas(room.width,room.height).getContext('2d');assert.equal(drawSourceInteriorSurfaces(c,room),true);const b=room.bounds;
  const material=room.floor_material,asset=resolveDesignAsset(material.asset_id),[tileWidth,tileHeight]=material.tile_world_size||asset.tile_world_size;
  assert.equal(asset.representation,'flat-texture');assert.ok(tileWidth>0&&tileHeight>0);
  const inside=(p,poly)=>{let v=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],z=poly[j];if((a[1]>p.y)!==(z[1]>p.y)&&p.x<(z[0]-a[0])*(p.y-a[1])/(z[1]-a[1])+a[0])v=!v;}return v;};
  let checked=0;const colors=new Set();for(let y=b.top+24;y<b.bottom-24;y+=29)for(let x=b.left+24;x<b.right-tileWidth-24;x+=37){const p={x:Math.floor(x),y:Math.floor(y)},q={x:p.x+tileWidth,y:p.y};if(!material.regions.some(poly=>[p,q].every(pt=>[[0,0],[-8,0],[8,0],[0,-8],[0,8]].every(([dx,dy])=>inside({x:pt.x+dx,y:pt.y+dy},poly)))))continue;const a=[...c.getImageData(p.x,p.y,1,1).data],z=[...c.getImageData(q.x,q.y,1,1).data];assert.deepEqual(a,z,`${room.id} floor material changes world scale`);assert.equal(a[3],255);colors.add(a.join(','));checked++;}
  assert.ok(checked>=3,`${room.id} has no measurable material region`);
  assert.ok(colors.size>=3,`${room.id} must paint varied native material rather than an opaque fallback`);
 }}finally{delete globalThis.OffscreenCanvas;}
});

test('native displayed groceries actually paint above their low display support',async()=>{
 const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');const root=new URL('../',import.meta.url),room=map.rooms.find(r=>r.id==='shop-food');
 await preloadSourceInteriorRoom(room,url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root))));
 const c=createCanvas(room.width,room.height).getContext('2d');
 for(const d of sourceInteriorDetailLayout(room).filter(d=>d.nativeProp)){assert.equal(drawSourceInteriorDetail(c,d),true);const b=d.bounds,px=c.getImageData(Math.floor(b.x),Math.floor(b.y),Math.ceil(b.width)+1,Math.ceil(b.height)+1).data;assert.ok(px.some((n,i)=>i%4===3&&n>=160));}
});

test('glass displays reuse the exact cabinet pixels without drawing the source facade or roof',async()=>{
 const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),root=new URL('../',import.meta.url),load=url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root)));
 const fixture={id:'cabinet-proof',modular_source:true,details:[{id:'glass',asset_id:'food-kiosk',source_rect:[209,291,373,357],x:102,y:86,width:164,layer:'object',collision:false}]};
 await preloadSourceInteriorRoom(fixture,load);const d=sourceInteriorDetailLayout(fixture)[0],c=createCanvas(220,120).getContext('2d');assert.equal(drawSourceInteriorDetail(c,d),true);
 const asset=resolveDesignAsset('food-kiosk'),reference=createCanvas(asset.width,asset.height).getContext('2d');reference.drawImage(await load(asset.url),0,0);
 assert.deepEqual(c.getImageData(20,20,164,66).data,reference.getImageData(209,291,164,66).data,'the glass cabinet is sampled byte for byte from its registered source PNG');
 const pixels=c.getImageData(0,0,220,120).data;for(let y=0;y<120;y++)for(let x=0;x<220;x++)if(x<20||x>=184||y<20||y>=86)assert.equal(pixels[(y*220+x)*4+3],0,'no exterior part of the source kiosk is painted');
});
