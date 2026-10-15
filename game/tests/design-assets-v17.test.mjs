import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const path=new URL('../web/design-assets.js',import.meta.url);
test('source design runtime exists',()=>assert.ok(fs.existsSync(path),'Source PNG assets must have a runtime renderer'));
test('asset box preserves proportions and bottom anchor',async()=>{
 if(!fs.existsSync(path))return;
 const {designDestination}=await import(path);
 assert.deepEqual(designDestination({width:100,height:200},300,400,120,160),{x:260,y:240,width:80,height:160});
 assert.deepEqual(designDestination({width:200,height:100},300,400,120,160),{x:240,y:340,width:120,height:60});
});
test('all four source furniture sides are independent and available',async()=>{
 if(!fs.existsSync(path))return;
 const {resolveDesignAsset}=await import(path);
 const views=['front','right','back','left'].map(side=>resolveDesignAsset('clan-furniture-sofa-modern',side));
 assert.equal(new Set(views.map(v=>v.url)).size,4);
 for(const v of views){assert.ok(v.width>0&&v.height>0);assert.ok(v.source_sha256);assert.ok(fs.existsSync(new URL('..'+v.url,import.meta.url)));}
 assert.equal(resolveDesignAsset('missing-source'),null);
});
test('preloading and drawing never transform image into a mirrored side',async()=>{
 if(!fs.existsSync(path))return;
 const {resolveDesignAsset,preloadDesignAssets,drawDesignAsset}=await import(path);
 const calls=[];await preloadDesignAssets(['clan-furniture-sofa-modern'],async(url)=>({url,width:100,height:100}));
 const ctx={imageSmoothingEnabled:true,drawImage(...args){calls.push(args);}};
 assert.equal(drawDesignAsset(ctx,'clan-furniture-sofa-modern',0,0,140,100),true);
 assert.equal(calls.length,1);assert.equal(calls[0][0].url,resolveDesignAsset('clan-furniture-sofa-modern').url);
 assert.ok(calls[0].slice(3).every(n=>n>=0));
 assert.equal(drawDesignAsset(ctx,'missing',0,0,140,100),false);
});
test('mobile preload decodes only the requested real side of a model',async()=>{
 const {preloadDesignViews,resolveDesignAsset}=await import(path),calls=[];
 await preloadDesignViews([{id:'clan-furniture-sofa-loft',direction:'back'},{id:'clan-furniture-sofa-loft',direction:'back'}],async url=>{calls.push(url);return {url};});
 assert.deepEqual(calls,[resolveDesignAsset('clan-furniture-sofa-loft','back').url]);
});
test('visible facade sizing excludes faint transparent borders without stretching or changing the PNG',async()=>{
 const {designDestination,designCrop,resolveDesignAsset,preloadDesignViews,drawDesignAsset}=await import(path);
 const example={width:768,height:768,solid_bbox:[200,100,600,700]};
 assert.deepEqual(designCrop(example,{crop:'solid'}),{x:200,y:100,width:400,height:600});
 assert.deepEqual(designDestination(example,200,300,100,150,{crop:'solid'}),{x:150,y:150,width:100,height:150});
 const id='ordinary-house-grey-panel',asset=resolveDesignAsset(id),calls=[];
 await preloadDesignViews([{id}],async url=>({url}));
 const c={drawImage(...args){calls.push(args);}};
 assert.ok(drawDesignAsset(c,id,200,300,100,300,{crop:'solid'}));
 assert.equal(calls[0].length,9);
 assert.deepEqual(calls[0].slice(1,5),Object.values(designCrop(asset,{crop:'solid'})));
 assert.equal(calls[0][7],100,'visible house fills the requested width');
 assert.ok(asset.solid_bbox[2]-asset.solid_bbox[0]<asset.width);
});
