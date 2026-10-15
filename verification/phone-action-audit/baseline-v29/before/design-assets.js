import {designData} from './design-data.js';
const images=new Map(),pending=new Map();
export {designData};
export function resolveDesignAsset(id,direction='front'){
 const asset=designData.assets[id];return asset?(asset.views?.[direction]||asset):null;
}
export function designCrop(asset,options={}){
 const b=options.crop==='solid'?asset?.solid_bbox:null;
 return Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=0&&b[1]>=0&&b[2]<=asset.width&&b[3]<=asset.height&&b[2]>b[0]&&b[3]>b[1]?{x:b[0],y:b[1],width:b[2]-b[0],height:b[3]-b[1]}:{x:0,y:0,width:asset?.width,height:asset?.height};
}
export function designDestination(asset,x,y,width,height,options={}){
 if(!asset||![x,y,width,height,asset.width,asset.height].every(Number.isFinite)||width<=0||height<=0||asset.width<=0||asset.height<=0)return null;
 const crop=designCrop(asset,options),scale=Math.min(width/crop.width,height/crop.height),w=crop.width*scale,h=crop.height*scale;
 return {x:x-w*(options.anchorX??.5),y:y-h*(options.anchorY??1),width:w,height:h};
}
function loadBrowserImage(url){return new Promise((resolve,reject)=>{if(typeof Image==='undefined'){reject(new Error('Image unavailable'));return;}const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Не удалось загрузить рисунок'));img.src=url;});}
function request(asset,loader=loadBrowserImage){
 if(images.has(asset.url))return Promise.resolve(images.get(asset.url));
 if(!pending.has(asset.url))pending.set(asset.url,loader(asset.url).then(img=>{images.set(asset.url,img);if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('bziker:design-asset-ready',{detail:{url:asset.url}}));return img;}).catch(()=>null).finally(()=>pending.delete(asset.url)));
 return pending.get(asset.url);
}
export async function preloadDesignAssets(ids,loader=loadBrowserImage){
 const unique=new Map();for(const id of ids){const a=designData.assets[id];if(!a)continue;for(const item of [a,...Object.values(a.views||{})])unique.set(item.url,item);}
 return Promise.all([...unique.values()].map(a=>request(a,loader)));
}
/** Decode exactly the currently visible view; other sides stay lazy. */
export async function preloadDesignViews(requests,loader=loadBrowserImage){
 const unique=new Map();for(const {id,direction='front'} of requests){const asset=resolveDesignAsset(id,direction);if(asset)unique.set(asset.url,asset);}
 return Promise.all([...unique.values()].map(asset=>request(asset,loader)));
}
export function drawDesignAsset(c,id,x,y,width,height,options={}){
 const asset=resolveDesignAsset(id,options.direction),box=designDestination(asset,x,y,width,height,options);if(!box)return false;
 const image=images.get(asset.url);if(!image){if(typeof Image!=='undefined')void request(asset);return false;}
 c.imageSmoothingEnabled=false;
 if(options.crop==='solid'){const crop=designCrop(asset,options);c.drawImage(image,crop.x,crop.y,crop.width,crop.height,Math.round(box.x),Math.round(box.y),box.width,box.height);}
 else c.drawImage(image,Math.round(box.x),Math.round(box.y),box.width,box.height);
 return true;
}
export function designAssetURL(id,direction='front'){return resolveDesignAsset(id,direction)?.url||'';}
