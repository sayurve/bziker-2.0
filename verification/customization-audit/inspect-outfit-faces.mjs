/** QA-only pixel diagnostic; no changes to production assets. */
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
import {defaultAvatar,drawAvatarCanvas} from '../../game/web/avatar.js';
import {loadSourceActor,sourceActorFrame} from '../../game/web/source-actors.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const label=process.argv[2]||'interop-final-freeze-v27';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Expected simple interop result directory name');
const root=new URL('../../',import.meta.url),game=new URL('game/',root),out=new URL(label+'/',import.meta.url),cache=new Map();
const load=async p=>{if(!cache.has(p))cache.set(p,await loadImage(fileURLToPath(new URL(p.replace(/^\//,''),game))));return cache.get(p)};
for(const id of ['human-male','human-female'])await loadSourceActor(id,{createCanvas,loadImage:load});
const reference=process.argv[3]||label;
if(!/^[a-z0-9-]+$/.test(reference))throw Error('Expected simple reference directory name');
const candidates=JSON.parse(await readFile(new URL(reference+'/attention-cases.json',import.meta.url),'utf8')).faceCandidates;
function poly(p,x,y){let z=false;for(let i=0,j=p.length-1;i<p.length;j=i++){let a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])z=!z}return z}
function render(g,o,f,ph){let c=createCanvas(96,128),cx=c.getContext('2d'),opts={facing:f,walking:true,running:true,walkFrame:ph*2},a={...defaultAvatar,gender:g,outfit:o};drawAvatarCanvas(cx,a,0,0,{...opts,scale:2});return {c,p:cx.getImageData(0,0,96,128).data,h:sourceActorFrame(a,opts).head}}
let result=[],sheet=createCanvas(900,6*240),cx=sheet.getContext('2d'),row=0;cx.fillStyle='#d9d6cb';cx.fillRect(0,0,sheet.width,sheet.height);cx.imageSmoothingEnabled=false;
for(let r of candidates){let a=render(r.gender,r.outfit,r.facing,r.phase),b=render(r.gender,0,r.facing,r.phase),points=[];
for(let y=0;y<128;y++)for(let x=0;x<96;x++){let i=(y*96+x)*4;if(b.p[i+3]&&poly(b.h.facePolygon,x/2,y/2)&&[0,1,2,3].some(k=>a.p[i+k]!==b.p[i+k]))points.push({x,y,before:[...b.p.slice(i,i+4)],after:[...a.p.slice(i,i+4)],insideHeadBox:x/2>=b.h.left&&x/2<=b.h.right&&y/2>=b.h.top&&y/2<=b.h.bottom});}
result.push({gender:r.gender,outfit:r.outfit,facing:r.facing,phase:r.phase,headBottom:b.h.bottom,points});
if(r.outfit===6&&r.phase===0&&row<6){let y=row*240;cx.fillStyle='#202020';cx.font='16px sans-serif';cx.fillText(`g${r.gender} ${r.facing} outfit0 | outfit6 | changed pixels`,10,y+22);cx.drawImage(b.c,0,0,96,80,10,y+30,240,200);cx.drawImage(a.c,0,0,96,80,270,y+30,240,200);cx.drawImage(a.c,0,0,96,80,530,y+30,240,200);cx.fillStyle='#ff00ff';for(let p of points)cx.fillRect(530+p.x*2.5,y+30+p.y*2.5,2.5,2.5);row++;}}
await writeFile(new URL('outfit-face-pixel-diagnostic.json',out),JSON.stringify(result,null,2));await writeFile(new URL('outfit-face-attention-zoom.png',out),sheet.toBuffer('image/png'));
let pts=result.flatMap(r=>r.points),inside=pts.filter(p=>p.insideHeadBox);console.log(JSON.stringify({cases:result.length,points:pts.length,insideHeadBox:inside.length,exampleInside:inside.slice(0,6),rows:row}));
