import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {PhaserWorldRenderer,rasterBounds,visibleWorldBounds,animationPaintKey} from '../web/phaser-world-renderer.js';
import {paintWorldFrame} from '../web/phaser-scene-paint.js';

const {createCanvas}=createRequire(process.execPath)('@napi-rs/canvas');

function cachedRenderer(){
 const renderer=Object.create(PhaserWorldRenderer.prototype);
 const sprite=()=>({setOrigin(){return this;},setPosition(){return this;},setDepth(){return this;},setVisible(){return this;},destroy(){}});
 const camera={setScroll(){return this;},setZoom(){return this;},setOrigin(){return this;}};
 Object.assign(renderer,{entries:new Map(),serial:0,frame:0,bytes:0,maxBytes:64*1024*1024,width:100,height:100,dpr:1,
  canvas:{dataset:{}},game:{scale:{width:100,height:100}},scene:{children:[],cameras:{main:camera},
   textures:{addCanvas(){return {refresh(){}};},remove(){}},add:{sprite}}});
 return renderer;
}

function paintCachedNode(renderer,node,time,reducedMotion){
 renderer.begin();
 paintWorldFrame(renderer,{view:{x:0,y:0,width:100,height:100,scale:1},sceneKey:'city:city',revision:'city-art-1',
  time,reducedMotion,ground(){},nodes:[node]});
 renderer.end();
}

function withCanvasDocument(run){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 globalThis.document={createElement:()=>createCanvas(1,1)};
 try{run();}finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}
}

test('raster bounds include fractional edges without squeezing the underlying texture',()=>{
 assert.deepEqual(rasterBounds({x:10.25,y:20.75,width:48,height:64}),{x:10,y:20,width:49,height:65});
 assert.equal(rasterBounds({x:0,y:0,width:0,height:4}),null);
});
test('visible bounds are independent of DPR and physical canvas dimensions',()=>{
 const view={x:200,y:300,scale:2,width:195,height:422};
 assert.deepEqual(visibleWorldBounds(view),{x:200,y:300,width:195,height:422});
});
test('animation repaint key follows discrete authored samples instead of render FPS',()=>{
 assert.equal(animationPaintKey(1000),animationPaintKey(1040));
 assert.notEqual(animationPaintKey(1000),animationPaintKey(1100));
 assert.equal(animationPaintKey(1000,true),animationPaintKey(4000,true));
});
test('an existing game canvas is booted with an explicit Phaser renderer',()=>{
 let config;globalThis.Phaser={AUTO:0,WEBGL:2,CANVAS:1,Game:class{constructor(value){config=value;}}};
 new PhaserWorldRenderer({dataset:{}});
 assert.notEqual(config.type,Phaser.AUTO,'Phaser requires an explicit renderer with a provided canvas');
 delete globalThis.Phaser;
});
test('reduced motion still redraws changed actor poses while retaining unchanged textures',()=>withCanvasDocument(()=>{
 const renderer=cachedRenderer(),bounds={x:10,y:10,width:20,height:20};let draws=0;
 const node=(revision,color)=>({id:'player:1',actor:true,bounds,revision,draw(c){draws++;c.fillStyle=color;c.fillRect(10,10,20,20);}});
 paintCachedNode(renderer,node('idle-down','#ff0000'),1000,true);
 paintCachedNode(renderer,node('phone-right','#0000ff'),2000,true);
 paintCachedNode(renderer,node('phone-right','#0000ff'),3000,true);
 const canvas=renderer.entries.get('city:city:object:player:1').canvas;
 assert.deepEqual([...canvas.getContext('2d').getImageData(5,5,1,1).data],[0,0,255,255]);
 assert.equal(draws,2,'Only an actual pose revision invalidates a reduced-motion texture');
}));
test('changed clan house art redraws despite an unchanged object id and dimensions',()=>withCanvasDocument(()=>{
 const renderer=cachedRenderer(),bounds={x:10,y:10,width:20,height:20};let draws=0;
 const node=(revision,color)=>({id:'base-01',bounds,revision,draw(c){draws++;c.fillStyle=color;c.fillRect(10,10,20,20);}});
 paintCachedNode(renderer,node('ALPHA:red','#ff0000'),1000,false);
 paintCachedNode(renderer,node('BRAVO:blue','#0000ff'),2000,false);
 paintCachedNode(renderer,node('BRAVO:blue','#0000ff'),3000,false);
 const canvas=renderer.entries.get('city:city:object:base-01').canvas;
 assert.deepEqual([...canvas.getContext('2d').getImageData(5,5,1,1).data],[0,0,255,255]);
 assert.equal(draws,2,'The unchanged house remains cached after its new art is painted');
}));
