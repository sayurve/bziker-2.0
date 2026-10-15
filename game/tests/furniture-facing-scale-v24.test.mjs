import test from 'node:test';
import assert from 'node:assert/strict';
import {furnitureCatalog} from '../web/world.js';
import {sourceFurnitureLayout} from '../web/source-interiors.js';
import {resolveDesignAsset} from '../web/design-assets.js';
import {fitFurniturePreview} from '../web/furniture-preview.js';

test('rotating native furniture retains its visible height and aligns its feet to the ground',()=>{
 const grid=furnitureCatalog.grid,failures=[];
 for(const type of furnitureCatalog.types)for(const theme of ['modern','wood','loft','stone','tech']){
  const measurements=[];
  for(const rotation of type.rotations){
   const shape=rotation%180?{width:type.footprint.height,height:type.footprint.width}:type.footprint;
   const geometry={x:200,y:300,width:shape.width*grid.cell_width,height:shape.height*grid.cell_height};
   const layout=sourceFurnitureLayout({type:type.id,rotation},theme,geometry);if(!layout)continue;
   const asset=resolveDesignAsset(layout.assetId,layout.direction),b=asset.solid_bbox,scale=layout.bounds.height/asset.height;
   assert.ok(Math.abs(scale-layout.bounds.width/asset.width)<1e-9,'native proportions must remain uniform');
   measurements.push({rotation,height:(b[3]-b[1])*scale,feet:layout.bounds.y+b[3]*scale,ground:geometry.y+geometry.height});
  }
  if(!measurements.length)continue;
  const reference=measurements[0].height;
  for(const measurement of measurements)if(Math.abs(reference-measurement.height)>1e-7||Math.abs(measurement.feet-measurement.ground)>1e-7)
   failures.push({type:type.id,theme,reference,...measurement});
 }
 assert.deepEqual(failures,[],`${failures.length} furniture facings change height or float above their support`);
});

test('native editor previews keep the same zoom and ground anchor while rotating',()=>{
 const grid=furnitureCatalog.grid,failures=[];
 for(const type of furnitureCatalog.types)for(const theme of ['modern','wood','loft','stone','tech']){
  const fits=[];
  for(const rotation of type.rotations){
   const item={type:type.id,rotation,source_theme:theme},shape=rotation%180?{width:type.footprint.height,height:type.footprint.width}:type.footprint;
   const geometry={width:shape.width*grid.cell_width,height:shape.height*grid.cell_height},layout=sourceFurnitureLayout(item,theme,{x:0,y:0,...geometry});if(!layout)continue;
   const fit=fitFurniturePreview(item,geometry,{width:176,height:144});
   fits.push({rotation,scale:fit.scale,anchorX:fit.x+layout.anchor.x*fit.scale,anchorY:fit.y+layout.anchor.y*fit.scale});
  }
  for(const fit of fits)if(['scale','anchorX','anchorY'].some(key=>Math.abs(fit[key]-fits[0][key])>1e-8))failures.push({type:type.id,theme,...fit});
 }
 assert.deepEqual(failures,[],`${failures.length} rotated previews change zoom or ground position`);
});
