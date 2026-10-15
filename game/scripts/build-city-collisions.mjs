import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {cityPhysicalObstacles} from '../web/city-collision.js';
import {createCityGroundPlan} from '../web/city-ground.js';
import {sourceParkedVehicleLayouts,sourceCityAreaLayouts} from '../web/source-city.js';
import {sourceShoreLayouts} from '../web/source-water.js';
import {supplementalEnvironmentLayouts} from '../web/supplemental-environment.js';
import {isModularCity} from '../web/city-scene.js';
const root=new URL('../web/',import.meta.url),raw=readFileSync(new URL('world-map.json',root)),map=JSON.parse(raw),shapes=JSON.parse(readFileSync(new URL('prop-collisions.json',root))),ground=createCityGroundPlan(map),extras=[];
const add=(id,x,y,width,height,kind='furniture')=>extras.push({id,x,y,width,height,kind});
if(!isModularCity(map)){
for(const bed of ground.plantings)add(bed.id,bed.x-2,bed.y-2,bed.width+4,bed.height+7,'planter');
if(Array.isArray(map.architecture?.bike_racks))for(const rack of map.architecture.bike_racks)add(rack.id,...['x','y','width','height'].map(k=>rack.footprint[k]),'bike-rack');
for(const b of map.buildings){
 if(!Array.isArray(map.architecture?.bike_racks)&&!['railway','shop-food'].includes(b.id)){const y=b.y+b.height+(['messages','terrace'].includes(b.id)?-7:7);add(`bike-rack-${b.id}`,b.x+4,y+21,68,8,'bike-rack');}
 if(!map.design_source?.exact_scene&&!map.architecture?.props?.some(p=>p.kind==='terrace-table')&&['messages','terrace'].includes(b.id))for(const dx of [25,b.width-62])add(`table-${b.id}-${dx}`,b.x+dx-14,b.y+b.height+31,72,39,'table');
}
if(!map.design_source?.exact_scene){const smoke=map.smoking;add('smoking-ashtray',smoke.x+200,smoke.y+105,30,27,'ashtray');}
if(!map.design_source?.exact_scene){const welcome=map.landmarks.welcome;for(const dx of [-113,108])add(`welcome-support-${dx}`,welcome.x+dx,welcome.y-51,5,16,'sign');}
for(const car of sourceParkedVehicleLayouts(map))add(car.id,...['x','y','width','height'].map(k=>car.footprint[k]),'vehicle');
for(const prop of supplementalEnvironmentLayouts(map).filter(p=>p.footprint))add(prop.id,...['x','y','width','height'].map(k=>prop.footprint[k]),prop.kind);
// Only raised rocks are solid. Reeds, grass and flat pebbles remain walkable.
for(const shore of sourceShoreLayouts(map).filter(s=>/shore-(?:boulders|stones)$/.test(s.assetId))){const width=shore.width*.7,height=shore.assetId.endsWith('boulders')?14:10;add(shore.id,shore.anchor.x-width/2,shore.anchor.y-height,width,height,'rock');}
// Fence supports block walking while the open court entrances remain usable.
for(const area of sourceCityAreaLayouts(map).filter(a=>['tennis','basketball'].includes(a.id))){const b=area.bounds;add(`${area.id}-fence-back`,b.x,b.y,b.width,5,'fence');for(const side of [0,1])add(`${area.id}-fence-side-${side}`,b.x+side*(b.width-5),b.y,5,b.height,'fence');add(`${area.id}-fence-front-left`,b.x,b.y+b.height-5,b.width/2-35,5,'fence');add(`${area.id}-fence-front-right`,b.x+b.width/2+35,b.y+b.height-5,b.width/2-35,5,'fence');}
}
const result={version:map.schema_version||17,map_sha256:createHash('sha256').update(raw).digest('hex'),obstacles:cityPhysicalObstacles(map,shapes,extras)};
writeFileSync(new URL('city-collisions.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({obstacles:result.obstacles.length,map_sha256:result.map_sha256}));
