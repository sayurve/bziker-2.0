import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=resolve(app,'../..');
let createCanvas;
try{({createCanvas}=createRequire(import.meta.url)('@napi-rs/canvas'));}catch{({createCanvas}=createRequire(process.execPath)('@napi-rs/canvas'));}
const baselineRevision='7f355bcda4c59a91532f08bf5634c71c59a40ba8';
const original=execFileSync('git',['show',`${baselineRevision}:output/bziker/web/city-ground.js`],{cwd:root,encoding:'utf8'});
const before=await import(`data:text/javascript;base64,${Buffer.from(original.replace("'./road-topology.js'",JSON.stringify(pathToFileURL(resolve(app,'web/road-topology.js')).href))).toString('base64')}`);
const after=await import(pathToFileURL(resolve(app,'web/city-ground.js')).href);
const files=['web/city-ground.js','web/road-topology.js','web/world-map.json'];
const hash=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await readFile(resolve(app,p))).digest('hex')])));
const beforeHashes=await hash(),map=JSON.parse(await readFile(resolve(app,'web/world-map.json'),'utf8')),plan=after.createCityGroundPlan(map);
const rgb=color=>color.match(/\w\w/g).map(n=>parseInt(n,16));
const publicPaths=plan.roads.filter(r=>r.kind!=='road'&&!r.id.startsWith('door-')&&!r.id.startsWith('access-'));
const samples=[];
function addPath(id,path,width,street=false){for(let k=1;k<path.length;k++){
 const a=path[k-1],b=path[k],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length)continue;
 const tx=(b[0]-a[0])/length,ty=(b[1]-a[1])/length,across=street?[-width/2-17,-width/2-9,width/2+9,width/2+17]:[-width/2+8,0,width/2-8];
 for(let d=8;d<length-8;d+=8)for(const n of across)samples.push({id,x:Math.round(a[0]+tx*d-ty*n),y:Math.round(a[1]+ty*d+tx*n)});
}}
function addRect(id,f){for(let y=f.y+8;y<f.y+f.height-8;y+=8)for(let x=f.x+8;x<f.x+f.width-8;x+=8)samples.push({id,x,y});}
for(const road of [...plan.roads.filter(r=>r.kind==='road'),...publicPaths])addPath(road.id,road.points,road.width,road.kind==='road');
for(const a of plan.approaches){addPath(`approach-${a.id}`,a.path,a.width);addRect(`forecourt-${a.id}`,a.forecourt);}
addRect('plaza',plan.plaza);addRect('smoking',plan.smoking);
function region(module,box,mini=false,scale=1){const canvas=createCanvas(box.width*scale,box.height*scale),c=canvas.getContext('2d'),p=module.createCityGroundPlan(map);c.scale(scale,scale);c.translate(-box.x,-box.y);if(mini)module.drawMiniMapGround(c,p);else module.drawCityGround(c,p,box);const pixels=c.getImageData(0,0,canvas.width,canvas.height).data;return {canvas,at:(x,y)=>{const i=(Math.floor((y-box.y)*scale)*canvas.width+Math.floor((x-box.x)*scale))*4;return [...pixels.slice(i,i+3)];}};}
const curb=rgb(plan.materials.curb),checks=[];
for(const [label,module] of [['before',before],['after',after]])for(const mini of [false,true])for(const scale of [1,.5]){
 const tiles=new Map(),failures=[];
 for(const s of samples){const tx=Math.floor(s.x/1024)*1024,ty=Math.floor(s.y/1024)*1024,key=`${tx}:${ty}`;if(!tiles.has(key))tiles.set(key,region(module,{x:tx,y:ty,width:1024,height:1024},mini,scale));if(tiles.get(key).at(s.x,s.y).every((n,i)=>n===curb[i]))failures.push(s);}
 checks.push({stage:label,render:mini?'minimap':'city',scale,samples:samples.length,interiorCurbFailures:failures.length,affectedSurfaces:[...new Set(failures.map(f=>f.id))],firstFailures:failures.slice(0,20)});
}
const approaches=plan.approaches.map(a=>{
 const f=a.forecourt,points=[...a.path,[f.x,f.y],[f.x+f.width,f.y+f.height]],xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 return {id:a.id,box:{x:Math.floor(Math.min(...xs)-45),y:Math.floor(Math.min(...ys)-40),width:Math.ceil(Math.max(...xs)-Math.min(...xs)+90),height:Math.ceil(Math.max(...ys)-Math.min(...ys)+80)}};
});
const joinCenters=[...plan.junctions.map(j=>({id:j.id,point:j.center})),...publicPaths.flatMap(r=>r.points.map((point,i)=>({id:`${r.id}:${i}`,point}))),...[['plaza',plan.plaza],['smoking',plan.smoking]].flatMap(([id,r])=>[[r.x,r.y],[r.x+r.width,r.y],[r.x,r.y+r.height],[r.x+r.width,r.y+r.height]].map((point,i)=>({id:`${id}-corner-${i}`,point})))];
const joins=joinCenters.map(j=>({id:j.id,box:{x:Math.floor(j.point[0]-180),y:Math.floor(j.point[1]-135),width:360,height:270}}));
async function sheet(kind,cells,module,stage,mini=false){const columns=5,w=256,h=218,canvas=createCanvas(columns*w,Math.ceil(cells.length/columns)*h),c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.imageSmoothingEnabled=false;c.font='12px sans-serif';
 for(let i=0;i<cells.length;i++){const cell=cells[i],x=i%columns*w,y=Math.floor(i/columns)*h,raw=region(module,cell.box,mini,.5).canvas,scale=Math.min((w-12)/raw.width,(h-35)/raw.height),dw=raw.width*scale,dh=raw.height*scale;c.drawImage(raw,x+6+(w-12-dw)/2,y+5+(h-35-dh)/2,dw,dh);c.fillStyle='#171c18';c.fillText(cell.id,x+6,y+h-11);}
 const filename=`curb-v11-${kind}-${stage}${mini?'-minimap':''}.png`;await writeFile(resolve(app,'docs',filename),canvas.toBuffer('image/png'));return filename;
}
const images=[];
for(const [stage,module] of [['before',before],['after',after]])for(const mini of [false,true]){images.push(await sheet('approaches',approaches,module,stage,mini));images.push(await sheet('joins',joins,module,stage,mini));}
const smoke=map.smoking,closeup={x:smoke.x-450,y:smoke.y-140,width:850,height:480};
for(const [stage,module] of [['before',before],['after',after]])await writeFile(resolve(app,`docs/curb-v11-smoke-${stage}.png`),region(module,closeup).canvas.toBuffer('image/png'));
const afterHashes=await hash(),result={baselineRevision,mapWidth:map.width,mapHeight:map.height,approaches:approaches.length,roadJunctions:plan.junctions.length,publicPathVertices:publicPaths.reduce((n,r)=>n+r.points.length,0),squareCorners:8,totalJoinImages:joins.length,checks,images,sourceUnchangedDuringRun:JSON.stringify(beforeHashes)===JSON.stringify(afterHashes),sourceHashes:afterHashes};
await writeFile(resolve(app,'docs/curb-v11-native.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(!result.sourceUnchangedDuringRun||checks.some(c=>c.stage==='after'&&c.interiorCurbFailures))process.exitCode=1;
