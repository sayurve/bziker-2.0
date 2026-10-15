import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parts,defaultAvatar} from '../web/avatar.js';
const directions=['down','left','right','up'];
const head={top:4,bottom:25,left:12,right:35,neckAnchor:[24,27],eyeAnchor:[24,16],eyeLine:16,portraitChin:26,facePolygon:[[12,11],[35,11],[35,25],[12,25]]};
function fixture(){const idle=Object.fromEntries(directions.map(direction=>{const path=`test-only/canonical-${direction}.png`,detailPath=`test-only/canonical-${direction}-fine.png`;return [direction,{id:`canonical-idle-male-${direction}`,images:[{path,width:48,height:64}],detail_images:[{path:detailPath,width:96,height:128}],frames:[{x:0,y:0,w:48,h:64,page:0,head,detail:{path:detailPath,x:0,y:0,w:96,h:128,factor:2}}],anchor:[24,63],sprite_size:[48,64],loop:true,duration:1,fps:1,timeline:[0],sourceKey:`art/canonical-idle/${direction}`}];}));return {version:1,actors:{'human-male':{status:'approved',artReview:{checked:true,evidence:['verification/canonical-contact-review.md']},images:Object.values(idle).flatMap(s=>s.images),detail_images:Object.values(idle).flatMap(s=>s.detail_images),idle}}};}
async function isolatedApi(canonical=fixture()){
 let source=readFileSync(new URL('../web/source-actors.js',import.meta.url),'utf8');
 source=source.replace(/^import .*canonical-actors-data\.js';?\s*$/m,'');
 // Independent family supplements are disabled only in this contract fixture;
 // production selection and full native pixels are covered by separate tests.
 // Keep real pixel/mask code, but isolate independently reviewed locomotion/action supplements.
 source=source.replace(/^import .*locomotion-actors-data\.js';?\s*$/m,'const L={version:1,actors:{}};');
 source=source.replace(/^import .*interaction-actors-data\.js';?\s*$/m,'const A={version:1,actors:{}};');
 source=`const C=${JSON.stringify(canonical)};\n`+source.replace(/from '(\.\/[^']+)'/g,(_match,path)=>`from '${new URL(path,new URL('../web/source-actors.js',import.meta.url)).href}'`);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+Math.random());
}
test('canonical whole idle takes every male facing while absent female keeps source fallback',async()=>{
 const api=await isolatedApi();for(const facing of directions){const frame=api.sourceActorFrame({gender:0},{facing});assert.equal(frame.id,`canonical-idle-male-${facing}`);assert.equal(frame.atlas,`test-only/canonical-${facing}.png`);assert.deepEqual(frame.anchor,[24,63]);assert.deepEqual(frame.spriteSize,[48,64]);assert.equal(frame.rect.detail.factor,2);assert.doesNotMatch(frame.id,/На_месте/);const female=api.sourceActorFrame({gender:1},{facing});assert.doesNotMatch(female.id,/canonical/);}assert.equal(api.sourceActorFrame({gender:0}).id,'canonical-idle-male-down');
});
test('canonical loading decodes coarse and detail pages without removing original source resources',async()=>{
 const api=await isolatedApi(),requests=[];await api.loadSourceActor('human-male',{loadImage:async path=>{requests.push(path);return {path};}});for(const direction of directions){assert.ok(requests.includes(`test-only/canonical-${direction}.png`));assert.ok(requests.includes(`test-only/canonical-${direction}-fine.png`));}assert.ok(requests.includes('assets/design-actor-base-human-male-1.png'));assert.ok(requests.includes('assets/design-actor-detail-base-human-male-1.png'));assert.equal(new Set(requests).size,requests.length);
});
test('isolated canonical idle never shadows walk, run, litter, seated or gesture clips; standing phone keeps this exact idle',async()=>{
 const api=await isolatedApi();for(const facing of directions)for(const options of[{walking:true,walkFrame:4},{walking:true,running:true,walkFrame:2},{pose:'sit'},{pose:'sit',phoneOpen:true},{holding:'litter'},{action:'pet',actionProgress:.5},{action:'wave',actionProgress:.5}])assert.doesNotMatch(api.sourceActorFrame({gender:0},{...options,facing}).id,/canonical/);
 for(const facing of directions){const idle=api.sourceActorFrame({gender:0},{facing}),phone=api.sourceActorFrame({gender:0},{facing,phoneOpen:true});assert.equal(phone.id,idle.id);assert.deepEqual(phone.rect,idle.rect);assert.equal(phone.prop,'phone');}
});
test('head-only and anonymous generic previews select the same canonical idle automatically',async()=>{
 const api=await isolatedApi(),{createRequire}=await import('node:module'),{createCanvas}=createRequire(process.execPath)('@napi-rs/canvas');
 await api.loadSourceActor('human-male',{createCanvas,loadImage:async path=>{const fine=path.includes('-fine'),factor=fine?2:1,c=createCanvas(48*factor,64*factor),q=c.getContext('2d');q.fillStyle='#a95d3c';q.fillRect(12*factor,4*factor,24*factor,23*factor);q.fillStyle='#777777';q.fillRect(17*factor,27*factor,14*factor,35*factor);return c;}});
 for(const options of [{headOnly:true,facing:'left'},{generic:true,facing:'up'}]){
  const raster=api.sourceAvatarRaster({...defaultAvatar,gender:options.generic?1:0},parts,options);
  assert.ok(raster);assert.equal(raster.factor,2);assert.equal(raster.width,96);assert.equal(raster.grid.length,raster.width*raster.height);assert.ok(raster.grid.some(Boolean));assert.ok(raster.runs.length>0);
  assert.match(raster.key,options.headOnly?/canonical-left\.png/:/canonical-down\.png/);
 }

});

test('draft or unreviewed canonical artwork stays out of both idle selection and preload',async()=>{
 for(const mutate of [actor=>actor.status='draft',actor=>delete actor.status,actor=>delete actor.artReview,actor=>actor.artReview.checked=false,actor=>actor.artReview.evidence=[],actor=>actor.artReview.evidence=['  ']]){const data=fixture();mutate(data.actors['human-male']);const api=await isolatedApi(data);assert.doesNotMatch(api.sourceActorFrame({gender:0}).id,/canonical/);const paths=[];await api.loadSourceActor('human-male',{loadImage:async path=>{paths.push(path);return {path};}});assert.ok(paths.length>0);assert.ok(paths.every(path=>!path.startsWith('test-only/canonical')));}
});
test('real exported canonical PNGs preserve their declared canvases, alpha and frame metadata',async()=>{
 const {canonicalActorsData}=await import('../web/canonical-actors-data.js');const {createRequire}=await import('node:module'),{fileURLToPath}=await import('node:url');const {loadImage,createCanvas}=createRequire(process.execPath)('@napi-rs/canvas');
 const actor=canonicalActorsData.actors['human-male'];assert.ok(actor);assert.equal(actor.mode,'legacy-composite');assert.equal(actor.images.length,4);assert.equal(actor.detail_images.length,4);
 for(const direction of directions){const seq=actor.idle[direction],frame=seq.frames[0];assert.equal(seq.id,`canonical-idle-male-${direction}`);assert.deepEqual(seq.anchor,[24,63]);assert.deepEqual(seq.sprite_size,[48,64]);assert.equal(seq.frames.length,1);assert.ok(frame.head.top<frame.head.bottom);assert.equal(frame.detail.factor,2);assert.ok(frame.head.left<frame.head.right);}
 for(const resource of [...actor.images,...actor.detail_images]){const im=await loadImage(fileURLToPath(new URL('../'+resource.path,import.meta.url)));assert.equal(im.width,resource.width);assert.equal(im.height,resource.height);const c=createCanvas(im.width,im.height).getContext('2d');c.drawImage(im,0,0);const pixels=c.getImageData(0,0,im.width,im.height).data;assert.ok(pixels.some((v,i)=>i%4===3&&v===0),resource.path+' transparent margins');assert.ok(pixels.some((v,i)=>i%4===3&&v>127),resource.path+' actual character');}
});
test('real module approval status controls actual canonical preloads and selected idle',async()=>{
 const {canonicalActorsData}=await import('../web/canonical-actors-data.js'),api=await import('../web/source-actors.js');const {createRequire}=await import('node:module'),{fileURLToPath}=await import('node:url'),{loadImage,createCanvas}=createRequire(process.execPath)('@napi-rs/canvas'),actor=canonicalActorsData.actors['human-male'],paths=[];
 await api.loadSourceActor('human-male',{createCanvas,loadImage:async path=>{paths.push(path);return loadImage(fileURLToPath(new URL('../'+path,import.meta.url)));}});
 const approved=actor.status==='approved'&&actor.artReview?.checked===true&&Array.isArray(actor.artReview.evidence)&&actor.artReview.evidence.length>0&&actor.artReview.evidence.every(value=>typeof value==='string'&&value.trim());
 assert.equal(paths.filter(path=>path.startsWith('assets/canonical-idle-v2/')).length,approved?8:0);assert.equal(api.sourceActorFrame({gender:0}).id.startsWith('canonical-idle-'),approved);const female=canonicalActorsData.actors['human-female'],femaleApproved=female?.status==='approved'&&female.artReview?.checked===true&&female.artReview.evidence?.length>0;assert.equal(api.sourceActorFrame({gender:1}).id.startsWith('canonical-idle-'),!!femaleApproved);
});
