// Pack already reviewed whole native frames; never fit geometry or infer artwork approval.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {sourceActorsData as D} from '../game/web/source-actors-data.js';
import {interactionActorsData as A} from '../game/web/interaction-actors-data.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const sha=b=>createHash('sha256').update(b).digest('hex'),files=new Map(),entries=new Map();
const sourceSequences=new Map(['daily','gestures','composites','water'].flatMap(k=>Object.values(D[k]).map(s=>[s.id,s])));
const key=(id,sequence,n)=>[id,sequence,n].join(':');
async function nativeTile(path,rect={x:0,y:0,w:96,h:128}){
 const image=await loadImage(path);
 if(rect.w!==96||rect.h!==128||rect.x<0||rect.y<0||rect.x+96>image.width||rect.y+128>image.height)throw Error('Invalid native frame extent');
 const canvas=createCanvas(96,128),ctx=canvas.getContext('2d');ctx.drawImage(image,rect.x,rect.y,96,128,0,0,96,128);return canvas;
}
function translateHead(metadata,delta){
 const h=structuredClone(metadata);
 for(const k of['top','bottom','portraitChin','eyeLine'])if(Number.isFinite(h[k]))h[k]+=delta[1]/2;
 for(const k of['left','right'])h[k]+=delta[0]/2;
 for(const k of['eyeAnchor','neckAnchor'])if(h[k])h[k]=h[k].map((v,i)=>v+delta[i]/2);
 for(const k of['facePolygon','scalpPolygon'])if(h[k])h[k]=h[k].map(p=>p.map((v,i)=>v+delta[i]/2));
 for(const k of['top','left'])h[k]=Math.floor(h[k]);for(const k of['bottom','right'])h[k]=Math.ceil(h[k]);return h;
}
// Preserve previously reviewed sparse entries when another action family is added.
for(const[id,actor]of Object.entries(A.actors))for(const[sequenceId,seq]of Object.entries(actor.sequences))for(const[n,record]of Object.entries(seq.frames)){
 entries.set(key(id,sequenceId,n),{id,sequenceId,n:Number(n),record:structuredClone(record),review:record.provenance.review,canvas:await nativeTile('game/'+record.detail.path,record.detail)});
}
const inputs=process.argv.slice(2).length?process.argv.slice(2):['verification/action-head-annotations-seated-v29.json'];
for(const input of inputs){
 const set=JSON.parse(fs.readFileSync(input)),review=set.review||'verification/seated-canonical-identity-art-review-v29.md';
 if(set.status!=='approved'||!fs.existsSync(review))throw Error('Only actually reviewed annotation sets may install');
 for(const spec of set.frames){
  const original=sourceSequences.get(spec.sequenceId),source=original?.frames[spec.frameIndex];
  if(!source||!['human-male','human-female'].includes(spec.actorId))throw Error('Unknown source actor/frame');
  const delta=spec.translation;if(delta?.length!==2||!delta.every(Number.isInteger)||!spec.headMetadata?.neckAnchor)throw Error('Authored donor registration required');
  if(!spec.sourceFine||['path','x','y','w','h'].some(k=>spec.sourceFine[k]!==source.detail[k]))throw Error('Source body provenance mismatch');
  const canvas=await nativeTile(spec.draftFine),gender=spec.actorId.replace('human-',''),record={...source,head:translateHead(spec.headMetadata,delta),canonicalFace:{gender,donor:spec.headDonor,translation:delta,sourceBody:spec.sourceFine},provenance:{annotationSet:input,sourceSequence:original.id,sourceFrame:spec.frameIndex,originalAtlas:source.detail.path,originalRect:source.detail,headDonor:spec.headDonor,headDonorSHA256:sha(fs.readFileSync(spec.headDonor)),review,foregroundPolygons:spec.foregroundPolygons||[],preserveCollar:spec.preserveCollar,removeHeadPolygon:spec.removeHeadPolygon}};
  entries.set(key(spec.actorId,original.id,spec.frameIndex),{id:spec.actorId,sequenceId:original.id,n:spec.frameIndex,record,review,canvas});
 }
}
const data={version:1,actors:{}};
for(const id of['human-male','human-female']){
 const selected=[...entries.values()].filter(e=>e.id===id),actor={status:'approved',mode:'derived-head-body-compatibility',editableMaster:false,wardrobeApproval:false,artReview:{checked:true,evidence:[...new Set(selected.map(e=>e.review))]},images:[],detail_images:[],sequences:{}};
 for(const sequenceId of[...new Set(selected.map(e=>e.sequenceId))].sort()){
  const poses=selected.filter(e=>e.sequenceId===sequenceId).sort((a,b)=>a.n-b.n),seq={images:[],detail_images:[],frames:{}};actor.sequences[sequenceId]=seq;
  for(let start=0;start<poses.length;start+=128){
   const batch=poses.slice(start,start+128),columns=Math.min(8,batch.length),rows=Math.ceil(batch.length/columns),fineAtlas=createCanvas(columns*96,rows*128),coarseAtlas=createCanvas(columns*48,rows*64),fineCtx=fineAtlas.getContext('2d'),coarseCtx=coarseAtlas.getContext('2d'),page=seq.images.length;
   coarseCtx.imageSmoothingEnabled=false;
   for(const[i,e]of batch.entries()){
    const x=i%columns,y=Math.floor(i/columns),fullFine=e.canvas.toBuffer('image/png'),coarse=createCanvas(48,64),ctx=coarse.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(e.canvas,0,0,48,64);
    // Complete per-pose PNGs remain the review/export authority; atlases are only packaging.
    const individual=`art/approved/interaction-v29/${sequenceId}-${e.n}`;files.set(individual+'-fine.png',fullFine);files.set(individual+'.png',coarse.toBuffer('image/png'));
    fineCtx.drawImage(e.canvas,x*96,y*128);coarseCtx.drawImage(coarse,x*48,y*64);
    seq.frames[e.n]={...e.record,page,x:x*48,y:y*64,w:48,h:64,detail:{path:`assets/interaction-v29/${sequenceId}-page-${page+1}-fine.png`,x:x*96,y:y*128,w:96,h:128,factor:2},provenance:{...e.record.provenance,individualFine:individual+'-fine.png'}};
   }
   for(const[fine,atlas]of[[false,coarseAtlas],[true,fineAtlas]]){
    const path=`assets/interaction-v29/${sequenceId}-page-${page+1}${fine?'-fine':''}.png`,bytes=atlas.toBuffer('image/png'),resource={path,width:atlas.width,height:atlas.height,sha256:sha(bytes)};
    actor[fine?'detail_images':'images'].push(resource);seq[fine?'detail_images':'images'].push(resource);files.set('game/'+path,bytes);
   }
  }
 }
 if(selected.length)data.actors[id]=actor;
}
files.set('game/web/interaction-actors-data.js',Buffer.from('// Reviewed sparse canonical-head whole poses. Explicit native atlas refs; complete pose PNGs retained. Not a layered wardrobe.\nexport const interactionActorsData='+JSON.stringify(data)+';\n'));
// All source decoding, bounds and metadata validation finish before the first artifact is changed.
for(const[p,b]of files){fs.mkdirSync(p.slice(0,p.lastIndexOf('/')),{recursive:true});fs.writeFileSync(p,b)}
console.log({reviewedFrames:entries.size,runtimePages:Object.values(data.actors).reduce((n,a)=>n+a.images.length+a.detail_images.length,0),inputs});
