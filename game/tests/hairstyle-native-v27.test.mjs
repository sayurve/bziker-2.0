import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loadSourceActor,drawSourceAvatarCanvas,sourceActorFrame} from '../web/source-actors.js';
import {parts,defaultAvatar} from '../web/avatar.js';
import {sourceActorsData as D} from '../web/source-actors-data.js';
const originalRun=(gender,facing)=>Object.values(D.actors['human-'+(gender?'female':'male')].actions).find(a=>a.name.includes('Бег')&&a.name.includes({right:'Справа',left:'Слева',up:'Сзади',down:'Спереди'}[facing])).sourceKey;
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const load=path=>loadImage(fileURLToPath(new URL('../'+path.replace(/^\//,''),import.meta.url)));
for(const gender of ['male','female'])await loadSourceActor('human-'+gender,{createCanvas,loadImage:load});
const render=(avatar,options)=>{const c=createCanvas(96,128).getContext('2d');assert.equal(drawSourceAvatarCanvas(c,avatar,parts,0,0,{scale:2,...options}),true);return c.getImageData(0,0,96,128).data;};
const pixel=(p,x,y)=>[...p.slice((y*96+x)*4,(y*96+x)*4+4)];

test('changing hair never deletes the genuine fine skin hidden by a brown coarse sample',()=>{
 for(const sample of [{gender:1,facing:'right',walking:true,running:true,style:1,x:75,y:40,rgb:[248,154,104,255]}]){
  if(sample.walking){sample.animationId=originalRun(sample.gender,sample.facing);sample.sourceTime=0;}
  const base=render({...defaultAvatar,gender:sample.gender},sample);
  assert.deepEqual(pixel(base,sample.x,sample.y),sample.rgb,'regression must exercise the actual native flesh pixel');
  for(const hairColor of [0,4,6]){
   const edited=render({...defaultAvatar,gender:sample.gender,hairStyle:sample.style,hairColor},sample);
   assert.deepEqual(pixel(edited,sample.x,sample.y),sample.rgb,`${sample.gender}/${sample.facing}/colour${hairColor} wipes the native face`);
  }
 }
});

test('native eyes retain every bright eye pixel through all 12 hairstyles and motion directions',()=>{
 for(const gender of [0,1])for(const facing of ['down','right','left'])for(const running of [false,true])for(let phase=0;phase<4;phase++){
  const options={facing,walking:true,running,walkFrame:phase*2};
  for(let hairStyle=0;hairStyle<12;hairStyle++){
   // H7 on each model deliberately uses the exact stationary C head, while the other
   // styles retain the original L head for this phase. Compare its real donor.
   const donor=hairStyle===7?{facing}:options,base=render({...defaultAvatar,gender},donor),head=sourceActorFrame({...defaultAvatar,gender},donor).head;
   // The former72px scan also called the bright C T-shirt an eye. Keep every
   // bright eye pixel above the authored neck, using the selected real head.
   const eyes=[];for(let y=30;y<Math.min(72,Math.ceil((head.neckAnchor?.[1]??36)*2));y++)for(let x=14;x<88;x++){const p=pixel(base,x,y);if(p[3]&&Math.min(...p.slice(0,3))>200&&Math.max(...p.slice(0,3))-Math.min(...p.slice(0,3))<30)eyes.push([x,y,p]);}
   assert.ok(eyes.length,`${gender}/${facing}/${running}/${phase}/style${hairStyle} must contain real visible eye whites`);
   const edited=render({...defaultAvatar,gender,hairStyle,hairColor:6},options);
   for(const [x,y,p]of eyes)assert.deepEqual(pixel(edited,x,y),p,`${gender}/${facing}/${running}/${phase}/style${hairStyle} changes eye ${x},${y}`);
  }
 }
});

test('native rear and side ear skin survives every hairstyle without turning into white hair',()=>{
 const samples=[{gender:0,facing:'up',x:26,y:45,rgb:[255,177,131,255]},
 {gender:0,facing:'up',x:70,y:45,rgb:[244,160,115,255]},
 {gender:1,facing:'right',x:55,y:54,rgb:[248,140,93,255]},
 {gender:1,facing:'left',x:42,y:53,rgb:[243,163,133,255]}];
 for(const s of samples){const options={facing:s.facing,walking:true,running:true,walkFrame:0,animationId:originalRun(s.gender,s.facing),sourceTime:0};
  assert.deepEqual(pixel(render({...defaultAvatar,gender:s.gender},options),s.x,s.y),s.rgb,'measured native ear fixture');
  for(let hairStyle=0;hairStyle<12;hairStyle++)assert.deepEqual(pixel(render({...defaultAvatar,gender:s.gender,hairStyle,hairColor:6},options),s.x,s.y),s.rgb,`${s.gender}/${s.facing}/style${hairStyle}: native ear`);
 }
});

test('short rear styles preserve the genuine native lower nape until a reviewed hidden-neck layer exists',()=>{
 for(const gender of [0,1])for(const state of ['idle','walk','run'])for(let phase=0;phase<4;phase++){
  const options={facing:'up',walking:state!=='idle',running:state==='run',walkFrame:phase*2},base=render({...defaultAvatar,gender},options),head=sourceActorFrame({...defaultAvatar,gender},options).head;
  const neck=head.neckAnchor||[(head.left+head.right)/2,head.bottom+2],from=Math.floor((neck[1]-3)*2),to=Math.min(128,Math.ceil((neck[1]+6)*2));
  for(let hairStyle=1;hairStyle<12;hairStyle++){
   const actual=render({...defaultAvatar,gender,hairStyle,hairColor:6},options);
   for(let y=from;y<to;y++)for(let x=Math.floor(neck[0]*2-8);x<neck[0]*2+8;x++)if(pixel(base,x,y)[3])assert.equal(pixel(actual,x,y)[3],255,`${gender}/${state}/${phase}/style${hairStyle}: detached head at ${x},${y}`);
  }
 }
});

test('all native hairstyle phases keep a transparent safety edge without resizing the head or actor',()=>{
 for(const gender of[0,1])for(const facing of['down','right','up','left'])for(const state of['idle','walk','run'])for(let phase=0;phase<4;phase++)for(let hairStyle=0;hairStyle<12;hairStyle++){
  const p=render({...defaultAvatar,gender,hairStyle},{facing,walking:state!=='idle',running:state==='run',walkFrame:phase*2});
  for(let x=0;x<96;x++)assert.equal(pixel(p,x,0)[3],0,`${gender}/${facing}/${state}/${phase}/style${hairStyle}: crown clips at ${x},0`);
  for(let y=0;y<128;y++)for(const x of[0,95])assert.equal(pixel(p,x,y)[3],0,`${gender}/${facing}/${state}/${phase}/style${hairStyle}: hair clips at ${x},${y}`);
 }
});

test('all 12 hairstyles preserve every opaque native authored face pixel on current approved idle and running heads',()=>{
 const inside=(p,x,y)=>{let b=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],c=p[j];if((a[1]>y)!==(c[1]>y)&&x<(c[0]-a[0])*(y-a[1])/(c[1]-a[1])+a[0])b=!b;}return b;};
 let inspected=0;
 for(const gender of[0,1])for(const facing of['down','right','up','left'])for(const state of['idle','run'])for(let phase=0;phase<(state==='idle'?1:4);phase++){
  const a={...defaultAvatar,gender},o={facing,walking:state==='run',running:state==='run',walkFrame:phase*2};
  for(let hairStyle=0;hairStyle<12;hairStyle++){
   const donor=hairStyle===7?{facing}:o,head=sourceActorFrame(a,donor).head;
   // The expected face is decoded from the actual selected C/L authority,
   // never from hairStyle0 at a different moving head registration.
   if(!head.facePolygon?.length)continue;
   const base=render(a,donor),points=[];for(let y=0;y<96;y++)for(let x=0;x<96;x++){const n=(y*96+x)*4;if(base[n+3]&&inside(head.facePolygon,x/2,y/2)){
    const [r,g,b]=base.slice(n,n+3),scalp=head.scalpPolygon?.length>=3&&inside(head.scalpPolygon,(x+.5)/2,(y+.5)/2),warm=r>g*1.15&&g>b*1.06,nativeFlesh=r>=210&&r-g>55&&g-b>15;
    if(!(scalp&&warm&&!nativeFlesh))points.push(n);
   }}
   assert.ok(points.length>40,`${gender}/${facing}/${state}/${phase}/style${hairStyle}: observe a real authored face`);
   for(const hairColor of[0,6]){const actual=render({...a,hairStyle,hairColor},o);for(const n of points){inspected++;assert.deepEqual([...actual.slice(n,n+4)],[...base.slice(n,n+4)],`${gender}/${facing}/${state}/${phase}/style${hairStyle}/colour${hairColor}: authored face pixel ${n/4%96},${Math.floor(n/4/96)}`);}}
  }
 }
 assert.ok(inspected>100000,'compare actual native face colours and alpha, not resource declarations');
});
