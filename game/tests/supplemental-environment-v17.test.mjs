import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const S=await import('../web/supplemental-environment.js').catch(()=>({}));
const manifest=JSON.parse(await readFile(new URL('../assets/generated-environment-v17-manifest.json',import.meta.url),'utf8'));
const require=createRequire(process.execPath),{createCanvas,loadImage}=require('@napi-rs/canvas');
const absolute=url=>fileURLToPath(new URL('../'+url.replace(/^\//,''),import.meta.url));
const loader=url=>loadImage(absolute(url));

test('supplemental props use the authored visible bounds and keep physical footprint separate from roofs and jets',()=>{
 assert.equal(typeof S.supplementalEnvironmentLayouts,'function');
 const physical={x:140,y:320,width:120,height:70};
 const map={decor:{environment_props:[{id:'park-f',kind:'fountain',x:200,y:390,width:180,footprint:physical},{id:'park-g',kind:'gazebo',x:500,y:410,width:160},{id:'rail-c',kind:'passenger-coach',x:710,y:200,width:300}]}};
 const snapshot=JSON.stringify(map),layouts=S.supplementalEnvironmentLayouts(map);
 assert.equal(layouts.length,3);assert.equal(JSON.stringify(map),snapshot);
 assert.deepEqual(layouts[0].footprint,physical);assert.notEqual(layouts[0].footprint,physical);
 assert.deepEqual(layouts[0].sourceBounds,manifest.assets.find(a=>a.id==='generated-environment-fountain').contentBounds);
 assert.equal(layouts[0].bounds.x,110);assert.equal(layouts[0].bounds.y+layouts[0].bounds.height,390);assert.equal(layouts[0].depth,390);
 assert.ok(layouts[1].footprint.height<layouts[1].bounds.height/2,'the gazebo roof must not become a collision wall');
 assert.ok(layouts[2].footprint.height<layouts[2].bounds.height);
});

test('rotation preserves the ground anchor and explicit physical rect while invalid map entries cannot select other files',()=>{
 assert.equal(typeof S.supplementalEnvironmentLayouts,'function');
 const footprint={x:75,y:185,width:50,height:15};
 const map={decor:{environment_props:[{id:'train',kind:'passenger-coach',x:100,y:200,width:120,height:40,rotation:Math.PI/2,footprint},{kind:'__proto__',x:0,y:0,width:50},{kind:'gazebo',x:NaN,y:5,width:20},{kind:'fountain',x:5,y:5,width:-1}]}};
 const [r,...rest]=S.supplementalEnvironmentLayouts(map);assert.equal(rest.length,0);
 assert.deepEqual(r.anchor,{x:100,y:200});assert.deepEqual(r.footprint,footprint);
 assert.ok(Math.abs(r.bounds.x-100)<1e-8);assert.ok(Math.abs(r.bounds.y-140)<1e-8);
 assert.ok(Math.abs(r.bounds.width-40)<1e-8);assert.ok(Math.abs(r.bounds.height-120)<1e-8);
 assert.deepEqual(S.supplementalEnvironmentLayouts(null),[]);
});

test('rail layouts cover every finite nonzero strip segment at the requested width and stay on the background layer',()=>{
 assert.equal(typeof S.supplementalEnvironmentLayouts,'function');
 const map={railway_strip:{points:[[10,70],[510,70],[810,170],[810,170],[NaN,2]],width:85}},copy=JSON.stringify(map);
 const rails=S.supplementalEnvironmentLayouts(map);
 assert.equal(rails.length,2);assert.equal(JSON.stringify(map),copy);
 assert.equal(rails[0].kind,'railway-track');assert.equal(rails[0].depth,-1);assert.equal(rails[0].footprint,null);
 assert.equal(rails[0].width,85);assert.equal(rails[0].length,500);assert.ok(rails[0].moduleLength>150);
 assert.deepEqual(rails[0].end,{x:510,y:70});assert.deepEqual(rails[1].anchor,rails[0].end);
 assert.ok(rails[1].rotation>0);assert.ok(rails[1].phase>0,'a straight vertex must not reset the repeat phase');
 const current=S.supplementalEnvironmentLayouts({architecture:{railway_strip:{points:[[1,2],[301,2]],width:90}},railway_strip:map.railway_strip});
 assert.equal(current.length,1);assert.equal(current[0].width,90);assert.deepEqual(current[0].anchor,{x:1,y:2});
});

test('diagonal coaches follow the closest rail tangent without tilting their upright walls',()=>{
 const map={architecture:{railway_strip:{points:[[0,100],[1000,300]],width:90}},decor:{environment_props:[{id:'coach',kind:'passenger-coach',x:500,y:220,width:300,height:90}]}};
 const train=S.supplementalEnvironmentLayouts(map).find(p=>p.kind==='passenger-coach');
 assert.equal(train.rotation,0);assert.equal(train.shearY,.2);assert.deepEqual(train.anchor,{x:500,y:220});
 assert.equal(train.bounds.width,300);assert.equal(train.bounds.height,150);
 assert.equal(train.bounds.y,100);assert.equal(train.bounds.x,350);
 const explicit=S.supplementalEnvironmentLayouts({...map,decor:{environment_props:[{...map.decor.environment_props[0],rotation:.1}]}}).find(p=>p.kind==='passenger-coach');
 assert.equal(explicit.shearY,0,'explicit art orientation must not receive a second transform');
});

test('the independent loader decodes only six individual PNGs, deduplicates parallel preloads and reports unavailable files',async()=>{
 assert.equal(typeof S.preloadSupplementalEnvironment,'function');
 const calls=[];
 const tracked=async url=>{calls.push(url);return loader(url);};
 const results=await Promise.all([S.preloadSupplementalEnvironment(tracked),S.preloadSupplementalEnvironment(tracked)]);
 assert.equal(calls.length,6);assert.deepEqual(new Set(calls.map(p=>p.replace(/^\//,''))),new Set(manifest.assets.map(a=>a.path)));
 assert.ok(calls.every(p=>!/(map|sheet|исходная)/i.test(p)));
 for(const result of results){assert.equal(result.loaded.length,6);assert.equal(result.failed.length,0);}
 const fresh=await import('../web/supplemental-environment.js?unavailable');
 const failed=await fresh.preloadSupplementalEnvironment(()=>Promise.reject(new Error('missing')));
 assert.equal(failed.loaded.length,0);assert.equal(failed.failed.length,6);
 assert.equal(fresh.drawSupplementalEnvironment(createCanvas(50,50).getContext('2d'),fresh.supplementalEnvironmentLayouts({decor:{environment_props:[{kind:'park-shrub',x:25,y:40,width:30}]}})[0]),false);
});

test('canvas uses the exact RGBA source crop and repeated rail bodies have no transparent seams',async()=>{
 assert.equal(typeof S.drawSupplementalEnvironment,'function');await S.preloadSupplementalEnvironment(loader);
 for(const a of manifest.assets.filter(a=>!a.id.endsWith('railway-track'))){
  const {contentBounds:b}=a,kind=a.id.replace('generated-environment-','');
  const layout=S.supplementalEnvironmentLayouts({decor:{environment_props:[{kind,x:b.w/2,y:b.h,width:b.w,height:b.h}]}})[0];
  const actual=createCanvas(b.w,b.h).getContext('2d'),expected=createCanvas(b.w,b.h).getContext('2d');
  assert.equal(S.drawSupplementalEnvironment(actual,layout),true);expected.drawImage(await loader(a.path),b.x,b.y,b.w,b.h,0,0,b.w,b.h);
  assert.deepEqual(actual.getImageData(0,0,b.w,b.h).data,expected.getImageData(0,0,b.w,b.h).data,'sprite body was stretched from transparent padding or repainted');
 }
 const rails=S.supplementalEnvironmentLayouts({railway_strip:{points:[[10,60],[770,60]],width:85}}),c=createCanvas(800,120).getContext('2d');
 assert.equal(S.drawSupplementalEnvironment(c,rails[0]),true);const rgba=c.getImageData(0,0,800,120).data;
 for(let x=11;x<769;x++)assert.ok(rgba[(60*800+x)*4+3]>127,'transparent seam in the repeated rail bed');
 assert.equal(rgba[3],0);assert.equal(rgba[(60*800+790)*4+3],0,'last rail tile escaped segment clipping');
 const bent=S.supplementalEnvironmentLayouts({architecture:{railway_strip:{points:[[10,60],[410,60],[770,150]],width:85}}}),turn=createCanvas(800,220).getContext('2d');
 for(const layout of bent)S.drawSupplementalEnvironment(turn,layout);
 const joined=turn.getImageData(0,0,800,220).data;
 assert.ok(joined[(40*800+412)*4+3]>127,'a turn leaves an open wedge between the two clipped strips');
 assert.equal(S.drawSupplementalEnvironment(c,null),false);
});
