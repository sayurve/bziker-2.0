import {sourceActorsData as D} from './source-actors-data.js';
import {canonicalActorsData as C} from './canonical-actors-data.js';
import {locomotionActorsData as L} from './locomotion-actors-data.js';
import {interactionActorsData as A} from './interaction-actors-data.js';
import {customizeSourceGrid,customizeSourceDetailGrid,sourcePortraitMask} from './actor-sprite.js';

// Whole supplied poses, sampled on a discrete timeline. The server's world
// position is the only translation; source root-motion tracks are never used.
const images=new Map(),pending=new Map(),pixels=new Map(),bitmaps=new Map();
let injected=null;
const dirs={down:'front',right:'right',up:'back',left:'left'},facingFor={front:'down',right:'right',back:'up',left:'left'};
// Authored palm attachments on the approved fixed standing poses (coarse48x64).
const standingPhoneHands={male:{down:[32,47],right:[18,46],up:[17,46],left:[29,46]},female:{down:[30,48],right:[20,47],up:[18,47],left:[27,47]}};
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const lookup=(object,key)=>typeof key==='string'&&Object.hasOwn(object,key)?object[key]:null;
const approvedCanonicalActor=id=>{
 const actor=lookup(C.actors,id),review=actor?.artReview;
 return actor?.status==='approved'&&review?.checked===true&&Array.isArray(review.evidence)&&review.evidence.length>0&&review.evidence.every(value=>typeof value==='string'&&value.trim())?actor:null;
};
const approvedLocomotionActor=id=>{
 const actor=L.version===1?lookup(L.actors,id):null,review=actor?.artReview;
 return actor?.status==='approved'&&review?.checked===true&&Array.isArray(review.evidence)&&review.evidence.length>0&&review.evidence.every(value=>typeof value==='string'&&value.trim())?actor:null;
};
const approvedInteractionActor=id=>{
 const actor=A.version===1?lookup(A.actors,id):null,review=actor?.artReview;
 return actor?.status==='approved'&&review?.checked===true&&Array.isArray(review.evidence)&&review.evidence.length>0&&review.evidence.every(value=>typeof value==='string'&&value.trim())?actor:null;
};
// Narrow opt-in whole-body families. Each direction needs its own review and
// all four fixed-canvas poses; an approved actor never implicitly approves drafts.
function reviewedFamily(actorId,family,facing){
 const seq=lookup(lookup(approvedInteractionActor(actorId)?.families||{},family)||{},facing),review=seq?.artReview;
 const pair=v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite);
 if(seq?.status!=='approved'||review?.checked!==true||!Array.isArray(review.evidence)||!review.evidence.length||!review.evidence.every(v=>typeof v==='string'&&v.trim())||seq.frames?.length!==4||!pair(seq.anchor)||seq.anchor[0]!==24||seq.anchor[1]!==63||seq.sprite_size?.[0]!==48||seq.sprite_size?.[1]!==64)return null;
 return seq.frames.every(r=>{const page=seq.images?.[r?.page||0],d=r?.detail;return r?.w===48&&r.h===64&&Number.isFinite(r.x)&&Number.isFinite(r.y)&&r.x>=0&&r.y>=0&&page?.path&&r.x+48<=page.width&&r.y+64<=page.height&&d?.path&&d.w===96&&d.h===128&&d.factor===2&&Number.isFinite(d.x)&&Number.isFinite(d.y)&&d.x>=0&&d.y>=0&&pair(r.head?.neckAnchor)&&pair(r.head?.eyeAnchor)&&pair(r.hand)&&(family!=='water'||Number.isFinite(r.water?.rodAngle)&&pair(r.water?.rodHand)&&Number.isFinite(r.water?.sourceScale)&&r.water.sourceScale>0)&&(!['lowerReach','seated'].includes(family)||pair(r.pelvis))&&(!r.propLayer||r.propLayer==='behind-body'||r.propLayer==='front')})?seq:null;
}
function canonicalFamilyFrame(actorId,family,facing,index,options,extra={}){
 const seq=reviewedFamily(actorId,family,facing);return seq?frameOf(seq,index,actorId,options,{poseFamily:family,...extra}):null;
}
// One finite action progress selects the body and its attachments together.
// Walking keeps the locomotion body; these families describe planted actions.
function canonicalActionFrame(actorId,action,seated,options){
 if(options.walking&&!seated)return null;
 const facing=Object.hasOwn(dirs,options.facing)?options.facing:'down',p=Number.isFinite(options.actionProgress)?clamp(options.actionProgress,0,1):null;
 const mouth=['eat','drink','smoke'].includes(action),lower=['pick-litter','pet','feed','water-pet','putdown','water-plant','crouch'].includes(action);
 const hand=['throw-litter','throw-ash','give','receive','pocket','counter','buy','greet','talk','handshake','call','inventory','equip','carry','door','leash'].includes(action);
 let family,index,prop=options.holding==='litter'&&!action?'trash':null;
 if(seated){family='seated';index=mouth?(p===null||options.reducedMotion?2:p<.15?0:p<.35?1:p<.8?2:p<.97?1:0):lower?3:hand?(action==='carry'?1:options.reducedMotion?3:p===null?1:p<.3?1:p<.8?3:0):options.holding==='litter'?1:0;}
 else if(lower){family='lowerReach';index=action==='crouch'||options.reducedMotion?2:p===null?1:action==='pet'?(p<.18?0:p<.34?1:p<.5?2:p<.66?1:p<.84?2:3):(p<.18?0:p<.43?1:p<.7?2:3);}
 else if(mouth){family='hand';index=p===null||options.reducedMotion?2:p<.15?0:p<.35?1:p<.8?2:p<.97?1:0;}
 else if(hand){family='hand';index=action==='carry'?1:options.reducedMotion?3:p===null?1:p<.3?1:p<.8?3:0;}
 else if(options.holding==='litter'){family='lowerReach';index=3;prop='trash';}
 else return null;
 if(action==='eat')prop=options.prop||'sandwich';
 else if(action==='drink')prop=options.prop||'mug';
 else if(action==='smoke')prop='cigarette';
 else if(action==='pick-litter')prop=p!==null&&p<.43?null:'trash';
 else if(action==='throw-litter')prop=p!==null&&p>=.4?null:'trash';
 else if(action==='throw-ash')prop=p!==null&&p>=.4?null:'cigarette';
 else if(action==='feed')prop='food-bowl';
 else if(action==='water-pet')prop='water-bowl';
 else if(action==='water-plant')prop='watering-can';
 else if(action==='carry')prop=options.prop||'parcel';
 else if(action==='counter'||action==='buy')prop=options.prop||'wallet';
 else if(['give','receive','pocket'].includes(action))prop=options.prop||null;
 return canonicalFamilyFrame(actorId,family,facing,index,options,{context:seated?'seated':'standing',prop});
}
function reviewedRun(actorId,facing){
 const sequence=lookup(approvedLocomotionActor(actorId)?.run||{},facing);
 // This supplement has four whole poses on the existing logical canvas.
 // An incomplete export must leave the normal source clip intact.
 return sequence?.frames?.length===4&&sequence.images?.length&&
  sequence.frames.every(r=>r?.w===48&&r.h===64&&sequence.images[r.page||0]?.path)?sequence:null;
}
const index4=(n=0)=>Math.abs(Math.floor(n))%4;
const genderName=a=>a.gender===1?'female':'male';
const actorName=a=>'human-'+genderName(a);
const makeCanvas=(w,h)=>injected?.createCanvas?injected.createCanvas(w,h):typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):typeof document!=='undefined'?Object.assign(document.createElement('canvas'),{width:w,height:h}):null;
const runtimeImage=path=>injected?.loadImage?injected.loadImage(path):typeof Image!=='undefined'?new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src='/'+path;}):Promise.resolve(null);
function ensureImage(path){
 if(images.has(path))return Promise.resolve(images.get(path));
 if(!pending.has(path))pending.set(path,runtimeImage(path).then(im=>{if(im){images.set(path,im);if(typeof window!=='undefined'&&typeof CustomEvent!=='undefined')window.dispatchEvent(new CustomEvent('bziker:actor-assets-ready'));}return im;}).catch(()=>null).finally(()=>pending.delete(path)));
 return pending.get(path);
}
/** Optional injection lets render tests decode the same PNGs without a DOM. */
export async function loadSourceActor(id,environment=null){
 if(environment)injected=environment;
 const actor=lookup(D.actors,id);if(!actor)return null;
 const canonical=approvedCanonicalActor(id),locomotion=approvedLocomotionActor(id),interaction=approvedInteractionActor(id);
 const familyResources=[];
 for(const family of Object.keys(interaction?.families||{}))for(const facing of Object.keys(dirs)){const seq=reviewedFamily(id,family,facing);if(seq)familyResources.push(...seq.images,...seq.detail_images||[],...seq.frames.map(r=>r.detail));}
 const props=familyResources.length?Object.values(D.props):[D.props.phone];
 await Promise.all([...actor.images,...actor.detail_images||[],...canonical?.images||[],...canonical?.detail_images||[],...locomotion?.images||[],...locomotion?.detail_images||[],...interaction?.images||[],...interaction?.detail_images||[],...familyResources,...props].map(p=>ensureImage(p.path)));return actor;
}
export async function loadSourceSequence(id,environment=null){
 if(environment)injected=environment;
 const sequence=lookup(D.daily,id)||lookup(D.gestures,id)||lookup(D.composites,id)||lookup(D.water,id);
 if(!sequence)return null;await Promise.all([...sequence.images,...sequence.detail_images||[],...sequence.frames.flatMap(r=>r.detail?[r.detail]:[])].map(p=>ensureImage(p.path)));if(sequence.effects)await Promise.all(sequence.effects.images.map(p=>ensureImage(p.path)));
 await Promise.all(Object.values(D.props).map(p=>ensureImage(p.path)));return sequence;
}
function frameOf(sequence,frameIndex,actorId,options={},extra={}){
 const n=clamp(Math.floor(frameIndex)||0,0,sequence.frames.length-1),originalRect=sequence.frames[n];
 const supplement=lookup(approvedInteractionActor(actorId)?.sequences||{},sequence.id),candidate=lookup(supplement?.frames||{},String(n));
 const reviewed=candidate?.w===48&&candidate.h===64&&candidate.detail?.w===96&&candidate.detail.h===128&&candidate.head?.neckAnchor?.length===2&&candidate.head.neckAnchor.every(Number.isFinite)&&supplement.images?.[candidate.page||0]?.path&&candidate.detail.path;
 const rect=reviewed?{...originalRect,...candidate}:originalRect;
 if(reviewed)sequence={...sequence,images:supplement.images};
 const actor=D.actors[actorId],pages=sequence.images||actor.images;
 return {id:sequence.id||sequence.name,actorId,sourceKey:sequence.sourceKey,frameIndex:n,
  atlas:pages[rect.page||0].path,rect,anchor:sequence.anchor||actor.anchor,
  spriteSize:sequence.sprite_size||actor.sprite_size,offset:[0,0],facing:options.facing||facingFor[sequence.direction]||'down',
  context:sequence.context||'standing',hand:rect.hand,pelvis:rect.pelvis,head:rect.head,propLayer:rect.propLayer,handVisibility:rect.handVisibility,water:rect.water,
  embeddedProps:!!sequence.embeddedProps,sequence,...extra};
}
function timelineFrame(sequence,options={},working=false){
 if(options.reducedMotion)return working?sequence.timeline[Math.floor(sequence.timeline.length/2)]||0:0;
 let elapsed=options.sourceTime??options.sourceElapsed;
 if(Number.isFinite(options.sourceProgress))elapsed=clamp(options.sourceProgress,0,1)*(sequence.duration||1);
 else if(Number.isFinite(options.actionProgress))elapsed=clamp(options.actionProgress,0,1)*(sequence.duration||1);
 if(!Number.isFinite(elapsed)){
  // Open phone / sustained smoking remain in their active phase, never
  // repeatedly pocketing and retrieving the item on every loop.
  elapsed=working?3+(options.poseFrame||0)*.25:0;
 }
 const timeline=sequence.timeline||[0,1,2,3],fps=sequence.fps||12;
 // Elapsed clocks wrap looping clips. Explicit progress and sustained working
 // poses retain their authored ending/active frame instead of pocketing again.
 if(sequence.loop===true&&!working&&!Number.isFinite(options.sourceProgress)&&!Number.isFinite(options.actionProgress)){
  const duration=sequence.duration>0?sequence.duration:timeline.length/fps;
  elapsed=Math.max(0,elapsed)%duration;
 }
 const frame=clamp(Math.floor(elapsed*fps),0,timeline.length-1);
 return timeline[frame]??0;
}
const daily=(gender,mode,context,direction)=>D.daily[`${gender}-${mode}-${context}-${direction}`]||D.daily[`${gender}-${mode}-${direction}`];
const gesture=(gender,mode,direction)=>D.gestures[`${gender}-${mode}-${direction}`];
const actionBy=(actor,token,direction)=>Object.values(actor.actions).find(a=>a.name.includes(token)&&(!direction||a.name.includes({front:'Спереди',right:'Справа',back:'Сзади',left:'Слева'}[direction])));
function held(frame,prop){return prop?{...frame,prop}:frame;}
function scenarioOptions(scene,options){
 const action={seat:scene.mode,door:'door',counter:'counter',social:scene.mode,plant:'water-plant',water:scene.mode,
  bin:scene.mode==='ash'?'throw-ash':'throw-litter',item:{pickup:'pick-litter',putdown:'putdown',pocket:'pocket',phone:'phone'}[scene.mode],
  pet:{feed:'feed',water:'water-pet',pet:'pet',follow:'call',walk:'leash',play:'give',wash:'pet',sleep:'pet',talk:'talk',carry:'carry',release:'putdown'}[scene.mode]||'pet',
  road:scene.mode==='run'?'run':'walk',smoke:'smoke'}[scene.type];
 return {...options,animationId:null,action,pose:scene.type==='seat'?'sit':options.pose,
  walking:scene.type==='road'||options.walking,running:scene.mode==='run'||options.running,prop:scene.type==='counter'?scene.mode:scene.type==='social'||scene.type==='item'?scene.object:options.prop};
}
/** Every source key is addressable; adapters cover existing world action names. */
export function sourceActorFrame(avatar={},options={}){
 options={...options,facing:Object.hasOwn(dirs,options.facing)?options.facing:'down'};
 const gender=genderName(avatar),actorId=actorName(avatar),actor=D.actors[actorId],direction=dirs[options.facing]||'front';
 const boatContext=!!options.boat||options.action==='boat'||options.pose==='boat';
 const waterContext=boatContext||['fish','fishing','fish-catch'].includes(options.action||options.pose);
 const seated=options.pose==='sit'||options.pose==='seated'||waterContext;
 if(seated&&(options.phoneOpen||options.action==='phone')){
  const timedWater=['fish','fishing','fish-catch'].includes(options.action||options.pose);
  // The reviewed cast/hold/reel bodies stand on shore. Only row is seated;
  // keep that exact body on a boat, including phone/idle, rather than standing up.
  const water=waterContext&&canonicalFamilyFrame(actorId,'water','right',boatContext?3:1,{...options,facing:'right'},{context:boatContext?'seated':'standing',prop:timedWater?null:'phone'});if(water)return water;
  const neutral=canonicalFamilyFrame(actorId,'seated',options.facing||'down',0,options,{context:'seated',prop:'phone'});if(neutral)return neutral;
  const sequence=gesture(gender,'seated',direction);
  if(sequence)return frameOf(sequence,1,actorId,options,{context:'seated',prop:'phone'});
 }
 if(!seated&&(options.phoneOpen||options.action==='phone'||options.pose==='phone')){
  const facing=Object.hasOwn(dirs,options.facing)?options.facing:'down',canonical=lookup(approvedCanonicalActor(actorId)?.idle||{},facing);
  // Opening the phone never replaces this person's body, head or clothing
  // with an independently authored phone figure. Only the separate item draws.
  if(canonical)return frameOf(canonical,0,actorId,{...options,facing},{context:'standing',prop:'phone',hand:standingPhoneHands[gender][facing]});
 }
 const explicit=options.animationId||options.sourceAction;
 if(explicit){
  const seq=lookup(D.daily,explicit)||lookup(D.gestures,explicit)||lookup(D.composites,explicit)||lookup(D.water,explicit);
  if(seq)return frameOf(seq,timelineFrame(seq,options),actorId,options);
  const scene=lookup(D.scenarios,explicit);if(scene){const f=sourceActorFrame(avatar,scenarioOptions(scene,options));return {...f,scenarioId:explicit,scenarioSourceKey:scene.sourceKey};}
  const base=lookup(actor.actions,explicit)||Object.values(actor.actions).find(a=>a.sourceKey===explicit);
  if(base)return frameOf(base,timelineFrame(base,options),actorId,options);
 }
 const context=seated?'seated':options.walking?'walking':'standing';
 const action=options.action||(['eat','drink','smoke','phone','fish','fishing','fish-catch','boat'].includes(options.pose)?options.pose:null);
 const seqFrame=(seq,working=false)=>seq&&frameOf(seq,timelineFrame(seq,options,working),actorId,options);
 if(!['fish','fishing','fish-catch','boat'].includes(action)&&!options.boat){const family=canonicalActionFrame(actorId,action,seated,options);if(family)return family;}
 if(['fish','fishing','fish-catch','boat'].includes(action)||options.boat){
  const progress=Number.isFinite(options.actionProgress)?clamp(options.actionProgress,0,1):null;
  const index=boatContext?3:action==='fish-catch'?(options.reducedMotion?1:progress===null||progress<.4?2:1):action==='fish'||action==='fishing'?(options.reducedMotion||progress===null||progress>=.43?1:0):options.walking?3:1;
  const water=canonicalFamilyFrame(actorId,'water','right',index,{...options,facing:'right'},{context:boatContext?'seated':'standing'});if(water)return water;
 }
 if(action==='fish-catch'){
  const progress=clamp(options.actionProgress||0,0,.999),seq=D.water[gender==='female'?'female-water':'male-fish-pocket'];
  // Female source phases 12–15 are fish in hand → pocket → finish;
  // her earlier phases contain the cast and waiting cycle.
  const n=gender==='female'?12+Math.floor(progress*4):Math.floor(progress*seq.frames.length);
  return frameOf(seq,n,actorId,{...options,facing:'right'},{context:'seated'});
 }
 if(action==='fish'||action==='fishing'||action==='boat'||options.boat&&!options.phoneOpen){
  const seq=gender==='female'?D.water['female-water']:D.water[action==='boat'||options.boat&&!['fish','fishing'].includes(action)?'male-boat':'male-fishing'];
  let n=Number.isFinite(options.actionProgress)?Math.floor(clamp(options.actionProgress,0,.999)*seq.frames.length):action==='boat'||options.boat?7:4;
  if(action==='fish'||action==='fishing')n=Number.isFinite(options.actionProgress)&&options.actionProgress<.5?Math.floor(clamp(options.actionProgress,0,.499)*8):4;
  else if(gender==='female')n=options.walking?4:6;
  return frameOf(seq,n,actorId,{...options,facing:'right'},{context:'seated'});
 }
 if(action==='eat'){
  const seq=seated?D.composites[`${gender}-eat-seated-${direction}`]:gesture(gender,'eat',direction);
  return {...held(seqFrame(seq),options.prop||'sandwich'),secondaryProp:options.phoneOpen?'phone':null};
 }
 if(['drink','smoke','phone','call','inventory','equip'].includes(action)||options.phoneOpen){
  const mode=action==='drink'?options.drinkMode||'mug':action||'phone',walkMode={phone:'walk-phone',drink:'walk-drink',smoke:'walk-smoke'}[action==='drink'?'drink':mode];
  const seq=context==='walking'&&walkMode?daily(gender,walkMode,context,direction):daily(gender,mode,context==='walking'?'standing':context,direction);
  if(seq){const n=context==='walking'?index4(Math.floor((options.walkFrame||0)/2)):timelineFrame(seq,options,!!options.phoneOpen||action==='smoke');return frameOf(seq,n,actorId,options,{secondaryProp:options.phoneOpen&&['drink','smoke'].includes(action)?'phone':null});}
 }
 const map={'pick-litter':'pickup','throw-litter':'give','throw-ash':'give',pet:'pet',feed:'bowl','water-pet':'bowl',leash:'call',putdown:'bowl',pocket:'pocket','water-plant':'water',door:'door',counter:'counter',buy:'counter',greet:'talk',give:'give',receive:'receive',talk:'talk',handshake:'handshake',carry:'carry'};
 if(map[action]){
  const seq=gesture(gender,map[action],direction),frame=seqFrame(seq);
  const props={'pick-litter':Number.isFinite(options.actionProgress)&&options.actionProgress<.35?null:'trash','throw-litter':Number.isFinite(options.actionProgress)&&options.actionProgress>.6?null:'trash','throw-ash':'cigarette',feed:'food-bowl','water-pet':'water-bowl','water-plant':'watering-can',carry:options.prop||'parcel',counter:options.prop||'wallet',buy:options.prop||'wallet',give:options.prop,receive:options.prop,pocket:options.prop};
  return held(frame,props[action]);
 }
 if(seated)return frameOf(gesture(gender,'seated',direction),1,actorId,options);
 if(options.walking||action==='walk'||action==='run'){
  // One reviewed whole-pose gait serves ordinary walk/run; callers own speed
  // and distance cadence. Explicit animationId retains the source archive.
  const running=options.running||action==='run',seq=reviewedRun(actorId,options.facing)||actionBy(actor,running?'Бег':'Ходьба',direction);
  const frame=held(frameOf(seq,index4(Math.floor((options.walkFrame||0)/2)),actorId,options),options.holding==='litter'?'trash':null);
  // ONE reviewed H7 preset: the whole authored C head is stationary while the
  // four existing locomotion bodies retain their native roots and real limbs.
  const idle=avatar.hairStyle===7&&['human-male','human-female'].includes(actorId)&&seq===reviewedRun(actorId,options.facing)?lookup(approvedCanonicalActor(actorId)?.idle||{},options.facing):null;
  return idle?{...frame,sourceHead:frame.head,head:idle.frames[0].head,fixedHeadSequence:idle}:frame;
 }
 const specials={jump:'Прыжок',crouch:'Приседает',sleep:'Сон',wave:'Приветствие'};
 if(specials[action])return seqFrame(actionBy(actor,specials[action]));
 const base=direction==='front'?actionBy(actor,'На_месте'):actionBy(actor,'Ходьба',direction);
 if(options.holding==='litter')return held(seqFrame(gesture(gender,'carry',direction)),'trash');
 const canonical=lookup(approvedCanonicalActor(actorId)?.idle||{},options.facing||'down');
 if(canonical)return frameOf(canonical,0,actorId,options);
 return frameOf(base,0,actorId,options);
}
function hash(value){let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
export function sourceAnimalFrame(p,effect=null,reducedMotion=false,now=0){
 const kind=p.kind==='dog'?'dog':'cat',ids=Object.keys(D.actors).filter(id=>D.actors[id].kind===kind);
 const id=D.actors[p.breed]?.kind===kind?p.breed:D.actors[p.actor_id]?.kind===kind?p.actor_id:ids[hash(p.id||kind)%ids.length],actor=D.actors[id];
 const direction=dirs[p.facing]||'left',reaction=effect&&Number.isFinite(effect.started_at)&&Number.isFinite(effect.duration)&&now>=effect.started_at&&now<effect.started_at+effect.duration;
 const explicit=p.animationId||p.animation_id||p.sourceAction,aliases={sit:'Садится',lie:'Ложится',sleep:'Сон',eat:'Ест',drink:'Пьёт',jump:'Прыжок',wash:'Умывается',sniff:'Нюхает'};
 let seq=lookup(actor.actions,explicit)||Object.values(actor.actions).find(a=>a.sourceKey===explicit);
 const explicitClip=!!seq,namedAction=Object.hasOwn(aliases,p.action);
 if(!seq)seq=namedAction?actionBy(actor,aliases[p.action]):actionBy(actor,reaction?'16_':p.walking?(p.running?'Бег':'Ходьба'):'На_месте',p.walking&&!reaction?direction:null);
 if(!seq)seq=actionBy(actor,'На_месте');
 const contactFrame=reaction&&Number.isInteger(p.pet_contact_frame)&&p.pet_contact_frame>=0&&p.pet_contact_frame<4?p.pet_contact_frame:null;
 const n=contactFrame??(reducedMotion?0:explicitClip||namedAction?timelineFrame(seq,p):reaction?index4((now-effect.started_at)*4):p.walking?index4(p.walk_frame):0);
 return frameOf(seq,n,id,{facing:p.facing||'left'},{context:'animal'});
}
function sourcePixels(frame,detail=false){
 const r=detail?frame.rect.detail:frame.rect,path=detail?r?.path:frame.atlas;if(!r)return null;
 const key=path+':'+[r.x,r.y].join(',');if(pixels.has(key))return pixels.get(key);
 const im=images.get(path),canvas=makeCanvas(r.w,r.h);if(!im||!canvas)return null;
 const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(im,r.x,r.y,r.w,r.h,0,0,r.w,r.h);
 const rgba=c.getImageData(0,0,r.w,r.h).data,grid=Array(r.w*r.h).fill(null);
 for(let n=0;n<grid.length;n++)if(rgba[n*4+3]>127)grid[n]='#'+[0,1,2].map(k=>rgba[n*4+k].toString(16).padStart(2,'0')).join('');
 const out={grid,canvas};if(pixels.size>=256)pixels.delete(pixels.keys().next().value);pixels.set(key,out);return out;
}
const portraitFrame=(avatar,options)=>sourceActorFrame(options.generic?{gender:0}:avatar,options.generic?{facing:'down'}:options.headOnly?{facing:options.facing}:options);
const colourChannels=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
function sourceHeadGrid(source,frame){
 const {w,h}=frame.rect,head=frame.head||{top:4,bottom:25,left:12,right:35};
 // Authored head bounds include a few neck / collar rows. Keep the native
 // jaw, and only the lateral hair below it; clothes must be absent *before*
 // customization so a changed skin colour cannot restore the neck or hands.
 const chin=head.portraitChin??head.top+(frame.actorId==='human-female'?17:18),center=(head.left+head.right)/2;
 const bottom=Math.min(h-1,Math.max(head.bottom,chin));
 const grid=Array(w*h).fill(null);
 for(let y=0;y<=bottom;y++)for(let x=0;x<w;x++){
  const color=source[y*w+x];if(!color)continue;
  const [r,g,b]=colourChannels(color),warm=r>g*1.15&&g>b*1.06;
  if(y>=chin&&!warm)continue;
  if(y>chin&&Math.abs(x-center)<4.5)continue;
  grid[y*w+x]=color;
 }
 return {grid,chin,bottom};
}
function retainHeadwearHair(grid,w,height,crownBottom){
 // Face outlines can leave isolated dots after the cheeks are removed. Only
 // components attached to the crown belong to hair or to a headwear item.
 const visited=new Set();
 for(let n=0;n<grid.length;n++){
  if(!grid[n]||visited.has(n))continue;
  const queue=[n],component=[];let crown=false;visited.add(n);
  while(queue.length){
   const p=queue.pop(),x=p%w,y=Math.floor(p/w);component.push(p);if(y<crownBottom)crown=true;
   for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]]){
    const xx=x+dx,yy=y+dy,k=yy*w+xx;if(xx<0||xx>=w||yy<0||yy>=height||!grid[k]||visited.has(k))continue;
    visited.add(k);queue.push(k);
   }
  }
  if(!crown)for(const k of component)grid[k]=null;
 }
}
function sourceAvatarGrid(frame,avatar,parts,options){
 const source=sourcePixels(frame);if(!source)return null;
 // A jury mannequin has one fixed native source identity, regardless of the
 // player's gender, wardrobe, action or facing. Head previews omit all torso
 // customization before cropping so a long hairstyle can keep its own pixels.
 const selected=options.generic?{gender:0}:options.headOnly?{...avatar,shirtStyle:2,shirtColor:6,pantsStyle:0,pantsColor:1,shoesColor:0,outfit:0,accessory:[1,3,4].includes(avatar.accessory)&&options.face!==false?avatar.accessory:0}:avatar;
 const w=frame.rect.w,h=frame.rect.h,head=frame.head||{top:4,bottom:25,left:12,right:35},nativeHead=options.headOnly?sourceHeadGrid(source.grid,frame):null,base=nativeHead?.grid||source.grid;
 const customized=customizeSourceGrid(base,selected,parts,{facing:frame.facing,head:frame.head,pelvis:frame.pelvis,generic:!!options.generic});
 const faceRows=new Map();
 if(options.face===false){
  // Row spans of the approved face remove eyes / mouth between the cheeks,
  // without deleting the bright brown highlights in the native hairstyle.
  for(let y=head.top+8;y<=(nativeHead?.chin??head.bottom);y++){
   let left=w,right=-1;
   for(let x=0;x<w;x++){
    const color=base[y*w+x];if(!color)continue;const [r,g,b]=colourChannels(color);
    if(r>235&&g>105&&b>50&&r-g>26&&g-b>13){left=Math.min(left,x);right=Math.max(right,x);}
   }
   if(right>=left)faceRows.set(y,{left:Math.max(0,left-1),right:Math.min(w-1,right+1)});
  }
 }
 const offsetY=options.headOnly?3-head.top:0,height=options.headOnly?40:h,grid=Array(w*height).fill(null);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const yy=y+offsetY;if(yy<0||yy>=height)continue;
  const face=faceRows.get(y);if(face&&x>=face.left&&x<=face.right)continue;
  grid[yy*w+x]=customized[y*w+x];
 }
 if(options.headOnly&&options.face===false)retainHeadwearHair(grid,w,height,head.top+8+offsetY);
 return {grid:options.headOnly||options.generic?grid:standingProportions(grid,w,height,frame,avatar,parts),width:w,height,sourceCrop:options.headOnly?{offsetY,head:{...head},chin:nativeHead.chin,bottom:nativeHead.bottom}:null};
}
function rasterKey(frame,avatar,options){return 'source-v17:v23:'+frame.atlas+':'+frame.rect.x+':'+frame.rect.y+':'+JSON.stringify(options.generic?{gender:0}:avatar)+':'+JSON.stringify([!!options.headOnly,options.face!==false,!!options.generic]);}
const previewRasters=new Map();
const anonymousAvatar={gender:0,skin:0,hairStyle:0,hairColor:0,shirtStyle:2,shirtColor:6,pantsStyle:0,pantsColor:1,shoesColor:0,accessory:0,headwear:0,outfit:0};
export function sourceAvatarRaster(avatar,parts,options={}){
 const selected=options.generic?anonymousAvatar:avatar,frame=portraitFrame(selected,options),detail=frame.rect.detail;
 // Never flash a different coarse/reference person while the actual fine PNG
 // is pending. The existing readiness event replaces neutral UI placeholders.
 if(!detail||!images.has(detail.path)||!images.has(frame.atlas)){if(detail)ensureImage(detail.path);loadSourceActor(frame.actorId);return null;}
 if(!options.headOnly&&!options.generic){for(const prop of[frame.prop,frame.secondaryProp]){const path=D.props[prop]?.path;if(path&&!images.has(path)){ensureImage(path);return null;}}const effects=frame.sequence.effects;if(effects){const n=clamp(timelineFrame(effects,options),0,effects.frames.length-1),path=effects.images[effects.frames[n].page]?.path;if(path&&!images.has(path)){ensureImage(path);return null;}}}
 const key=rasterKey(frame,selected,options)+':native-fine:'+JSON.stringify([options.headOnly?null:frame.prop,options.headOnly?null:frame.secondaryProp,frame.sequence.effects?timelineFrame(frame.sequence.effects,options):null]);if(previewRasters.has(key))return previewRasters.get(key);
 const bitmap=customBitmap(frame,selected,parts,{...options,headOnly:false,generic:false,face:true});if(!bitmap||bitmap.factor!==2)return null;
 let rasterCanvas=bitmap.canvas;if(!options.headOnly&&!options.generic&&(frame.prop||frame.secondaryProp||frame.sequence.effects)){rasterCanvas=makeCanvas(bitmap.canvas.width,bitmap.canvas.height);paintSourceBitmap(rasterCanvas.getContext('2d'),bitmap,frame,0,0,bitmap.factor,options);}
 const width=bitmap.canvas.width,factor=bitmap.factor,rgba=rasterCanvas.getContext('2d').getImageData(0,0,width,bitmap.canvas.height).data,full=Array(width*bitmap.canvas.height).fill(null);
 for(let n=0;n<full.length;n++)if(rgba[n*4+3]>=128)full[n]='#'+[0,1,2].map(z=>rgba[n*4+z].toString(16).padStart(2,'0')).join('');
 let grid=full,height=bitmap.canvas.height,sourceCrop=null;
 if(options.headOnly||options.face===false){
  const native=sourcePixels(frame,true),mask=sourcePortraitMask(native.grid,width,height,selected,parts,{head:frame.head,facing:frame.facing,pelvis:frame.pelvis});
  let offset=options.headOnly?Math.round((3-(frame.head?.top||0))*factor):0;
  if(options.headOnly){let top=height,bottom=-1;for(let n=0;n<full.length;n++)if(mask.head[n]&&full[n]){top=Math.min(top,Math.floor(n/width));bottom=Math.max(bottom,Math.floor(n/width));}
   height=40*factor;offset=Math.min(offset,height-1-bottom);if(top+offset<0){height=Math.ceil(Math.max(height,bottom-top+1)/factor)*factor;offset=-top;}
   sourceCrop={offsetY:offset/factor,head:{...frame.head},chin:frame.head?.portraitChin??frame.head?.bottom,bottom:bottom/factor,factor};
  }
  grid=Array(width*height).fill(null);for(let n=0;n<full.length;n++){const x=n%width,y=Math.floor(n/width),yy=y+offset;if(yy<0||yy>=height||options.headOnly&&!mask.head[n]||options.face===false&&mask.face[n])continue;grid[yy*width+x]=full[n];}
 }
 const runs=[];for(let y=0;y<height;y++)for(let x=0;x<width;){const color=grid[y*width+x];let end=x+1;while(end<width&&grid[y*width+end]===color)end++;if(color)runs.push({x,y,w:end-x,h:1,color});x=end;}
 const out={grid,runs,width,height,factor,logicalWidth:width/factor,logicalHeight:height/factor,sourceCrop,key,resolution:'native-fine'};if(previewRasters.size>=256)previewRasters.delete(previewRasters.keys().next().value);previewRasters.set(key,out);return out;
}
function standingProportions(grid,width,height,frame,avatar,parts){
 if(!frame.id.includes('На_месте'))return grid;
 const actor=D.actors[frame.actorId],run=actionBy(actor,'Бег','front')?.frames[0],head=frame.head;
 if(!head||!run?.head)return grid;
 const factor=width/frame.rect.w,runFrame=frameOf(actionBy(actor,'Бег','front'),0,frame.actorId);
 const source=sourcePixels(runFrame,factor===2),coarse=sourcePixels(runFrame);if(!source||!coarse)return grid;
 // Standing and running were supplied with different face proportions. Use
 // the running head without stretching any of its pixels; keep the authored
 // relaxed arms and feet, and fit the body below the same neck line.
 const donor=factor===2?customizeSourceDetailGrid(source.grid,width,height,coarse.grid,avatar,parts,{facing:'down',head:runFrame.head}):customizeSourceGrid(source.grid,avatar,parts,{facing:'down',head:runFrame.head});
 const naturalHair=avatar.hairStyle?factor===2?customizeSourceDetailGrid(source.grid,width,height,coarse.grid,{...avatar,hairStyle:0},parts,{facing:'down',head:runFrame.head}):customizeSourceGrid(source.grid,{...avatar,hairStyle:0},parts,{facing:'down',head:runFrame.head}):null;
 // Measured from the supplied fine idle/run0 sprites, including the dark jaw
 // outline. The catalogue head box is a hair-edit region, not a neck cut.
 const female=frame.actorId==='human-female',cut=female?{source:58,neck:76,pure:68,outline:[[38,60],[39,58],[39,57],[40,56],[42,54],[42,53],[42,53],[42,53]]}:{source:55,neck:69,pure:60,outline:[[34,63],[36,60],[36,60],[38,58],[38,58],[38,58],[41,54],[41,54],[42,53]]};
 const split=Math.round(cut.source*factor/2),newSplit=Math.round(cut.neck*factor/2),foot=Math.round(frame.anchor[1]*factor);
 const out=Array(width*height).fill(null);
 for(let y=newSplit;y<height;y++)for(let x=0;x<width;x++){
  const sy=split+Math.floor((y-newSplit)*(foot-split)/Math.max(1,foot-newSplit));
  if(sy>=0&&sy<height)out[y*width+x]=grid[sy*width+x];
 }
 for(let y=0;y<newSplit;y++)for(let x=0;x<width;x++){
  const native=source.grid[y*width+x],colour=donor[y*width+x];if(!colour)continue;
  const row=Math.floor(y*2/factor),span=cut.outline[row-cut.pure];
  if(row>=cut.pure&&!(span&&x>=span[0]*factor/2&&x<(span[1]+1)*factor/2)&&!(naturalHair&&colour!==naturalHair[y*width+x])){
   if(!female||!native)continue;const [r,g,b]=colourChannels(native);if(!(r>g*1.15&&g>b*1.06&&r-g<75))continue;
  }
  out[y*width+x]=colour;
 }
 return out;
}
const stationaryHeads=new Map();
function stationaryLocomotionHead(grid,width,height,frame,avatar,parts,options){
 const seq=frame.fixedHeadSequence,donor=frameOf(seq,0,frame.actorId,{facing:frame.facing}),raw=sourcePixels(donor,true),coarse=sourcePixels(donor);
 if(!raw||!coarse){ensureImage(donor.atlas);if(donor.rect.detail)ensureImage(donor.rect.detail.path);return null;}
 const key=rasterKey(donor,avatar,options)+':stationary-head-v32';let pack=stationaryHeads.get(key);
 if(!pack){
  const pixels=customizeSourceDetailGrid(raw.grid,width,height,coarse.grid,avatar,parts,{facing:frame.facing,head:donor.head,pelvis:donor.pelvis});
  const mask=sourcePortraitMask(raw.grid,width,height,avatar,parts,{facing:frame.facing,head:donor.head,pelvis:donor.pelvis}).head;
  // Explicit authored face authority includes its native dark jaw/ear edge,
  // even where the conservative material classifier calls that edge cloth.
  // Copy actual customized donor RGBA; never infer a face colour or fill alpha.
  const polygon=donor.head.facePolygon;
  if(polygon?.length>=3)for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const n=y*width+x;if(!raw.grid[n])continue;let inside=false;
   for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>y/2)!==(b[1]>y/2)&&x/2<(b[0]-a[0])*(y/2-a[1])/(b[1]-a[1])+a[0])inside=!inside;}
   if(inside)mask[n]=true;
  }
  pack={pixels,mask};if(stationaryHeads.size>=32)stationaryHeads.delete(stationaryHeads.keys().next().value);stationaryHeads.set(key,pack);
 }
 const source=sourcePixels(frame,true),oldMask=sourcePortraitMask(source.grid,width,height,avatar,parts,{facing:frame.facing,head:frame.sourceHead,pelvis:frame.pelvis}).head,out=[...grid];
 // Material masks can contain a disconnected real fist near the jaw. Only
 // the semantic component containing the actual head is replaced; arms stay.
 const pending=new Set(oldMask.flatMap((yes,n)=>yes&&grid[n]?[n]:[]));let head=[];
 while(pending.size){const first=pending.values().next().value,stack=[first],component=[];pending.delete(first);
  while(stack.length){const n=stack.pop(),x=n%width,y=Math.floor(n/width);component.push(n);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,k=yy*width+xx;if(xx>=0&&xx<width&&yy>=0&&yy<height&&pending.delete(k))stack.push(k);}}
  if(component.length>head.length)head=component;
 }
 for(const n of head)out[n]=null;
 for(let n=0;n<out.length;n++)if(pack.mask[n]&&pack.pixels[n])out[n]=pack.pixels[n];
 if(frame.actorId==='human-female'){
  // Female H7 uses her own approved C collar, not the male seam coordinates.
  if(frame.facing==='right')for(const [x,y]of [[38,65],[39,65],[40,65],[41,65],[38,66],[39,66],[40,66]]){const n=y*width+x;if(!out[n]&&raw.grid[n]&&pack.pixels[n])out[n]=pack.pixels[n];}
  // Authored leftover endpoints of the former LEFT jaw, with literal source
  // material guards. The canonical female head has alpha0 at these samples.
  if(frame.facing==='left'&&(frame.frameIndex===0||frame.frameIndex===2)){const x=frame.frameIndex===0?37:36,n=65*width+x;if(source.grid[n]==='#1f0909'&&!pack.mask[n]&&out[n]===grid[n])out[n]=null;}
 }
 if(frame.actorId==='human-male'&&frame.facing==='right'){
  // Root-reviewed C collar samples, copied only into transparent seam pixels.
  // These are actual donor pixels, never a filled rectangle or invented skin.
  for(const [x,y]of [[39,58],[40,58],[38,59],[39,59],[40,59],[38,60],[39,60],[40,60]]){const n=y*width+x;if(!out[n]&&raw.grid[n]&&pack.pixels[n])out[n]=pack.pixels[n];}
  // Two authored old-jaw endpoints in approved male RIGHT phase3. Source
  // identity/material checks prevent this annotation clearing changed artwork.
  if(frame.frameIndex===3)for(const [x,y,color]of [[68,65,'#010200'],[71,65,'#010101']]){const n=y*width+x;if(source.grid[n]===color&&!pack.mask[n]&&out[n]===grid[n])out[n]=null;}
 }
 return out;
}
function customBitmap(frame,avatar,parts,options){
 const detail=!options.headOnly&&!options.generic&&frame.rect.detail&&images.has(frame.rect.detail.path),key=rasterKey(frame,avatar,options)+':'+(detail?'fine':'coarse');if(bitmaps.has(key))return bitmaps.get(key);
 const sourceFrame=frame.sourceHead?{...frame,head:frame.sourceHead}:frame;
 const raster=sourceAvatarGrid(sourceFrame,avatar,parts,options);if(!raster)return null;
 let {grid,width,height}=raster;let factor=1;
 if(detail){const source=sourcePixels(frame,true),coarse=sourcePixels(frame);width=frame.rect.detail.w;height=frame.rect.detail.h;factor=frame.rect.detail.factor;grid=customizeSourceDetailGrid(source.grid,width,height,coarse.grid,avatar,parts,{facing:frame.facing,head:sourceFrame.head,pelvis:frame.pelvis});}
 else if(frame.rect.detail&&!options.headOnly&&!options.generic)ensureImage(frame.rect.detail.path);
 if(detail)grid=standingProportions(grid,width,height,sourceFrame,avatar,parts);
 if(frame.fixedHeadSequence){if(!detail)return null;grid=stationaryLocomotionHead(grid,width,height,frame,avatar,parts,options);if(!grid)return null;}
 const canvas=makeCanvas(width,height),c=canvas.getContext('2d');
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const colour=grid[y*width+x];if(colour){c.fillStyle=colour;c.fillRect(x,y,1,1);}}
 const result={canvas,factor};if(bitmaps.size>=128)bitmaps.delete(bitmaps.keys().next().value);bitmaps.set(key,result);return result;
}
function drawProp(c,frame,x,y,scale,prop,support=false){
 const data=D.props[prop];if(!data)return;const image=images.get(data.path);if(!image){ensureImage(data.path);return;}
 let hand=support?frame.rect.second_hand:(frame.rect.propSockets?.[prop]||frame.hand);
 if(!hand){const grid=sourcePixels(frame)?.grid,pts=[];if(grid)for(let yy=Math.max(29,((frame.sourceHead||frame.head)?.bottom||24)+3);yy<59;yy++)for(let xx=0;xx<48;xx++){const v=grid[yy*48+xx];if(!v)continue;const rgb=[1,3,5].map(k=>parseInt(v.slice(k,k+2),16));if(rgb[0]>100&&rgb[0]-rgb[1]>26&&rgb[1]-rgb[2]>13&&(!support||!frame.hand||Math.abs(xx-frame.hand[0])>5))pts.push([xx,yy]);}hand=pts.length?pts[Math.floor(pts.length*.6)]:support?[16,43]:[31,43];}
 const [w,h]=data.size,xx=Math.round(x+(hand[0]-w*.5)*scale),yy=Math.round(y+(hand[1]-h*.5)*scale);
 c.drawImage(image,xx,yy,Math.round(w*scale),Math.round(h*scale));
}
// The approved mouth keypose contains a real foreground palm. Composite only
// those exact customized pixels above its separate cup/food; never a head bbox.
function drawMouthPalm(c,bitmap,frame,x,y,scale){
 const points=frame.rect.provenance?.foregroundSourcePixels;
 if(frame.poseFamily!=='hand'||frame.frameIndex!==2||frame.propLayer==='behind-body'||!Array.isArray(points)||!points.length)return;
 if(!bitmap.mouthPalm){
  const layer=makeCanvas(bitmap.canvas.width,bitmap.canvas.height);if(!layer)return;
  const context=layer.getContext('2d');context.imageSmoothingEnabled=false;
  for(const point of points){if(!Array.isArray(point)||point.length!==2||!point.every(Number.isInteger)||point[0]<0||point[0]>=96||point[1]<0||point[1]>=128)continue;
   const sx=Math.floor(point[0]*bitmap.factor/2),sy=Math.floor(point[1]*bitmap.factor/2);context.drawImage(bitmap.canvas,sx,sy,1,1,sx,sy,1,1);
  }
  bitmap.mouthPalm=layer;
 }
 c.drawImage(bitmap.mouthPalm,x,y,Math.round(bitmap.canvas.width*scale/bitmap.factor),Math.round(bitmap.canvas.height*scale/bitmap.factor));
}
export function drawSourceAvatarCanvas(c,avatar,parts,x,y,options={}){
 if(!c.drawImage)return false;
 if(options.headOnly||options.generic){const raster=sourceAvatarRaster(avatar,parts,options);if(!raster)return false;const canvas=makeCanvas(raster.width,raster.height);if(!canvas)return false;const q=canvas.getContext('2d');for(const r of raster.runs){q.fillStyle=r.color;q.fillRect(r.x,r.y,r.w,r.h)}const scale=(options.scale??1.25)/raster.factor;c.save();c.imageSmoothingEnabled=false;c.drawImage(canvas,Math.round(x),Math.round(y),Math.round(raster.width*scale),Math.round(raster.height*scale));c.restore();return true;}
 let frame=portraitFrame(avatar,options),im=images.get(frame.atlas);if(!im){ensureImage(frame.atlas);const base=portraitFrame(avatar,{...options,action:null,pose:null,phoneOpen:false,walking:false});im=images.get(base.atlas);if(!im){loadSourceActor(options.generic?'human-male':actorName(avatar));return false;}frame=base;}
 const bitmap=customBitmap(frame,avatar,parts,options);if(!bitmap)return false;
 const scale=options.scale??1.25,transform=c.getTransform?.();let ox=Math.round(x),oy=Math.round(y);
 if(transform&&transform.b===0&&transform.c===0&&transform.a>0&&transform.d>0){const ax=(options.anchorX||0)*scale,ay=(options.anchorY||0)*scale;ox=(Math.round((x+ax)*transform.a+transform.e)-Math.round(ax*transform.a)-transform.e)/transform.a;oy=(Math.round((y+ay)*transform.d+transform.f)-Math.round(ay*transform.d)-transform.f)/transform.d;}
 paintSourceBitmap(c,bitmap,frame,ox,oy,scale,options);return true;
}
function paintSourceBitmap(c,bitmap,frame,ox,oy,scale,options){
 c.save();c.imageSmoothingEnabled=false;
 if(!options.headOnly&&!options.generic&&frame.prop&&frame.propLayer==='behind-body')drawProp(c,frame,ox,oy,scale,frame.prop);
 c.drawImage(bitmap.canvas,ox,oy,Math.round(bitmap.canvas.width*scale/bitmap.factor),Math.round(bitmap.canvas.height*scale/bitmap.factor));
 if(frame.prop&&frame.propLayer!=='behind-body'){drawProp(c,frame,ox,oy,scale,frame.prop);drawMouthPalm(c,bitmap,frame,ox,oy,scale);}
 if(frame.secondaryProp)drawProp(c,frame,ox,oy,scale,frame.secondaryProp,true);
 const effects=frame.sequence.effects;if(effects){const n=clamp(timelineFrame(effects,{...options,sourceTime:options.sourceTime??(options.phoneOpen?3+(options.poseFrame||0)*.25:options.sourceTime)},false),0,effects.frames.length-1),r=effects.frames[n],path=effects.images[r.page].path,im=images.get(path);if(im){c.globalCompositeOperation=effects.blend||'source-over';c.drawImage(im,r.x,r.y,r.w,r.h,ox,oy,Math.round(r.w*scale),Math.round(r.h*scale));c.globalCompositeOperation='source-over';}else ensureImage(path);}
 c.restore();
}
export function drawSourceAnimalCanvas(c,p,effect=null,reducedMotion=false,now=0){
 if(!c.drawImage)return false;const frame=sourceAnimalFrame(p,effect,reducedMotion,now),im=images.get(frame.atlas);if(!im){loadSourceActor(frame.actorId);return false;}
 const r=frame.rect,x=Math.round(p.x),y=Math.round(p.y);c.save();c.imageSmoothingEnabled=false;
 c.drawImage(im,r.x,r.y,r.w,r.h,x-frame.anchor[0],y-frame.anchor[1],r.w,r.h);
 c.restore();return true;
}

export const sourceAnimationCoverage=D.coverage;

// Character creation and cloud tiles may render before the city canvas.
// Decode the two small portraits early; all additional actions stay lazy.
if(typeof Image!=='undefined'){
 loadSourceActor('human-male');loadSourceActor('human-female');
}
