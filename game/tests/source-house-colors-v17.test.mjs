import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {preloadDesignAssets,resolveDesignAsset} from '../web/design-assets.js';
import {sourceClanHouseAssets,sourceBuildingLayout} from '../web/source-city.js';
import {drawHouseCanvas,housePreviewSVG} from '../web/house-models.js';
const require=createRequire(process.execPath),{createCanvas,loadImage}=require('@napi-rs/canvas');
const load=url=>loadImage(fileURLToPath(new URL('../'+url.replace(/^\//,''),import.meta.url)));
const materials=await import('../web/source-house-materials.js').catch(()=>({}));
await preloadDesignAssets(sourceClanHouseAssets,load);
if(materials.preloadSourceHouseMaterials)await materials.preloadSourceHouseMaterials(load,{createCanvas});
const house={id:'base-1',x:90,y:110,width:350,height:230,door:{x:265,y:355}};
const changed=(a,b)=>{let count=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])count++;return count;};
const render=(style,color)=>{const c=createCanvas(600,450).getContext('2d');drawHouseCanvas(c,house,{exterior_style:style,exterior_color:color});return c;};

test('native clan facades retain the actual clan name, emblem and compact house number',()=>{
 const c=createCanvas(600,450).getContext('2d'),labels=[],fill=c.fillText.bind(c);
 c.fillText=(...args)=>{labels.push(args[0]);fill(...args);};
 drawHouseCanvas(c,house,{exterior_style:0,exterior_color:'#e88d78',color:'#7d9de6',name:'Команда идей',flag:'КИ'});
 assert.ok(labels.includes('Команда идей'));assert.ok(labels.includes('КИ'));assert.ok(labels.includes('01'));
});

test('a saved exterior colour changes the native facade, rather than only an entrance stripe',()=>{
 for(let style=0;style<6;style++){
  const a=render(style,'#e88d78').getImageData(0,0,600,450).data,b=render(style,'#7d9de6').getImageData(0,0,600,450).data;
  assert.ok(changed(a,b)>2500,`style ${style}: colour did not reach the wall material`);
 }
});
test('native material masks leave source windows, roof, plants and alpha untouched and retain texture',()=>{
 assert.equal(typeof materials.sourceHouseMaterial,'function');
 for(const id of new Set(sourceClanHouseAssets)){
  const native=materials.sourceHouseMaterial(id,'#faf8f2'),painted=materials.sourceHouseMaterial(id,'#e88d78'),asset=resolveDesignAsset(id);
  assert.ok(painted?.canvas);assert.equal(painted.canvas.width,asset.width);assert.equal(painted.canvas.height,asset.height);
  const a=native.sourcePixels,b=painted.canvas.getContext('2d').getImageData(0,0,asset.width,asset.height).data;
  let count=0;const wallValues=new Set();
  for(let i=0;i<a.length;i+=4){assert.equal(b[i+3],a[i+3]);if(painted.mask[i/4]){count++;wallValues.add(`${b[i]},${b[i+1]},${b[i+2]}`);}else assert.deepEqual(Array.from(b.slice(i,i+4)),Array.from(a.slice(i,i+4)),`${id}: non-wall material changed`);}
  assert.ok(count>12000,`${id}: no substantial wall mask`);assert.ok(wallValues.size>40,`${id}: wall texture was flattened`);
  for(const [x,y] of painted.protectedSamples){const p=(y*asset.width+x)*4;assert.equal(painted.mask[p/4],0,`${id}: protected pixel ${x},${y} was painted`);assert.deepEqual(Array.from(b.slice(p,p+4)),Array.from(a.slice(p,p+4)));}
 }
});
test('construction preview and world use the identical cached native bitmap for historical hex colours',()=>{
 assert.equal(typeof materials.drawSourceHouseMaterial,'function');
 for(let style=0;style<6;style++){
  const id=sourceClanHouseAssets[style],material=materials.sourceHouseMaterial(id,'#FF8562');
  assert.equal(materials.sourceHouseMaterial(id,'#ff8562'),material,'same material should not run the pixel shader twice');
  const svg=housePreviewSVG(style,'#FF8562');assert.ok(svg.includes(material.url));assert.match(svg,/#FF8562/);assert.doesNotMatch(svg.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g,''),/foreignObject|<script|NaN/);
  const actual=render(style,'#FF8562').getImageData(0,0,600,450).data,expected=createCanvas(600,450).getContext('2d');
  assert.equal(materials.drawSourceHouseMaterial(expected,sourceBuildingLayout(house,{exterior_style:style}),'#FF8562'),true);
  expected.fillStyle='#263436';expected.font='bold 10px monospace';expected.textAlign='center';expected.fillText('01',house.x+house.width-18,house.y+house.height+11);
  assert.equal(changed(actual,expected.getImageData(0,0,600,450).data),0,'preview bitmap must be the image painted into the world');
 }
 assert.equal(materials.sourceHouseMaterial(sourceClanHouseAssets[0],'<script>').color,'#faf8f2');
});
test('the sixth provided brick facade recolours actual brick while preserving both native doors, glass and rooftop equipment',()=>{
 const id='ordinary-house-red-brick-view-front',material=materials.sourceHouseMaterial(id,'#7d9de6');
 assert.ok(material?.canvas,'the sixth facade has a measured brick material mask');
 const width=material.canvas.width,a=material.sourcePixels,b=material.canvas.getContext('2d').getImageData(0,0,width,material.canvas.height).data;
 for(const [name,x,y,w,h]of [['roof',275,100,25,15],['front-glass',151,144,8,10],['lit-window',192,157,10,12],['left-door',231,320,14,21],['right-door',452,391,14,19],['side-glass',615,266,6,7],['lit-side-glass',647,225,6,12]]){
  let opaque=0;for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const p=yy*width+xx,i=p*4;opaque+=a[i+3]>=128;assert.equal(material.mask[p],0,`${name} must not become facade paint`);assert.deepEqual(Array.from(b.slice(i,i+4)),Array.from(a.slice(i,i+4)),`${name} must retain native RGBA`);}assert.ok(opaque>0,`${name} tests actual pixels`);
 }
 for(const [x,y]of [[155,217],[351,243],[532,379],[638,305]]){const p=y*width+x,i=p*4;assert.equal(material.mask[p],1,`measured brick at ${x},${y}`);assert.notDeepEqual(Array.from(b.slice(i,i+3)),Array.from(a.slice(i,i+3)));assert.equal(b[i+3],a[i+3]);}
});
