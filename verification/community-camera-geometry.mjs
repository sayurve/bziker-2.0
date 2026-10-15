import {readFileSync,writeFileSync} from 'node:fs';
import {worldCamera,interiorCameraBounds} from '../game/web/world-camera.js';
import {sourceInteriorDetailLayout} from '../game/web/source-interiors.js';
const rooms=JSON.parse(readFileSync(new URL('../game/web/interiors-map.json',import.meta.url))).rooms.filter(r=>['arena','results','clans','terrace'].includes(r.id)),out=[];
for(const original of rooms){
 const room={...original,surfaces:original.surfaces.filter(s=>!['left-wall','right-wall'].includes(s.id))},roof=room.bounds.top-174;
 const fixtureTop=Math.min(...sourceInteriorDetailLayout(room).filter(d=>d.layer==='background').map(d=>d.bounds.y));
 for(const [width,height]of[[1204,650],[1204,800],[390,600]]){const view=worldCamera({width,height,dpr:1,zoom:1.25,sceneWidth:room.width,sceneHeight:room.height,position:room.spawn,sceneBounds:interiorCameraBounds(room)});out.push({room:room.id,canvas:[width,height],spawn:room.spawn,roofY:roof,fixtureTop,view,roofCroppedWorldUnits:Math.max(0,view.y-roof),fixtureCroppedWorldUnits:Math.max(0,view.y-fixtureTop)});}
}
writeFileSync(new URL('community-camera-geometry.json',import.meta.url),JSON.stringify({scope:'pure current camera geometry with side cutaways; no browser viewport assertion',out},null,2));console.log(JSON.stringify(out.map(({room,canvas,view,roofCroppedWorldUnits,fixtureCroppedWorldUnits})=>({room,canvas,scale:view.scale,roofCroppedWorldUnits,fixtureCroppedWorldUnits})),null,2));
