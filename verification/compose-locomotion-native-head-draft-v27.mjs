// Explicit derived head/body layers for reviewed whole-pose compatibility.
// Native donor head pixels are copied at1:1; no face resize, limb warp or fit.
import fs from 'node:fs';import{createRequire}from'node:module';import{createHash}from'node:crypto';
import{sourceActorsData as D}from'../game/web/source-actors-data.js';
const{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const female=process.argv.includes('--female'),gender=female?'female':'male',version=female?'v3':'v2';
const sha=b=>createHash('sha256').update(b).digest('hex');
const inside=(p,x,y)=>{let v=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])v=!v;}return v;};
const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height);
const configs={
 right:{token:'Справа',neck:[55,60],eye:[63,47],
  headPolygon:[[20,7],[83,7],[83,53],[76,54],[75,59],[70,62],[65,62],[63,60],[59,63],[55,62],[52,59],[48,57],[46,55],[39,55],[32,52],[25,47],[20,39]],
  facePolygon:[[57,31],[73,31],[74,50],[78,53],[73,60],[67,62],[63,60],[59,63],[55,60],[52,57],[47,55],[46,43],[51,42],[54,46],[56,39]],
  scalpPolygon:[[25,20],[42,11],[60,9],[75,20],[77,29],[59,31],[56,41],[53,44],[47,42],[46,51],[40,55],[32,50],[26,43],[23,34]],
  seams:[[[230,255],[288,263],[335,272],[356,291],[380,300],[470,300]],[[190,253],[248,263],[292,272],[313,291],[337,300],[420,300]],[[230,247],[288,255],[335,264],[356,283],[380,292],[470,292]],[[190,246],[248,254],[292,263],[313,282],[337,291],[430,291]]]},
 left:{token:'Слева',neck:[40,61],eye:[27,48],
  headPolygon:[[14,8],[70,8],[73,35],[68,47],[60,54],[53,57],[47,57],[43,59],[39,62],[35,64],[30,63],[25,61],[22,58],[17,55],[14,49]],
  facePolygon:[[23,34],[38,34],[40,43],[45,45],[46,48],[49,45],[51,46],[51,54],[46,57],[40,59],[36,63],[30,62],[24,60],[20,56],[17,54],[19,49],[21,43]],
  scalpPolygon:[[22,16],[38,10],[52,13],[63,22],[68,36],[64,47],[57,53],[50,57],[45,56],[46,48],[39,47],[37,35],[23,34],[18,30]],
  seams:[[[175,335],[258,335],[284,324],[310,315],[347,294],[408,284],[470,276]],[[120,335],[203,335],[229,324],[255,315],[292,294],[353,284],[420,276]],[[175,289],[258,289],[284,278],[310,269],[347,248],[408,238],[470,230]],[[120,289],[203,289],[229,278],[255,269],[292,248],[353,238],[420,230]]]}
};
const contact=createCanvas(1056,664),cc=contact.getContext('2d');cc.fillStyle='#20282c';cc.fillRect(0,0,1056,664);cc.font='17px sans-serif';cc.fillStyle='#fff';cc.fillText('DRAFT same native run0 alpha head per direction / fixed body scale / neck translation only',8,25);cc.imageSmoothingEnabled=false;
const evidence={status:'draft',mode:'derived-head-body-compatibility',editableMaster:false,wardrobeApproval:false,artReview:{checked:false,evidence:[]},directions:{}};
for(const[direction,cfg]of Object.entries(configs)){
 const folder=`art/drafts/locomotion-v27/${gender}-${direction}-${version}`,out=folder+'/native-head-composition';fs.mkdirSync(out,{recursive:true});
 const spec=JSON.parse(fs.readFileSync(folder+'/export-spec-and-evidence.json')),seq=Object.values(D.actors['human-male'].actions).find(s=>s.name.includes('Бег')&&s.name.includes(cfg.token)),donor=seq.frames[0],r=donor.detail;
 const original=await loadImage('game/'+r.path),head=createCanvas(96,128),hc=head.getContext('2d');hc.drawImage(original,r.x,r.y,r.w,r.h,0,0,r.w,r.h);const hd=pixels(head);let donorPixels=0;
 for(let y=0;y<128;y++)for(let x=0;x<96;x++){const k=(y*96+x)*4;if(!inside(cfg.headPolygon,x+.5,y+.5))hd.data[k+3]=0;if(hd.data[k+3])donorPixels++;}
 hc.putImageData(hd,0,0);const headBytes=head.toBuffer('image/png');fs.writeFileSync(out+'/native-run0-alpha-head-fine.png',headBytes);
 const record={donor:{sourceKey:seq.sourceKey,frameIndex:0,atlas:r.path,rect:r,sha256:sha(fs.readFileSync('game/'+r.path)),headLayerSHA256:sha(headBytes),alphaPixels:donorPixels,authoredHeadPolygon:cfg.headPolygon,neckAnchor:cfg.neck,eyeAnchor:cfg.eye,facePolygon:cfg.facePolygon,scalpPolygon:cfg.scalpPolygon},poses:[]};
 for(let n=0;n<4;n++){
  const pose=spec.poses[n],file=`${folder}/phase-${n}-shaded-fine.png`,im=await loadImage(file),body=createCanvas(96,128),bc=body.getContext('2d');bc.drawImage(im,0,0);const bp=pixels(body),before=new Uint8ClampedArray(bp.data),seam=cfg.seams[n],poly=[[0,0],[627,0],...seam.slice().reverse()];
  const toSource=(x,y)=>[(x-48)/spec.uniformFineScale+pose.sourceRoot[0],(y-126)/spec.uniformFineScale+pose.sourceRoot[1]];
  let removed=0;const removal=createCanvas(96,128),rc=removal.getContext('2d'),rp=rc.createImageData(96,128);
  for(let y=0;y<128;y++)for(let x=0;x<96;x++){
   const k=(y*96+x)*4,p=toSource(x+.5,y+.5),r=bp.data[k],g=bp.data[k+1],b=bp.data[k+2];
   const edge=seam.findIndex((v,i)=>i<seam.length-1&&p[0]>=v[0]&&p[0]<=seam[i+1][0]);
   const seamY=edge<0?-Infinity:seam[edge][1]+(seam[edge+1][1]-seam[edge][1])*(p[0]-seam[edge][0])/(seam[edge+1][0]-seam[edge][0]);
   // Follow actual warm hair/skin fringes just below the authored curved seam.
   // This removes generated neck/ear antialias pixels without cutting a
   // rectangular band from the grey collar or any raised arm.
   const headFringe=r>g*1.15&&g>b*1.06&&p[1]<=seamY+14;
   if((inside(poly,...p)||headFringe)&&bp.data[k+3]){removed++;rp.data[k]=rp.data[k+1]=rp.data[k+2]=255;rp.data[k+3]=bp.data[k+3];bp.data[k+3]=0;}
  }
  bc.putImageData(bp,0,0);rc.putImageData(rp,0,0);fs.writeFileSync(`${out}/phase-${n}-generated-head-alpha-mask-fine.png`,removal.toBuffer('image/png'));fs.writeFileSync(`${out}/phase-${n}-body-below-neck-fine.png`,body.toBuffer('image/png'));
  const target=pose.sourceNeckAnchor.map((v,i)=>(i===0?48:126)+(v-pose.sourceRoot[i])*spec.uniformFineScale),delta=target.map((v,i)=>Math.round(v-cfg.neck[i]));
  const composite=createCanvas(96,128),c=composite.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(body,0,0);c.drawImage(head,...delta);const cp=pixels(composite),protectedBodyY=Math.ceil(target[1]+8);let copied=0,bodyChanges=0;
  for(let y=0;y<128;y++)for(let x=0;x<96;x++){const k=(y*96+x)*4,hx=x-delta[0],hy=y-delta[1],j=(hy*96+hx)*4,inHead=hx>=0&&hx<96&&hy>=0&&hy<128&&hd.data[j+3]===255;
   if(inHead){for(let z=0;z<4;z++)if(cp.data[k+z]!==hd.data[j+z])throw Error('Native opaque donor head pixels changed');copied++;}
   else if(y>=protectedBodyY&&[0,1,2,3].some(z=>cp.data[k+z]!==before[k+z]))bodyChanges++;
  }
  if(bodyChanges)throw Error('Head composition changed beyond authored neck +8px in '+gender+' '+direction+' phase'+n+' count'+bodyChanges+' neck'+target); if(!copied||!removed)throw Error('Vacuous head composition');
  for(const factor of[1,2]){const canvas=factor===2?composite:createCanvas(48,64);if(factor===1){const q=canvas.getContext('2d');q.imageSmoothingEnabled=false;q.drawImage(composite,0,0,48,64);}fs.writeFileSync(`${out}/phase-${n}-${factor===2?'fine':'coarse'}.png`,canvas.toBuffer('image/png'));}
  const sourceHead=donor.head,shift=delta.map(v=>v/2),headMetadata={...sourceHead,top:sourceHead.top+shift[1],bottom:sourceHead.bottom+shift[1],left:sourceHead.left+shift[0],right:sourceHead.right+shift[0],portraitChin:(direction==='right'?32:33)+shift[1],eyeAnchor:cfg.eye.map((v,i)=>(v+delta[i])/2),eyeLine:(cfg.eye[1]+delta[1])/2,neckAnchor:cfg.neck.map((v,i)=>(v+delta[i])/2),facePolygon:cfg.facePolygon.map(p=>p.map((v,i)=>(v+delta[i])/2)),scalpPolygon:cfg.scalpPolygon.map(p=>p.map((v,i)=>(v+delta[i])/2))};
  record.poses.push({phase:n,bodySource:file,sourceRoot:pose.sourceRoot,sourceNeck:pose.sourceNeckAnchor,bodyHeadRemovalPolygon:poly,removedGeneratedPixels:removed,headTranslation:delta,identicalOpaqueHeadPixels:copied,protectedBodyY,bodyPixelChangesBelowAuthoredNeck:bodyChanges,head:headMetadata});
  const x=n*264+36,y=direction==='right'?54:370;cc.fillStyle='#fff';cc.fillText(direction+' phase'+n+' head shift'+delta.join(','),x-24,y-9);cc.drawImage(composite,x,y,192,256);cc.strokeStyle='#2fc4d4';cc.beginPath();cc.moveTo(x-20,y+252.5);cc.lineTo(x+216,y+252.5);cc.stroke();
 }
 evidence.directions[direction]=record;fs.writeFileSync(out+'/composition-evidence.json',JSON.stringify({status:'draft',...record},null,2)+'\n');
}
fs.writeFileSync(`verification/locomotion-${gender}-native-head-composition-v27.json`,JSON.stringify(evidence,null,2)+'\n');fs.writeFileSync(`verification/locomotion-${gender}-${version}-native-head-draft.png`,contact.toBuffer('image/png'));
console.log('Draft head/body compositions created; exact same native head copied, body below authored neck +8px unchanged.');
