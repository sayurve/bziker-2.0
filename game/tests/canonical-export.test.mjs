import test,{mock} from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,copyFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {validateExportSpec,buildCanonicalIdle} from '../scripts/build-canonical-idle.mjs';
const specPath=fileURLToPath(new URL('../../art/drafts/canonical-idle-v2/export-spec.json',import.meta.url));
test('canonical export rejects missing directions and per-frame fitting',()=>{
 const spec=JSON.parse(readFileSync(specPath));assert.equal(validateExportSpec(spec).uniformScale,.10625);
 const bad=structuredClone(spec);bad.poses.left.scaleX=2;assert.throws(()=>validateExportSpec(bad),/scale|crop|flip/);
 const missing=structuredClone(spec);delete missing.poses.up;assert.throws(()=>validateExportSpec(missing),/Four/);
 const unreviewed=structuredClone(spec);unreviewed.status='approved';unreviewed.artReview={checked:false,evidence:[]};assert.throws(()=>validateExportSpec(unreviewed),/visual/);
});
test('exporting another model preserves the first model and its provenance',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bziker-canonical-merge-')),spec=JSON.parse(readFileSync(specPath));
 try{
  for(const pose of Object.values(spec.poses))copyFileSync(new URL('../../art/drafts/canonical-idle-v2/'+pose.file,import.meta.url),join(dir,pose.file));
  const malePath=join(dir,'male.json'),femalePath=join(dir,'female.json');
  writeFileSync(malePath,JSON.stringify(spec));
  const female={...spec,actorId:'human-female',gender:'female',status:'draft',artReview:{checked:false,evidence:[]}};writeFileSync(femalePath,JSON.stringify(female));
  const first=await buildCanonicalIdle(malePath,{output:dir}),firstReport=JSON.parse(readFileSync(join(dir,'docs/canonical-idle-v2-export.json'))),firstFiles=generatedFiles(dir),result=await buildCanonicalIdle(femalePath,{output:dir});
  assert.deepEqual(Object.keys(result.actors).sort(),['human-female','human-male']);
  assert.deepEqual(result.actors['human-male'],first.actors['human-male']);
  assert.equal(result.actors['human-female'].status,'draft');
  const report=JSON.parse(readFileSync(join(dir,'docs/canonical-idle-v2-export.json')));
  assert.deepEqual(report.actors['human-male'],firstReport.actors['human-male']);assert.equal(report.actors['human-female'].sources.length,4);
  const mergedFiles=generatedFiles(dir);for(const [file,hash]of Object.entries(firstFiles))if(file.endsWith('.png'))assert.equal(mergedFiles[file],hash,'second model preserves first model PNG bytes');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('actual canonical masters export fixed canvases using one immutable model scale',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bziker-canonical-')),before=Object.values(JSON.parse(readFileSync(specPath)).poses).map(v=>readFileSync(new URL('../../art/drafts/canonical-idle-v2/'+v.file,import.meta.url)));
 try{const result=await buildCanonicalIdle(specPath,{output:dir}),actor=result.actors['human-male'];assert.equal(Object.keys(actor.idle).length,4);
  const manifest=JSON.parse(readFileSync(join(dir,'docs/canonical-idle-v2-export.json')));assert.equal(new Set(manifest.actors['human-male'].sources.map(s=>s.uniformScale)).size,1);
  for(const d of ['down','left','right','up']){const pose=actor.idle[d];assert.deepEqual(pose.anchor,[24,63]);assert.deepEqual([pose.frames[0].w,pose.frames[0].h],[48,64]);assert.deepEqual([pose.frames[0].detail.w,pose.frames[0].detail.h],[96,128]);assert.ok(pose.frames[0].head.right>pose.frames[0].head.left);}
  const after=Object.values(JSON.parse(readFileSync(specPath)).poses).map(v=>readFileSync(new URL('../../art/drafts/canonical-idle-v2/'+v.file,import.meta.url)));assert.deepEqual(after,before);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const generatedFiles=dir=>Object.fromEntries(['assets/canonical-idle-v2','web','docs'].flatMap(folder=>readdirSync(join(dir,folder)).sort().map(file=>[folder+'/'+file,createHash('sha256').update(readFileSync(join(dir,folder,file))).digest('hex')])));
async function workingExport(run){
 const dir=mkdtempSync(join(tmpdir(),'bziker-canonical-failure-')),spec=JSON.parse(readFileSync(specPath)),path=join(dir,'spec.json');
 try{for(const pose of Object.values(spec.poses))copyFileSync(new URL('../../art/drafts/canonical-idle-v2/'+pose.file,import.meta.url),join(dir,pose.file));writeFileSync(path,JSON.stringify(spec));await buildCanonicalIdle(path,{output:dir});await run({dir,spec,path});}finally{rmSync(dir,{recursive:true,force:true});}
}
test('late invalid anchor, missing master and invalid existing metadata preserve every installed artifact',async()=>{
 for(const failure of ['anchor','missing','module','provenance'])await workingExport(async({dir,spec,path})=>{
  // The first direction would change before the final direction fails.
  spec.poses.down.sourceAnchor[0]+=20;
  if(failure==='anchor')spec.poses.up.sourceAnchor[1]=1e6;
  if(failure==='missing')rmSync(join(dir,spec.poses.up.file));
  if(failure==='module')writeFileSync(join(dir,'web/canonical-actors-data.js'),'unrecognised existing module');
  if(failure==='provenance')writeFileSync(join(dir,'docs/canonical-idle-v2-export.json'),'{invalid');
  writeFileSync(path,JSON.stringify(spec));const before=generatedFiles(dir);
  await assert.rejects(buildCanonicalIdle(path,{output:dir}));
  assert.deepEqual(generatedFiles(dir),before,failure+': a failed build must preserve all installed bytes');
  assert.ok(readdirSync(dir).every(name=>!name.startsWith('.canonical-build-')),'no abandoned staging after handled failure');
 });
});
test('an in-master ground landmark that clips opaque feet is rejected without changing installed output',async()=>{
 await workingExport(async({dir,spec,path})=>{spec.poses.down.sourceAnchor[1]-=200;writeFileSync(path,JSON.stringify(spec));const before=generatedFiles(dir);await assert.rejects(buildCanonicalIdle(path,{output:dir}),/opaque.*clip|clip.*opaque/i);assert.deepEqual(generatedFiles(dir),before);});
});
test('clipping validation uses alpha128 threshold without fitting the source silhouette',async()=>{
 await workingExport(async({dir,spec,path})=>{
  const master=join(dir,spec.poses.down.file),im=await loadImage(master);
  for(const alpha of[127,128]){const c=createCanvas(im.width,im.height),ctx=c.getContext('2d');ctx.drawImage(im,0,0);const pixel=ctx.createImageData(1,1);pixel.data.set([120,70,40,alpha]);ctx.putImageData(pixel,0,0);writeFileSync(master,c.toBuffer('image/png'));const before=generatedFiles(dir);
   if(alpha===127)await buildCanonicalIdle(path,{output:dir});else{await assert.rejects(buildCanonicalIdle(path,{output:dir}),/opaque.*clip|clip.*opaque/i);assert.deepEqual(generatedFiles(dir),before);}
  }
 });
});
test('real male and female exports decode to fixed transparent canvases with authored grounded feet',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bziker-canonical-native-'));
 try{for(const file of['export-spec.json','female-export-spec.json']){const full=fileURLToPath(new URL('../../art/drafts/canonical-idle-v2/'+file,import.meta.url)),spec=JSON.parse(readFileSync(full)),masters=Object.values(spec.poses).map(p=>readFileSync(new URL('../../art/drafts/canonical-idle-v2/'+p.file,import.meta.url)));const result=await buildCanonicalIdle(full,{output:dir});
   for(const direction of['down','left','right','up'])for(const fine of[false,true]){
    const resource=`assets/canonical-idle-v2/${spec.gender}-${direction}${fine?'-fine':''}.png`,im=await loadImage(join(dir,resource)),width=fine?96:48,height=fine?128:64,anchor=fine?[48,126]:[24,63];
    assert.deepEqual([im.width,im.height],[width,height],resource+': independently decode fixed dimensions');
    assert.deepEqual(result.actors[spec.actorId].idle[direction].anchor,[24,63]);
    const ctx=createCanvas(width,height).getContext('2d');ctx.drawImage(im,0,0);const p=ctx.getImageData(0,0,width,height).data;let bottom=-1,opaque=0,transparent=0,groundDark=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const k=(y*width+x)*4,a=p[k+3];if(!a)transparent++;if(a>=128){opaque++;bottom=Math.max(bottom,y);if(y===anchor[1]-1&&Math.max(p[k],p[k+1],p[k+2])<100)groundDark++;}if(x===0||y===0||x===width-1||y===height-1)assert.equal(a,0,resource+': real transparent outer margin');}
    assert.ok(opaque>200&&transparent>200,resource+': real character plus alpha, not flattened background');
    assert.equal(bottom,anchor[1]-1,resource+': actual boot ground sits immediately above authored root');
    assert.ok(groundDark>1,resource+': inspect actual dark boot contacts');
   }
   assert.deepEqual(Object.values(spec.poses).map(p=>readFileSync(new URL('../../art/drafts/canonical-idle-v2/'+p.file,import.meta.url))),masters,'raw masters unchanged');
  }}finally{rmSync(dir,{recursive:true,force:true});}
});

test('filesystem install errors restore old artifacts and remove an incomplete new model',async()=>{
 for(const failure of['early-png','last-metadata','new-model'])await workingExport(async({dir,spec,path})=>{
  spec.poses.down.sourceAnchor[0]+=20;
  if(failure==='new-model'){spec.actorId='human-female';spec.gender='female';spec.status='draft';spec.artReview={checked:false,evidence:[]};}
  writeFileSync(path,JSON.stringify(spec));
  const before=generatedFiles(dir),rename=fs.renameSync,failedTarget=join(dir,failure==='early-png'?'assets/canonical-idle-v2/male-left.png':'docs/canonical-idle-v2-export.json');let injected=false;
  const stub=mock.method(fs,'renameSync',(from,to)=>{if(!injected&&to===failedTarget){injected=true;throw Error('injected disk installation failure');}return rename(from,to);});
  syncBuiltinESMExports();
  try{await assert.rejects(buildCanonicalIdle(path,{output:dir}),/injected disk/);assert.equal(injected,true,'exercise an actual staged file installation');assert.deepEqual(generatedFiles(dir),before,failure+': old PNG/module/provenance unchanged and no incomplete female PNG');assert.ok(readdirSync(dir).every(name=>!name.startsWith('.canonical-build-')));}finally{stub.mock.restore();syncBuiltinESMExports();}
 });
});
