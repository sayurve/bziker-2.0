import test from 'node:test';
import assert from 'node:assert/strict';
import * as water from '../web/water.js';

// A concave bay: its central northern inlet is land, despite lying in the
// bounding ellipse. A rotated elliptical island is separately dry.
export const bay={x:150,y:100,radius_x:150,radius_y:100,outline:[[0,0],[100,0],[100,120],[200,120],[200,0],[300,0],[300,200],[0,200]],islands:[{x:55,y:145,radius_x:25,radius_y:15,rotation:.35}]};
const p=(x,y)=>({x,y});

test('concave shore and dry island replace only the optional ellipse geometry',()=>{
 assert.equal(water.lakeContains(bay,p(150,40)),false,'the bay inlet is dry');
 assert.equal(water.lakeContains(bay,p(250,40)),true);
 assert.equal(water.lakeContains(bay,p(55,145)),false,'island grass is walkable');
 assert.equal(water.lakeContains(bay,p(5,180),12),false,'boats keep a real shore margin');
 assert.equal(water.lakeContains(bay,p(25,145),12),false,'boats keep a margin around islands');
 assert.equal(water.lakeContains(bay,p(0,180)),false,'shore boundary is dry');
 assert.equal(water.lakeContains({x:0,y:0,radius_x:100,radius_y:40,rotation:0},p(90,0)),true,'legacy ellipse stays intact');
 assert.equal(water.lakeContains(bay,p(NaN,40)),false);
});

test('pedestrian segments respect concave land and dry island rather than bounding boxes',()=>{
 assert.equal(water.segmentCrossesLake(bay,p(110,40),p(190,40)),false,'walking inside the dry inlet is allowed');
 assert.equal(water.segmentCrossesLake(bay,p(-30,40),p(330,40)),true,'both dry endpoints still cross water');
 assert.equal(water.segmentCrossesLake(bay,p(50,145),p(60,145)),false,'an island path stays dry');
 assert.equal(water.segmentCrossesLake(bay,p(120,120),p(180,120)),false,'the shoreline itself stays dry');
 assert.equal(water.segmentCrossesLake(bay,p(120,119),p(180,121)),true,'a short segment entering water cannot tunnel');
});

test('boats stop at the first bank or island even when the far endpoint is water',()=>{
 assert.equal(typeof water.segmentStaysInLake,'function');
 assert.equal(water.segmentStaysInLake(bay,p(20,145),p(90,145),2),false);
 assert.equal(water.segmentStaysInLake(bay,p(50,40),p(250,40),2),false,'a long step cannot cross the dry inlet');
 assert.equal(water.segmentStaysInLake(bay,p(210,160),p(280,160),2),true);
 const islandStop=water.moveBoatPosition(bay,p(20,145),70,0,2);
 assert.ok(islandStop.x>20&&islandStop.x<31);assert.equal(water.lakeContains(bay,islandStop,2),true);
 assert.ok(water.segmentStaysInLake(bay,p(20,145),islandStop,2));
 const inletStop=water.moveBoatPosition(bay,p(50,40),200,0,2);
 assert.ok(inletStop.x>97&&inletStop.x<98.01);assert.equal(water.lakeContains(bay,inletStop,2),true);
 assert.ok(Math.hypot(...Object.values(water.moveBoatPosition(bay,inletStop,200,0,2)).map((v,i)=>v-Object.values(inletStop)[i]))<.001);
});

test('nearest shore uses the actual concave edge or nearest dry island with matching padding',()=>{
 const inlet=water.nearestShore(bay,p(110,140),5);
 assert.ok(Math.hypot(inlet.x-110,inlet.y-115)<1e-7);assert.equal(water.lakeContains(bay,inlet),false);
 const island=water.nearestShore(bay,p(55,171),3);
 assert.ok(Math.hypot(island.x-55,island.y-145)<26);assert.equal(water.lakeContains(bay,island),false);
 const boatPoint=water.nearestShore(bay,p(110,140),-8);
 assert.equal(water.lakeContains(bay,boatPoint,7),true,'negative padding relocates to the water side');
});

test('shared path exposes authored absolute contour and cuts every dry island from rendering',()=>{
 assert.equal(typeof water.lakeOutline,'function');assert.equal(typeof water.lakeBounds,'function');assert.equal(typeof water.traceLakePath,'function');
 assert.deepEqual(water.lakeOutline(bay),bay.outline);
 assert.deepEqual(water.lakeBounds(bay),{x:0,y:0,width:300,height:200});
 const calls=[],context=new Proxy({}, {get:(_,name)=>(...args)=>calls.push([name,...args])});
 assert.equal(water.traceLakePath(context,bay),true);
 assert.ok(calls.some(a=>a[0]==='lineTo'&&a[1]===100&&a[2]===120));
 assert.ok(calls.some(a=>a[0]==='ellipse'&&a[1]===55&&a[2]===145&&a[3]===25&&a[4]===15));
});

test('rotated legacy ellipse bounds enclose the exact visible extremities',()=>{
 const lake={x:500,y:300,radius_x:197,radius_y:43,rotation:.35},bounds=water.lakeBounds(lake);
 const halfWidth=Math.hypot(lake.radius_x*Math.cos(lake.rotation),lake.radius_y*Math.sin(lake.rotation)),halfHeight=Math.hypot(lake.radius_x*Math.sin(lake.rotation),lake.radius_y*Math.cos(lake.rotation));
 assert.ok(Math.abs(bounds.x-(lake.x-halfWidth))<1e-9);
 assert.ok(Math.abs(bounds.y-(lake.y-halfHeight))<1e-9);
 assert.ok(Math.abs(bounds.width-2*halfWidth)<1e-9);assert.ok(Math.abs(bounds.height-2*halfHeight)<1e-9);
});

const bridgedBay={...bay,walkways:[{id:'island-bridge',points:[[310,145],[55,145]],width:20}]};
test('only authored pedestrian bridge strips allow walking across water to a dry island',()=>{
 assert.equal(typeof water.pedestrianLakeContains,'function');assert.equal(typeof water.pedestrianSegmentCrossesLake,'function');
 assert.equal(water.lakeContains(bridgedBay,p(250,145)),true,'boat geometry still treats the bridge water as water');
 assert.equal(water.pedestrianLakeContains(bridgedBay,p(250,145)),false);
 assert.equal(water.pedestrianLakeContains(bridgedBay,p(250,154)),false,'the authored strip width is walkable');
 assert.equal(water.pedestrianLakeContains(bridgedBay,p(250,156)),true,'stepping off the side enters water');
 assert.equal(water.pedestrianSegmentCrossesLake(bridgedBay,p(310,154),p(55,154)),false);
 assert.equal(water.pedestrianSegmentCrossesLake(bridgedBay,p(150,40),p(55,145)),true,'dry endpoints cannot cut diagonally across water');
 assert.equal(water.pedestrianSegmentCrossesLake(bridgedBay,p(310,145),p(55,190)),true,'a bridge does not unlock the rest of the lake');
 assert.equal(water.segmentStaysInLake(bridgedBay,p(20,145),p(90,145),2),false,'boats still collide with dry islands');
 assert.equal(water.pedestrianSegmentCrossesLake(bay,p(310,145),p(55,145)),true,'no bridge field retains the original water barrier');
});
