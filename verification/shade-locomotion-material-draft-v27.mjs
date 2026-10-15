// Authored material identities on complete source legs. RGB only: no geometry.
import fs from 'node:fs';import{createRequire}from'node:module';
const{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const female=process.argv.includes('--female'),direction=process.argv.includes('--left')?'left':'right',gender=female?'female':'male',version=female?'v3':'v2';
const folder=`art/drafts/locomotion-v27/${gender}-${direction}-${version}`,spec=JSON.parse(fs.readFileSync(folder+'/export-spec-and-evidence.json'));
const front=[[314,405],[358,405],[379,432],[408,485],[431,535],[474,541],[481,569],[442,590],[393,585],[387,547],[365,500],[338,462],[310,433]];
const rear=[[278,412],[316,411],[324,440],[286,473],[239,508],[222,533],[234,553],[225,575],[193,575],[177,549],[167,520],[183,502],[213,484],[252,452]];
const vertical=[[267,406],[307,406],[320,442],[305,482],[303,540],[328,550],[328,582],[296,596],[240,590],[240,565],[254,540],[252,481],[255,444]];
const raised=[[302,405],[336,403],[358,423],[393,444],[390,472],[364,486],[352,503],[369,511],[368,534],[340,535],[322,520],[315,494],[327,465],[343,450],[311,440]];
const leftFront=[[332,440],[364,447],[357,470],[315,520],[278,555],[251,566],[218,580],[185,578],[181,559],[204,546],[221,547],[250,511],[281,473],[312,445]],leftRear=[[354,440],[387,441],[414,474],[442,508],[475,536],[493,542],[502,565],[487,588],[456,612],[428,613],[426,586],[448,572],[431,549],[397,517],[368,479]],leftVertical=[[313,439],[350,439],[363,476],[360,527],[359,573],[379,585],[379,614],[339,617],[290,614],[290,592],[311,569],[309,524],[310,477]],leftRaised=[[296,434],[330,440],[327,472],[290,497],[275,518],[295,535],[282,558],[255,561],[238,543],[231,520],[239,494],[262,464]];
const rise=p=>p.map(([x,y])=>[x,y-46]);
const polygons=direction==='right'?[{near:front,far:rear},{near:vertical,far:raised},{near:rear,far:front},{near:raised,far:vertical}]:[{near:leftFront,far:leftRear},{near:leftVertical,far:leftRaised},{near:rise(leftRear),far:rise(leftFront)},{near:rise(leftRaised),far:rise(leftVertical)}];
const ownership=['A near front, far back','B near vertical support, far raised','C near back, far front','D far vertical support, near raised'];
const contact=createCanvas(1056,664),cc=contact.getContext('2d');cc.fillStyle='#20282c';cc.fillRect(0,0,1056,664);cc.imageSmoothingEnabled=false;cc.font='17px sans-serif';cc.fillStyle='#fff';cc.fillText('DRAFT raw whole pose above / authored leg material shading below / alpha+geometry identical',8,23);
const evidence={status:'draft',operation:'RGB material gain only, intersected with actual source alpha; no pixel translation/warp/new silhouettes',maskScope:'complete visible thigh/shin/shoe regions, not rectangular strips',gains:{near:1.12,far:.64},phases:[]};
for(let n=0;n<4;n++){
 const pose=spec.poses[n],im=await loadImage(`${folder}/phase-${n}-master.png`),c=createCanvas(627,627),ctx=c.getContext('2d');ctx.drawImage(im,0,0);const original=ctx.getImageData(0,0,627,627),shaded=ctx.getImageData(0,0,627,627),tags=new Uint8Array(627*627),counts={near:0,far:0};
 for(const name of['far','near']){
  const mask=createCanvas(627,627),m=mask.getContext('2d'),polygon=polygons[n][name];m.fillStyle='#fff';m.beginPath();m.moveTo(...polygon[0]);for(const p of polygon.slice(1))m.lineTo(...p);m.closePath();m.fill();const p=m.getImageData(0,0,627,627);
  for(let i=0;i<tags.length;i++){
   const k=i*4,r=original.data[k],g=original.data[k+1],b=original.data[k+2];
   // Source-alpha intersection preserves real contours and gaps. Neutral dark
   // pants/shoe pixels exclude any jacket or skin overlapping the authored hip.
   const selected=p.data[k+3]>=128&&original.data[k+3]>=128&&Math.max(r,g,b)<65&&Math.max(r,g,b)-Math.min(r,g,b)<14;
   p.data[k]=p.data[k+1]=p.data[k+2]=255;p.data[k+3]=selected?original.data[k+3]:0;if(selected)tags[i]=name==='near'?2:1;
  }
 }
 // The near leg owns any visible hip overlap. Save disjoint alpha masks from
 // those final authored tags, rather than two overlapping selection polygons.
 for(const [name,tag]of[['far',1],['near',2]]){
  const mask=createCanvas(627,627),m=mask.getContext('2d'),p=m.createImageData(627,627);
  for(let i=0;i<tags.length;i++)if(tags[i]===tag){const k=i*4;p.data[k]=p.data[k+1]=p.data[k+2]=255;p.data[k+3]=original.data[k+3];}
  m.putImageData(p,0,0);fs.writeFileSync(`${folder}/phase-${n}-${name}-leg-material-alpha.png`,mask.toBuffer('image/png'));
 }
 let changed=0;
 for(let i=0;i<tags.length;i++){const k=i*4;if(tags[i]){const gain=tags[i]===2?1.12:.64;counts[tags[i]===2?'near':'far']++;for(let j=0;j<3;j++)shaded.data[k+j]=Math.min(255,Math.round(original.data[k+j]*gain));if([0,1,2].some(j=>shaded.data[k+j]!==original.data[k+j]))changed++;}if(shaded.data[k+3]!==original.data[k+3])throw Error('Material authoring changed alpha');}
 ctx.putImageData(shaded,0,0);
 const exports=[];
 for(const factor of[1,2]){const out=createCanvas(48*factor,64*factor),o=out.getContext('2d'),s=spec.uniformFineScale*factor/2; o.imageSmoothingEnabled=false;o.setTransform(s,0,0,s,24*factor-pose.sourceRoot[0]*s,63*factor-pose.sourceRoot[1]*s);o.drawImage(c,0,0);const file=`${folder}/phase-${n}-shaded-${factor===2?'fine':'coarse'}.png`;fs.writeFileSync(file,out.toBuffer('image/png'));exports.push(file);
  if(factor===2){const raw=await loadImage(`${folder}/phase-${n}-fine.png`),probe=createCanvas(96,128).getContext('2d');probe.drawImage(raw,0,0);const a=probe.getImageData(0,0,96,128).data,b=o.getImageData(0,0,96,128).data;for(let i=3;i<a.length;i+=4)if(a[i]!==b[i])throw Error('Export material authoring changed silhouette');const x=n*264+36;cc.fillStyle='#fff';cc.fillText(ownership[n],x-24,51);cc.drawImage(raw,x,54,192,256);cc.drawImage(out,x,370,192,256);for(const y of[54,370]){cc.strokeStyle='#2fc4d4';cc.beginPath();cc.moveTo(x-20,y+252.5);cc.lineTo(x+216,y+252.5);cc.stroke();}}
 }
 evidence.phases.push({phase:n,ownership:ownership[n],polygons:polygons[n],counts,changedSourcePixels:changed,exports});
}
fs.writeFileSync(folder+'/material-mask-evidence.json',JSON.stringify(evidence,null,2)+'\n');fs.writeFileSync(`verification/locomotion-${gender}-${direction}-${version}-material-draft.png`,contact.toBuffer('image/png'));
console.log('Authored draft material masks and RGB-only previews; every source/export alpha byte unchanged.');
