import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mountWorld,drawAvatar,actorRenderBounds,actorVisualRevision,worldMap} from '../game/web/world.js';
import {PhaserWorldRenderer} from '../game/web/phaser-world-renderer.js';
import {worldCamera} from '../game/web/world-camera.js';
import {advanceWalkCycle} from '../game/web/walk-cycle.js';
import {sourceActorsData as D} from '../game/web/source-actors-data.js';
import {loadSourceActor,sourceActorFrame} from '../game/web/source-actors.js';
import {defaultAvatar} from '../game/web/avatar.js';
import {motionRuntimeV25} from '../game/tests/helpers/world-motion-runtime-v25.mjs';
import {fixtureRenderer} from '../game/tests/helpers/phaser-renderer-fixture.mjs';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const root=new URL('../game/',import.meta.url),load=p=>loadImage(fileURLToPath(new URL(p,root)));
for(const id of ['human-male','human-female'])await loadSourceActor(id,{createCanvas,loadImage:load});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function inputCase(fps,input){
 const h=motionRuntimeV25(),records=[],room={id:'jitter-open-room',label:'audit',kind:'station',width:1000,height:1000,bounds:{left:0,right:1000,top:0,bottom:1000},seats:[],props:[],details:[],zones:[],solids:[],spawn:{x:200,y:200},exit:{x:950,y:950},action:{x:950,y:50,id:'test-service'},modular_source:true};let snap={scene:'interior',interior_id:room.id,interior:room,position:{x:200,y:200},players:[]},moves=0;
 const rendererFactory=(canvas,options)=>{const f=fixtureRenderer(canvas,options),paint=f.paint;f.paint=(key,bounds,draw,opts)=>{if(key.includes('object:player:jitter-self')){const json=opts.revision.slice(0,opts.revision.lastIndexOf(':')),r=JSON.parse(JSON.parse(json)[1]);records.push({walking:r[6],walkFrame:r[8]});}return paint(key,bounds,draw,opts);};return f;};
 const view=mountWorld(h.container,{profile:{id:'jitter-self',avatar:defaultAvatar},settings:{lightingMode:'day',showNicknames:false},rendererFactory,api:async(path,data)=>{if(path==='/api/world/move'){moves++;snap={...snap,position:{x:data.x,y:data.y}};}return snap;}});
 try{await settle();h.frame(0);h.stick(input,0);for(let i=1;i<=fps*2;i++){h.frame(i*1000/fps);await settle();}return {fps,input,distance:view.getState().position.x-200,walkingFrames:records.filter(r=>r.walking).length,totalSamples:records.length,gaitFrames:[...new Set(records.map(r=>r.walkFrame))],movementPosts:moves};}finally{view.destroy();}
}
const inputCases=[];for(const fps of[60,120,240])inputCases.push(await inputCase(fps,.13));
// Exercise the actual cache and Canvas painters with no Phaser/browser emulation claims.
globalThis.document={createElement:()=>createCanvas(1,1)};
let allocations=0,refreshes=0,releases=0;const camera={setScroll(){return this;},setZoom(){return this;},setOrigin(){return this;}},renderer=Object.create(PhaserWorldRenderer.prototype);
Object.assign(renderer,{entries:new Map(),serial:0,frame:0,bytes:0,maxBytes:64*1024*1024,width:390,height:600,dpr:1,canvas:{dataset:{}},game:{scale:{width:390,height:600}},scene:{children:[],cameras:{main:camera},textures:{addCanvas(){allocations++;return{refresh(){refreshes++;}};},remove(){releases++;}},add:{sprite(x,y){return{x,y,setOrigin(){return this;},setPosition(x,y){this.x=x;this.y=y;return this;},setDepth(){return this;},setVisible(){return this;},destroy(){}};}}}});
renderer.setView({x:0,y:0,width:1000,height:1000,scale:1});const cache=[];
for(const offset of[0,.25,.5,.75,1,1.25,1.5,1.75,2]){const actor={x:200+offset,y:200+offset,avatar:defaultAvatar,facing:'right',pose:'idle',walking:false},bounds=actorRenderBounds(actor,0);renderer.frame++;renderer.paint('probe',bounds,c=>drawAvatar(c,actor,0,false,false,false,0,[],false),{revision:String(offset),depth:1});const entry=renderer.entries.get('probe'),pixels=entry.canvas.getContext('2d').getImageData(70,0,100,125).data;cache.push({offset,textureSize:[entry.width,entry.height],localPixelsHash:createHash('sha256').update(pixels).digest('hex'),spritePosition:[entry.image.x,entry.image.y],allocations,refreshes});}
const native=[];
for(const gender of[0,1])for(const facing of['down','left','up','right'])for(const running of[false,true]){
 const frames=[];for(let i=0;i<4;i++){const f=sourceActorFrame({...defaultAvatar,gender},{facing,walking:true,running,walkFrame:i*2}),r=f.rect.detail,c=createCanvas(96,128).getContext('2d');c.drawImage(await load(r.path),r.x,r.y,r.w,r.h,0,0,96,128);const a=c.getImageData(0,0,96,128).data;let left=96,right=-1,top=128,bottom=-1;for(let y=0;y<Math.min(80,(f.head.bottom+2)*2);y++)for(let x=0;x<96;x++){const k=(y*96+x)*4,[red,green,blue,alpha]=a.slice(k,k+4);if(alpha>127&&red<190&&red>green*1.15&&green>blue*1.06&&red-green<75){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}frames.push({sourceFrame:i,headBounds:[left,top,right,bottom],headCenter:[(left+right)/2,(top+bottom)/2]});}native.push({gender,facing,running,frames});
}
const gait=[];let previous=null;for(let x=200;x<=456;x+=4){previous=advanceWalkCycle(previous,{x,y:200,walking:true,scene:'city'});gait.push({distance:x-200,gaitFrame:previous.frame,sourceFrame:sourceActorFrame(defaultAvatar,{walking:true,running:true,facing:'right',walkFrame:previous.frame}).frameIndex});}
const cameraSamples=[1,2].map(dpr=>({dpr,values:[0,.25,.5,.75,1].map(o=>{const p={x:500+o,y:500+o},v=worldCamera({width:390,height:600,dpr,zoom:1.25,sceneWidth:8400,sceneHeight:5200,position:p});return{offset:o,zoomPhysical:v.scale*dpr,cameraPhysical:[v.x*v.scale*dpr,v.y*v.scale*dpr],rawFootPhysical:[(p.x-v.x)*v.scale*dpr,(p.y-v.y)*v.scale*dpr]};})}));
const out={inputCases,cache:{allocations,releases,refreshes,samples:cache,stableLocalPixels:new Set(cache.map(x=>x.localPixelsHash)).size===1},native,gait,cameraSamples,gaitMath:{speed:worldMap.movement_speed,cycleWorldDistance:128,uniquePngStepWorldDistance:32,uniquePngFrequencyAtFullSpeed:worldMap.movement_speed/32,cycleSeconds:128/worldMap.movement_speed,displayCanvasWorldSize:[48*1.25,64*1.25]}};
writeFileSync(new URL('motion-jitter-audit'+(process.argv.includes('--after')?'-after':'')+'.json',import.meta.url),JSON.stringify(out,null,2));console.log(JSON.stringify({inputCases,cache:out.cache,gaitMath:out.gaitMath,cameraSamples},null,2));
