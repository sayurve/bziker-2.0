import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {paintWorldFrame} from '../web/phaser-scene-paint.js';

const {createCanvas}=createRequire(process.execPath)('@napi-rs/canvas');

test('a floor interaction outline stays visible beside the player and cannot erase their face',()=>{
 const layers=[];
 const renderer={setView(){},clearNight(){},paint(key,bounds,draw,options){
  const canvas=createCanvas(100,100);draw(canvas.getContext('2d'));
  layers.push({key,canvas,depth:options.depth});
 }};
 paintWorldFrame(renderer,{
  view:{x:0,y:0,width:100,height:100},sceneKey:'test',revision:'1',time:0,
  ground(c){c.fillStyle='#40503a';c.fillRect(0,0,100,100);},
  nodes:[{id:'player',actor:true,bounds:{x:40,y:30,width:20,height:40},
   draw(c){c.fillStyle='#1234ab';c.fillRect(40,30,20,40);}}],
  action:{x:50,y:50},
 });
 const result=createCanvas(100,100),c=result.getContext('2d');
 for(const layer of layers.sort((a,b)=>a.depth-b.depth))c.drawImage(layer.canvas,0,0);
 assert.deepEqual([...c.getImageData(46,37,1,1).data],[18,52,171,255],
  'The dashed top edge crosses this face pixel in world space and must remain behind it');
 assert.ok(layers.find(l=>l.key==='test:action').depth>layers.find(l=>l.key.startsWith('test:ground:')).depth);
 assert.notDeepEqual([...c.getImageData(22,37,1,1).data],[64,80,58,255],
  'An exposed part of the interaction outline should still be visible');
});
