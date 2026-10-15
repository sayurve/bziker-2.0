/** Integrate supplied raster sprite atlases without redrawing their artwork.
 * Originals are copied byte-for-byte. Runtime grids point-sample original RGB;
 * alpha below64 is ignored as transparent clipboard-fringe noise.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(process.execPath), {loadImage,createCanvas}=require('@napi-rs/canvas');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const inputs={idle:process.argv[2]||path.join(root,'assets','actor-reference-idle-v14.png'),walk:process.argv[3]||path.join(root,'assets','actor-reference-walk-v14.png')};
const names={idle:'actor-reference-idle-v14.png',walk:'actor-reference-walk-v14.png'};
const dirs=['down','left','up','right'],W=48,H=64,AX=24,AY=63,THRESHOLD=64;
const palette=['#00000000'], paletteMap=new Map();
const indexRGB=(r,g,b)=>{const hex='#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');if(!paletteMap.has(hex)){paletteMap.set(hex,palette.length);palette.push(hex);}return paletteMap.get(hex);};
const sourceData={},sources={};
for(const kind of ['idle','walk']){const input=inputs[kind],bytes=fs.readFileSync(input),target=path.join(root,'assets',names[kind]);if(path.resolve(input)!==target)fs.copyFileSync(input,target);const img=await loadImage(bytes),canvas=createCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,img.width,img.height).data,alphaCounts=new Map();for(let i=3;i<data.length;i+=4){alphaCounts.set(data[i],(alphaCounts.get(data[i])||0)+1);}sources[kind]={url:'/assets/'+names[kind],width:img.width,height:img.height,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),alpha:{transparent:alphaCounts.get(0)||0,lowFringe:[...alphaCounts].filter(([a])=>a>0&&a<THRESHOLD).reduce((n,[,count])=>n+count,0),visible:[...alphaCounts].filter(([a])=>a>=THRESHOLD).reduce((n,[,count])=>n+count,0),distinctValues:alphaCounts.size}};sourceData[kind]={width:img.width,height:img.height,data};}
function at(kind,x,y){const s=sourceData[kind];if(x<0||y<0||x>=s.width||y>=s.height)return 0;const k=(y*s.width+x)*4;if(s.data[k+3]<THRESHOLD)return 0;return indexRGB(s.data[k],s.data[k+1],s.data[k+2]);}
function bbox(kind,cell,ys=cell.y){const s=sourceData[kind];let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,count=0;for(let y=ys;y<cell.y+cell.h;y++)for(let x=cell.x;x<cell.x+cell.w;x++){if(s.data[(y*s.width+x)*4+3]>=THRESHOLD){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);count++;}}return{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1,count};}
function centroid(kind,cell,from,to){const s=sourceData[kind];let sum=0,n=0;for(let y=from;y<to;y++)for(let x=cell.x;x<cell.x+cell.w;x++){if(s.data[(y*s.width+x)*4+3]>=THRESHOLD){sum+=x;n++;}}return Math.round(sum/n);}
function sample(kind,{anchorX,ground,scaleX,scaleY,fromY=0,toY=H,sourceTop=-Infinity,sourceBottom=Infinity,sourceLeft=-Infinity,sourceRight=Infinity}){const pixels=Array(W*H).fill(0);for(let y=fromY;y<toY;y++)for(let x=0;x<W;x++){const sx=Math.floor(anchorX+(x+.5-AX)/scaleX),sy=Math.floor(ground+(y+.5-AY)/scaleY);if(sy>=sourceTop&&sy<sourceBottom&&sx>=sourceLeft&&sx<sourceRight)pixels[y*W+x]=at(kind,sx,sy);}return pixels;}
const idleCuts={down:341,left:329,up:325,right:330},walkCuts={down:151,left:465,up:774,right:1083};
const frames={idle:{},walk:{}};
for(let d=0;d<4;d++){const kind='idle',s=sourceData[kind],cell={x:Math.floor(d*s.width/4),y:0,w:Math.floor((d+1)*s.width/4)-Math.floor(d*s.width/4),h:s.height},b=bbox(kind,cell),anchorX=centroid(kind,cell,b.y,b.y+Math.round(b.h*.33)),ground=b.y+b.h,scale=(AY-1)/(b.h-1),headBodySplit=Math.round(AY+(idleCuts[dirs[d]]-ground)*scale),pixels=sample(kind,{anchorX,ground,scaleX:scale,scaleY:scale,sourceTop:cell.y,sourceBottom:cell.y+cell.h,sourceLeft:cell.x,sourceRight:cell.x+cell.w});frames.idle[dirs[d]]={id:`idle-${dirs[d]}`,sourceCell:cell,source:{x:b.x-2,y:b.y-2,w:b.w+4,h:b.h+4},opaqueBounds:b,headBounds:bbox(kind,{...cell,h:idleCuts[dirs[d]]-cell.y}),bodyBounds:bbox(kind,cell,idleCuts[dirs[d]]),sourceAnchor:{x:anchorX,y:ground},sourceSplit:idleCuts[dirs[d]],headBodySplit,neck:{x:AX,y:headBodySplit},scale:{x:scale,y:scale},normalizedPixels:pixels};}
const walkInfos=dirs.map((dir,d)=>{
 const s=sourceData.walk;return Array.from({length:4},(_,f)=>{
  const cell={x:Math.floor(f*s.width/4),y:Math.floor(d*s.height/4),w:Math.floor((f+1)*s.width/4)-Math.floor(f*s.width/4),h:Math.floor((d+1)*s.height/4)-Math.floor(d*s.height/4)},b=bbox('walk',cell),sourceSplit=walkCuts[dir];
  return{cell,b,body:bbox('walk',cell,sourceSplit),anchorX:centroid('walk',cell,b.y,sourceSplit),ground:b.y+b.h,sourceSplit};
 });
});
// One scale for the entire authored cycle. Transparent side margins retain
// the widest stride; neither the head nor the legs are resized independently.
const allWalk=walkInfos.flat(),walkScale=Math.min((AY-1)/Math.max(...allWalk.map(i=>i.b.h-1)),(AX-1)/Math.max(...allWalk.map(i=>Math.max(i.anchorX-i.b.x,i.b.x+i.b.w-i.anchorX))));
for(let d=0;d<4;d++){
 const dir=dirs[d];frames.walk[dir]=walkInfos[d].map((i,f)=>{
  const headBodySplit=Math.round(AY+(i.sourceSplit-i.ground)*walkScale),pixels=sample('walk',{anchorX:i.anchorX,ground:i.ground,scaleX:walkScale,scaleY:walkScale,sourceTop:i.cell.y,sourceBottom:i.cell.y+i.cell.h,sourceLeft:i.cell.x,sourceRight:i.cell.x+i.cell.w});
  return{id:`walk-${dir}-${f}`,sourceCell:i.cell,source:{x:i.b.x-2,y:i.b.y-2,w:i.b.w+4,h:i.b.h+4},opaqueBounds:i.b,headBounds:bbox('walk',{...i.cell,h:i.sourceSplit-i.cell.y}),bodyBounds:i.body,sourceAnchor:{x:i.anchorX,y:i.ground},sourceSplit:i.sourceSplit,headBodySplit,neck:{x:AX,y:headBodySplit},scale:{x:walkScale,y:walkScale},normalizedPixels:pixels};
 });
}
const atlas=createCanvas(W*5,H*4),actx=atlas.getContext('2d');actx.imageSmoothingEnabled=false;function drawPixels(pixels,ox,oy){for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=pixels[y*W+x];if(p){actx.fillStyle=palette[p];actx.fillRect(ox+x,oy+y,1,1);}}}
for(let d=0;d<4;d++){const dir=dirs[d];drawPixels(frames.idle[dir].normalizedPixels,0,d*H);for(let f=0;f<4;f++){drawPixels(frames.walk[dir][f].normalizedPixels,(f+1)*W,d*H);frames.walk[dir][f].atlas={x:(f+1)*W,y:d*H,w:W,h:H};}frames.idle[dir].atlas={x:0,y:d*H,w:W,h:H};}
fs.writeFileSync(path.join(root,'assets','actor-atlas-v14.png'),atlas.toBuffer('image/png'));
let checkedFrames=0, checkedPixels=0, checkedBodyPixels=0;
const usedPalette=new Set([0]);
for(const kind of ['idle','walk']){const original=fs.readFileSync(inputs[kind]),copied=fs.readFileSync(path.join(root,'assets',names[kind]));if(!original.equals(copied))throw new Error('Original-source copy differs: '+kind);for(const dir of dirs)for(const f of kind==='idle'?[frames.idle[dir]]:frames.walk[dir]){checkedFrames++;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const sx=Math.floor(f.sourceAnchor.x+(x+.5-AX)/f.scale.x),sy=Math.floor(f.sourceAnchor.y+(y+.5-AY)/f.scale.y),cell=f.sourceCell,expected=sx>=cell.x&&sx<cell.x+cell.w&&sy>=cell.y&&sy<cell.y+cell.h?at(kind,sx,sy):0,actual=f.normalizedPixels[y*W+x];if(actual!==expected)throw new Error('Source point mismatch: '+f.id+' '+x+','+y);usedPalette.add(actual);checkedPixels++;}if(f.bodyPixels){for(let y=0;y<H;y++)for(let x=0;x<W;x++){const sy=Math.floor(f.sourceAnchor.y+(y+.5-AY)/f.bodyScale.y),sx=Math.floor(f.sourceAnchor.x+(x+.5-AX)/f.bodyScale.x),expected=y>=f.bodySplit&&sy>=f.sourceSplit&&sy<f.sourceAnchor.y?at(kind,sx,sy):0,actual=f.bodyPixels[y*W+x];if(actual!==expected)throw new Error('Walking-body source point mismatch: '+f.id);usedPalette.add(actual);checkedBodyPixels++;}}}}
if(usedPalette.size!==palette.length)throw new Error('Unused palette entries: '+(palette.length-usedPalette.size));
const sourceVerification={byteExactOriginalCopies:2,normalizedFrames:checkedFrames,pointSamples:checkedPixels,walkingBodyPointSamples:checkedBodyPixels,allPaletteEntriesUsed:true,alphaThreshold:THRESHOLD};
const data={schemaVersion:2,sourceVerification,geometry:{width:W,height:H,anchorX:AX,anchorY:AY,walkFrames:8,sourceWalkFrames:4},directions:dirs,alphaThreshold:THRESHOLD,normalization:'Nearest point sampling of unchanged supplied sources; source RGB retained, occupied runtime pixels opaque. The sixteen complete walking frames share one uniform scale and a common ground baseline. Runtime displays whole frames in source order without head/body assembly.',sources,palette,frames,atlas:{url:'/assets/actor-atlas-v14.png',width:W*5,height:H*4,layout:'rows down,left,up,right; column0 idle; columns1..4 walk'}};
fs.writeFileSync(path.join(root,'web','actor-atlas-data.js'),'// Generated from the user-provided raster references by scripts/build-reference-atlas-v14.mjs.\n// Originals remain copied byte-for-byte in assets/actor-reference-{idle,walk}-v14.png.\nexport const actorAtlasData = '+JSON.stringify(data)+';\n');
fs.writeFileSync(path.join(root,'assets','actor-atlas-v14.json'),JSON.stringify({...data,palette:undefined,frames:Object.fromEntries(Object.entries(frames).map(([kind,dirs])=>[kind,Object.fromEntries(Object.entries(dirs).map(([dir,v])=>[dir,Array.isArray(v)?v.map(({normalizedPixels,bodyPixels,runs,bodyRuns,...info})=>info):(({normalizedPixels,runs,...info})=>info)(v)]))]))},null,2)+'\n');
console.log(JSON.stringify({sources,geometry:data.geometry,paletteColors:palette.length,frames:20,sourceVerification,atlas:{w:atlas.width,h:atlas.height},outputs:['assets/actor-reference-idle-v14.png','assets/actor-reference-walk-v14.png','assets/actor-atlas-v14.png','assets/actor-atlas-v14.json','web/actor-atlas-data.js']},null,2));
