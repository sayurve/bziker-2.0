import {defaultAvatar,parts} from './avatar.js';
import {loadSourceActor,drawSourceAvatarCanvas} from './source-actors.js';
import {CharacterController} from './character-system/controller.js';
import {PhaserCharacterView} from './character-system/phaser-view.js';
import {DIRECTIONS,poseKey} from './character-system/definition.js';

const PALETTES=Object.freeze({native:6,green:3,purple:1});
const ACTIONS=Object.freeze({idle:1,walk:8,run:8});
const TEXTURE_PREFIX='bziker-character-lab-v1';
const textureKey=(gender,palette,key)=>`${TEXTURE_PREFIX}:${gender}:${palette}:${key}`;

/** Existing whole authored figures only; these definitions never claim layered art. */
export function buildLegacyLabModel(gender=0){
 if(gender!==0&&gender!==1)throw new TypeError('Lab gender must be 0 or 1');
 const definition={id:`lab-legacy-${gender===1?'female':'male'}`,status:'draft',mode:'legacy-composite',canvas:{width:96,height:128},anchor:{x:48,y:126},layers:['composite'],directions:[...DIRECTIONS],layerOrder:Object.fromEntries(DIRECTIONS.map(dir=>[dir,['composite']])),actions:{idle:{loop:true,frames:[{durationMs:200}]},walk:{loop:true,distancePerCycle:80,frames:Array.from({length:8},()=>({durationMs:62.5}))},run:{loop:true,distancePerCycle:64,frames:Array.from({length:8},()=>({durationMs:50}))}},poses:{},provenance:'Existing source-actors complete poses; runtime compatibility textures, no new clothing layers.'};
 const outfits=Object.fromEntries(Object.keys(PALETTES).map(id=>[id,{id,status:'draft',modelId:definition.id,layers:{composite:{}}}]));
 for(const [action,count] of Object.entries(ACTIONS))for(const direction of DIRECTIONS)for(let i=0;i<count;i++){
  const key=poseKey(action,direction,i),ref={texture:textureKey(gender,'native',key),frame:null};
  // Native locomotion does not expose authored hand/seat coordinates in this adapter.
  // Empty attachments avoid inventing points that were never artistically checked.
  definition.poses[key]={layers:{composite:ref},attachments:{}};
  for(const palette of Object.keys(PALETTES))outfits[palette].layers.composite[key]={texture:textureKey(gender,palette,key),frame:null};
 }
 return {definition,outfits};
}

/** Same source decoder as the game, with actual HTMLCanvasElement/Image in browser. */
export async function prepareLabResources(scene,{createCanvas,loadImage}={}){
 createCanvas??=((width,height)=>Object.assign(document.createElement('canvas'),{width,height}));
 loadImage??=(path=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Source PNG failed: ${path}`));image.src='/'+path;}));
 const errors=[],environment={createCanvas,loadImage:async path=>{try{return await loadImage(path);}catch(error){errors.push(error);throw error;}}};
 await loadSourceActor('human-male',environment);await loadSourceActor('human-female',environment);
 if(errors.length)throw new Error(`Source images unavailable: ${errors.map(e=>e.message).join('; ')}`);
 const resources=new Map(),created=[];
 try{
  for(const gender of [0,1]){
   const resource=buildLegacyLabModel(gender);resources.set(gender,resource);
   for(const [palette,shirtColor] of Object.entries(PALETTES)){
    const avatar={...defaultAvatar,gender,shirtColor};
    for(const [action,count] of Object.entries(ACTIONS))for(const direction of DIRECTIONS)for(let i=0;i<count;i++){
     const key=poseKey(action,direction,i),texture=textureKey(gender,palette,key);
     if(scene.textures.exists(texture))throw new Error(`Lab texture collision: ${texture}`);
     const canvas=createCanvas(96,128),context=canvas.getContext('2d');
     context.imageSmoothingEnabled=false;
     const painted=drawSourceAvatarCanvas(context,avatar,parts,0,0,{scale:2,facing:direction,walking:action!=='idle',running:action==='run',walkFrame:i});
     if(!painted)throw new Error(`Actual source pose unavailable: ${gender}/${key}`);
     const added=scene.textures.addCanvas(texture,canvas);
     if(!added)throw new Error(`Could not register lab texture: ${texture}`);
     created.push(texture);added.refresh?.();
    }
   }
  }
  return resources;
 }catch(error){for(const key of created)scene.textures.remove(key);throw error;}
}

export function stepLabController(controller){
 const snapshot=controller.snapshot,clip=controller.definition.actions[snapshot.action];
 if(clip.distancePerCycle!==undefined)return controller.advance({distance:clip.distancePerCycle/clip.frames.length});
 return controller.advance({deltaMs:clip.frames[snapshot.frameIndex].durationMs});
}
export function rejectIncompleteLabOutfit(controller,outfit,view){
 const before=controller.snapshot,invalid=structuredClone(outfit),missing='walk/up/7';
 delete invalid.layers.composite[missing];
 try{controller.setOutfit(invalid,view);return {rejected:false,unchanged:false,message:'Ошибка: неполный комплект принят'};}
 catch(error){return {rejected:true,unchanged:JSON.stringify(controller.snapshot)===JSON.stringify(before),message:`Отклонено: отсутствует ${missing}. ${error.message}`};}
}

export function startCharacterLab(root){
 const $=selector=>root.querySelector(selector),proof=$('#lab-proof'),status=$('#lab-status'),canvas=$('#lab-canvas');
 let resources,controller,view,scene,playing=false,gender=0,swapPreserved='untried';
 const fail=error=>{proof.dataset.ready='false';proof.dataset.error=error.message;status.textContent=`Ошибка лаборатории: ${error.message}`;};
 function sync(){
  if(!controller)return;const s=controller.snapshot;
  Object.assign(proof.dataset,{ready:'true',engine:`Phaser ${globalThis.Phaser.VERSION}`,model:s.modelId,gender:String(gender),mode:s.mode,status:'draft',poseKey:s.poseKey,frame:String(s.frameIndex),phase:String(s.phase),outfit:s.outfitId??'native',anchor:`${s.anchor.x},${s.anchor.y}`,origin:`${s.anchor.x/s.canvas.width},${s.anchor.y/s.canvas.height}`,scale:String(view.container.scaleX),layerCount:String(s.layers.length),texture:s.layers[0].texture,playing:String(playing),swapPreserved});
  $('#proof-pose').textContent=s.poseKey;$('#proof-frame').textContent=String(s.frameIndex);$('#proof-phase').textContent=s.phase.toFixed(4);$('#proof-outfit').textContent=s.outfitId??'native';$('#proof-model').textContent=s.modelId;$('#proof-anchor').textContent=`${s.anchor.x}, ${s.anchor.y}`;$('#proof-scale').textContent=`${view.container.scaleX} × ${view.container.scaleY}`;
  $('#lab-play').textContent=playing?'Пауза':'Воспроизвести';$('#lab-play').setAttribute('aria-pressed',String(playing));
 }
 function apply(){view.apply(controller.snapshot);sync();}
 function changeModel(){
  const prior=controller?.snapshot,resource=resources.get(gender),next=new CharacterController(resource.definition,{allowDraft:true,reducedMotion:$('#lab-reduced').checked});
  if(prior)next.setState({action:prior.action,direction:prior.direction});
  const nextView=new PhaserCharacterView(scene,resource.definition,{x:192,y:315,scale:2,allowDraft:true});
  try{next.setOutfit(resource.outfits[$('#lab-outfit').value],nextView);}catch(error){nextView.destroy();throw error;}
  view?.destroy();controller=next;view=nextView;sync();
 }
 function guarded(action){return ()=>{if(!controller)return;try{action();}catch(error){status.textContent=error.message;proof.dataset.error=error.message;}};}
 $('#lab-play').addEventListener('click',guarded(()=>{playing=!playing;sync();}));
 $('#lab-step').addEventListener('click',guarded(()=>{playing=false;stepLabController(controller);apply();}));
 $('#lab-action').addEventListener('change',guarded(()=>{controller.setState({action:$('#lab-action').value});apply();}));
 $('#lab-direction').addEventListener('change',guarded(()=>{controller.setState({direction:$('#lab-direction').value});apply();}));
 $('#lab-gender').addEventListener('change',guarded(()=>{gender=Number($('#lab-gender').value);changeModel();}));
 $('#lab-outfit').addEventListener('change',guarded(()=>{
  const before=controller.snapshot,position={x:view.container.x,y:view.container.y,scale:view.container.scaleX};
  controller.setOutfit(resources.get(gender).outfits[$('#lab-outfit').value],view);
  swapPreserved=String(before.poseKey===controller.snapshot.poseKey&&before.phase===controller.snapshot.phase&&position.x===view.container.x&&position.y===view.container.y&&position.scale===view.container.scaleX);status.textContent='Комплект полных поз заменён атомарно; фаза и опора сохранены.';sync();
 }));
 $('#lab-reject').addEventListener('click',guarded(()=>{
  const oldTexture=controller.snapshot.layers[0].texture,result=rejectIncompleteLabOutfit(controller,resources.get(gender).outfits.green,view);
  Object.assign(proof.dataset,{rejected:String(result.rejected),unchanged:String(result.unchanged&&oldTexture===controller.snapshot.layers[0].texture)});status.textContent=result.message;sync();
 }));
 $('#lab-stop').addEventListener('click',guarded(()=>{playing=false;controller.stop();$('#lab-action').value='idle';apply();}));
 $('#lab-reduced').addEventListener('change',guarded(()=>{controller.setReducedMotion($('#lab-reduced').checked);apply();}));
 if(!globalThis.Phaser){fail(new Error('Не загружен локальный Phaser'));return null;}
 const Phaser=globalThis.Phaser;
 const game=new Phaser.Game({type:Phaser.WEBGL,canvas,width:384,height:384,backgroundColor:'#202a36',pixelArt:true,roundPixels:true,antialias:false,banner:false,
  scene:{key:'CharacterCompatibilityLab',create(){
   scene=this;const g=this.add.graphics();g.lineStyle(1,0x3d4b5c,.65);for(let x=0;x<=384;x+=32)g.lineBetween(x,0,x,384);for(let y=0;y<=384;y+=32)g.lineBetween(0,y,384,y);g.fillStyle(0x101820,.7).fillEllipse(192,315,100,18);g.lineStyle(1,0xe2ba72,1).lineBetween(176,315,208,315).lineBetween(192,307,192,323);
   prepareLabResources(this).then(result=>{resources=result;changeModel();root.querySelectorAll('button,select,input').forEach(element=>element.disabled=false);status.textContent='Полные исходные позы загружены. Художественная приёмка новых слоёв не выполнена.';}).catch(fail);
  },update(_time,delta){if(!controller||!playing)return;try{controller.advance({deltaMs:delta,distance:delta*160/1000});apply();}catch(error){playing=false;fail(error);}}}});
 globalThis.addEventListener?.('pagehide',()=>{view?.destroy();game.destroy(true);},{once:true});return game;
}
if(typeof document!=='undefined'){const root=document.getElementById('character-lab');if(root)startCharacterLab(root);}
