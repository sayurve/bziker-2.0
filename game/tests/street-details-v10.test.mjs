import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createCityGroundPlan} from '../web/city-ground.js';
import {segmentCrossesLake} from '../web/water.js';
import {streetDetailGeometry,streetDetailObjects} from '../web/street-details.js';
import {sourceStreetLayout} from '../web/source-city.js';
let createCanvas;
try{({createCanvas}=createRequire(import.meta.url)('@napi-rs/canvas'));}
catch{({createCanvas}=createRequire(process.execPath)('@napi-rs/canvas'));}
const map=JSON.parse(await readFile(new URL('../web/world-layout-v18.json',import.meta.url),'utf8'));
const plan=createCityGroundPlan(map),lamps=map.decor.lamps;
const details=streetDetailObjects(map),bins=map.activities.filter(a=>a.action==='trash-bin');
const lampBounds=l=>sourceStreetLayout('lamp',l.x,l.y).bounds,binBounds=l=>sourceStreetLayout('bin',l.x,l.y).bounds;
const newProps=[...lamps.map(l=>({...l,bounds:lampBounds(l)})),...details,...bins.map(b=>({...b,bounds:binBounds(b)}))];
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
function lineRectangleClear(a,b,width,box){
 // Sample the whole outline and both route endpoints. The dense outline
 // sampling catches projected sides, not just a prop's centre or support.
 const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy;
 const distance=(x,y)=>{const t=n?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/n)):0;return Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);};
 if([a,b].some(p=>p[0]>=box.x&&p[0]<=box.x+box.width&&p[1]>=box.y&&p[1]<=box.y+box.height))return false;
 for(let x=box.x;x<=box.x+box.width;x+=1)if(distance(x,box.y)<width/2+7||distance(x,box.y+box.height)<width/2+7)return false;
 for(let y=box.y;y<=box.y+box.height;y+=1)if(distance(box.x,y)<width/2+7||distance(box.x+box.width,y)<width/2+7)return false;
 return true;
}
test('the authored city has measured lighting rows in all pedestrian districts',()=>{
 assert.ok(lamps.length>=28&&lamps.length<=85,`Source streets have ${lamps.length} aligned lights`);
 assert.ok(lamps.every(l=>l.row_id&&l.road_id));assert.ok(new Set(lamps.map(l=>l.row_id)).size>=12);
 assert.equal(details.length,map.buildings.length);assert.ok(bins.length>=8);assert.ok(!details.some(d=>d.kind==='guide'));
 assert.equal(new Set(newProps.map(p=>p.id)).size,newProps.length);
});
test('full source contours leave every authored route and all 19 generated entrances open',()=>{
 assert.equal(map.roads.filter(r=>r.id.startsWith('door-')).length,map.architecture.frontages.length);assert.equal(plan.approaches.length,19);
 const routes=[...plan.roadSegments,...plan.approaches.flatMap(a=>a.path.slice(1).map((b,i)=>({id:`approach-${a.id}`,a:a.path[i],b,width:a.width})))];
 for(const p of newProps)for(const r of routes)assert.ok(lineRectangleClear(r.a,r.b,r.width,p.bounds),`${p.id} covers ${r.id}`);
});
test('new props keep clear of every house, tree, bench, planting, existing light and each other',()=>{
 const fixed=[...map.buildings,...map.district.buildings,...map.background_buildings,...map.decor.trees.map(t=>({id:t.id,x:t.x-9*t.size,y:t.y+15*t.size,width:18*t.size,height:17*t.size})),...map.bench_groups.map(b=>({id:b.id,...sourceStreetLayout('bench',b.x,b.y).bounds})),...plan.plantings.map(b=>({id:b.id,x:b.x-2,y:b.y-16,width:b.width+8,height:47}))];
 for(let i=0;i<newProps.length;i++){const p=newProps[i];for(const f of fixed)assert.ok(!overlap(p.bounds,f),`${p.id} overlaps ${f.id}`);for(let j=i+1;j<newProps.length;j++)assert.ok(!overlap(p.bounds,newProps[j].bounds),`${p.id} overlaps ${newProps[j].id}`);}
});
test('street details are grounded beside their declared routes and outside the water',()=>{
 for(const p of newProps){if(p.road_id){const r=map.roads.find(r=>r.id===p.road_id);assert.ok(r,`${p.id} has no road association`);assert.ok(Array.isArray(p.anchor));assert.ok(Math.abs(Math.hypot(p.x-p.anchor[0],p.y-p.anchor[1])-(r.width/2+185))<=1.5,`${p.id} is detached from its aligned row`);}
  const b=p.bounds;assert.ok(b.x>=28&&b.y>=28&&b.x+b.width<=map.width-28&&b.y+b.height<=map.height-28);
  const corners=[[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]];
  for(let i=0;i<4;i++)assert.equal(segmentCrossesLake(map.lake,{x:corners[i][0],y:corners[i][1]},{x:corners[(i+1)%4][0],y:corners[(i+1)%4][1]},-10),false,`${p.id} touches the water`);
 }
});
test('new waste bins participate in the existing disposal action',()=>{
 for(const bin of bins){assert.equal(bin.action,'trash-bin');assert.equal(bin.label,'Выбросить мусор');assert.equal(bin.radius,65);}
 assert.ok(bins.some(b=>b.id==='bin-park'));assert.ok(bins.some(b=>b.id==='bin-plaza'));assert.ok(bins.some(b=>b.id.includes('arrival')));
});
test('crossing landings and their tactile pads stay unobscured',()=>{
 const clear=plan.crossings.flatMap(c=>c.pads.map((poly,i)=>{const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);return {id:`${c.id}-pad-${i}`,x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}));
 for(const p of newProps)for(const pad of clear)assert.ok(!overlap(p.bounds,pad),`${p.id} covers ${pad.id}`);
});
test('each street sprite fits its declared complete bounds with stable pixels and ground depth',async()=>{
 const {preloadDesignAssets}=await import('../web/design-assets.js'),{loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),{fileURLToPath}=await import('node:url'),root=new URL('../',import.meta.url);
 await preloadDesignAssets(['street-bin'],url=>loadImage(fileURLToPath(new URL(url.replace(/^\//,''),root))));
 for(const kind of ['planter','bollard','bin']){const f={id:kind,kind,x:140,y:140,flowers:true},node=streetDetailObjects({decor:{street_details:[f]}})[0],paint=()=>{const canvas=createCanvas(300,300),c=canvas.getContext('2d');node.paint(c);return c.getImageData(0,0,300,300).data;},a=paint(),b=paint();assert.deepEqual(a,b);
  let count=0;for(let y=0;y<300;y++)for(let x=0;x<300;x++)if(a[(y*300+x)*4+3]){count++;assert.ok(x>=node.bounds.x&&y>=node.bounds.y&&x<node.bounds.x+node.bounds.width&&y<node.bounds.y+node.bounds.height,`${kind} draws outside bounds at ${x},${y}`);}
  assert.ok(count>180,`${kind} has no useful sprite`);assert.ok(node.depth>=f.y);assert.deepEqual(streetDetailGeometry(f).bounds,node.bounds);
 }
 assert.equal(streetDetailGeometry({kind:'unknown',x:1,y:1}),null);
});
