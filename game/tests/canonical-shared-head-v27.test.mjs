import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {canonicalActorsData as C} from '../web/canonical-actors-data.js';
import {locomotionActorsData as L} from '../web/locomotion-actors-data.js';
import {sourceActorFrame} from '../web/source-actors.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const directions=['down','right','up','left'];
const pixels=async p=>{const file=fileURLToPath(new URL('../'+p,import.meta.url)),i=await loadImage(file),c=createCanvas(i.width,i.height);c.getContext('2d').drawImage(i,0,0);return {width:i.width,height:i.height,data:c.getContext('2d').getImageData(0,0,i.width,i.height).data};};
const male=JSON.parse(readFileSync(new URL('../../art/drafts/locomotion-v27/shared-head-style-proposal/proposal-evidence.json',import.meta.url))),female=JSON.parse(readFileSync(new URL('../../art/drafts/canonical-face-v29/female-heads-v1/export-evidence.json',import.meta.url)));
const donor=(gender,dir)=>gender==='male'?male.sources.find(s=>s.gender==='male'&&s.dir===dir):female.poses[dir];
const femaleInstall=JSON.parse(readFileSync(new URL('../../verification/canonical-female-face-install-v29.json',import.meta.url)));
const nativeDonorPath=d=>d.file||d.fine;
const bounds=data=>{let top=128,bottom=-1;for(let y=0;y<128;y++)for(let x=0;x<96;x++)if(data[(y*96+x)*4+3]>=128){top=Math.min(top,y);bottom=Math.max(bottom,y);}return {top,bottom,height:bottom-top+1};};
test('approved male and own-faced female idle keep fixed native canvases, uniform model scales and a slightly shorter female body',async()=>{
 for(const dir of directions){const heights=[];
  for(const [gender,id] of [['male',0],['female',1]]){
   const actor=C.actors['human-'+gender],seq=actor.idle[dir],f=sourceActorFrame({gender:id},{facing:dir});
   assert.equal(actor.status,'approved');assert.equal(f.id,`canonical-idle-${gender}-${dir}`);assert.deepEqual(f.anchor,[24,63]);assert.deepEqual(f.spriteSize,[48,64]);
   const p=await pixels(f.rect.detail.path),b=bounds(p.data);assert.deepEqual([p.width,p.height],[96,128]);assert.equal(b.bottom,125);
   // Body registration is one authored uniform scalar for the model. Crown
   // bounds now depend on the woman's own head, so a fixed4px height delta
   // would incorrectly require the obsolete shared male face.
   assert.equal(seq.provenance.uniformFineScale,gender==='male'?.10625:.1,`${gender}/${dir}: one model scalar, never bbox fitting`);
   const d=donor(gender,dir),dp=await pixels('../'+nativeDonorPath(d)),delta=f.head.neckAnchor.map((v,i)=>v*2-d.head.neckAnchor[i]*2);
   assert.ok(delta.every(Number.isInteger),'canonical heads use integer translation only');
   assert.equal(b.top,bounds(dp.data).top+delta[1],`${gender}/${dir}: crown comes from this exact unscaled donor`);
   heights.push(b.height);
  }
  assert.ok(heights[1]<heights[0]&&heights[1]>heights[0]*.9,`${dir}: female remains slightly shorter with her own authored crown`);
 }
});
test('idle and every running phase preserve their own model donor exact native head RGBA after integer authored neck translation',async()=>{
 for(const gender of ['male','female'])for(const dir of directions){
  const d=donor(gender,dir),file=nativeDonorPath(d),donorBytes=readFileSync(new URL('../../'+file,import.meta.url));
  assert.equal(createHash('sha256').update(donorBytes).digest('hex'),d.headLayerSHA256||d.sha256,'the registered donor file itself is unchanged');
  if(gender==='female')assert.match(file,/canonical-face-v29\/female-heads-v1\//,'female identity must never fall back to the male donor');
  const p=await pixels('../'+file),neck=d.head.neckAnchor.map(v=>v*2),frames=[...C.actors['human-'+gender].idle[dir].frames,...L.actors['human-'+gender].run[dir].frames];
  assert.equal(frames.length,5);let count=0;
  for(const [index,r] of frames.entries()){
   const q=await pixels(r.detail.path),delta=r.head.neckAnchor.map((v,i)=>v*2-neck[i]);assert.ok(delta.every(Number.isInteger));
   let femaleExpected=null;
   if(gender==='female'){
    // Almost every female donor pixel has authored alpha251..254. Requiring
    // only alpha255 would inspect just1..10pixels; compare every visible donor
    // pixel to the exact recorded body+head source-over composite instead.
    const evidence=femaleInstall.poses.find(v=>v.state===(index===0?'idle':'run')&&v.dir===dir&&v.phase===(index===0?0:index-1));assert.ok(evidence);
    const source=readFileSync(new URL('../../'+evidence.sourceBody,import.meta.url));assert.equal(createHash('sha256').update(source).digest('hex'),evidence.sourceBodySHA256);
    const body=r.neckRepair?.bodyFine?readFileSync(new URL('../../'+r.neckRepair.bodyFine,import.meta.url)):source;
    const c=createCanvas(96,128),context=c.getContext('2d');context.drawImage(await loadImage(body),0,0);context.drawImage(await loadImage(donorBytes),...delta);femaleExpected=context.getImageData(0,0,96,128).data;
   }
   for(let y=0;y<128;y++)for(let x=0;x<96;x++){
    const k=(y*96+x)*4;if(gender==='female'?p.data[k+3]<=127:p.data[k+3]!==255)continue;
    const tx=x+delta[0],ty=y+delta[1];assert.ok(tx>=0&&tx<96&&ty>=0&&ty<128,'no opaque donor head pixel is clipped');
    const j=(ty*96+tx)*4,expected=femaleExpected?femaleExpected.slice(j,j+4):p.data.slice(k,k+4);assert.deepEqual([...q.data.slice(j,j+4)],[...expected],`${gender}/${dir}/${index}: exact opaque donor at ${x},${y}`);count++;
   }
  }
  assert.ok(count>1000,`${gender}/${dir}: verify a real opaque head, not an empty mask`);
 }
});
