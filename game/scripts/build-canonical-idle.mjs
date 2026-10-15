/** Export preserved image_gen masters with one authored model scale and root registration. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,mkdtempSync,renameSync,rmSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const gameRoot=fileURLToPath(new URL('../',import.meta.url)),projectRoot=resolve(gameRoot,'..');
const dirs=['down','left','right','up'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function requireCanvas(){try{return createRequire(import.meta.url)('@napi-rs/canvas');}catch{return createRequire(process.execPath)('@napi-rs/canvas');}}
export function validateExportSpec(spec){
 if(!spec||spec.version!==1||!/^human-(male|female)$/.test(spec.actorId)||!['male','female'].includes(spec.gender)||spec.actorId!==`human-${spec.gender}`)throw Error('Invalid canonical actor identity');
 if(!['draft','approved'].includes(spec.status)||spec.mode!=='legacy-composite')throw Error('Complete-pose export must declare its review status and mode');
 if(!Number.isFinite(spec.uniformScale)||spec.uniformScale<=0)throw Error('One positive model scale required');
 if(JSON.stringify(spec.canvas)!=='[48,64]'||JSON.stringify(spec.anchor)!=='[24,63]')throw Error('Runtime source canvas/anchor contract required');
 if(Object.keys(spec.poses||{}).sort().join(',')!==[...dirs].sort().join(','))throw Error('Four real directional idle poses required');
 for(const pose of Object.values(spec.poses)){
  if(typeof pose.file!=='string'||!pose.file.endsWith('.png')||pose.file.includes('/')||pose.file.includes('\\')||pose.file==='..png')throw Error('Master must be a PNG beside the export spec');
  if(!Array.isArray(pose.sourceAnchor)||pose.sourceAnchor.length!==2||!pose.sourceAnchor.every(Number.isFinite))throw Error('Explicit authored ground/root landmark required');
  if(Object.keys(pose).some(key=>!['file','sourceAnchor','portraitChin'].includes(key)))throw Error('Per-pose scale/crop/flip is unsupported');
  if(pose.portraitChin!==undefined&&(!Number.isInteger(pose.portraitChin)||pose.portraitChin<0||pose.portraitChin>39))throw Error('Authored portrait chin must fit head preview canvas');
 }
 if(spec.status==='approved'&&!(spec.artReview?.checked===true&&Array.isArray(spec.artReview.evidence)&&spec.artReview.evidence.length&&spec.artReview.evidence.every(p=>typeof p==='string'&&p.trim())))throw Error('Approved export requires actual visual evidence');
 return spec;
}
function headRegion(canvas){
 const c=canvas.getContext('2d'),p=c.getImageData(0,0,48,64).data,points=[];
 for(let y=0;y<43;y++)for(let x=0;x<48;x++){const n=(y*48+x)*4,r=p[n],g=p[n+1],b=p[n+2];if(p[n+3]>127&&r>g*1.15&&g>b*1.06&&r-g<75)points.push([x,y]);}
 if(!points.length)throw Error('Canonical master has no expected brown head region');
 const top=Math.min(...points.map(p=>p[1])),hair=points.filter(p=>p[1]<top+21);
 return {top,bottom:Math.min(42,Math.max(...hair.map(p=>p[1]))+2),left:Math.min(...hair.map(p=>p[0])),right:Math.max(...hair.map(p=>p[0]))};
}
/** Measure opaque coverage only to reject clipping; this never changes the transform. */
function opaqueBounds(image,createCanvas){
 const width=image.width,height=image.height,ctx=createCanvas(width,height).getContext('2d');ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,width,height).data;
 let left=width,top=height,right=0,bottom=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>=128){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
 if(!right||!bottom)throw Error('Canonical master has no opaque pixels');
 return {left,top,right,bottom};
}
function requireUnclipped(bounds,pose,scale,width,height,anchor,direction){
 const left=anchor[0]+(bounds.left-pose.sourceAnchor[0])*scale,right=anchor[0]+(bounds.right-pose.sourceAnchor[0])*scale;
 const top=anchor[1]+(bounds.top-pose.sourceAnchor[1])*scale,bottom=anchor[1]+(bounds.bottom-pose.sourceAnchor[1])*scale;
 if(left< -1e-9||top< -1e-9||right>width+1e-9||bottom>height+1e-9)throw Error('Opaque master would clip the fixed canvas: '+direction);
}
/** Stage complete bytes and backups before replacing any installed artifact.
 * Handled installation errors restore previous files; no intermediate output is
 * advertised as a successful build. A process crash is outside this transaction.
 */
function installArtifacts(output,artifacts){
 mkdirSync(output,{recursive:true});
 const stage=mkdtempSync(resolve(output,'.canonical-build-')),files=[],installed=[];let retainBackups=false;
 try{
  for(const [file,bytes]of artifacts){
   const target=resolve(output,file),staged=resolve(stage,String(files.length)+'.new'),backup=resolve(stage,String(files.length)+'.old');
   mkdirSync(dirname(target),{recursive:true});
   const existed=existsSync(target);
   if(existed)writeFileSync(backup,readFileSync(target));
   writeFileSync(staged,bytes);files.push({target,staged,backup,existed});
  }
  for(const file of files){renameSync(file.staged,file.target);installed.push(file);}
 }catch(error){
  const rollbackErrors=[];
  for(const file of installed.reverse())try{if(file.existed)renameSync(file.backup,file.target);else rmSync(file.target);}catch(rollback){rollbackErrors.push(rollback);}
  if(rollbackErrors.length){retainBackups=true;throw new AggregateError([error,...rollbackErrors],'Export rollback incomplete; backups retained in '+stage);}
  throw error;
 }finally{if(!retainBackups)rmSync(stage,{recursive:true,force:true});}
}
export async function buildCanonicalIdle(specPath,{output=gameRoot}={}){
 const spec=validateExportSpec(JSON.parse(readFileSync(specPath))),{createCanvas,loadImage}=requireCanvas(),sequences={},images=[],detail_images=[],sources=[],artifacts=new Map();
 // Existing metadata is also input: decode it before preparing or installing files.
 const dataPath=resolve(output,'web/canonical-actors-data.js'),reportPath=resolve(output,'docs/canonical-idle-v2-export.json');
 let existing={version:1,actors:{}};
 if(existsSync(dataPath)){
  const module=readFileSync(dataPath,'utf8'),match=module.match(/export const canonicalActorsData=(\{[^]*\});\s*$/);
  if(!match)throw Error('Refusing to overwrite an unrecognised canonical actor module');
  existing=JSON.parse(match[1]);
  if(existing.version!==1||!existing.actors||Array.isArray(existing.actors))throw Error('Unsupported existing canonical actor data');
 }
 const previous=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):{};
 for(const direction of dirs){
  const pose=spec.poses[direction],sourcePath=resolve(dirname(specPath),pose.file),sourceBytes=readFileSync(sourcePath),im=await loadImage(sourcePath);
  if(pose.sourceAnchor[0]<0||pose.sourceAnchor[0]>im.width||pose.sourceAnchor[1]<0||pose.sourceAnchor[1]>im.height)throw Error('Authored root lies outside master '+direction);
  const coverage=opaqueBounds(im,createCanvas),rendered=[];
  for(const detail of [1,2]){
   const width=48*detail,height=64*detail,scale=spec.uniformScale*detail/2;
   requireUnclipped(coverage,pose,scale,width,height,[24*detail,63*detail],direction);
   const c=createCanvas(width,height),ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
   // Engine export only: the whole immutable original uses the authored scale
   // and landmark. Coverage checks never normalize or fit the silhouette.
   ctx.setTransform(scale,0,0,scale,24*detail-pose.sourceAnchor[0]*scale,63*detail-pose.sourceAnchor[1]*scale);ctx.drawImage(im,0,0);
   const file=`assets/canonical-idle-v2/${spec.gender}-${direction}${detail===2?'-fine':''}.png`,bytes=c.toBuffer('image/png');artifacts.set(file,bytes);
   rendered.push({canvas:c,path:file,width,height,sha256:hash(bytes)});
  }
  const coarse=rendered[0],fine=rendered[1];images.push({path:coarse.path,width:48,height:64});detail_images.push({path:fine.path,width:96,height:128});
  const head=headRegion(coarse.canvas);if(pose.portraitChin!==undefined)head.portraitChin=pose.portraitChin;
  const frame={page:0,x:0,y:0,w:48,h:64,head,sourceScale:spec.uniformScale/2,detail:{path:fine.path,x:0,y:0,w:96,h:128,factor:2}};
  sequences[direction]={id:`canonical-idle-${spec.gender}-${direction}`,name:`Canonical idle ${direction}`,images:[images.at(-1)],detail_images:[detail_images.at(-1)],frames:[frame],anchor:[24,63],sprite_size:[48,64],loop:true,duration:1,fps:1,timeline:[0],sourceKey:`art/drafts/canonical-idle-v2/${pose.file}`};
  sources.push({direction,file:relative(projectRoot,sourcePath),sha256:hash(sourceBytes),size:[im.width,im.height],sourceAnchor:pose.sourceAnchor,uniformScale:spec.uniformScale,exports:rendered.map(({canvas,...v})=>v)});
 }
 const actor={status:spec.status,mode:spec.mode,artReview:spec.artReview,images,detail_images,idle:sequences},data={version:1,actors:{...existing.actors,[spec.actorId]:actor}};
 const report={version:2,actors:{...(previous.version===2?previous.actors:{}),[spec.actorId]:{spec:relative(projectRoot,specPath),mode:spec.mode,status:spec.status,canvas:[48,64],fineCanvas:[96,128],anchor:[24,63],sources}}};
 artifacts.set('web/canonical-actors-data.js','// Derived from preserved masters; see canonical-idle-v2-export.json.\nexport const canonicalActorsData='+JSON.stringify(data)+';\n');
 artifacts.set('docs/canonical-idle-v2-export.json',JSON.stringify(report,null,2)+'\n');
 installArtifacts(output,artifacts);return data;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.includes('--help')){console.log('node scripts/build-canonical-idle.mjs [--spec path] [--out game-directory]');process.exit(0);}
 const val=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
 const spec=resolve(val('--spec')||resolve(projectRoot,'art/drafts/canonical-idle-v2/export-spec.json'));
 await buildCanonicalIdle(spec,{output:resolve(val('--out')||gameRoot)});console.log('Canonical idle exported with one uniform model scale; review status preserved.');
}
