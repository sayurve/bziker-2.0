import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {furnitureCatalog,furnitureFootprint,worldMap} from '../web/world.js';
import {sourceFurnitureLayout} from '../web/source-interiors.js';

// Exercise the real editor draw statement. Before the fix this also executes
// its original h + 80 projection, so the clipping regression is not a mock of
// the new helper's implementation.
const worldSource=readFileSync(new URL('../web/world.js',import.meta.url),'utf8');
const start=worldSource.indexOf('if(shape){',worldSource.indexOf("const preview=$('.world-item-preview')"));
let end=start,depth=0;
for(let i=worldSource.indexOf('{',start);i<worldSource.length;i++){
 if(worldSource[i]==='{')depth++;
 if(worldSource[i]==='}'&&--depth===0){end=i+1;break;}
}
const helperURL=new URL('../web/furniture-preview.js',import.meta.url);
const fitFurniturePreview=existsSync(helperURL)?(await import(helperURL)).fitFurniturePreview:undefined;
const drawPreview=new Function('shape','worldMap','preview','ctx','$','drawFurnitureVolume','colors','type','rotation','fitFurniturePreview',worldSource.slice(start,end));
const canvas={width:176,height:144},themes=['modern','wood','loft','stone','tech'];
function projectedBounds(type,rotation,theme){
 const shape=furnitureFootprint({type,rotation}),transform={},values={'.world-item-theme':theme,'.world-item-variant':'standard','.world-item-color':'#faf8f2'};
 const ctx={save(){},restore(){},translate(x,y){transform.x=x;transform.y=y;},scale(x,y){transform.scaleX=x;transform.scaleY=y;}};
 let source;
 drawPreview(shape,worldMap,canvas,ctx,selector=>({value:values[selector]}),(_ctx,item,_type,x,y,width,height)=>{
  source=sourceFurnitureLayout({...item,type:_type},theme,{x,y,width,height});
 },{paper:'#faf8f2'},type,rotation,fitFurniturePreview);
 if(!source)return null;
 const b=source.bounds;
 return {left:transform.x+b.x*transform.scaleX,top:transform.y+b.y*transform.scaleY,
  right:transform.x+(b.x+b.width)*transform.scaleX,bottom:transform.y+(b.y+b.height)*transform.scaleY,...transform};
}

test('the actual editor preview keeps all 240 native furnishing views within its canvas',()=>{
 const failures=[];let views=0;
 for(const entry of furnitureCatalog.types)for(const theme of themes)for(const rotation of entry.rotations){
  const b=projectedBounds(entry.id,rotation,theme);if(!b)continue;views++;
  assert.equal(b.scaleX,b.scaleY,'native pixels must retain their aspect ratio');
  if(b.left<8-1e-8||b.top<8-1e-8||b.right>canvas.width-8+1e-8||b.bottom>canvas.height-8+1e-8)
   failures.push(`${entry.id}/${theme}/${rotation}: ${JSON.stringify(b)}`);
 }
 assert.equal(views,240,'every available native type, theme and facing must be exercised');
 assert.deepEqual(failures,[],`${failures.length} clipped furnishing previews`);
});

test('fallback furnishing projection retains its existing scale and ground anchor',()=>{
 assert.equal(typeof fitFurniturePreview,'function');
 for(const type of ['rug','bed','lamp'])for(const rotation of [0,90,180,270]){
  const shape=furnitureFootprint({type,rotation}),width=shape.width*worldMap.base.grid.cell_width,height=shape.height*worldMap.base.grid.cell_height;
  assert.equal(sourceFurnitureLayout({type,rotation},'modern',{x:0,y:0,width,height}),null);
  const fit=fitFurniturePreview({type,rotation,source_theme:'modern'},{width,height},canvas),scale=Math.min(1,(canvas.width-16)/(width+8),(canvas.height-16)/(height+80));
  assert.equal(fit.scale,scale);assert.ok(Math.abs(fit.x-(canvas.width-width*scale)/2)<1e-8);
  assert.equal(fit.y,canvas.height-8-height*scale);
 }
});
