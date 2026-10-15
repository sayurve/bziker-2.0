import fs from'node:fs';import path from'node:path';import{fileURLToPath,pathToFileURL}from'node:url';import{createHash}from'node:crypto';import{createRequire}from'node:module';
const {loadImage,createCanvas}=createRequire(process.execPath)('@napi-rs/canvas'),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),reviewed=o=>o?.status==='approved'&&o.artReview?.checked===true&&o.artReview.evidence?.length&&o.artReview.evidence.every(v=>typeof v==='string'&&v.trim()),pair=v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite);
/** Validate/decode every incoming byte before any artifact can be replaced. */
export async function stageCanonicalFamilies({projectRoot,existing,manifests}){
 const data=structuredClone(existing),writes=new Map(),resources=new Map(),records=[];
 for(const manifest of manifests)for(const [actorId,actor]of Object.entries(manifest.actors||{})){
  if(!['human-male','human-female'].includes(actorId))throw Error('Unsupported canonical family model');
  const gender=actorId.slice(6),target=data.actors[actorId]||{status:'approved',images:[],detail_images:[],sequences:{},artReview:{checked:true,evidence:[]}};target.families||={};
  for(const [family,directions]of Object.entries(actor.families||{}))for(const [dir,input]of Object.entries(directions)){
   if(!['hand','lowerReach','seated','water'].includes(family)||!['down','left','up','right'].includes(dir)||!reviewed(input)||input.frames?.length!==4||JSON.stringify(input.anchor)!=='[24,63]'||JSON.stringify(input.sprite_size)!=='[48,64]')throw Error(`Unreviewed/incomplete family ${actorId}/${family}/${dir}`);
   for(const receipt of input.artReview.evidence)if(!fs.existsSync(path.join(projectRoot,receipt)))throw Error(`Missing review receipt ${receipt}`);
   const seq=structuredClone(input);seq.images=[];seq.detail_images=[];
   for(const [i,frame]of seq.frames.entries()){
    if(frame.w!==48||frame.h!==64||frame.x!==0||frame.y!==0||!pair(frame.head?.neckAnchor)||!pair(frame.head?.eyeAnchor)||!pair(frame.hand)||['seated','lowerReach'].includes(family)&&!pair(frame.pelvis)||frame.detail?.w!==96||frame.detail.h!==128||frame.detail.factor!==2||frame.detail.x!==0||frame.detail.y!==0)throw Error(`Invalid authored metadata ${input.id}/${i}`);
    for(const [kind,w,h,source]of [['coarse',48,64,input.images[frame.page||0]?.path],['fine',96,128,frame.detail.path]]){
     if(typeof source!=='string'||!source.endsWith('.png')||path.isAbsolute(source)||source.split(/[\\/]/).includes('..'))throw Error('Invalid native PNG path');
     const bytes=fs.readFileSync(path.join(projectRoot,source)),image=await loadImage(bytes);if(image.width!==w||image.height!==h)throw Error(`Wrong native dimensions ${source}`);
     const canvas=createCanvas(w,h);canvas.getContext('2d').drawImage(image,0,0);const rgba=canvas.getContext('2d').getImageData(0,0,w,h).data;if(!rgba.some((v,k)=>k%4===3&&v===0)||!rgba.some((v,k)=>k%4===3&&v>=128))throw Error(`PNG needs actual figure and true alpha ${source}`);
     const hash=sha(bytes),expected=(kind==='coarse'?input.images[frame.page||0]:input.detail_images?.find(v=>v.path===source))?.sha256;if(expected&&expected!==hash)throw Error(`Reviewed PNG changed ${source}`);const key=`${w}x${h}:${hash}`;let resource=resources.get(key);
     if(!resource){const name=`${gender}-${family}-${dir}-${i}${kind==='fine'?'-fine':''}.png`,runtime=`assets/interaction-v29/${name}`,approved=`art/approved/canonical-actions-v30/${name}`;resource={path:runtime,width:w,height:h,sha256:hash,source,approved};resources.set(key,resource);writes.set(`game/${runtime}`,bytes);writes.set(approved,bytes);}
     if(kind==='coarse'){frame.page=i;seq.images.push({...resource});}else{frame.detail={...frame.detail,path:resource.path};seq.detail_images.push({...resource});}
    }
    frame.provenance={...frame.provenance,review:seq.artReview.evidence,sourceFine:input.frames[i].detail.path,sourceCoarse:input.images[input.frames[i].page||0].path};
   }
   target.families[family]||={};target.families[family][dir]=seq;target.status='approved';target.mode='canonical-wholepose-family-compatibility';target.editableMaster=false;target.wardrobeApproval=false;target.artReview={checked:true,evidence:[...new Set([...(target.artReview?.evidence||[]),...seq.artReview.evidence])]};records.push({actorId,family,dir,id:seq.id,frames:4});
  }
  data.actors[actorId]=target;
 }
 if(!records.length)throw Error('No reviewed families supplied');
 writes.set('game/web/interaction-actors-data.js',Buffer.from('// Reviewed canonical whole-body pose families and sparse compatibility; not an editable layered wardrobe.\nexport const interactionActorsData='+JSON.stringify(data)+';\n'));
 return{data,writes,records};
}
export async function installCanonicalFamilies(options){const staged=await stageCanonicalFamilies(options);for(const [name,bytes]of staged.writes){const dest=path.join(options.projectRoot,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes)}return staged.records;}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){const projectRoot=fileURLToPath(new URL('../',import.meta.url)),{interactionActorsData:existing}=await import('../game/web/interaction-actors-data.js');const files=process.argv.slice(2);if(!files.length)throw Error('Pass reviewed staged manifests explicitly');const manifests=files.map(file=>JSON.parse(fs.readFileSync(path.resolve(projectRoot,file))));console.log(JSON.stringify(await installCanonicalFamilies({projectRoot,existing,manifests}),null,2));}
