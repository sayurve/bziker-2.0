import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {worldCamera,interiorCameraBounds} from '../web/world-camera.js';
import {sourceInteriorPropLayout} from '../web/source-interiors.js';
const room=JSON.parse(readFileSync(new URL('../web/interiors-map.json',import.meta.url))).rooms.find(r=>r.id==='railway');
const reference=JSON.parse(readFileSync(new URL('../web/interiors-map-v19.json',import.meta.url))).rooms.find(r=>r.id==='railway');

test('station floor span relative to a native bench matches its actual source composition',()=>{
 const benches=room.props.filter(p=>p.id.startsWith('bench-'));
 const sourceBenches=reference.props.filter(p=>p.id==='sofa-1'||p.id==='sofa-2');
 const nativeBench=benches.reduce((sum,p)=>sum+sourceInteriorPropLayout(p,room).bounds.width,0)/benches.length;
 const sourceBench=sourceBenches.reduce((sum,p)=>sum+p.source_pixel_bbox[2],0)/sourceBenches.length;
 const actual=(room.bounds.right-room.bounds.left)/nativeBench;
 const expected=(reference.bounds.right-reference.bounds.left)/reference.source_scene.scale/sourceBench;
 assert.ok(actual/expected>=.85&&actual/expected<=1.15,`station width is ${actual} bench widths; original is ${expected}`);
});

test('entering the station exposes both bench groups instead of only an empty central floor',()=>{
 for(const viewport of [{width:1204,height:880,dpr:2},{width:390,height:800,dpr:2}]){
  const v=worldCamera({...viewport,zoom:1.25,sceneWidth:room.width,sceneHeight:room.height,position:room.spawn,sceneBounds:interiorCameraBounds(room)});
  const visible=room.props.filter(p=>p.id.startsWith('bench-')).filter(p=>{
   const b=sourceInteriorPropLayout(p,room).bounds;
   const width=Math.max(0,Math.min(b.x+b.width,v.x+v.width)-Math.max(b.x,v.x));
   const height=Math.max(0,Math.min(b.y+b.height,v.y+v.height)-Math.max(b.y,v.y));
   return width*v.scale>=24&&height*v.scale>=24;
  });
  assert.equal(visible.length,2,`${viewport.width} viewport sees ${visible.length} bench groups at entry`);
 }
});
