import test from 'node:test';import assert from 'node:assert/strict';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';
import{loadSourceActor,loadSourceSequence,drawSourceAvatarCanvas}from'../web/source-actors.js';import{parts,defaultAvatar}from'../web/avatar.js';import{sourceActorsData as D}from'../web/source-actors-data.js';import{customizeSourceDetailGrid}from'../web/actor-sprite.js';
const{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'),env={createCanvas,loadImage:p=>loadImage(fileURLToPath(new URL('../'+p.replace(/^\//,''),import.meta.url)))};
for(const g of['male','female'])await loadSourceActor('human-'+g,env);for(const key of['female-carry-right','female-talk-front','male-pet-back','female-mug-standing-left'])await loadSourceSequence(key,env);
const render=(a,o)=>{const x=createCanvas(96,128).getContext('2d');assert.equal(drawSourceAvatarCanvas(x,{...defaultAvatar,...a},parts,0,0,{scale:2,sourceTime:.25,actionProgress:.5,...o}),true);return x.getImageData(0,0,96,128).data;},px=(p,x,y)=>[...p.slice((y*96+x)*4,(y*96+x)*4+4)];
// Historical source probes deliberately bypass newer canonical composites.
// They exercise the production fine-mask renderer against the original PNGs;
// canonical phone / current metadata integration remains covered separately.
const originals=new Map();
for(const[key,phase]of[['female-carry-right',2],['female-talk-front',2],['male-pet-back',2],['female-mug-standing-left',4],['male-pickup-right',2],['male-pickup-left',2],['male-pickup-front',2]]){
 const sequence=D.daily[key]||D.gestures[key],frame=sequence.frames[phase],r=frame.detail;
 const read=async(path,rect,w,h)=>{const x=createCanvas(w,h).getContext('2d');x.drawImage(await env.loadImage(path),rect.x,rect.y,rect.w,rect.h,0,0,w,h);const p=x.getImageData(0,0,w,h).data;return Array.from({length:w*h},(_,n)=>p[n*4+3]?'#'+[...p.slice(n*4,n*4+3)].map(v=>v.toString(16).padStart(2,'0')).join(''):null);};
 originals.set(key,{fine:await read(r.path,r,96,128),coarse:await read(sequence.images[frame.page||0].path,frame,48,64),head:frame.head});
}
const renderOriginal=(a,o)=>{const f=originals.get(o.animationId),g=customizeSourceDetailGrid(f.fine,96,128,f.coarse,{...defaultAvatar,...a},parts,{facing:o.facing,head:f.head}),p=new Uint8ClampedArray(96*128*4);for(let n=0;n<g.length;n++)if(g[n]){p[n*4]=parseInt(g[n].slice(1,3),16);p[n*4+1]=parseInt(g[n].slice(3,5),16);p[n*4+2]=parseInt(g[n].slice(5,7),16);p[n*4+3]=255;}return p;};
test('legacy carry with black eyes retains genuine fine face flesh for every selected hairstyle',()=>{
 const o={animationId:'female-carry-right',facing:'right'},base=renderOriginal({gender:1},o);assert.deepEqual(px(base,64,66),[222,128,88,255],'observe actual original flesh, not a synthetic replacement');
 for(let hairStyle=1;hairStyle<12;hairStyle++)for(const hairColor of[0,6])assert.deepEqual(px(renderOriginal({gender:1,hairStyle,hairColor},o),64,66),px(base,64,66),`style${hairStyle}/colour${hairColor}: closed/black eyes must not remove the face`);
});
test('selected hair retains exact original raised-hand flesh',()=>{
 const o={animationId:'female-talk-front',facing:'down'},base=renderOriginal({gender:1},o);
 for(let hairStyle=1;hairStyle<12;hairStyle++){
  const actual=renderOriginal({gender:1,hairStyle,hairColor:6},o);
  for(const[x,y,rgba]of[[42,67,[239,161,106,255]],[43,68,[242,153,102,255]],[44,70,[242,159,105,255]]]){assert.deepEqual(px(base,x,y),rgba,'literal actual raised-hand flesh');assert.deepEqual(px(actual,x,y),rgba,`style${hairStyle}: native raised-hand ${x},${y}`);}
 }
});
test('long white strands survive every coarse garment edit on the original rear pet gesture',()=>{
 const o={animationId:'male-pet-back',facing:'up'},a={gender:0,hairStyle:6,hairColor:6},own=renderOriginal(a,o);assert.deepEqual(px(own,27,68),[255,255,255,255],'observe actual selected long strand');for(const config of[{shirtStyle:0},{shirtStyle:1},{shirtStyle:3},...[1,2,3,4,5,6].map(outfit=>({outfit}))])assert.deepEqual(px(renderOriginal({...a,...config},o),27,68),px(own,27,68),JSON.stringify(config));
});
test('selected long hair keeps the native opaque neck boundary on the canonical standing phone',()=>{
 const o={phoneOpen:true,facing:'right'},base=render({gender:1},o);assert.equal(px(base,50,67)[3],255,'observe actual opaque native neck boundary');assert.deepEqual(px(render({gender:1,hairStyle:6,hairColor:6},o),50,67),px(base,50,67));
});

test('legacy left drinking retains genuine ear and face even when a prop supplies a white-eye candidate',()=>{
 const o={animationId:'female-mug-standing-left',facing:'left'},base=renderOriginal({gender:1},o);assert.deepEqual(px(base,54,40),[236,160,114,255],'observe actual source ear/face');
 for(let hairStyle=1;hairStyle<12;hairStyle++)for(const hairColor of[0,6])assert.deepEqual(px(renderOriginal({gender:1,hairStyle,hairColor},o),54,40),px(base,54,40),`style${hairStyle}/colour${hairColor}: mug must not replace the face authority`);
});

test('bent pickup keeps actual gray sleeve outside the loose head search box',()=>{
 const o={animationId:'male-pickup-right',facing:'right'},base=renderOriginal({gender:0},o);assert.deepEqual(px(base,36,83),[65,59,60,255],'observe actual original jacket texture');
 for(const hairStyle of[2,3,4])assert.deepEqual(px(renderOriginal({gender:0,hairStyle,hairColor:6},o),36,83),px(base,36,83),`style${hairStyle}: a source sleeve is not removable scalp`);
 for(let hairStyle=1;hairStyle<12;hairStyle++)assert.equal(px(renderOriginal({gender:0,hairStyle,hairColor:6},o),36,83)[3],255,'hair may cover a sleeve, never erase its alpha');
});

test('bent pickup also retains real gray sleeve inside imprecise source head bounds',()=>{
 const o={animationId:'male-pickup-left',facing:'left'},base=renderOriginal({gender:0},o);assert.deepEqual(px(base,57,83),[65,61,65,255],'observe real jacket texture inside head bbox');for(const hairStyle of[2,3,4])assert.deepEqual(px(renderOriginal({gender:0,hairStyle,hairColor:6},o),57,83),px(base,57,83),`style${hairStyle}: coarse bounds cannot classify cloth as hair`);
 for(let hairStyle=1;hairStyle<12;hairStyle++)assert.equal(px(renderOriginal({gender:0,hairStyle,hairColor:6},o),57,83)[3],255,'hair may cover a sleeve, never erase its alpha');
});

test('hair tint preserves actual dark pickup hands even when flesh touches the source head',()=>{
 const o={animationId:'male-pickup-front',facing:'down'},base=renderOriginal({gender:0},o);
 for(const[x,y,rgba]of[[38,93,[120,81,61,255]],[39,93,[190,122,81,255]],[58,93,[201,144,107,255]]]){assert.deepEqual(px(base,x,y),rgba,'observe actual source hand shadow');for(const hairStyle of[0,6])assert.deepEqual(px(renderOriginal({gender:0,hairStyle,hairColor:6},o),x,y),rgba,'source hands are not hair material');}
});

test('wardrobe cannot overwrite retained natural scalp in a bent source pose',()=>{
 const o={animationId:'male-pickup-front',facing:'down'},base=renderOriginal({gender:0},o);assert.deepEqual(px(base,32,70),[71,40,32,255],'observe actual original scalp');
 for(const hairStyle of[0,6])for(const hairColor of[0,6]){const own=renderOriginal({gender:0,hairStyle,hairColor},o),dressed=renderOriginal({gender:0,hairStyle,hairColor,shirtStyle:0},o);assert.deepEqual(px(dressed,32,70),px(own,32,70),'source scalp and independent strands both precede wardrobe');}
});
