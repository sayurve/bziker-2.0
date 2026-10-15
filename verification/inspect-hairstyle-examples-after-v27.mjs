import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loadSourceActor,drawSourceAvatarCanvas,sourceActorFrame} from '../game/web/source-actors.js';
import {parts,defaultAvatar} from '../game/web/avatar.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const root=new URL('../game/',import.meta.url),out=new URL('./hairstyle-after-v27/',import.meta.url);
const load=p=>loadImage(fileURLToPath(new URL(p.replace(/^\//,''),root)));
for(const g of ['male','female'])await loadSourceActor('human-'+g,{createCanvas,loadImage:load});
// Expose private mask functions in an in-memory diagnostic module only.
let code=await readFile(new URL('web/actor-sprite.js',root),'utf8');
code=code.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${new URL(p,new URL('web/actor-sprite.js',root)).href}'`);
const masks=await import('data:text/javascript;base64,'+Buffer.from(code+'\nexport {sourceHairMaterial};').toString('base64'));
const render=(avatar,opt)=>{const canvas=createCanvas(96,128),c=canvas.getContext('2d');if(!drawSourceAvatarCanvas(c,avatar,parts,0,0,{scale:2,...opt}))throw Error('missing actor');return {canvas,pixels:c.getImageData(0,0,96,128).data};};
const specs=[{gender:0,state:'idle',facing:'down',phase:0,style:1},{gender:0,state:'run',facing:'right',phase:0,style:2},
 {gender:0,state:'run',facing:'up',phase:0,style:4},{gender:1,state:'run',facing:'right',phase:0,style:1},
 {gender:1,state:'run',facing:'left',phase:2,style:6},{gender:1,state:'walk',facing:'right',phase:1,style:0}];
const sheet=createCanvas(1050,1380),c=sheet.getContext('2d');c.fillStyle='#eef1ee';c.fillRect(0,0,sheet.width,sheet.height);c.imageSmoothingEnabled=false;
c.fillStyle='#15202a';c.font='15px sans-serif';for(const [i,label]of ['native short brown','selected brown','selected white','red = native pixels now ALPHA0'].entries())c.fillText(label,225+i*205,20);
const residual=[];
for(const [i,s]of specs.entries()){
 const options={facing:s.facing,walking:s.state!=='idle',running:s.state==='run',walkFrame:s.phase*2},a={...defaultAvatar,gender:s.gender,hairStyle:s.style};
 const baseline=render({...defaultAvatar,gender:s.gender},options),brown=render(a,options),white=render({...a,hairColor:6},options);
 for(let j=0;j<3;j++){
  const x=225+j*205,y=40+i*220;for(let yy=0;yy<180;yy+=12)for(let xx=0;xx<192;xx+=12){c.fillStyle=(xx/12+yy/12)%2?'#d5ddda':'#edf1ee';c.fillRect(x+xx,y+yy,12,12);}
  c.drawImage([baseline,brown,white][j].canvas,0,0,96,90,x,y,192,180);
 }
 const mask=createCanvas(96,90),m=mask.getContext('2d');m.drawImage(brown.canvas,0,0);m.fillStyle='#ed2340';
 for(let y=0;y<90;y++)for(let x=0;x<96;x++){const n=(y*96+x)*4;if(baseline.pixels[n+3]&&!brown.pixels[n+3])m.fillRect(x,y,1,1);}
 c.drawImage(mask,0,0,96,90,225+3*205,40+i*220,192,180);
 c.fillStyle='#15202a';c.fillText(`${s.gender?'female':'male'} ${s.state}`,8,80+i*220);c.fillText(`${s.facing} frame${s.phase} style${s.style}`,8,105+i*220);
 if(s.style===0){
  const frame=sourceActorFrame(a,options),r=frame.rect.detail,native=createCanvas(r.w,r.h).getContext('2d');native.drawImage(await load(r.path),r.x,r.y,r.w,r.h,0,0,r.w,r.h);const rgba=native.getImageData(0,0,r.w,r.h).data;
  const grid=Array.from({length:r.w*r.h},(_,n)=>rgba[n*4+3]>127?'#'+[0,1,2].map(k=>rgba[n*4+k].toString(16).padStart(2,'0')).join(''):null);
  const material=masks.sourceHairMaterial(grid,r.w,r.h,frame.head,s.facing);
  for(let y=frame.head.top*2;y<(frame.head.bottom+1)*2;y++)for(let x=frame.head.left*2;x<(frame.head.right+1)*2;x++){
   const n=(y*96+x)*4,b=baseline.pixels,w=white.pixels;
   if(b[n+3]&&b[n]>b[n+1]*1.15&&b[n+1]>b[n+2]*1.06&&b[n]-b[n+1]<75&&b[n]>70&&[0,1,2,3].every(k=>b[n+k]===w[n+k]))residual.push({x,y,rgb:[b[n],b[n+1],b[n+2]],materialFace:material.face[y*96+x],materialHair:material.hair[y*96+x]});
  }
 }
}
await writeFile(new URL('examples.png',out),sheet.toBuffer('image/png'));
await writeFile(new URL('white-residual-female-right-walk1.json',out),JSON.stringify({case:specs.at(-1),diagnostic:'Brown pixels left unchanged by white hair colour; mask classification shown, anatomical interpretation requires the image.',pixels:residual},null,2)+'\n');
console.log(JSON.stringify({examples:specs.length,residualBrownPixels:residual.length,samples:residual.slice(0,10)}));
