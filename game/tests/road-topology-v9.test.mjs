import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {roadJunctions,crossingIntervals} from '../web/road-topology.js';

function segment(roadId,a,b,width=110,index=0){const length=Math.hypot(b[0]-a[0],b[1]-a[1]);return {id:`${roadId}:${index}`,roadId,kind:'road',a,b,width,length,tangent:[(b[0]-a[0])/length,(b[1]-a[1])/length]};}
const map=JSON.parse(await readFile(new URL('../web/world-layout-v18.json',import.meta.url),'utf8'));
const mapped=()=>map.roads.flatMap(r=>r.points.slice(1).map((b,i)=>({...segment(r.id,r.points[i],b,r.width,i),kind:r.kind})));

test('road junctions include four touching segment arms at a shared polyline point',()=>{
 const s=[segment('east',[0,200],[0,400],110,0),segment('east',[0,400],[0,600],110,1),segment('avenue',[-200,400],[0,400],90,0),segment('avenue',[0,400],[200,400],90,1)];
 const j=roadJunctions(s);assert.equal(j.length,1);assert.deepEqual(j[0].center,[0,400]);assert.deepEqual(j[0].segmentIds,['avenue:0','avenue:1','east:0','east:1']);assert.deepEqual(j[0].roadWidths,{avenue:90,east:110});
});

test('T junctions are found in the middle of a through road',()=>{
 const s=[segment('main',[100,0],[100,800]),segment('branch',[100,350],[450,350],90)];
 const j=roadJunctions(s);assert.equal(j.length,1);assert.deepEqual(j[0].center,[100,350]);assert.deepEqual(j[0].roadIds,['branch','main']);
});

test('walkways, zero length edges, bends within one road, and separate streets do not become road junctions',()=>{
 const s=[segment('main',[0,0],[0,500]),segment('main',[0,500],[200,500],110,1),{...segment('path',[-200,250],[200,250],44),kind:'walkway'},segment('apart',[500,0],[500,500]),{...segment('empty',[100,100],[100,100]),length:0}];
 assert.deepEqual(roadJunctions(s),[]);
});

test('collinear roads sharing an endpoint produce one connection, not duplicate junctions',()=>{
 const j=roadJunctions([segment('one',[0,0],[200,0]),segment('two',[200,0],[400,0])]);assert.equal(j.length,1);assert.deepEqual(j[0].center,[200,0]);
});

test('source city intersections name actual streets and retain every touching arm',()=>{
 const edges=mapped(),j=roadJunctions(edges);assert.ok(j.length>=3);assert.equal(new Set(j.map(n=>n.id)).size,j.length);
 for(const join of j){assert.ok(join.roadIds.length>=2);for(const id of join.segmentIds){const s=edges.find(s=>s.id===id);assert.ok(s);const cross=(join.center[0]-s.a[0])*s.tangent[1]-(join.center[1]-s.a[1])*s.tangent[0];assert.ok(Math.abs(cross)<1e-6);}}
});

test('crossing intervals leave a full zebra and pedestrian margin clear of a middle T junction',()=>{
 const main=segment('main',[0,0],[0,900]),branch=segment('branch',[0,450],[400,450],90),j=roadJunctions([main,branch]);
 assert.deepEqual(crossingIntervals(main,j),[[133,307],[593,767]]);
 const stricter=crossingIntervals(main,j,{gap:78});assert.deepEqual(stricter,[[133,245],[655,767]]);
});

test('a short space between two junctions is rejected rather than placing a clipped crossing',()=>{
 const main=segment('main',[0,1820],[0,2610]),s=[main,segment('quarter',[0,2370],[400,2370],90),segment('avenue',[-400,2610],[400,2610],110)],j=roadJunctions(s);
 const intervals=crossingIntervals(main,j);assert.deepEqual(intervals,[[133,407]]);assert.ok(!intervals.some(([a,b])=>657>=a&&657<=b),'old crossing at y=2477 must be excluded');
});

test('unrelated junctions do not move a crossing, and short roads have no viable crossing',()=>{
 const main=segment('main',[0,0],[0,900]),other=[segment('side',[400,0],[400,900]),segment('branch',[400,450],[600,450])],j=roadJunctions(other);
 assert.deepEqual(crossingIntervals(main,j),[[133,767]]);assert.deepEqual(crossingIntervals(segment('short',[0,0],[0,200]),[]),[]);
});

test('planning junctions and crossing intervals does not mutate saved road geometry',()=>{
 const s=mapped(),before=JSON.stringify(s),j=roadJunctions(s);for(const edge of s)crossingIntervals(edge,j);assert.equal(JSON.stringify(s),before);
});
