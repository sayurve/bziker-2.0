import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loadSourceActor} from '../../web/source-actors.js';
import {avatarRaster} from '../../web/avatar.js';
export const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
export async function preloadNativeAvatars(){
 const environment={createCanvas,loadImage:p=>loadImage(fileURLToPath(new URL('../../'+p,import.meta.url)))};
 for(const id of ['human-male','human-female'])await loadSourceActor(id,environment);
}
export function readyAvatarRaster(avatar={},options={}){
 const sprite=avatarRaster(avatar,options);
 assert.notEqual(sprite.loading,true,'Fixture must decode actual native PNGs before inspecting the character');
 assert.equal(sprite.factor,2);assert.equal(sprite.grid.length,sprite.width*sprite.height);
 assert.ok(sprite.grid.some(Boolean),'A nonempty source-loading placeholder is not a character');
 return sprite;
}
// Observe actual source bitmap draws, including their nearest-neighbour scaling.
// The scene fixture does not paint a browser canvas; decode only native avatar
// canvases here, while keeping ground/furniture observation unchanged.
const decoded=new WeakMap();
export function recordNativeAvatarImage(rects,image,...args){
 if(image?.width!==96||image?.height!==128||args.length!==4||typeof image.getContext!=='function')return;
 const [x,y,w,h]=args;if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return;
 let sizes=decoded.get(image);if(!sizes){sizes=new Map();decoded.set(image,sizes);}const key=`${w}/${h}`;
 if(!sizes.has(key)){
  const c=createCanvas(w,h),q=c.getContext('2d');q.imageSmoothingEnabled=false;q.drawImage(image,0,0,w,h);const d=q.getImageData(0,0,w,h).data,runs=[];
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;){let k=(yy*w+xx)*4,end=xx+1;while(end<w&&[0,1,2,3].every(z=>d[(yy*w+end)*4+z]===d[k+z]))end++;if(d[k+3]>=128)runs.push({x:xx,y:yy,w:end-xx,h:1,color:'#'+[0,1,2].map(z=>d[k+z].toString(16).padStart(2,'0')).join('')});xx=end;}sizes.set(key,runs);
 }
 for(const r of sizes.get(key))rects.push({...r,x:x+r.x,y:y+r.y});
}
