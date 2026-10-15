import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{fileURLToPath}from'node:url';import{createRequire}from'node:module';
import{locomotionActorsData as L}from'../web/locomotion-actors-data.js';import{sourceActorFrame}from'../web/source-actors.js';
const{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),file=p=>fileURLToPath(new URL('../'+p,import.meta.url));
const decode=async p=>{let im=await loadImage(file(p)),c=createCanvas(im.width,im.height);c.getContext('2d').drawImage(im,0,0);return{width:im.width,height:im.height,pixels:c.getContext('2d').getImageData(0,0,im.width,im.height).data}};
test('reviewed real side clips replace run with four separately preserved whole PNG poses',async()=>{
 for(const[gender,id]of[['male',0],['female',1]])for(const dir of['down','right','up','left']){
  const a=L.actors['human-'+gender];assert.equal(a?.status,'approved');assert.equal(a.artReview.checked,true);for(const evidence of a.artReview.evidence)assert.ok(fs.existsSync(fileURLToPath(new URL('../../'+evidence,import.meta.url))));
  const s=a.run[dir];assert.equal(s.frames.length,4);assert.deepEqual(s.anchor,[24,63]);assert.equal(new Set(s.images.map(v=>v.path)).size,4);
  let unique=new Set();for(let n=0;n<4;n++){
   const f=sourceActorFrame({gender:id},{walking:true,running:true,facing:dir,walkFrame:n*2});assert.equal(f.id,`locomotion-run-${gender}-${dir}`);assert.equal(f.frameIndex,n);assert.deepEqual(f.spriteSize,[48,64]);assert.deepEqual(f.anchor,[24,63]);
   const coarse=await decode(f.atlas),fine=await decode(f.rect.detail.path);assert.deepEqual([coarse.width,coarse.height],[48,64]);assert.deepEqual([fine.width,fine.height],[96,128]);assert.ok(fine.pixels.some((v,i)=>i%4===3&&v===0));assert.ok(fine.pixels.some((v,i)=>i%4===3&&v===255));
   let bottom=-1;for(let y=0;y<128;y++)for(let x=0;x<96;x++)if(fine.pixels[(y*96+x)*4+3]>=128)bottom=Math.max(bottom,y);assert.equal(bottom,125,'every real support shoe rests immediately above common ground126');unique.add(Buffer.from(fine.pixels).toString('base64'));
  }assert.equal(unique.size,4,'four different authored poses, not duplicate clocks');
 }
});
test('each gender keeps its own exact opaque donor face through every phase (female identity is independent of male)',async()=>{
 const evidence=JSON.parse(fs.readFileSync(file('../art/drafts/canonical-face-v29/female-heads-v1/export-evidence.json')));
 for(const dir of['down','right','up','left']){let tested=0;for(const gender of['male','female']){const path=gender==='male'?`../art/drafts/locomotion-v27/shared-head-style-proposal/male-${dir}-native-run0-head-fine.png`:'../'+evidence.poses[dir].fine,head=await decode(path),neck=gender==='male'?{down:[48,61],right:[55,60],up:[48,58],left:[40,61]}[dir]:evidence.poses[dir].head.neckAnchor.map(v=>v*2);let own=0;for(const r of L.actors['human-'+gender].run[dir].frames){const image=await decode(r.detail.path),delta=r.head.neckAnchor.map((v,i)=>Math.round(v*2-neck[i]));for(let y=0;y<128;y++)for(let x=0;x<96;x++){const k=(y*96+x)*4;if(head.pixels[k+3]!==255)continue;const xx=x+delta[0],yy=y+delta[1];assert.ok(xx>=0&&xx<96&&yy>=0&&yy<128);assert.deepEqual([...image.pixels.slice((yy*96+xx)*4,(yy*96+xx)*4+4)],[...head.pixels.slice(k,k+4)]);own++;tested++}}assert.ok(own>0,'positive real opaque donor pixels per gender')}assert.ok(tested>1000,'positive native face coverage')}
});
test('head identity composition preserves actual authored lower body RGBA and limb geometry',async()=>{
 for(const[actor,a]of Object.entries(L.actors))for(const[dir,s]of Object.entries(a.run))for(let n=0;n<4;n++){
  const r=s.frames[n],actual=await decode(r.detail.path);let expected,offset=[0,0];
  if(r.sourceBodyPNG)expected=await decode('../'+r.sourceBodyPNG);
  else if(['right','left'].includes(dir))expected=await decode('../'+s.sourceKey.replace(/sheet\.png$/,`phase-${n}-shaded-fine.png`));
  else{const im=await loadImage(file(r.sourceBodyAtlas)),c=createCanvas(96,128),q=r.sourceBodyRect;offset=r.bodyTranslation;c.getContext('2d').drawImage(im,q.x,q.y,q.w,q.h,...offset,96,128);expected={pixels:c.getContext('2d').getImageData(0,0,96,128).data};}
  let opaque=0;for(let y=80;y<128;y++)for(let x=0;x<96;x++){let k=(y*96+x)*4;assert.deepEqual([...actual.pixels.slice(k,k+4)],[...expected.pixels.slice(k,k+4)],`${actor}/${dir}/${n}: existing authored limb/body pixel ${x},${y}`);if(actual.pixels[k+3]>=128)opaque++}
  assert.ok(opaque>100,'positive actual lower-body coverage');for(const k of['top','left','bottom','right'])assert.ok(Number.isInteger(r.head[k]),'coarse crop bounds must index integer rows and columns');
 }
});
test('female rear run keeps the same slight model-height difference and never drops below its standing head',async()=>{
 const{canonicalActorsData:C}=await import('../web/canonical-actors-data.js');const extent=async path=>{const p=await decode(path);let top=128,bottom=-1;for(let y=0;y<128;y++)for(let x=0;x<96;x++)if(p.pixels[(y*96+x)*4+3]>=128){top=Math.min(top,y);bottom=Math.max(bottom,y)}return{top,bottom,height:bottom-top+1}};
 const idle=await extent(C.actors['human-female'].idle.up.frames[0].detail.path);
 for(let n=0;n<4;n++){let m=await extent(L.actors['human-male'].run.up.frames[n].detail.path),f=await extent(L.actors['human-female'].run.up.frames[n].detail.path);assert.equal(f.bottom,125);assert.ok(Math.abs(f.height/m.height-.20/.2125)<.02,'approved female scale .20 vs male .2125 gives about6% lower stature, within two fine pixels');assert.ok(f.top<=idle.top&&idle.top-f.top<=5,'starting rear run raises the head a few pixels as the other run poses do, never a6px downward hop');}
});
