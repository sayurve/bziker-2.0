import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {designData,resolveDesignAsset} from '../web/design-assets.js';

const models=['mercedes-cabriolet','zaporozhets','bentley','g-wagen','pickup','compact-hatchback','sports-coupe'];
const directions=['front','right','back','left'];
test('all 124 authored vehicle sides retain their model, colour and source provenance',()=>{
 let count=0;const urls=new Set();
 for(const model of models){
  const id=`vehicle-${model}`,parent=designData.assets[id],keys=model==='sports-coupe'?['red']:['black','white','red','blue','green'];
  assert.deepEqual(Object.keys(parent.colors||{}),keys,`${id} colour variants`);
  for(const colour of keys){
   const variant=designData.assets[`${id}-${colour}`];assert.ok(variant);assert.equal(variant.model_id,id);assert.equal(variant.color,colour);
   assert.deepEqual(Object.keys(variant.views),directions);assert.equal(parent.colors[colour].id,`${id}-${colour}`);
   for(const direction of directions){const asset=resolveDesignAsset(`${id}-${colour}`,direction);assert.equal(asset.direction,direction);assert.equal(asset.color,colour);assert.ok(asset.source_sha256);assert.ok(asset.source.endsWith('/основной.png'));assert.ok(asset.width<=512&&asset.height<=512);assert.ok(fs.existsSync(new URL('..'+asset.url,import.meta.url)));urls.add(asset.url);count++;}
  }
 }
 assert.equal(count,124);assert.equal(urls.size,124);
});
test('catalogue character filtering preserves every location mascot and all isolated construction elements',()=>{
 for(const suffix of ['railway','casino','clothing','food','bar','mall','furniture','clan','construction'])assert.ok(designData.assets[`mascot-location-${suffix}`]);
 for(const id of ['station-interior-cashier','casino-interior-cashier','clothing-interior-mascot',...['earth-pile','fence-corner','fence-straight','foundation','gate','pit'].map(x=>'construction-site-'+x)]){const a=designData.assets[id];assert.ok(a,id);assert.ok(a.source_sha256);assert.ok(fs.existsSync(new URL('..'+a.url,import.meta.url)));}
 assert.equal(designData.assets['station-interior-cashier'].status,'approved');
});
