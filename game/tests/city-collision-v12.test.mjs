import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cityPhysicalObstacles,nearestFreeCityPoint,moveBetweenObstacles} from '../web/city-collision.js';
import {publicBuildingGeometry} from '../web/city-architecture.js';
const shapes=JSON.parse(readFileSync(new URL('../web/prop-collisions.json',import.meta.url)));
const map={width:500,height:500,walkable:{left:0,right:500,top:0,bottom:500},spawn:{x:20,y:20},buildings:[],solids:[],district:{buildings:[]},background_buildings:[],bench_groups:[{id:'seat',x:100,y:100,width:120,height:36}],decor:{trees:[{id:'tree',x:250,y:150,size:1}],lamps:[{id:'lamp',x:40,y:180}],street_details:[{id:'bed',kind:'planter',x:150,y:250}]},activities:[{id:'bin',action:'trash-bin',x:70,y:300}],architecture:{props:[{id:'sculpture',footprint:{x:290,y:290,width:70,height:70}}]}};
test('all visible physical fixtures have ground support rather than blocking crowns or light',()=>{
 const obstacles=cityPhysicalObstacles(map,shapes);for(const id of ['seat','tree','lamp','bed','bin','sculpture'])assert.ok(obstacles.some(b=>b.id===id),id);
 const tree=obstacles.find(b=>b.id==='tree');assert.ok(tree.height<35);assert.ok(tree.y>=map.decor.trees[0].y);
 const lamp=obstacles.find(b=>b.id==='lamp');assert.ok(lamp.width<30&&lamp.height<30);
});
test('a large step cannot cross a lamp, and a tangent step can slide along its edge',()=>{
 const obstacles=[{x:100,y:100,width:18,height:18}];
 assert.deepEqual(moveBetweenObstacles({x:60,y:109},100,0,obstacles,map.walkable),{x:60,y:109});
 assert.deepEqual(moveBetweenObstacles({x:100,y:80},0,70,obstacles,map.walkable),{x:100,y:150});
});
test('public buildings block the rendered side wall while leaving the entrance step accessible',()=>{
 const b={id:'railway',x:100,y:100,width:100,height:140,door:{x:150,y:255}};
 const obstacle=cityPhysicalObstacles({...map,buildings:[b]},shapes).find(o=>o.id===b.id);
 assert.deepEqual({x:obstacle.x,y:obstacle.y,width:obstacle.width,height:obstacle.height},publicBuildingGeometry(b).footprint);
 assert.deepEqual(nearestFreeCityPoint(b.door,[obstacle],map.walkable),b.door);
 assert.notDeepEqual(nearestFreeCityPoint({x:210,y:200},[obstacle],map.walkable),{x:210,y:200});
});
test('renovating an occupied foot position moves it to a nearby free edge, not the station',()=>{
 const obstacles=[{x:100,y:100,width:30,height:30},{x:130,y:100,width:30,height:30}];
 const p=nearestFreeCityPoint({x:120,y:115},obstacles,map.walkable);assert.ok(Math.hypot(p.x-120,p.y-115)<25);assert.notDeepEqual(p,map.spawn);
 assert.ok(!obstacles.some(b=>p.x>b.x&&p.x<b.x+b.width&&p.y>b.y&&p.y<b.y+b.height));
 assert.deepEqual(nearestFreeCityPoint({x:80,y:80},obstacles,map.walkable),{x:80,y:80});
});
