import fs from 'node:fs';
import {mountWorld} from '../game/web/world.js';
import '../game/tests/helpers/character-core-native-fixture-v30.mjs';
import {motionRuntimeV25} from '../game/tests/helpers/world-motion-runtime-v25.mjs';
import {fixtureRenderer} from '../game/tests/helpers/phaser-renderer-fixture.mjs';
const flush=()=>new Promise(r=>setImmediate(r));
const h=motionRuntimeV25(),keys=[],id='litter-park-1';
const old={scene:'city',server_time:100,position:{x:5495,y:3416},pose:'idle',players:[],collected_litter:[id]};
let snap=old;
const v=mountWorld(h.container,{profile:{id:'independent-day',avatar:{gender:0,hairStyle:7,hairColor:6,skin:3,shirtColor:8}},settings:{lightingMode:'day'},rendererFactory:(canvas,options)=>{const r=fixtureRenderer(canvas,options),paint=r.paint;return {...r,paint(key,...args){keys.push(key);paint(key,...args)}}},api:async()=>snap});
const visible=t=>{keys.length=0;h.frame(t);return keys.includes('city:city:floor:'+id)};
try{await flush();const before=visible(0);snap={...old,server_time:200,collected_litter:[]};await v.refresh();const newDay=visible(16);const accepted=v.setActionState({server_time:100,action_effect:{id:'late-yesterday-pick',type:'pick-litter',target_id:id,started_at:100,duration:3},holding:'litter'});const afterLate=visible(4016);const result={beforeVisible:before,newDayVisible:newDay,latePreviousDayActionAccepted:accepted,afterLateActionExpiredVisible:afterLate,expectedAfterLateActionExpiredVisible:true};fs.writeFileSync(new URL(process.argv[2]||'./pickup-independent-day-action-v31.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}finally{v.destroy()}
