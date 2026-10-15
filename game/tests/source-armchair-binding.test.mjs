import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFurnitureAssetId,sourceFurnitureLayout} from '../web/source-interiors.js';
import {resolveDesignAsset} from '../web/design-assets.js';

// The supplied gaming armchair has its own back, side depth and armrests.
// A work chair is a different object even when both have a seating slot.
test('base armchairs select the supplied real armchair in all four authored views',()=>{
 const directions={0:'front',90:'left',180:'back',270:'right'};
 const folders={front:'01_Спереди',left:'04_Слева',back:'03_Сзади',right:'02_Справа'};
 for(const theme of ['modern','loft','tech','wood','stone']){
  assert.equal(sourceFurnitureAssetId({type:'armchair'},theme),'casino-interior-chair-front');
  const urls=new Set();
  for(const rotation of [0,90,180,270]){
   const layout=sourceFurnitureLayout({type:'armchair',rotation},theme,{x:180,y:260,width:70,height:58});
   assert.equal(layout.direction,directions[rotation]);
   const resource=resolveDesignAsset(layout.assetId,layout.direction);
   assert.match(resource.source,/Игровое_кресло_Спереди\/Ракурсы\//u);
   assert.ok(resource.source.includes('/'+folders[directions[rotation]]+'/'));
   urls.add(resource.url);
  }
  assert.equal(urls.size,4,'four saved resource bindings, not one rotated texture');
 }
});
