import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {preloadDesignViews} from '../web/design-assets.js';
import {sourceCityModuleObjects} from '../web/source-city.js';
import {loadSourceActor} from '../web/source-actors.js';
import {drawAvatar,sortWorldDepth} from '../web/world.js';
import {defaultAvatar} from '../web/avatar.js';
import {cityPhysicalObstacles,nearestFreeCityPoint} from '../web/city-collision.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const loader=url=>loadImage(fileURLToPath(new URL(`..${url.startsWith('/')?url:'/'+url}`,import.meta.url)));
const records=[
 {id:'native-lamp',kind:'lamp',depth:400,footprint:{x:348,y:396,width:4,height:4},design:{assetId:'streetlight-classic',x:350,y:400,width:100,height:160,anchorX:.5,anchorY:1,crop:'solid',direction:'front'}},
 {id:'native-car',kind:'car',depth:400,footprint:{x:300,y:392,width:100,height:8},design:{assetId:'vehicle-mercedes-cabriolet',x:350,y:400,width:150,height:110,anchorX:.5,anchorY:1,crop:'solid',direction:'front'}},
 {id:'native-bin',kind:'bin',depth:400,footprint:{x:342,y:393,width:16,height:7},design:{assetId:'street-bin',x:350,y:400,width:48,height:60,anchorX:.5,anchorY:1,crop:'solid',direction:'front'}},
];
await preloadDesignViews(records.map(r=>({id:r.design.assetId})),loader);
await loadSourceActor('human-male',{createCanvas,loadImage:loader});
const map={schema_version:20,width:700,height:650,scene_objects:records},obstacles=cityPhysicalObstacles(map),nodes=sourceCityModuleObjects(map);
const pixels=paint=>{const c=createCanvas(700,650).getContext('2d');paint(c);return c.getImageData(0,0,700,650).data;};
test('native modular lamp, vehicle and bin use their real ground depth in front of and behind an actual source actor',()=>{
 for(const node of nodes){
  const object=pixels(c=>node.draw(c));
  for(const {name,point}of [{name:'behind',point:{x:370,y:390}},{name:'front',point:{x:370,y:435}}]){
   assert.deepEqual(nearestFreeCityPoint(point,obstacles,{left:18,right:682,top:18,bottom:632}),point,`${node.id} ${name} sample must be playable`);
   const actorNode={id:'actual-player',depth:point.y,draw:c=>drawAvatar(c,{...point,avatar:defaultAvatar,facing:'down',pose:'idle',walking:false},0,false,false,true,0,[],false)},actor=pixels(actorNode.draw),composite=pixels(c=>{for(const n of sortWorldDepth([actorNode,node]))n.draw(c);});
   let overlap=0;
   for(let k=0;k<object.length;k+=4)if(object[k+3]>=250&&actor[k+3]===255&&Math.max(...[0,1,2].map(ch=>Math.abs(object[k+ch]-actor[k+ch])))>20){
    overlap++;const alpha=object[k+3]/255;
    for(let ch=0;ch<3;ch++){
     const expected=name==='behind'?Math.round(object[k+ch]*alpha+actor[k+ch]*(1-alpha)):actor[k+ch];
     assert.ok(Math.abs(composite[k+ch]-expected)<=1,`${node.id} ${name} source pixel ${k/4%700},${Math.floor(k/4/700)} has the wrong depth`);
    }
    assert.equal(composite[k+3],255);
   }
   assert.ok(overlap>=8,`${node.id} ${name} sample must actually overlap the supplied actor and native prop`);
  }
 }
});
