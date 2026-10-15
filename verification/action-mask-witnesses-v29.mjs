import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';
import{parts,defaultAvatar}from'../game/web/avatar.js';import{sourceActorsData as D}from'../game/web/source-actors-data.js';
const web=new URL('../game/web/',import.meta.url),version=process.argv[2]||'after';
let actorModule=new URL('source-actors.js',web).href;
if(version==='before'){
 const absolute=code=>code.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${new URL(p,web).href}'`),data=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
 const old=data(absolute(await readFile(new URL('action-customization-v29/actor-sprite-before.js',import.meta.url),'utf8')));
 actorModule=data(absolute(await readFile(new URL('source-actors.js',web),'utf8')).replace(new URL('actor-sprite.js',web).href,old));
}
const{loadSourceActor,loadSourceSequence,drawSourceAvatarCanvas,sourceActorFrame}=await import(actorModule);
const{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),root=new URL('../game/',import.meta.url),out=new URL('./action-customization-v29/',import.meta.url),load=p=>loadImage(fileURLToPath(new URL(p.replace(/^\//,''),root))),env={createCanvas,loadImage:load};for(const g of['male','female'])await loadSourceActor('human-'+g,env);
const keys=new Map(['daily','gestures','composites','water'].flatMap(k=>Object.entries(D[k]).map(([key,s])=>[s,key]))),render=(a,o)=>{const c=createCanvas(96,128),x=c.getContext('2d');drawSourceAvatarCanvas(x,a,parts,0,0,{scale:2,...o});return{canvas:c,p:x.getImageData(0,0,96,128).data};};
const specs=[{gender:0,facing:'right',action:'pick-litter',hairStyle:4},{gender:1,facing:'left',action:'drink',hairStyle:2},{gender:0,facing:'up',action:'pet',hairStyle:6,shirtStyle:0},{gender:1,facing:'right',action:'carry',hairStyle:2},{gender:1,facing:'down',action:'talk',hairStyle:1},{gender:1,facing:'right',phoneOpen:true,hairStyle:6,shirtStyle:0},{gender:1,facing:'down',action:'inventory',hairStyle:6,outfit:6}];
const sheet=createCanvas(1420,specs.length*300+40),c=sheet.getContext('2d');c.fillStyle='#e4e9e5';c.fillRect(0,0,sheet.width,sheet.height);c.imageSmoothingEnabled=false;c.font='15px sans-serif';c.fillStyle='#18242d';['raw source','actual baseline','hair brown own','hair white own','hair white dressed'].forEach((t,j)=>c.fillText(t,210+j*240,22));const metrics=[];
for(const[i,s]of specs.entries()){
 const a={...defaultAvatar,gender:s.gender},o={facing:s.facing,action:s.action,phoneOpen:s.phoneOpen,actionProgress:.5,sourceTime:.25};const f=sourceActorFrame(a,o),key=keys.get(f.sequence);if(key)await loadSourceSequence(key,env);
 const r=f.rect.detail,raw=createCanvas(96,128),rc=raw.getContext('2d');rc.drawImage(await load(r.path),r.x,r.y,r.w,r.h,0,0,96,128);const rp=rc.getImageData(0,0,96,128).data;
 const base=render(a,o),brown=render({...a,hairStyle:s.hairStyle},o),white=render({...a,hairStyle:s.hairStyle,hairColor:6},o),dressed=render({...a,...s,hairColor:6},o);
 c.fillStyle='#18242d';c.fillText(`${s.gender?'female':'male'} ${s.facing}`,3,65+i*300);c.fillText(`${s.action||'phone'} H${s.hairStyle}`,3,85+i*300);c.fillText(`shirt${s.shirtStyle??2} outfit${s.outfit??0}`,3,105+i*300);
 for(const[j,im]of[raw,base.canvas,brown.canvas,white.canvas,dressed.canvas].entries())c.drawImage(im,210+j*240,40+i*300,192,256);
 const lost=[];for(let y=0;y<128;y++)for(let x=0;x<96;x++){const n=(y*96+x)*4;if(y>(f.head.bottom-1)*2&&y<(f.head.bottom+10)*2&&base.p[n+3]&&!white.p[n+3]&&Math.max(...base.p.slice(n,n+3))-Math.min(...base.p.slice(n,n+3))<22)lost.push({x,y,raw:[...rp.slice(n,n+4)],baseline:[...base.p.slice(n,n+4)],edited:[...white.p.slice(n,n+4)]});}
 metrics.push({spec:s,frame:f.id,phase:f.frameIndex,head:f.head,sourceDetail:r,sourceFileSHA256:createHash('sha256').update(await readFile(new URL(r.path.replace(/^\//,''),root))).digest('hex'),lostNeutralSourcePixels:lost});
}
await writeFile(new URL(`witnesses-${version}.png`,out),sheet.toBuffer('image/png'));await writeFile(new URL(`witnesses-${version}.json`,out),JSON.stringify(metrics,null,2)+'\n');console.log(metrics.map(m=>({spec:m.spec,holes:m.lostNeutralSourcePixels.length,first:m.lostNeutralSourcePixels.slice(0,3)})));
