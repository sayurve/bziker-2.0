import{readFile,writeFile,mkdir}from'node:fs/promises';import{createHash}from'node:crypto';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';
import{parts,defaultAvatar}from'../game/web/avatar.js';
const{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),root=new URL('../',import.meta.url),out=new URL('./h7-focused-v30/',import.meta.url);await mkdir(out,{recursive:true});
const files=['game/web/source-actors.js','game/web/actor-sprite.js','game/web/interaction-actors-data.js','game/web/canonical-actors-data.js','game/web/locomotion-actors-data.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await readFile(new URL(p,root))).digest('hex')])));const before=await hashes();
async function exposed(p,names){let s=await readFile(new URL(p,root),'utf8');s=s.replace(/from '([.]\/[^']+)'/g,(_,q)=>`from '${new URL(q,new URL(p,root)).href}'`);return import('data:text/javascript;base64,'+Buffer.from(s+'\nexport{'+names.join(',')+'};').toString('base64'));}
const S=await exposed('game/web/source-actors.js',['customBitmap','sourcePixels']),M=await exposed('game/web/actor-sprite.js',['sourceHairMaterial','nativeHeadAnatomy','applyNativeHair']);const env={createCanvas,loadImage:p=>loadImage(fileURLToPath(new URL('game/'+p.replace(/^\//,''),root)))};
for(const g of['male','female'])await S.loadSourceActor('human-'+g,env);

const a={...defaultAvatar,gender:0,hairStyle:7,hairColor:6,skin:3,shirtColor:8,outfit:0,headwear:0},f=S.sourceActorFrame(a,{facing:'left'}),r=S.sourcePixels(f,true),g=[...r.grid],materials=M.sourceHairMaterial(g,96,128,f.head,f.facing),an=M.nativeHeadAnatomy(g,96,128,f.head,f.facing),selected=M.applyNativeHair(g,r.grid,96,128,a,f.head,f.facing,materials);
for(const[x,y]of[[46,15],[28,18],[28,19],[67,41],[64,49]]){const n=y*96+x;console.log({x,y,raw:r.grid[n],afterHair:g[n],selected:selected[n],hair:materials.hair[n],face:materials.face[n],authFace:an.face[n],scalp:an.scalp[n]});}

const c=createCanvas(96,128);S.drawSourceAvatarCanvas(c.getContext('2d'),a,parts,0,0,{facing:'left',scale:2});
const z=createCanvas(576,768),q=z.getContext('2d');q.fillStyle='#c5cdd0';q.fillRect(0,0,576,768);q.imageSmoothingEnabled=false;q.drawImage(c,0,0,576,768);await writeFile(new URL('h7-left-islands-after.png',new URL('./hair-tint-v30/',import.meta.url)),z.toBuffer('image/png'));

const pair=createCanvas(1152,800),pc=pair.getContext('2d');pc.fillStyle='#c5cdd0';pc.fillRect(0,0,1152,800);pc.fillStyle='#17252c';pc.font='18px sans-serif';pc.fillText('BEFORE: 5 isolated native scalp pixels',8,23);pc.fillText('AFTER: same H7 / face / body',584,23);pc.drawImage(await loadImage(fileURLToPath(new URL('./hair-tint-v30/h7-left-islands-before.png',import.meta.url))),0,32);pc.drawImage(z,576,32);await writeFile(new URL('./hair-tint-v30/h7-left-islands-before-after.png',import.meta.url),pair.toBuffer('image/png'));
