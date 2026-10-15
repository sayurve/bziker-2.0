import test from 'node:test';
import assert from 'node:assert/strict';
import {worldViewportHeight,worldCamera} from '../web/world-camera.js';
test('short landscape uses the available viewport height without extending below screen',()=>{
 assert.equal(worldViewportHeight(320,54.5),265.5);assert.equal(worldViewportHeight(844,52),792);
});
test('a room entrance stays above action buttons even when the floor is shorter than the viewport',()=>{
 const v=worldCamera({width:320,height:686,dpr:2,zoom:1,sceneWidth:900,sceneHeight:680,position:{x:450,y:625}});
 assert.ok((625-v.y)*v.scale<=572);
});
test('hero remains above touch controls and device pixel snapping stabilizes every frame',()=>{
 for(const [width,height] of [[390,792],[320,686],[568,265.5],[1440,800]]){
 const v=worldCamera({width,height,dpr:2,zoom:1,sceneWidth:8400,sceneHeight:5200,position:{x:5700.13,y:2650.27}});
 const foot=(2650.27-v.y)*v.scale;assert.ok(foot<=height-(height<360?72:114)+1,`${width} ${foot}`);assert.ok(foot>=80);
 assert.equal(Math.round(v.x*v.scale*2),v.x*v.scale*2);assert.equal(Math.round(v.y*v.scale*2),v.y*v.scale*2);
 }
});
