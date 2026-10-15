import test from 'node:test';import assert from 'node:assert/strict';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';
import{loadSourceActor,drawSourceAvatarCanvas,sourceActorFrame}from'../web/source-actors.js';import{parts,defaultAvatar}from'../web/avatar.js';
const{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');for(const g of['male','female'])await loadSourceActor('human-'+g,{createCanvas,loadImage:p=>loadImage(fileURLToPath(new URL('../'+p.replace(/^\//,''),import.meta.url)))});
const render=(a,o)=>{const x=createCanvas(96,128).getContext('2d');assert.equal(drawSourceAvatarCanvas(x,a,parts,0,0,{scale:2,...o}),true);return x.getImageData(0,0,96,128).data;},px=(p,x,y)=>[...p.slice((y*96+x)*4,(y*96+x)*4+4)];
function detached(actual,base){const todo=new Set(Array.from({length:96*128},(_,n)=>n).filter(n=>actual[n*4+3])),out=[];while(todo.size){const n=todo.values().next().value,q=[n],c=[];todo.delete(n);let touches=false;while(q.length){const k=q.pop(),x=k%96;c.push(k);touches||=!!base[k*4+3];for(const v of[x>0?k-1:-1,x<95?k+1:-1,k-96,k+96])if(todo.delete(v))q.push(v);}if(!touches)out.push(c);}return out;}
test('rear glasses have no opaque lens or bridge stripe across the native back of the head',()=>{
 for(const gender of[0,1])for(const walking of[false,true]){const o={facing:'up',walking,running:walking,walkFrame:0},a={...defaultAvatar,gender},h=sourceActorFrame(a,o).head,b=render(a,o),p=render({...a,accessory:1},o);for(let y=h.top*2;y<=h.bottom*2;y++)for(let x=(h.left+6)*2;x<=(h.right-6)*2;x++)assert.deepEqual(px(p,x,y),px(b,x,y),`${gender}: backside lens/bridge at ${x},${y}`);}
});
test('side glasses surround the authored eye line instead of being only a portrait-row stripe',()=>{
 for(const gender of[0,1])for(const facing of['right','left'])for(let phase=0;phase<4;phase++){const a={...defaultAvatar,gender},o={facing,walking:true,running:true,walkFrame:phase*2},h=sourceActorFrame(a,o).head;assert.ok(h.eyeAnchor&&Number.isFinite(h.eyeLine),'approved head has actual landmarks');const p=render({...a,accessory:1},o),x=Math.round(h.eyeAnchor[0]*2),y=Math.round(h.eyeLine*2+6);assert.deepEqual(px(p,x,y),[37,37,45,255],`${gender}/${facing}/${phase}: missing lower native lens rim at ${x},${y}`);}
});
test('beast costume ears attach to the actual crown in both genders and every direction',()=>{
 for(const gender of[0,1])for(const facing of['down','right','up','left']){const a={...defaultAvatar,gender},o={facing,walking:true,running:true,walkFrame:0},h=sourceActorFrame(a,o).head,b=render(a,o),p=render({...a,outfit:5},o);const free=detached(p,b).filter(c=>c.some(n=>Math.floor(n/96)<h.bottom*2));assert.deepEqual(free.map(c=>[c.length,Math.min(...c.map(n=>n%96)),Math.min(...c.map(n=>Math.floor(n/96)))]),[],`${gender}/${facing}: floating costume fragments`);let added=0;for(let y=0;y<h.top*2+12;y++)for(let x=0;x<96;x++){const n=(y*96+x)*4;if(p[n+3]&&!b[n+3])added++;}assert.ok(added>=8,`${gender}/${facing}: costume must retain two actual attached ear silhouettes`);}
});
test('native coat does not introduce disconnected alpha islands around the moving body',()=>{
 for(const gender of[0,1])for(const facing of['down','right','up','left'])for(let phase=0;phase<4;phase++){const a={...defaultAvatar,gender},o={facing,walking:true,running:true,walkFrame:phase*2},b=render(a,o),p=render({...a,outfit:3},o);assert.equal(detached(p,b).length,0,`${gender}/${facing}/${phase}: native coat grows floating copied strips`);}
});
test('a front chest badge is not drawn through hair on the back',()=>{for(const gender of[0,1]){const a={...defaultAvatar,gender},o={facing:'up',walking:true,running:true,walkFrame:0};assert.deepEqual(render({...a,accessory:2},o),render(a,o));}});

test('current fine jaw boundary and lower body outline remain native when only hair colour changes',()=>{
 for(const s of[{facing:'down',walkFrame:0,x:32,y:56,rgba:[235,144,101,255]},{facing:'right',walkFrame:6,x:61,y:69,rgba:[5,2,1,255]}]){
  const o={...s,walking:true,running:true},base=render(defaultAvatar,o);assert.deepEqual(px(base,s.x,s.y),s.rgba,'observe current genuine native pixel');
  assert.deepEqual(px(render({...defaultAvatar,hairColor:6},o),s.x,s.y),s.rgba,'hair colour cannot recolour skin or the body outline');
 }
});
test('raincoat stripe cannot overwrite the actual fine female mouth/face through a coarse garment cell',()=>{
 const a={...defaultAvatar,gender:1},o={facing:'down',walking:true,running:true,walkFrame:0},base=render(a,o);assert.deepEqual(px(base,48,58),[253,181,133,255],'observe current genuine fine flesh after female donor change');assert.deepEqual(px(render({...a,outfit:6},o),48,58),px(base,48,58));
});

test('hair colour preserves the complete current body and hands below each authored neck',()=>{
 for(const gender of[0,1])for(const facing of['down','right','up','left'])for(let phase=0;phase<4;phase++){
  const a={...defaultAvatar,gender},o={facing,walking:true,running:true,walkFrame:phase*2},head=sourceActorFrame(a,o).head;assert.ok(head.neckAnchor,'current approved frame has authored neck');const b=render(a,o),p=render({...a,hairColor:6},o);
  for(let y=Math.ceil((head.neckAnchor[1]+2)*2);y<128;y++)for(let x=0;x<96;x++)assert.deepEqual(px(p,x,y),px(b,x,y),`${gender}/${facing}/${phase}: hair colour reaches body/hand at ${x},${y}`);
 }
});
