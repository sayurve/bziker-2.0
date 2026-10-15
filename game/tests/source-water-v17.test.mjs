import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await import('../web/source-water.js').catch(()=>({}));
const map=JSON.parse(await readFile(new URL('../web/world-layout-v19.json',import.meta.url),'utf8'));
const liveMap=JSON.parse(await readFile(new URL('../web/world-map.json',import.meta.url),'utf8'));
// The retained renderer is still used outside a complete authored scene. Keep
// its genuine pier/shore geometry checks separate from the exact map, which
// already contains those pixels and must never receive duplicate scenery.
const classicMap=JSON.parse(await readFile(new URL('../web/world-layout-v18.json',import.meta.url),'utf8'));
let canvasAPI;
async function ready(){
 const {createRequire}=await import('node:module'),require=createRequire(process.execPath);
 canvasAPI=require('@napi-rs/canvas');const {fileURLToPath}=await import('node:url'),root=new URL('../',import.meta.url);
 await source.preloadSourceWater(url=>canvasAPI.loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root))),{createCanvas:canvasAPI.createCanvas});
}
test('water family uses native environment layers without whole character or demonstration sheets',()=>{
 assert.equal(typeof source.drawSourceLake,'function');
 assert.equal(typeof source.drawSourceBoat,'function');assert.equal(typeof source.drawSourceDock,'function');
 assert.ok(source.sourceWaterAssetIds.includes('bziker-water-pier'));
 assert.ok(source.sourceWaterAssetIds.includes('bziker-water-boat-empty-seat-v3'));
 assert.ok(source.sourceWaterAssetIds.includes('bziker-water-motor-wake-sheet'));
 assert.ok(source.sourceWaterAssetIds.every(id=>!/(seated|driver|six-stages|entry|pocket|four-new-boats)/.test(id)));
});
test('boat body and its occluding front edge keep one fixed seat anchor; only four wake frames advance',()=>{
 assert.equal(typeof source.sourceBoatLayout,'function');
 const boat={id:'b',x:400,y:300,moving:true},a=source.sourceBoatLayout(boat,100),b=source.sourceBoatLayout(boat,900);
 assert.deepEqual(a.seat,{x:boat.x,y:boat.y});assert.deepEqual(a.body,b.body);
 assert.deepEqual(a.front,b.front);assert.ok(a.front.y>boat.y-8);assert.ok(a.bounds.width>=a.body.width);
 const frames=new Set(Array.from({length:4},(_,i)=>source.sourceWaterFrame(i*150).wake));assert.equal(frames.size,4);
 assert.deepEqual(source.sourceWaterFrame(100,true),source.sourceWaterFrame(999,true));
 assert.equal(source.sourceBoatLayout({...boat,x:NaN}),null);
});
test('the retained native pier is grounded at its v18 boarding and dock positions without changing saved geometry',()=>{
 assert.equal(typeof source.sourceDockLayout,'function');
 const before=JSON.stringify(classicMap.boats);
 for(const boat of classicMap.boats){const r=source.sourceDockLayout(boat);assert.equal(r.boarding.x,boat.boarding.x);assert.equal(r.boarding.y,boat.boarding.y);assert.ok(r.bounds.y<=boat.boarding.y);assert.ok(r.bounds.y+r.bounds.height<=boat.dock.y+30);assert.ok(r.bounds.width>125);}
 assert.equal(JSON.stringify(classicMap.boats),before);
});
test('retained native shore accents are deterministic and leave their v18 paths and boarding approaches clear',()=>{
 assert.equal(typeof source.sourceShoreLayouts,'function');const first=source.sourceShoreLayouts(classicMap);
 assert.deepEqual(first,source.sourceShoreLayouts(classicMap));assert.ok(first.length>=8);
 for(const p of first){assert.ok(p.assetId.startsWith('bziker-water-'));for(const b of classicMap.boats)assert.ok(Math.hypot(p.anchor.x-b.boarding.x,p.anchor.y-b.boarding.y)>160);
  const center={x:p.bounds.x+p.bounds.width/2,y:p.bounds.y+p.bounds.height/2},radius=Math.hypot(p.bounds.width,p.bounds.height)/2;
  for(const road of classicMap.roads)for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((center.x-a[0])*dx+(center.y-a[1])*dy)/den)):0;assert.ok(Math.hypot(center.x-a[0]-dx*t,center.y-a[1]-dy*t)>=road.width/2+radius+11,'native plant overlaps a saved path');}
 }
});
test('the exact city never repaints its native lake, piers, shore or stationary baked boats',async()=>{
 await ready();assert.equal(map.design_source.exact_scene,true);assert.equal(map.lake.exact_scene,true);assert.deepEqual(source.sourceShoreLayouts(map),[]);
 const {createCanvas}=canvasAPI,canvas=createCanvas(640,640),c=canvas.getContext('2d'),before=JSON.stringify({lake:map.lake,boats:map.boats});
 assert.equal(source.drawSourceLake(c,map.lake,0),true);
 for(const boat of map.boats){assert.equal(boat.exact_scene,true);assert.equal(source.drawSourceDock(c,boat),true);assert.equal(source.drawSourceBoat(c,boat,0,false),true);assert.equal(source.drawSourceBoat(c,boat,0,true),true);}
 assert.equal(c.getImageData(0,0,640,640).data.some(v=>v!==0),false,'native scenery is painted exclusively by the original city scene');assert.equal(JSON.stringify({lake:map.lake,boats:map.boats}),before,'visual guards never change authoritative water geometry');
});
test('an actual occupied or moving boat still paints its native hull above the exact city scene',async()=>{
 await ready();const {createCanvas}=canvasAPI,boat=map.boats[0];
 for(const state of [{occupant_id:'actual-player'},{moving:true}]){const canvas=createCanvas(640,640),c=canvas.getContext('2d');c.translate(320-boat.x,320-boat.y);assert.equal(source.drawSourceBoat(c,{...boat,...state},0,false),true);assert.equal(source.drawSourceBoat(c,{...boat,...state},0,true),true);assert.ok(c.getImageData(0,0,640,640).data.some((v,i)=>i%4===3&&v>0),'interactive boats are not suppressed with the baked background');}
});
test('real PNG water clips to the authoritative rotated ellipse; source boat passes compose into one native hull',async()=>{
 assert.equal(typeof source.preloadSourceWater,'function');await ready();
 const {createCanvas}=canvasAPI,c=createCanvas(600,400).getContext('2d'),lake={x:300,y:200,radius_x:200,radius_y:90,rotation:.35};
 assert.equal(source.drawSourceLake(c,lake,0,{shore:false}),true);const pixels=c.getImageData(0,0,600,400).data;
 assert.equal(pixels[(200*600+300)*4+3],255);assert.equal(pixels[3],0);
 for(let y=0;y<400;y+=8)for(let x=0;x<600;x+=8){const dx=x-lake.x,dy=y-lake.y,u=dx*Math.cos(lake.rotation)+dy*Math.sin(lake.rotation),v=-dx*Math.sin(lake.rotation)+dy*Math.cos(lake.rotation);if((u/lake.radius_x)**2+(v/lake.radius_y)**2>1.08)assert.equal(pixels[(y*600+x)*4+3],0);}
 const boat={x:250,y:220,moving:false},back=createCanvas(600,400).getContext('2d'),front=createCanvas(600,400).getContext('2d');
 assert.equal(source.drawSourceBoat(back,boat,0,false),true);assert.equal(source.drawSourceBoat(front,boat,0,true),true);
 const a=back.getImageData(0,0,600,400).data,b=front.getImageData(0,0,600,400).data;let rearPixels=0,frontPixels=0;
 for(let n=0;n<a.length;n+=4){if(a[n+3]>64)rearPixels++;if(b[n+3]>64){frontPixels++;assert.equal(a[n+3],0,'front edge was also drawn behind the character');}}
 assert.ok(rearPixels>2500);assert.ok(frontPixels>1000);
 const hashes=new Set();for(let frame=0;frame<4;frame++){const ctx=createCanvas(600,400).getContext('2d');source.drawSourceBoat(ctx,{...boat,moving:true},frame*150,false);hashes.add(Buffer.from(ctx.getImageData(0,0,600,400).data).toString('base64'));}assert.equal(hashes.size,4,'four wake cells must be cropped independently');
});

test('authored concave water outline and island holes use the same native image clip',async()=>{
 await ready();
 const {createCanvas}=canvasAPI,canvas=createCanvas(320,220),c=canvas.getContext('2d');
 const lake={x:150,y:100,radius_x:150,radius_y:100,outline:[[10,10],[100,10],[100,120],[200,120],[200,10],[300,10],[300,200],[10,200]],islands:[{x:55,y:145,radius_x:25,radius_y:15,rotation:.35}]};
 assert.equal(source.drawSourceLake(c,lake,0),true);
 const pixel=(x,y)=>Array.from(c.getImageData(x,y,1,1).data);
 assert.equal(pixel(150,40)[3],0,'native whole-lake background must not fill the dry inlet');
 assert.equal(pixel(55,145)[3],0,'root ground remains visible on an island');
 assert.equal(pixel(250,40)[3],255);assert.equal(pixel(2,2)[3],0);
 assert.ok(pixel(250,40)[2]>pixel(250,40)[1],'master map water is blue cyan');
});

test('native wave art remains unmodified; exactly four recolored frame canvases are cached',async()=>{
 assert.equal(typeof source.sourceWaterTexture,'function');await ready();
 const native=source.sourceWaterTexture(0,{native:true}),before=Buffer.from(native.getContext('2d').getImageData(0,0,native.width,native.height).data);
 const hashes=new Set();
 for(let frame=0;frame<4;frame++){
  const tinted=source.sourceWaterTexture(frame*333),raw=source.sourceWaterTexture(frame*333,{native:true});
  assert.notEqual(tinted,raw);assert.equal(tinted,source.sourceWaterTexture(frame*333),'color is cached rather than recomputed per draw');
  const pixels=tinted.getContext('2d').getImageData(0,0,tinted.width,tinted.height).data;
  hashes.add(Buffer.from(pixels).toString('base64'));
  const luminance=new Set();for(let i=0;i<pixels.length;i+=4*179){assert.ok(pixels[i+2]>pixels[i+1]);assert.equal(pixels[i+3],255);luminance.add(pixels[i+1]);}
  assert.ok(luminance.size>10,'wave contrast survives palette mapping');
 }
 assert.equal(hashes.size,4,'the four source waves remain distinct');
 assert.deepEqual(Buffer.from(native.getContext('2d').getImageData(0,0,native.width,native.height).data),before);
});

test('shore objects follow authored bay and island contours rather than obsolete ellipse radii',()=>{
 const lake={x:150,y:100,radius_x:150,radius_y:100,outline:[[0,0],[100,0],[100,120],[200,120],[200,0],[300,0],[300,200],[0,200]],islands:[{x:55,y:145,radius_x:25,radius_y:15,rotation:.35}]};
 const layouts=source.sourceShoreLayouts({lake});assert.ok(layouts.length>=12);
 const segmentDistance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/len)):0;return Math.hypot(p.x-a[0]-t*dx,p.y-a[1]-t*dy);};
 for(const detail of layouts.filter(p=>p.contour==='outer')){
  const distance=Math.min(...lake.outline.map((a,i)=>segmentDistance(detail.shorePoint,a,lake.outline[(i+1)%lake.outline.length])));
  assert.ok(distance<1e-6,'accent sampled from the real boundary');assert.ok(Math.hypot(detail.anchor.x-detail.shorePoint.x,detail.anchor.y-detail.shorePoint.y)<40);
 }
 assert.ok(layouts.some(p=>p.contour==='island-0'));
 assert.ok(layouts.some(p=>p.layer==='bank'&&p.width>70),'dense native stone rim is separate from reeds and grass accents');
});

test('native stone rim and shore plants leave authored island bridge approaches open',()=>{
 const lake={x:150,y:100,radius_x:150,radius_y:100,outline:[[0,0],[100,0],[100,120],[200,120],[200,0],[300,0],[300,200],[0,200]],islands:[{x:55,y:145,radius_x:25,radius_y:15}],walkways:[{id:'island-bridge',points:[[310,145],[55,145]],width:20}]};
 for(const p of source.sourceShoreLayouts({lake})){
  const center={x:p.anchor.x,y:p.anchor.y-p.height/2},radius=Math.hypot(p.width,p.height)/2;
  const x=Math.max(55,Math.min(310,center.x)),distance=Math.hypot(center.x-x,center.y-145);
  assert.ok(distance>=10+radius+12,'native rock or grass would occlude bridge feet');
 }
});


test('live modular city actually draws independent piers and empty boats',async()=>{
 await ready();assert.equal(liveMap.design_source.exact_scene,false);
 const {createCanvas}=canvasAPI;
 for(const boat of liveMap.boats){
  assert.notEqual(boat.exact_scene,true);
  const canvas=createCanvas(640,640),c=canvas.getContext('2d');
  c.translate(320-boat.x,320-boat.y);
  source.drawSourceBoat(c,boat,0,false);source.drawSourceBoat(c,boat,0,true);
  assert.ok(c.getImageData(0,0,640,640).data.some((v,i)=>i%4===3&&v>0),boat.id+' empty hull must be a real rendered object');
  const dock=createCanvas(640,640),dc=dock.getContext('2d');dc.translate(320-boat.boarding.x,320-boat.boarding.y);
  assert.equal(source.drawSourceDock(dc,boat),true);
  assert.ok(dc.getImageData(0,0,640,640).data.some((v,i)=>i%4===3&&v>0),boat.id+' pier must be rendered independently');
 }
});
