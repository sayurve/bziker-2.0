import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sourceActorsData as D} from '../game/web/source-actors-data.js';
import {sourceActorFrame,sourceAnimalFrame,drawSourceAvatarCanvas,drawSourceAnimalCanvas,loadSourceActor,loadSourceSequence} from '../game/web/source-actors.js';
import {defaultAvatar,parts} from '../game/web/avatar.js';
import {animalPosition,ambientAnimals} from '../game/web/ambient-animals.js';
import {advanceWalkCycle,advancePetMotion} from '../game/web/walk-cycle.js';
import {petFollower} from '../game/web/world.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const suffix=process.argv.includes('--after')?'-after':'';
const root=new URL('../game/',import.meta.url),load=path=>loadImage(fileURLToPath(new URL(path,root))),env={createCanvas,loadImage:load};
for(const id of Object.keys(D.actors))await loadSourceActor(id,env);
for(const id of ['male-phone-seated-front','female-phone-seated-front'])await loadSourceSequence(id,env);
const digest=canvas=>createHash('sha256').update(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data).digest('hex');
function stats(canvas){const {width:w,height:h}=canvas,a=canvas.getContext('2d').getImageData(0,0,w,h).data;let left=w,right=-1,top=h,bottom=-1,count=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(a[(y*w+x)*4+3]>127){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;}return {left,right,top,bottom,width:right-left+1,height:bottom-top+1,count};}
function human(gender,opts={}){const canvas=createCanvas(96,128);drawSourceAvatarCanvas(canvas.getContext('2d'),{...defaultAvatar,gender},parts,0,0,{scale:2,...opts});return canvas;}
async function raw(frame){const r=frame.rect.detail||frame.rect,path=r.path||frame.atlas,canvas=createCanvas(96,128);canvas.getContext('2d').drawImage(await load(path),r.x,r.y,r.w,r.h,0,0,96,128);return canvas;}
const directions=['down','left','up','right'],metrics=[],rows=[];
for(const gender of[0,1])for(const facing of directions){
 const avatar={...defaultAvatar,gender},idleFrame=sourceActorFrame(avatar,{facing}),original=await raw(idleFrame),idle=human(gender,{facing});
 const cells=[{label:'raw idle',canvas:original},{label:'runtime idle',canvas:idle}];
 for(const action of['walk','run'])for(const phase of[0,2,4,6])cells.push({label:`${action} ${phase}`,canvas:human(gender,{facing,walking:true,running:action==='run',walkFrame:phase})});
 rows.push({label:`${gender?'female':'male'} / ${facing}`,cells});
 const lowerHash=canvas=>createHash('sha256').update(canvas.getContext('2d').getImageData(0,90,96,38).data).digest('hex');
 metrics.push({gender,facing,rawIdle:stats(original),runtimeIdle:stats(idle),idleChangedPixels:(()=>{const a=original.getContext('2d').getImageData(0,0,96,128).data,b=idle.getContext('2d').getImageData(0,0,96,128).data;let n=0;for(let i=0;i<a.length;i+=4)if(a.slice(i,i+4).some((v,j)=>v!==b[i+j]))n++;return n;})(),walk:cells.slice(2,6).map(c=>({...stats(c.canvas),sha256:digest(c.canvas),lowerSha256:lowerHash(c.canvas)})),run:cells.slice(6).map(c=>({...stats(c.canvas),sha256:digest(c.canvas),lowerSha256:lowerHash(c.canvas)}))});
}
for(const kind of['cat','dog']){const actor=Object.values(D.actors).find(a=>a.kind===kind);const cells=[];for(const facing of['left','right'])for(let phase=0;phase<4;phase++){const canvas=createCanvas(96,128);drawSourceAnimalCanvas(canvas.getContext('2d'),{id:kind,kind,actor_id:actor.id,x:48,y:100,facing,walking:true,walk_frame:phase});cells.push({label:`${facing} ${phase}`,canvas});}rows.push({label:`${kind} source`,cells});}
const sheet=createCanvas(1120,64+rows.length*152),ctx=sheet.getContext('2d');ctx.fillStyle='#172330';ctx.fillRect(0,0,sheet.width,sheet.height);ctx.font='18px sans-serif';ctx.fillStyle='#ffffff';ctx.fillText('Existing source artwork audit — no generated production art',18,27);ctx.font='12px sans-serif';ctx.fillStyle='#bccbda';ctx.fillText('Fixed 96x128 cells. Raw idle = original atlas rectangle. Runtime = actual source renderer. Ground line retained.',18,48);
rows.forEach((row,y)=>{const yy=64+y*152;ctx.fillStyle='#d5dfeb';ctx.font='12px sans-serif';ctx.fillText(row.label,8,yy+20);row.cells.forEach((cell,x)=>{const xx=144+x*96;ctx.fillStyle=(x%2)?'#243548':'#293c50';ctx.fillRect(xx,yy,96,148);ctx.font='10px sans-serif';ctx.fillStyle='#b8cadb';ctx.fillText(cell.label,xx+4,yy+12);ctx.strokeStyle='#967e52';ctx.beginPath();ctx.moveTo(xx,yy+142);ctx.lineTo(xx+96,yy+142);ctx.stroke();ctx.drawImage(cell.canvas,xx,yy+16);});});
writeFileSync(new URL(`source-animation-contact${suffix}.png`,import.meta.url),sheet.toBuffer('image/png'));
const ambient=ambientAnimals.map(a=>{let sample=null;for(let t=0;t<300;t+=.2){const p=animalPosition(a,t);if(p.walking){sample=p;break;}}if(!sample)return null;return {id:a.id,action:sample.action,phases:[0,1,2,3].map(walk_frame=>sourceAnimalFrame({...sample,walk_frame}).frameIndex),withoutInteractionAction:[0,1,2,3].map(walk_frame=>sourceAnimalFrame({...sample,action:undefined,walk_frame}).frameIndex)};});
const actionSequences=Object.fromEntries(Object.entries(D.actors).map(([id,a])=>[id,Object.keys(a.actions).length]));
const rawRepeated=[];for(const [id,a]of Object.entries(D.actors))for(const [name,clip]of Object.entries(a.actions)){if(!/Ходьба|Бег/.test(name))continue;const im=await load((clip.images||a.images)[0].path);const hashes=[];for(const r of clip.frames){const c=createCanvas(r.w,r.h);c.getContext('2d').drawImage(im,r.x,r.y,r.w,r.h,0,0,r.w,r.h);hashes.push(digest(c));}rawRepeated.push({id,name,frames:clip.frames.length,unique:new Set(hashes).size,opposedEqual02:hashes[0]===hashes[2],opposedEqual13:hashes[1]===hashes[3]});}
const following={owner:{id:'o',x:100,y:100,scene:'city',facing:'right',pet:{id:'p',kind:'cat'}},before:{id:'p',x:59,y:115,motion_scene:JSON.stringify(['city',null,null]),facing:'left'}};const movedOwner={...following.owner,scene:'interior',interior_id:'cafe',x:500,y:500};const followerOnTransfer=petFollower(movedOwner,following.before,.04),followerMotion=advancePetMotion(following.before,{...followerOnTransfer,scene:'interior',interior_id:'cafe'},.04);
const sourceDiffs={};for(const p of ['source-actors.js','actor-sprite.js','source-actors-data.js','world.js']){const current=readFileSync(new URL('../game/web/'+p,import.meta.url)),original=readFileSync('/Users/sapp/Desktop/Игра/Bziker/Phaser/game/web/'+p);sourceDiffs[p]=current.equals(original);}
const out={sourceDiffs,manifest:{actors:Object.keys(D.actors).length,actionSequences,daily:Object.keys(D.daily).length,gestures:Object.keys(D.gestures).length,composites:Object.keys(D.composites).length,water:Object.keys(D.water).length},metrics,rawRepeated,ambient,followerOnTransfer,followerMotion};writeFileSync(new URL(`source-animation-metrics${suffix}.json`,import.meta.url),JSON.stringify(out,null,2));console.log(JSON.stringify({manifest:out.manifest,rawMovement:rawRepeated.length,nonUniqueMovement:rawRepeated.filter(x=>x.unique<4),ambient,followerOnTransfer,followerMotion,sourceDiffs},null,2));
