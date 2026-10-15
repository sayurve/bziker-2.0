import test from 'node:test';
import assert from 'node:assert/strict';
import {PhaserWorldRenderer,rasterBounds} from '../web/phaser-world-renderer.js';
import {actorRenderBounds,drawAvatar} from '../web/world.js';
import {createCanvas} from './helpers/character-core-native-fixture-v30.mjs';

const avatar={gender:0,hairStyle:7,hairColor:6,skin:3,shirtStyle:2,shirtColor:8,pantsStyle:0,pantsColor:1,accessory:0,headwear:0,outfit:0,shoesColor:0};

function rendererFixture(){
 const renderer=Object.create(PhaserWorldRenderer.prototype),counts={allocated:0,released:0,refreshed:0};
 const sprite=(x,y)=>({x,y,setOrigin(){return this;},setPosition(x,y){this.x=x;this.y=y;return this;},setDepth(){return this;},setVisible(){return this;},destroy(){}});
 Object.assign(renderer,{entries:new Map(),serial:0,frame:0,bytes:0,maxBytes:64*1024*1024,
  canvas:{dataset:{}},view:{x:5000,y:3000,width:2000,height:2000},scene:{children:[],
   textures:{addCanvas(){counts.allocated++;return {refresh(){counts.refreshed++;}};},remove(){counts.released++;}},add:{sprite}}});
 return {renderer,counts};
}
function canvasDocument(run){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 globalThis.document={createElement:()=>createCanvas(1,1)};
 try{return run();}finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}
}
const actor=(x,y)=>({id:'one-H7',x,y,avatar,facing:'right',walking:true,walkFrame:0,pose:'idle'});
const paintActor=(renderer,p,bounds,revision,now=100)=>renderer.paint('player:one',bounds,c=>drawAvatar(c,p,0,false,false,false,now,[],false),{revision});

test('121 half-pixel translations retain one native actor texture and refresh only changed poses',()=>canvasDocument(()=>{
 const {renderer,counts}=rendererFixture();let lastBounds;
 for(let i=0;i<121;i++){
  const p=actor(5744+i*.5,3472+i*.25),b=actorRenderBounds(p,100);lastBounds=b;
  renderer.begin();paintActor(renderer,p,b,'run-right-0');renderer.end();
  const e=renderer.entries.get('player:one');assert.equal(e.image.x,b.x);assert.equal(e.image.y,b.y);
 }
 assert.deepEqual(counts,{allocated:1,released:0,refreshed:1},'translation is not a new pose, size or texture');
 const e=renderer.entries.get('player:one');
 assert.ok(e.width>=lastBounds.width&&e.width<=lastBounds.width+2);
 assert.ok(e.height>=lastBounds.height&&e.height<=lastBounds.height+2);
 assert.equal(renderer.bytes,e.width*e.height*4);
 const p={...actor(5804.5,3502.25),walkFrame:2};
 paintActor(renderer,p,actorRenderBounds(p,100),'run-right-1');
 assert.deepEqual(counts,{allocated:1,released:0,refreshed:2},'a real pose change refreshes the retained canvas');
}));

test('a real throw envelope resize replaces the texture without retaining old GPU capacity',()=>canvasDocument(()=>{
 const {renderer,counts}=rendererFixture(),p={...actor(6044,4136),walking:false,facing:'up'};
 const ordinary=actorRenderBounds(p,100);paintActor(renderer,p,ordinary,'idle');
 const old=renderer.entries.get('player:one'),oldBytes=renderer.bytes;
 const throwing={...p,action_effect:{id:'real-throw',type:'throw-litter',target_id:'bin-plaza',x:6064,y:4096,started_at:100,duration:3}};
 const expanded=actorRenderBounds(throwing,102);assert.ok(expanded.height>ordinary.height,'real bin flight extends above the ordinary actor');
 paintActor(renderer,throwing,expanded,'throw',102);
 const next=renderer.entries.get('player:one');assert.notEqual(next,old);
 assert.deepEqual(counts,{allocated:2,released:1,refreshed:2});assert.equal(old.canvas.width,1);assert.equal(old.canvas.height,1);
 assert.equal(renderer.bytes,next.width*next.height*4);assert.ok(renderer.bytes>oldBytes);
 paintActor(renderer,p,ordinary,'idle-again');
 assert.deepEqual(counts,{allocated:3,released:2,refreshed:3});
 assert.equal(renderer.bytes,renderer.entries.get('player:one').bytes);
}));

test('fractional native paint preserves all body pixels, transparent padding and exact source origin',()=>canvasDocument(()=>{
 const {renderer}=rendererFixture();
 for(const [dx,dy] of [[0,0],[.5,.25],[.75,.5]]){
  const p=actor(5744+dx,3472+dy),b=actorRenderBounds(p,100);
  paintActor(renderer,p,b,'fresh-'+dx);
  const e=renderer.entries.get('player:one'),reference=createCanvas(300,180),q=reference.getContext('2d');
  q.translate(-b.x,-b.y);drawAvatar(q,p,0,false,false,false,100,[],false);
  const native=q.getImageData(0,0,300,180).data;
  assert.ok([...native].some((v,i)=>i%4===3&&v>127),'actual H7 body pixels are present');
  for(let y=0;y<180;y++)for(let x=0;x<300;x++)if(x>=e.width||y>=e.height)assert.equal(native[(y*300+x)*4+3],0,'no source pixels clipped outside capacity');
  assert.deepEqual([...e.canvas.getContext('2d').getImageData(0,0,e.width,e.height).data],[...reference.getContext('2d').getImageData(0,0,e.width,e.height).data]);
  assert.equal(e.image.x,b.x);assert.equal(e.image.y,b.y);
 }
 assert.deepEqual(rasterBounds({x:10.25,y:20.75,width:48,height:64}),{x:10,y:20,width:49,height:65},'public rasterBounds contract remains unchanged');
}));
