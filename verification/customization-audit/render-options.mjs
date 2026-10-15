import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {parts,defaultAvatar,avatarRaster,drawAvatarCanvas} from '../../game/web/avatar.js';
import {loadSourceActor,sourceActorFrame} from '../../game/web/source-actors.js';
import {sourceActorsData} from '../../game/web/source-actors-data.js';
import {catalogGroups,avatarPartHTML,profileBuilderHTML,catalogPartSVG} from '../../game/web/profile-builder.js';
import {inventoryHTML,bagKinds} from '../../game/web/inventory-ui.js';
import {itemIconSVG} from '../../game/web/gameplay-ui.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
if(!process.argv[2]||process.argv[2]==='--help'){console.log('Usage: node verification/customization-audit/render-options.mjs --plan | RUN_LABEL (run label only after root freeze)');process.exit(0);}
if(process.argv[2]==='--plan'){const freeValues=Object.entries(parts).filter(([key])=>key!=='gender').reduce((n,[key,p])=>n+p.options.length-(key==='outfit'?6:0),0);console.log(JSON.stringify({freeValues,idle:freeValues*2*4,walk:freeValues*2*4*4,hairIdle:96,hairWalk:384,svgHeadPreviews:24,inventoryIcons:9},null,2));process.exit(0);}
const label=process.argv[2];if(!/^[a-z0-9-]+$/.test(label))throw Error('Use a simple run label');
const root=new URL('../../',import.meta.url),game=new URL('game/',root),out=new URL(label+'/',import.meta.url);await mkdir(out,{recursive:false});
const sourceFiles=['game/web/avatar.js','game/web/profile-builder.js','game/web/source-actors.js','game/web/actor-sprite.js','game/web/actor-hair-data.js','game/web/actor-custom-data.js','game/web/actor-atlas-data.js','game/web/locomotion.js','game/web/locomotion-actors-data.js','game/web/source-actors-data.js','game/web/canonical-actors-data.js','game/web/inventory-ui.js'];
const digest=b=>createHash('sha256').update(b).digest('hex');
const snapshot=async()=>Promise.all(sourceFiles.map(async path=>({path,sha256:digest(await readFile(new URL(path,root)))})));
const before=await snapshot();
const nativeResources=new Map();
const load=async path=>{const url=new URL(path.replace(/^\//,''),game);const [im,bytes]=await Promise.all([loadImage(fileURLToPath(url)),readFile(url)]);nativeResources.set(path,{path,sha256:digest(bytes),sizeBytes:bytes.length,width:im.width,height:im.height});return im;};
async function svgImage(svg,name){const url=new URL(name+'.svg',out);await writeFile(url,svg);return loadImage(fileURLToPath(url));}
for(const id of ['human-male','human-female'])await loadSourceActor(id,{createCanvas,loadImage:load});
const directions=['down','right','up','left'],records=[],panels=[],missingSource=[];
function paintRuns(c,sprite,x,y,scale){for(const r of sprite.runs){c.fillStyle=r.color;c.fillRect(x+r.x*scale,y+r.y*scale,r.w*scale,r.h*scale);}}
function ink(canvas){const {width:w,height:h}=canvas,a=canvas.getContext('2d').getImageData(0,0,w,h).data;let n=0,left=w,top=h,right=-1,bottom=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(a[(y*w+x)*4+3]){n++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}return {ink:n,bbox:n?[left,top,right+1,bottom+1]:null,edgeInk:n&&[left,top,w-right-1,h-bottom-1].some(v=>v===0),sha256:digest(a)};}
function rendered(avatar,options){const raster=avatarRaster(avatar,options),frame=sourceActorFrame(avatar,options),canvas=createCanvas(96,128),c=canvas.getContext('2d');c.imageSmoothingEnabled=false;drawAvatarCanvas(c,avatar,0,0,{...options,scale:2});if(!raster.key.startsWith('source-v17:'))missingSource.push({avatar,options,key:raster.key});return {raster,frame,canvas,metrics:ink(canvas)};}
for(const [key,part] of Object.entries(parts)){
 if(key==='gender')continue;
 const values=part.options.map((_,i)=>i).filter(v=>key!=='outfit'||v===0);
 for(let start=0;start<values.length;start+=6){
  const page=values.slice(start,start+6),sheet=createCanvas(1360,page.length*145+28),c=sheet.getContext('2d');c.fillStyle='#e8e5dc';c.fillRect(0,0,sheet.width,sheet.height);c.fillStyle='#202629';c.font='15px sans-serif';c.fillText(`${key}: UI raster (left) / native world canvas (right)`,8,19);
  for(let row=0;row<page.length;row++)for(let gender=0;gender<2;gender++)for(let d=0;d<4;d++){
   const value=page[row],facing=directions[d],avatar={...defaultAvatar,gender,[key]:value},options={facing},r=rendered(avatar,options),x=(gender*4+d)*170,y=28+row*145;
   c.fillStyle='#18212a';c.fillRect(x+1,y+18,168,116);paintRuns(c,r.raster,x+7,y+28,1.5);c.imageSmoothingEnabled=false;c.drawImage(r.canvas,x+87,y+28,72,96);c.fillStyle='#202629';c.font='12px sans-serif';c.fillText(`${value} ${part.options[value]} G${gender} ${facing}`,x+3,y+13,164);
   records.push({category:key,value,label:part.options[value],gender,facing,pose:'idle',sourceKey:r.raster.key,frame:{id:r.frame.id,atlas:r.frame.atlas,rect:r.frame.rect},world:r.metrics,uiRasterSha256:digest(JSON.stringify(r.raster.runs)),file:`${key}-${start/6+1}.png`});
  }
  const file=`${key}-${start/6+1}.png`;await writeFile(new URL(file,out),sheet.toBuffer('image/png'));panels.push(file);
 }
}
const hairHead=createCanvas(1440,400),hc=hairHead.getContext('2d');hc.fillStyle='#e8e5dc';hc.fillRect(0,0,1440,400);
for(let gender=0;gender<2;gender++)for(let value=0;value<12;value++){const svg=catalogPartSVG('hairStyle',value,{...defaultAvatar,gender}),im=await svgImage(svg,`hair-preview-g${gender}-s${value}`),x=value%6*240,y=gender*200+Math.floor(value/6)*100;hc.drawImage(im,x+12,y+10,96,80);hc.fillStyle='#202629';hc.font='14px sans-serif';hc.fillText(`G${gender} ${value} ${parts.hairStyle.options[value]}`,x+110,y+45);}
await writeFile(new URL('hair-catalog-heads.png',out),hairHead.toBuffer('image/png'));panels.push('hair-catalog-heads.png');
const walk=[];
for(const record of records)for(let phase=0;phase<4;phase++){const {category,value,gender,facing}=record;const r=rendered({...defaultAvatar,gender,[category]:value},{facing,walking:true,walkFrame:phase*2});walk.push({category,value,gender,facing,phase,sourceKey:r.frame.sourceKey,frameIndex:r.frame.frameIndex,world:r.metrics});}
const categories=Object.entries(parts).map(([key,p])=>({key,label:p.label,options:p.options.map((name,value)=>({value,name,free:key!=='outfit'||value===0})),free:p.options.length-(key==='outfit'?6:0),locked:key==='outfit'?6:0}));
const wardrobeHTML=Object.entries(parts).filter(([key])=>key!=='gender').map(([key])=>avatarPartHTML(key,{avatar:defaultAvatar,unlockedOutfits:[],open:true})).join('\n');await writeFile(new URL('catalog-actual-markup.html',out),wardrobeHTML);
const outfits=avatarPartHTML('outfit',{avatar:defaultAvatar,unlockedOutfits:[]}),disabled=(outfits.match(/ disabled/g)||[]).length;
const inventoryIds=['coffee','snack','cigarette','cards','rod','pet-dog','pet-cat','fish','trash'];const kinds=['food','food','consumable','deck','tool','pet','pet','catch','litter'];const economy={inventory:inventoryIds.map((item_id,i)=>({item_id,quantity:1,item:{id:item_id,name:item_id,kind:kinds[i]}}))};
await writeFile(new URL('inventory-actual-markup.html',out),inventoryHTML(economy,'coffee'));
const icons=createCanvas(900,150),ic=icons.getContext('2d');ic.fillStyle='#e8e5dc';ic.fillRect(0,0,900,150);for(let i=0;i<inventoryIds.length;i++){const im=await svgImage(itemIconSVG(inventoryIds[i],kinds[i]),'inventory-'+inventoryIds[i]);ic.imageSmoothingEnabled=false;ic.drawImage(im,i*100+18,12,64,64);ic.fillStyle='#202629';ic.font='13px sans-serif';ic.fillText(inventoryIds[i],i*100+3,105,96);}await writeFile(new URL('inventory-native-icons.png',out),icons.toBuffer('image/png'));panels.push('inventory-native-icons.png');
const after=await snapshot();const resources=[...nativeResources.values()];const resourceChanges=[];for(const resource of resources){const bytes=await readFile(new URL(resource.path.replace(/^\//,''),game));if(digest(bytes)!==resource.sha256)resourceChanges.push(resource.path);}
const stable=JSON.stringify(before)===JSON.stringify(after)&&resourceChanges.length===0;
const metrics={run:label,generatedAt:new Date().toISOString(),sourceFiles:before,sourceFilesStable:stable,nativeResources:resources,resourceChanges,svgLoading:'Saved actual SVG files; loaded by filesystem path, no Buffer handoff',rootBrowserUsed:false,categories,catalogGroups,idleCases:records.length,hairIdleCases:records.filter(r=>r.category==='hairStyle').length,hairWalkCases:walk.filter(r=>r.category==='hairStyle').length,walkCases:walk.length,missingSourceFallbackCases:missingSource,allNonempty:records.every(r=>r.world.ink>0)&&walk.every(r=>r.world.ink>0),outfitDisabledWithoutOwnership:disabled,lockedOutfitWorldRenders:0,inventory:{bagKinds,slots:10,visibleItems:inventoryIds,actualMarkup:true,iconsFromActualItemIconSVG:true,domLayoutRasterized:false},panels,records,walk,limits:['One factor at a time; not every Cartesian clothing combination','Idle world uses actual drawAvatarCanvas/fine bitmap while UI raster remains actual avatarRaster path','Visual approval is not inferred from nonempty or unique image hashes','2432 walking samples are rasterized/metric-covered, not all individually visually inspected','Locked outfits are not purchased or saved by this script; six disabled options remain locked','Inventory contact covers actual icons; HTML is actual inventoryHTML but CSS/browser layout is not rasterized']};
await writeFile(new URL('metrics.json',out),JSON.stringify(metrics,null,2)+'\n');console.log(JSON.stringify({out:fileURLToPath(out),stable,idleCases:records.length,hairIdleCases:metrics.hairIdleCases,hairWalkCases:walk.filter(r=>r.category==='hairStyle').length,walkCases:walk.length,missingSource:missingSource.length,outfitDisabled:disabled,panels:panels.length,allNonempty:metrics.allNonempty}));
if(!stable||missingSource.length||disabled!==6||!metrics.allNonempty)process.exitCode=1;
