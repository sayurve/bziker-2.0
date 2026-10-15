import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {drawSourceRoadTextures} from '../web/city-ground.js';
import {preloadDesignAssets,resolveDesignAsset} from '../web/design-assets.js';

const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const assetId='source-road-asphalt-tile',asset=resolveDesignAsset(assetId);
let sourceImage;
await preloadDesignAssets([assetId],async url=>{
 sourceImage=await loadImage(fileURLToPath(new URL(url.replace(/^\//,''),new URL('../',import.meta.url))));
 return sourceImage;
});
const width=640,height=416;
// A broad real road capsule isolates texture coverage from curb/marking paint.
const plan={width,height,roadSegments:[{id:'texture-test-road',kind:'road',a:[-300,height/2],b:[width+300,height/2],width:600,tangent:[1,0],normal:[0,1],length:width+600}]};
function render(tile={x:0,y:0,width,height}){
 return renderRoadPlan(plan,drawSourceRoadTextures,tile);
}
function renderRoadPlan(roadPlan,draw=drawSourceRoadTextures,tile={x:0,y:0,width:roadPlan.width,height:roadPlan.height}){
 const canvas=createCanvas(tile.width,tile.height),c=canvas.getContext('2d');
 c.imageSmoothingEnabled=false;c.translate(-tile.x,-tile.y);
 draw(c,roadPlan,tile);
 return c;
}
const native=createCanvas(sourceImage.width,sourceImage.height).getContext('2d');native.drawImage(sourceImage,0,0);
const nativePixels=native.getImageData(0,0,sourceImage.width,sourceImage.height).data;
let nativeMinimumAlpha=255;for(let i=3;i<nativePixels.length;i+=4)nativeMinimumAlpha=Math.min(nativeMinimumAlpha,nativePixels[i]);

function road(id,a,b,roadWidth=180){
 const length=Math.hypot(b[0]-a[0],b[1]-a[1]),tangent=[(b[0]-a[0])/length,(b[1]-a[1])/length];
 return {id,kind:'road',a,b,width:roadWidth,length,tangent,normal:[-tangent[1],tangent[0]]};
}
function distanceToSegment(point,segment){
 const [dx,dy]=[segment.b[0]-segment.a[0],segment.b[1]-segment.a[1]];
 const t=Math.max(0,Math.min(1,((point[0]-segment.a[0])*dx+(point[1]-segment.a[1])*dy)/(dx*dx+dy*dy)));
 return Math.hypot(point[0]-segment.a[0]-t*dx,point[1]-segment.a[1]-t*dy);
}
function assertCapsuleUnionPainted(roadPlan,draw=drawSourceRoadTextures){
 const pixels=renderRoadPlan(roadPlan,draw).getImageData(0,0,roadPlan.width,roadPlan.height).data;
 let interiorCount=0,exteriorCount=0;
 for(let y=0;y<roadPlan.height;y++)for(let x=0;x<roadPlan.width;x++){
  // Pixel centres and a two-pixel margin exclude boundary antialiasing. This
  // Euclidean-distance oracle does not reuse the renderer's Canvas arc path.
  const clearance=Math.min(...roadPlan.roadSegments.map(s=>distanceToSegment([x+.5,y+.5],s)-s.width/2));
  const alpha=pixels[(y*roadPlan.width+x)*4+3];
  if(clearance<=-2){interiorCount++;assert.ok(alpha>=nativeMinimumAlpha,`Road capsule unpainted at ${x},${y}`);}
  else if(clearance>=2){exteriorCount++;assert.equal(alpha,0,`Road texture escaped the capsule union at ${x},${y}`);}
 }
 assert.ok(interiorCount>0&&exteriorCount>0,'The fixture must contain road interior and exterior pixels');
}
const terminalPlan={width,height,roadSegments:[road('terminal',[160,208],[480,208])]};
const junctionPlan={width,height,roadSegments:[
 road('junction-left',[130,286],[320,208],140),
 road('junction-right',[320,208],[510,286],140),
 road('junction-north',[320,208],[320,120],140),
]};

test('the real non-square source asphalt paints every row without transparent repeat bands',()=>{
 assert.equal(sourceImage.width,asset.width);assert.equal(sourceImage.height,asset.height);
 assert.notEqual(sourceImage.width,sourceImage.height,'The fixture must exercise the non-square native PNG');
 assert.ok(nativeMinimumAlpha>0,'The native source itself must not contain unpainted pixels');
 const pixels=render().getImageData(0,0,width,height).data;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  assert.ok(pixels[(y*width+x)*4+3]>=nativeMinimumAlpha,`A transparent source-road gap exposes the dark fallback at ${x},${y}`);
 }
});

test('native asphalt covers both complete terminal hemispheres without painting outside the road',()=>{
 assertCapsuleUnionPainted(terminalPlan);
});

test('native asphalt covers the entire angled junction union, including the shared terminal centre',()=>{
 assertCapsuleUnionPainted(junctionPlan);
});

test('terminal and junction coverage rejects the former inward-clockwise arc mutation',async()=>{
 const base=new URL('../web/',import.meta.url),original=await readFile(new URL('city-ground.js',base),'utf8');
 const mutated=original.replaceAll('r,n,n+Math.PI,true','r,n,n+Math.PI')
  .replaceAll('r,n+Math.PI,n+Math.PI*2,true','r,n+Math.PI,n+Math.PI*2');
 assert.notEqual(mutated,original,'The regression must actually remove the corrected arc direction');
 const isolated=mutated.replace(/from (['"])(\.\/[^'"]+)\1/g,(_,quote,path)=>`from ${JSON.stringify(new URL(path,base).href)}`);
 const oldRenderer=(await import('data:text/javascript;base64,'+Buffer.from(isolated).toString('base64'))).drawSourceRoadTextures;
 for(const roadPlan of [terminalPlan,junctionPlan]){
  assert.throws(()=>assertCapsuleUnionPainted(roadPlan,oldRenderer),/Road capsule unpainted/,
   'The original inward cap bug must fail the same real-pixel coverage check');
 }
});

test('source asphalt retains the native aspect ratio and exact nearest-neighbour grain',()=>{
 const expected=createCanvas(width,height).getContext('2d');expected.imageSmoothingEnabled=false;
 const repeatWidth=160,repeatHeight=repeatWidth*sourceImage.height/sourceImage.width;
 for(let y=0;y<height;y+=repeatHeight)for(let x=0;x<width;x+=repeatWidth){
  expected.drawImage(sourceImage,x,y,repeatWidth,repeatHeight);
 }
 assert.deepEqual(Buffer.from(render().getImageData(0,0,width,height).data),Buffer.from(expected.getImageData(0,0,width,height).data),
  'The road must use a contiguous proportional native tile, rather than stretch or letterbox the artwork');
});

test('adjacent uneven ground chunks keep one world texture phase across both seams',()=>{
 const full=render();
 for(const tile of [
  {x:0,y:0,width:317,height:173},
  {x:317,y:0,width:323,height:173},
  {x:0,y:173,width:317,height:243},
  {x:317,y:173,width:323,height:243},
 ]){
  const actual=render(tile).getImageData(0,0,tile.width,tile.height).data;
  const expected=full.getImageData(tile.x,tile.y,tile.width,tile.height).data;
  assert.deepEqual(Buffer.from(actual),Buffer.from(expected),`Chunk ${tile.x},${tile.y} changed the world texture phase`);
 }
});
