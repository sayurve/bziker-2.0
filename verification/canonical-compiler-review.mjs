import {readFileSync,writeFileSync,mkdtempSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {buildCanonicalIdle} from '../game/scripts/build-canonical-idle.mjs';
const {loadImage,createCanvas}=createRequire(process.execPath)('@napi-rs/canvas'),project=new URL('../',import.meta.url);
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const out={actualGeometry:[]};
function alphaBounds(im,threshold=128){const c=createCanvas(im.width,im.height).getContext('2d');c.drawImage(im,0,0);const p=c.getImageData(0,0,im.width,im.height).data;let left=im.width,top=im.height,right=-1,bottom=-1;for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(p[(y*im.width+x)*4+3]>=threshold){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}return[left,top,right+1,bottom+1];}
for(const name of ['export-spec.json','female-export-spec.json']){const spec=JSON.parse(readFileSync(new URL('art/drafts/canonical-idle-v2/'+name,project)));for(const [facing,p]of Object.entries(spec.poses)){const source=await loadImage(fileURLToPath(new URL('art/drafts/canonical-idle-v2/'+p.file,project))),b=alphaBounds(source),fineBounds=[48+(b[0]-p.sourceAnchor[0])*spec.uniformScale,126+(b[1]-p.sourceAnchor[1])*spec.uniformScale,48+(b[2]-p.sourceAnchor[0])*spec.uniformScale,126+(b[3]-p.sourceAnchor[1])*spec.uniformScale];out.actualGeometry.push({actor:spec.actorId,facing,sourceSize:[source.width,source.height],sourceOpaqueAlphaBounds:b,alphaThreshold:128,projectedFineBounds:fineBounds,clipped:fineBounds[0]<0||fineBounds[1]<0||fineBounds[2]>96||fineBounds[3]>128});}}
const dir=mkdtempSync(join(tmpdir(),'bziker-compiler-review-'));
try{
 const base=JSON.parse(readFileSync(new URL('art/drafts/canonical-idle-v2/export-spec.json',project)));
 for(const p of Object.values(base.poses))copyFileSync(new URL('art/drafts/canonical-idle-v2/'+p.file,project),join(dir,p.file));
 const specPath=join(dir,'spec.json');writeFileSync(specPath,JSON.stringify(base));await buildCanonicalIdle(specPath,{output:dir});
 const dataPath=join(dir,'web/canonical-actors-data.js'),imagePath=join(dir,'assets/canonical-idle-v2/male-down.png');
 const before={data:sha(dataPath),image:sha(imagePath)};
 const bad=structuredClone(base);bad.poses.down.sourceAnchor[0]+=20;bad.poses.up.sourceAnchor[1]=1e6;writeFileSync(specPath,JSON.stringify(bad));
 let error;try{await buildCanonicalIdle(specPath,{output:dir});}catch(e){error=e.message;}
 const after={data:sha(dataPath),image:sha(imagePath)};
 out.failureAtomicity={error,before,after,oldModuleRetained:before.data===after.data,oldPngRetained:before.image===after.image};
 const clipped=structuredClone(base);clipped.poses.down.sourceAnchor[1]-=200;writeFileSync(specPath,JSON.stringify(clipped));let result;
 try{result=await buildCanonicalIdle(specPath,{output:dir});}catch(e){out.clippingRejected=e.message;}
 out.clippedExportAccepted=!!result;if(result){const image=await loadImage(imagePath);out.clippedExportAlphaBounds=alphaBounds(image);}
}finally{rmSync(dir,{recursive:true,force:true});}
writeFileSync(new URL('canonical-compiler-review'+(process.argv.includes('--after')?'-after':'')+'.json',import.meta.url),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
