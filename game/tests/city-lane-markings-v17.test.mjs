import test from 'node:test';
import assert from 'node:assert/strict';
import {createCityGroundPlan} from '../web/city-ground.js';
import fs from 'node:fs';
const current=JSON.parse(fs.readFileSync(new URL('../web/world-layout-v18.json',import.meta.url)));
const plan=createCityGroundPlan({...current,roads:[{id:'east-west',kind:'road',width:180,points:[[0,500],[2000,500]]},{id:'north-south',kind:'road',width:200,points:[[1000,0],[1000,1000]]}],decor:{...current.decor,crosswalks:[{x:500,y:500,orientation:'horizontal'}]}});
test('urban centre markings have complete dashes and stop clear of the intersection and zebra',()=>{
 assert.ok(plan.laneMarkings.length>4);
 for(const dash of plan.laneMarkings){
  const s=plan.roadSegments.find(s=>s.id===dash.segmentId);
  assert.ok(dash.along>=100&&dash.along<=s.length-100);
  for(const j of plan.junctions.filter(j=>j.segmentIds.includes(s.id))){const along=(j.center[0]-s.a[0])*s.tangent[0]+(j.center[1]-s.a[1])*s.tangent[1];assert.ok(Math.abs(dash.along-along)>=100+plan.sidewalk+30+16);}
  for(const cross of plan.crossings.filter(c=>c.segmentId===s.id))assert.ok(Math.abs(dash.along-cross.along)>=110);
  assert.equal(dash.polygon.length,4);
 }
});
test('pedestrian paths never receive vehicle lane markings',()=>{
 const p=createCityGroundPlan({...current,roads:[{id:'wide-path',kind:'walkway',width:250,points:[[0,0],[2000,0]]}],decor:{...current.decor,crosswalks:[]}});
 assert.equal(p.laneMarkings.length,0);
});
