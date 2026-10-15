import{readFile,writeFile,mkdir}from'node:fs/promises';import{createHash}from'node:crypto';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';
import{parts,defaultAvatar}from'../game/web/avatar.js';
const{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),root=new URL('../',import.meta.url),out=new URL('./canonical-hand-runtime-v30/',import.meta.url);await mkdir(out,{recursive:true});
const files=['game/web/source-actors.js','game/web/actor-sprite.js','game/web/interaction-actors-data.js','game/web/canonical-actors-data.js','game/web/locomotion-actors-data.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await readFile(new URL(p,root))).digest('hex')])));const before=await hashes();
async function exposed(p,names){let s=await readFile(new URL(p,root),'utf8');s=s.replace(/from '([.]\/[^']+)'/g,(_,q)=>`from '${new URL(q,new URL(p,root)).href}'`);return import('data:text/javascript;base64,'+Buffer.from(s+'\nexport{'+names.join(',')+'};').toString('base64'));}
const S=await exposed('game/web/source-actors.js',['customBitmap']),M=await exposed('game/web/actor-sprite.js',['sourceHairMaterial']);const env={createCanvas,loadImage:p=>loadImage(fileURLToPath(new URL('game/'+p.replace(/^\//,''),root)))};
for(const g of['male','female'])await S.loadSourceActor('human-'+g,env);
const requests=[{family:'hand',pose:0,action:'drink',actionProgress:0},{family:'hand',pose:1,action:'drink',actionProgress:.2},{family:'hand',pose:2,action:'drink',actionProgress:.5},{family:'hand',pose:3,action:'give',actionProgress:.5},...[.1,.3,.5,.9].map((p,n)=>({family:'lowerReach',pose:n,action:'pick-litter',actionProgress:p}))];
const grid=p=>Array.from({length:96*128},(_,n)=>p[n*4+3]?'#'+[...p.slice(n*4,n*4+3)].map(v=>v.toString(16).padStart(2,'0')).join(''):null),pixels=c=>c.getContext('2d').getImageData(0,0,96,128).data;
function bitmap(a,o){const f=S.sourceActorFrame(a,o),b=S.customBitmap(f,a,parts,o);if(!b||b.factor!==2)throw Error('fine runtime missing');return{f,c:b.canvas,p:pixels(b.canvas)};}

const a={...defaultAvatar,gender:1},o={action:'pick-litter',actionProgress:.5,facing:'right'},b=bitmap(a,o),c=bitmap({...a,outfit:6},o);const m=M.sourceHairMaterial(grid(b.p),96,128,b.f.head,'right');console.log('head/pelvis',b.f.head,b.f.pelvis);for(let y=92;y<101;y++){const row=[];for(let x=34;x<43;x++){const n=(y*96+x)*4;row.push({xy:[x,y],source:[...b.p.slice(n,n+4)],coat:[...c.p.slice(n,n+4)],face:m.face[y*96+x]});}console.log(JSON.stringify(row));}
