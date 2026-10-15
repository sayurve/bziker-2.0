import {sourceActorsData as D} from 'file:///Users/sapp/Desktop/%D0%98%D0%B3%D1%80%D0%B0/Bzikert%202.0/game/web/source-actors-data.js';
import {canonicalActorsData as C} from 'file:///Users/sapp/Desktop/%D0%98%D0%B3%D1%80%D0%B0/Bzikert%202.0/game/web/canonical-actors-data.js';
import {locomotionActorsData as L} from 'file:///Users/sapp/Desktop/%D0%98%D0%B3%D1%80%D0%B0/Bzikert%202.0/game/web/locomotion-actors-data.js';
import {customizeSourceGrid,customizeSourceDetailGrid} from 'file:///Users/sapp/Desktop/%D0%98%D0%B3%D1%80%D0%B0/Bzikert%202.0/verification/customization-audit/skirt/before-sprite.mjs';

// Whole supplied poses, sampled on a discrete timeline. The server's world
// position is the only translation; source root-motion tracks are never used.
const images=new Map(),pending=new Map(),pixels=new Map(),bitmaps=new Map();
let injected=null;
const dirs={down:'front',right:'right',up:'back',left:'left'},facingFor={front:'down',right:'right',back:'up',left:'left'};
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
 const canonical=approvedCanonicalActor(id),locomotion=approvedLocomotionActor(id);
 await Promise.all([...actor.images,...actor.detail_images||[],...canonical?.images||[],...canonical?.detail_images||[],...locomotion?.images||[],...locomotion?.detail_images||[]].map(p=>ensureImage(p.path)));return actor;
}
export async function loadSourceSequence(id,environment=null){
 if(environment)injected=environment;
 const sequence=lookup(D.daily,id)||lookup(D.gestures,id)||lookup(D.composites,id)||lookup(D.water,id);
 if(!sequence)return null;await Promise.all([...sequence.images,...sequence.detail_images||[],...sequence.frames.flatMap(r=>r.detail?[r.detail]:[])].map(p=>ensureImage(p.path)));if(sequence.effects)await Promise.all(sequence.effects.images.map(p=>ensureImage(p.path)));
 await Promise.all(Object.values(D.props).map(p=>ensureImage(p.path)));return sequence;
}
function frameOf(sequence,frameIndex,actorId,options={},extra={}){
 const n=clamp(Math.floor(frameIndex)||0,0,sequence.frames.length-1),rect=sequence.frames[n];
 const actor=D.actors[actorId],pages=sequence.images||actor.images;
 return {id:sequence.id||sequence.name,actorId,sourceKey:sequence.sourceKey,frameIndex:n,
  atlas:pages[rect.page||0].path,rect,anchor:sequence.anchor||actor.anchor,
  spriteSize:sequence.sprite_size||actor.sprite_size,offset:[0,0],facing:options.facing||facingFor[sequence.direction]||'down',
  context:sequence.context||'standing',hand:rect.hand,pelvis:rect.pelvis,head:rect.head,
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
 const gender=genderName(avatar),actorId=actorName(avatar),actor=D.actors[actorId],direction=dirs[options.facing]||'front';
 const explicit=options.animationId||options.sourceAction;
 if(explicit){
  const seq=lookup(D.daily,explicit)||lookup(D.gestures,explicit)||lookup(D.composites,explicit)||lookup(D.water,explicit);
  if(seq)return frameOf(seq,timelineFrame(seq,options),actorId,options);
  const scene=lookup(D.scenarios,explicit);if(scene){const f=sourceActorFrame(avatar,scenarioOptions(scene,options));return {...f,scenarioId:explicit,scenarioSourceKey:scene.sourceKey};}
  const base=lookup(actor.actions,explicit)||Object.values(actor.actions).find(a=>a.sourceKey===explicit);
  if(base)return frameOf(base,timelineFrame(base,options),actorId,options);
 }
 const seated=options.pose==='sit'||options.pose==='seated'||options.boat,context=seated?'seated':options.walking?'walking':'standing';
 const action=options.action||(['eat','drink','smoke','phone','fish','fishing','fish-catch','boat'].includes(options.pose)?options.pose:null);
 const seqFrame=(seq,working=false)=>seq&&frameOf(seq,timelineFrame(seq,options,working),actorId,options);
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
  const running=options.running||action==='run',seq=running&&reviewedRun(actorId,options.facing||'down')||actionBy(actor,running?'Бег':'Ходьба',direction);
  return held(frameOf(seq,index4(Math.floor((options.walkFrame||0)/2)),actorId,options),options.holding==='litter'?'trash':null);
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
 const n=reducedMotion?0:explicitClip||namedAction?timelineFrame(seq,p):reaction?index4((now-effect.started_at)*4):p.walking?index4(p.walk_frame):0;
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
 const customized=customizeSourceGrid(base,selected,parts,{facing:frame.facing,head:frame.head,generic:!!options.generic});
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
export function sourceAvatarRaster(avatar,parts,options={}){
 const frame=portraitFrame(avatar,options),raster=sourceAvatarGrid(frame,avatar,parts,options);if(!raster)return null;const {grid,width,height}=raster,runs=[];
 for(let y=0;y<height;y++)for(let x=0;x<width;){const color=grid[y*width+x];let end=x+1;while(end<width&&grid[y*width+end]===color)end++;if(color)runs.push({x,y,w:end-x,h:1,color});x=end;}
 return {...raster,runs,key:rasterKey(frame,avatar,options)};
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
function customBitmap(frame,avatar,parts,options){
 const detail=!options.headOnly&&!options.generic&&frame.rect.detail&&images.has(frame.rect.detail.path),key=rasterKey(frame,avatar,options)+':'+(detail?'fine':'coarse');if(bitmaps.has(key))return bitmaps.get(key);
 const raster=sourceAvatarGrid(frame,avatar,parts,options);if(!raster)return null;
 let {grid,width,height}=raster;let factor=1;
 if(detail){const source=sourcePixels(frame,true),coarse=sourcePixels(frame);width=frame.rect.detail.w;height=frame.rect.detail.h;factor=frame.rect.detail.factor;grid=customizeSourceDetailGrid(source.grid,width,height,coarse.grid,avatar,parts,{facing:frame.facing,head:frame.head});}
 else if(frame.rect.detail&&!options.headOnly&&!options.generic)ensureImage(frame.rect.detail.path);
 if(detail)grid=standingProportions(grid,width,height,frame,avatar,parts);
 const canvas=makeCanvas(width,height),c=canvas.getContext('2d');
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const colour=grid[y*width+x];if(colour){c.fillStyle=colour;c.fillRect(x,y,1,1);}}
 const result={canvas,factor};if(bitmaps.size>=128)bitmaps.delete(bitmaps.keys().next().value);bitmaps.set(key,result);return result;
}
function drawProp(c,frame,x,y,scale,prop,support=false){
 const data=D.props[prop];if(!data)return;const image=images.get(data.path);if(!image){ensureImage(data.path);return;}
 let hand=support?frame.rect.second_hand:frame.hand;
 if(!hand){const grid=sourcePixels(frame)?.grid,pts=[];if(grid)for(let yy=Math.max(29,(frame.head?.bottom||24)+3);yy<59;yy++)for(let xx=0;xx<48;xx++){const v=grid[yy*48+xx];if(!v)continue;const rgb=[1,3,5].map(k=>parseInt(v.slice(k,k+2),16));if(rgb[0]>100&&rgb[0]-rgb[1]>26&&rgb[1]-rgb[2]>13&&(!support||!frame.hand||Math.abs(xx-frame.hand[0])>5))pts.push([xx,yy]);}hand=pts.length?pts[Math.floor(pts.length*.6)]:support?[16,43]:[31,43];}
 const [w,h]=data.size,xx=Math.round(x+(hand[0]-w*.5)*scale),yy=Math.round(y+(hand[1]-h*.5)*scale);
 c.drawImage(image,xx,yy,Math.round(w*scale),Math.round(h*scale));
}
export function drawSourceAvatarCanvas(c,avatar,parts,x,y,options={}){
 if(!c.drawImage)return false;
 let frame=portraitFrame(avatar,options),im=images.get(frame.atlas);if(!im){ensureImage(frame.atlas);const base=portraitFrame(avatar,{...options,action:null,pose:null,phoneOpen:false,walking:false});im=images.get(base.atlas);if(!im){loadSourceActor(options.generic?'human-male':actorName(avatar));return false;}frame=base;}
 const bitmap=customBitmap(frame,avatar,parts,options);if(!bitmap)return false;
 const scale=options.scale??1.25,transform=c.getTransform?.();let ox=Math.round(x),oy=Math.round(y);
 if(transform&&transform.b===0&&transform.c===0&&transform.a>0&&transform.d>0){const ax=(options.anchorX||0)*scale,ay=(options.anchorY||0)*scale;ox=(Math.round((x+ax)*transform.a+transform.e)-Math.round(ax*transform.a)-transform.e)/transform.a;oy=(Math.round((y+ay)*transform.d+transform.f)-Math.round(ay*transform.d)-transform.f)/transform.d;}
 c.save();c.imageSmoothingEnabled=false;c.drawImage(bitmap.canvas,ox,oy,Math.round(bitmap.canvas.width*scale/bitmap.factor),Math.round(bitmap.canvas.height*scale/bitmap.factor));
 if(options.headOnly||options.generic){c.restore();return true;}
 if(frame.prop)drawProp(c,frame,ox,oy,scale,frame.prop);
 if(frame.secondaryProp)drawProp(c,frame,ox,oy,scale,frame.secondaryProp,true);
 const effects=frame.sequence.effects;if(effects){const n=clamp(timelineFrame(effects,{...options,sourceTime:options.sourceTime??(options.phoneOpen?3+(options.poseFrame||0)*.25:options.sourceTime)},false),0,effects.frames.length-1),r=effects.frames[n],path=effects.images[r.page].path,im=images.get(path);if(im){c.globalCompositeOperation=effects.blend||'source-over';c.drawImage(im,r.x,r.y,r.w,r.h,ox,oy,Math.round(r.w*scale),Math.round(r.h*scale));c.globalCompositeOperation='source-over';}else ensureImage(path);}
 c.restore();return true;
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
