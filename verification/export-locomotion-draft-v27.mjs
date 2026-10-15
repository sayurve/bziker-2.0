// Engine derivatives of preserved image_gen whole poses; no bbox fitting.
import fs from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const female=process.argv.includes('--female'),scale=female?.20:.2125,gender=female?'female':'male',version=female?'v3':'v2',anchor=[48,126],cellSize=627;
const sources=[
 {direction:'right',file:'exec-c3b67b16-3bed-4d5a-b526-d7e78449847d.png',roots:[[320,591],[292,593],[322,582],[282,585]],
  heads:[[232,69,455,292],[194,71,411,292],[233,64,455,286],[194,65,412,286]],eyes:[[399,232],[351,232],[399,224],[352,225]],necks:[[355,284],[313,282],[355,277],[314,275]]},
 {direction:'left',file:'exec-af38f610-e54c-4144-8bc2-708c1c66f78c.png',roots:[[350,611],[310,611],[352,565],[310,565]],
  heads:[[214,85,450,325],[168,83,414,325],[214,39,450,280],[168,37,414,280]],eyes:[[276,259],[218,259],[276,213],[218,213]],necks:[[329,316],[273,316],[329,270],[273,270]]}
];
if(female){sources[0].file='exec-7590471c-16ab-4eaf-a991-9179dd86b0fa.png';sources[1].file='exec-1631a5a5-a87d-475d-aef1-8b098b09d907.png';sources[0].roots=[[320,594],[292,594],[322,582],[282,586]];sources[1].roots=[[350,613],[310,613],[352,567],[310,567]];}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const readPixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
const alphaBounds=c=>{const p=readPixels(c),b=[c.width,c.height,-1,-1];for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(p[(y*c.width+x)*4+3]>=128){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}return b;};
const native=[];
for(const source of sources){
 const original=resolve('/Users/sapp/.codex/generated_images/01a11cc3-6744-72b3-ad8a-81b59ea9f091',source.file),bytes=fs.readFileSync(original),sheet=await loadImage(original);
 if(sheet.width!==1254||sheet.height!==1254)throw Error('Expected the reviewed2x2source grid');
 const folder=`art/drafts/locomotion-v27/${gender}-${source.direction}-${version}`;fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(folder+'/sheet.png',bytes);
 const prompt=fs.existsSync(folder+'/prompt-info.json')?JSON.parse(fs.readFileSync(folder+'/prompt-info.json')):{};
 const metadata={version:1,status:'draft',mode:'legacy-composite',artReview:{checked:false,evidence:[]},sourcePath:original,sourceSHA256:hash(bytes),sourceDimensions:[1254,1254],sourceCellDimensions:[627,627],uniformFineScale:scale,fineCanvas:[96,128],fineAnchor:anchor,coarseCanvas:[48,64],coarseAnchor:[24,63],promptText:prompt.prompt||null,promptNote:prompt.prompt?'Exact root generation prompt preserved in prompt-info.json':'Root generated this sheet with built-in image_gen. Exact prompt text was not supplied to this agent.',headReview:'not accepted: generated head identity/shape drift; no head replacement performed',anatomyReview:'candidate: opposite near-arm contact and passing ownership now visible; leg depth material tags remain to review',precision:'source root/eye/neck points manually authored, not measured anatomical ground truth',poses:[]};
 for(let n=0;n<4;n++){
  const master=createCanvas(cellSize,cellSize),m=master.getContext('2d');m.drawImage(sheet,n%2*cellSize,Math.floor(n/2)*cellSize,cellSize,cellSize,0,0,cellSize,cellSize);
  fs.writeFileSync(`${folder}/phase-${n}-master.png`,master.toBuffer('image/png'));
  const root=source.roots[n],box=alphaBounds(master),point=p=>[anchor[0]+(p[0]-root[0])*scale,anchor[1]+(p[1]-root[1])*scale];
  const transformed=[...point([box[0],box[1]]),...point([box[2]+1,box[3]+1])];
  if(transformed[0]<0||transformed[1]<0||transformed[2]>96||transformed[3]>128)throw Error('Opaque pose would clip; revise authored model contract, never bbox-fit '+source.direction+n);
  const [hx,hy,hr,hb]=source.heads[n],head={top:Math.floor(point([hx,hy])[1]/2),bottom:Math.ceil(point([hr,hb])[1]/2),left:Math.floor(point([hx,hy])[0]/2),right:Math.ceil(point([hr,hb])[0]/2),eyeAnchor:point(source.eyes[n]).map(v=>v/2),eyeLine:point(source.eyes[n])[1]/2,neckAnchor:point(source.necks[n]).map(v=>v/2)};
  const pose={phase:n,sourceRoot:root,sourceEyeAnchor:source.eyes[n],sourceNeckAnchor:source.necks[n],sourceHeadBounds:source.heads[n],head,sourceAlphaBounds:box,exports:[]};
  for(const factor of[1,2]){
   const c=createCanvas(48*factor,64*factor),ctx=c.getContext('2d'),s=scale*factor/2;ctx.imageSmoothingEnabled=false;ctx.setTransform(s,0,0,s,24*factor-root[0]*s,63*factor-root[1]*s);ctx.drawImage(master,0,0);
   const output=`${folder}/phase-${n}-${factor===2?'fine':'coarse'}.png`,buffer=c.toBuffer('image/png');fs.writeFileSync(output,buffer);const check=await loadImage(output);if(check.width!==48*factor||check.height!==64*factor)throw Error('Export dimensions changed');
   const p=readPixels(c);if(!p.some((v,i)=>i%4===3&&v===0)||!p.some((v,i)=>i%4===3&&v===255))throw Error('Real alpha/opaque pose missing');
   pose.exports.push({file:output,size:[c.width,c.height],sha256:hash(buffer),alphaBounds:alphaBounds(c)});if(factor===2)native.push({direction:source.direction,phase:n,canvas:c,head});
  }
  metadata.poses.push(pose);
 }
 fs.writeFileSync(folder+'/export-spec-and-evidence.json',JSON.stringify(metadata,null,2)+'\n');
}
const contact=createCanvas(1056,664),c=contact.getContext('2d');c.fillStyle='#20282c';c.fillRect(0,0,contact.width,contact.height);c.font='18px sans-serif';c.fillStyle='#fff';c.fillText(`DRAFT ${gender} ${version} / generated whole poses / uniform fine scale ${scale} / no head repair`,12,25);c.imageSmoothingEnabled=false;
for(const item of native){const x=item.phase*264+36,y=item.direction==='right'?54:370;c.fillStyle='#fff';c.fillText(item.direction+' phase'+item.phase,x-24,y-9);c.drawImage(item.canvas,x,y,192,256);c.strokeStyle='#2fc4d4';c.beginPath();c.moveTo(x-20,y+252.5);c.lineTo(x+216,y+252.5);c.stroke();}
fs.writeFileSync(`verification/locomotion-${gender}-${version}-native-draft.png`,contact.toBuffer('image/png'));
console.log('Draft only:16runtime-sized PNGs,8full-cell masters,two preserved sources; no production module modified.');
