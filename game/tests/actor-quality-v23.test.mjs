import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {sourceActorFrame,loadSourceActor,drawSourceAvatarCanvas} from '../web/source-actors.js';
import {parts,defaultAvatar} from '../web/avatar.js';

const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const load=path=>loadImage(fileURLToPath(new URL('../'+path,import.meta.url)));
await loadSourceActor('human-male',{createCanvas,loadImage:load});
await loadSourceActor('human-female',{createCanvas,loadImage:load});
const render=(avatar,options={})=>{const c=createCanvas(96,128).getContext('2d');assert.equal(drawSourceAvatarCanvas(c,avatar,parts,0,0,{scale:2,...options}),true);return c.getImageData(0,0,96,128).data;};
const bounds=(p,predicate=()=>true)=>{let left=96,top=128,right=-1,bottom=-1;for(let y=0;y<128;y++)for(let x=0;x<96;x++){const n=(y*96+x)*4;if(p[n+3]&&predicate(p,n,x,y)){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}return {left,top,right,bottom,width:right-left+1,height:bottom-top+1};};

test('fine running frames retain every native face and texture pixel at all four phases and directions',async()=>{
 for(const gender of [0,1])for(const facing of ['down','right','up','left'])for(let n=0;n<4;n++){
  const avatar={...defaultAvatar,gender},options={facing,walking:true,running:true,walkFrame:n*2},frame=sourceActorFrame(avatar,options),r=frame.rect.detail;
  assert.ok(r);assert.deepEqual([r.w,r.h,r.factor],[96,128,2]);
  const c=createCanvas(96,128).getContext('2d');c.drawImage(await load(r.path),r.x,r.y,r.w,r.h,0,0,96,128);const expected=c.getImageData(0,0,96,128).data,actual=render(avatar,options);
  for(let p=0;p<actual.length;p+=4){const opaque=expected[p+3]>127;assert.equal(actual[p+3],opaque?255:0);if(opaque)assert.deepEqual([...actual.slice(p,p+3)],[...expected.slice(p,p+3)],`${gender}/${facing}/${n} modifies the native pixel`);}
 }
});

test('standing retains the run-canonical proportions and the pixels of its selected native idle',async()=>{
 const hair=(p,n,x,y)=>y<64&&p[n]>p[n+1]*1.15&&p[n+1]>p[n+2]*1.06&&p[n]-p[n+1]<75;
 for(const gender of [0,1]){
  const avatar={...defaultAvatar,gender},idle=render(avatar,{facing:'down'}),run=render(avatar,{facing:'down',walking:true,running:true});
  const a=bounds(idle,hair),b=bounds(run,hair);
  assert.ok(Math.abs(a.width-b.width)<=5,`${gender}: standing head ${a.width} versus running ${b.width}`);
  const frame=sourceActorFrame(avatar,{facing:'down'});
  if(frame.id.startsWith('canonical-idle-')){
   const r=frame.rect.detail,c=createCanvas(96,128).getContext('2d');c.drawImage(await load(r.path),r.x,r.y,r.w,r.h,0,0,96,128);const native=c.getImageData(0,0,96,128).data;
   for(let n=0;n<idle.length;n+=4){const opaque=native[n+3]>127;assert.equal(idle[n+3],opaque?255:0);if(opaque)assert.deepEqual([...idle.slice(n,n+3)],[...native.slice(n,n+3)],'the authored idle must retain its own face, jaw and body rather than transplanting run pixels');}
   assert.ok(Math.abs(bounds(idle).bottom-bounds(run).bottom)<=2,'authored idle preserves the ground anchor');
   continue;
  }
  const chin=gender===1?68:60;
  for(let y=0;y<chin;y++)for(let x=0;x<96;x++){const n=(y*96+x)*4;assert.deepEqual([...idle.slice(n,n+4)],[...run.slice(n,n+4)],'idle changes a native head pixel instead of retaining the running proportions');}
  const jaw=gender===1?[[38,60],[39,58],[39,57],[40,56],[42,54],[42,53],[42,53],[42,53]]:[[34,63],[36,60],[36,60],[38,58],[38,58],[38,58],[41,54],[41,54],[42,53]];
  for(let row=0;row<jaw.length;row++)for(let x=jaw[row][0];x<=jaw[row][1];x++){const n=((chin+row)*96+x)*4;assert.deepEqual([...idle.slice(n,n+4)],[...run.slice(n,n+4)],'idle clips the native mouth, chin or neck outline');}
  assert.ok(Math.abs(bounds(idle).bottom-bounds(run).bottom)<=2,'stopping never moves the ground anchor');
 }
});

test('fine customization preserves the native eyes while changing clothes and retains the foot anchor',()=>{
 for(const gender of [0,1]){
  const avatar={...defaultAvatar,gender},options={walking:true,running:true,facing:'down'},base=render(avatar,options),tinted=render({...avatar,shirtColor:0,pantsColor:3},options);
  assert.notDeepEqual(tinted,base);for(let y=0;y<50;y++)for(let x=0;x<96;x++){const n=(y*96+x)*4;assert.deepEqual([...tinted.slice(n,n+4)],[...base.slice(n,n+4)],'a wardrobe edit changes the face');}
  assert.equal(bounds(base).bottom,bounds(tinted).bottom);
 }
});

test('selected long hair keeps its added strands when the character stops running',()=>{
 for(const gender of [0,1]){
  const avatar={...defaultAvatar,gender,hairStyle:6,hairColor:4},options={facing:'down'},idle=render(avatar,options),run=render(avatar,{...options,walking:true,running:true}),natural=render({...avatar,hairStyle:0},{...options,walking:true,running:true});
  if(sourceActorFrame(avatar,options).id.startsWith('canonical-idle-')){
   for(const state of[options,{...options,walking:true,running:true}]){
    const selected=render(avatar,state),short=render({...avatar,hairStyle:0},state);let strands=0,purple=0;
    for(let y=0;y<80;y++)for(let x=0;x<96;x++){const n=(y*96+x)*4;if(selected[n+3]&&selected.slice(n,n+4).some((v,i)=>v!==short[n+i])){strands++;if(selected[n+2]>selected[n]&&selected[n]>selected[n+1])purple++;}}
    assert.ok(strands>20,'each native pose keeps a visibly selected long hairstyle');assert.ok(purple>20,'the selected hairstyle retains its chosen purple material');assert.equal(bounds(selected).bottom,bounds(short).bottom,'hair never moves the foot anchor');
   }
   continue;
  }
  let changed=0;for(let y=0;y<(gender===1?76:69);y++)for(let x=0;x<96;x++){const n=(y*96+x)*4;if(run[n+3]&&run.slice(n,n+4).some((c,i)=>c!==natural[n+i])){changed++;assert.deepEqual([...idle.slice(n,n+4)],[...run.slice(n,n+4)],'stopping removes part of the selected hairstyle');}}
  assert.ok(changed>20,'the selected long hair is visibly different from the natural hair');
 }
});
