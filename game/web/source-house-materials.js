import {drawDesignAsset,resolveDesignAsset,preloadDesignAssets,designDestination,designCrop} from './design-assets.js';

// Masks use the approved 768 px source coordinates. Window openings, roofs,
// entrance canopies and plants are holes, not recoloured components of a house.
const box=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const definitions={
 'clan-base-modern-clubhouse':{kind:'neutral',reference:185,
  planes:[box(52,194,685,435),box(209,143,241,435),box(498,143,530,435),[[684,197],[730,145],[730,381],[684,447]]],
  holes:[box(79,208,209,294),box(537,208,652,294),box(248,221,496,296),box(77,322,210,422),box(537,324,653,422),box(260,333,478,440),box(241,158,499,223),box(211,293,512,339),box(48,396,207,454),box(535,395,677,454),box(221,182,233,229),box(506,182,520,229),box(219,344,234,384),box(506,343,521,384),box(204,408,256,454),box(477,406,537,454),[[684,216],[724,167],[724,242],[684,294]],[[685,328],[723,280],[723,354],[685,415]]],
  protectedSamples:[[390,129],[145,247],[123,415]]},
 'clan-base-brick-loft':{kind:'warm',reference:129,
  planes:[box(65,185,684,437),[[280,137],[373,107],[455,137]],[[684,187],[733,138],[733,390],[684,437]]],
  holes:[box(225,136,526,197),box(93,200,229,306),box(251,201,312,306),box(321,195,430,305),box(437,202,500,306),box(520,199,656,309),box(93,324,229,436),box(286,338,438,447),box(520,321,656,436),box(239,302,505,341),box(242,388,284,447),box(436,389,486,447),[[683,211],[722,168],[722,263],[683,307]],[[683,339],[722,296],[722,386],[683,428]]],
  protectedSamples:[[389,81],[159,244],[264,417]]},
 'clan-base-tech-headquarters':{kind:'neutral',reference:151,
  planes:[box(79,209,237,449),box(230,168,256,294),box(425,137,475,431),box(249,332,526,433),box(525,283,692,447),[[692,188],[726,146],[726,388],[692,449]]],
  holes:[box(83,235,231,289),box(101,341,254,407),box(254,219,511,285),box(190,292,537,339),box(537,291,695,333),box(538,188,695,294),box(288,340,440,434),box(521,334,664,420),box(230,393,285,446),box(477,397,522,449),box(261,342,279,390),box(478,342,494,389),[[692,211],[717,183],[717,271],[692,301]],[[692,334],[717,305],[717,394],[692,422]]],
  protectedSamples:[[385,170],[581,247],[253,418]]},
 'clan-base-wood-clubhouse':{kind:'warm',reference:144,
  planes:[box(61,208,677,425),box(205,183,267,293),box(476,182,520,294),[[677,205],[717,158],[717,388],[677,425]]],
  holes:[box(79,212,206,301),box(270,250,475,296),box(519,204,660,315),box(78,327,206,423),box(263,338,454,435),box(517,331,648,425),box(231,190,483,252),box(187,290,526,329),box(208,344,227,399),box(486,345,503,399),box(202,400,245,435),box(452,398,495,437),[[677,227],[707,190],[707,266],[677,304]],[[677,337],[707,300],[707,376],[677,413]]],
  protectedSamples:[[386,126],[150,249],[642,249]]},
 'clan-base-stone-mansion':{kind:'neutral',reference:183,
  planes:[box(30,198,708,441),box(209,110,252,441),box(488,110,530,441),[[708,205],[757,151],[757,391],[708,444]]],
  holes:[box(244,118,489,184),box(64,205,123,307),box(146,205,202,307),box(254,188,304,291),box(313,188,418,291),box(433,188,484,291),box(529,205,585,307),box(621,205,674,307),box(64,332,202,425),box(280,338,441,443),box(528,331,675,426),box(210,285,492,334),box(53,403,219,453),box(517,405,685,455),box(272,390,313,448),box(472,391,514,449),box(219,128,236,178),box(499,128,518,178),box(248,348,267,398),box(506,348,523,398),box(37,245,54,295),box(680,245,697,295),[[708,219],[747,174],[747,258],[708,308]],[[708,339],[747,294],[747,375],[708,425]]],
  protectedSamples:[[376,83],[168,250],[121,433]]},
 'ordinary-house-red-brick-view-front':{kind:'brick',reference:130,
  planes:[[[120,117],[575,251],[575,451],[120,316]],[[583,253],[669,194],[669,414],[583,456]]],
  holes:[
   ...[[139,132,28],[185,147,28],[229,159,28],[271,173,29],[318,187,29],[363,202,29],[410,217,29],[453,231,29],[497,245,28],[539,258,28]].flatMap(([x,y,w])=>[0,47,94,141].map(d=>[[x-1,y+d-2],[x+w+1,y+d+7],[x+w+1,y+d+39],[x-1,y+d+31]])),
   ...[[609,247],[640,224]].flatMap(([x,y])=>[0,47,94,141].map(d=>[[x-1,y+d-1],[x+17,y+d-13],[x+17,y+d+23],[x-1,y+d+35]])),
   [[173,200],[193,185],[222,194],[222,236],[208,255],[173,244]],
   [[441,282],[460,266],[492,276],[492,317],[478,333],[441,322]],
   [[206,290],[224,288],[267,301],[267,358],[247,381],[194,365],[217,341],[217,307]],
   [[435,365],[452,361],[491,372],[491,425],[470,447],[425,432],[447,407],[447,382]],
  ],protectedSamples:[[290,112],[154,150],[198,165],[240,333],[460,405],[618,274]]},
};
export const sourceHouseMaterialIds=Object.freeze(Object.keys(definitions));
const sources=new Map(),painted=new Map(),pending=new Map();let factory=null;
const canvas=(w,h)=>factory?factory(w,h):typeof document!=='undefined'?Object.assign(document.createElement('canvas'),{width:w,height:h}):null;
const safeColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():'#faf8f2';
function polygon(c,points){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.closePath();c.fill();}
function prepareSource(id){
 if(sources.has(id))return sources.get(id);
 const asset=resolveDesignAsset(id),definition=definitions[id];if(!asset||!definition)return null;
 const native=canvas(asset.width,asset.height);if(!native)return null;const c=native.getContext('2d');
 if(!drawDesignAsset(c,id,0,0,asset.width,asset.height,{anchorX:0,anchorY:0}))return null;
 const imageData=c.getImageData(0,0,asset.width,asset.height),sourcePixels=imageData.data;
 const stencil=canvas(asset.width,asset.height),s=stencil.getContext('2d');s.fillStyle='#fff';for(const p of definition.planes)polygon(s,p);s.globalCompositeOperation='destination-out';for(const p of definition.holes)polygon(s,p);
 const geometry=s.getImageData(0,0,asset.width,asset.height).data,mask=new Uint8Array(asset.width*asset.height);
 for(let n=0;n<mask.length;n++){
  const i=n*4,r=sourcePixels[i],g=sourcePixels[i+1],b=sourcePixels[i+2],luma=.2126*r+.7152*g+.0722*b,spread=Math.max(r,g,b)-Math.min(r,g,b);
  // Material classification further protects outlines, warm lamps, green
  // foliage and blue glass at the stepped edges of the semantic openings.
  const material=definition.kind==='brick'?r-g>=20&&g-b>=6&&r-g<110:definition.kind==='warm'?r>=g&&g>=b&&spread<119&&g>b*.97&&r-g<79:spread<58&&r>=b-4;
  if(geometry[i+3]===255&&sourcePixels[i+3]>=128&&luma>(definition.kind==='brick'?30:61)&&material)mask[n]=1;
 }
 const source={canvas:native,sourcePixels,mask,reference:definition.reference,protectedSamples:definition.protectedSamples};sources.set(id,source);return source;
}
function refreshPreviews(id){
 if(typeof document==='undefined')return;
 for(const image of document.querySelectorAll('image[data-source-house-asset]')){
  if(image.getAttribute('data-source-house-asset')!==id)continue;
  const material=sourceHouseMaterial(id,image.getAttribute('data-source-house-color'));if(material?.url)image.setAttribute('href',material.url);
 }
}
function announce(id){
 refreshPreviews(id);
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('bziker:house-materials-ready',{detail:{assetId:id}}));
}
function request(id,loader){
 if(pending.has(id))return pending.get(id);
 const job=preloadDesignAssets([id],loader).then(()=>{const source=prepareSource(id);if(source){announce(id);if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>refreshPreviews(id));}return source;}).finally(()=>pending.delete(id));pending.set(id,job);return job;
}
/** Optional loader/canvas injection is used by offline validation. Browsers
 * request only the six small facade pictures, through the common lazy loader. */
export async function preloadSourceHouseMaterials(loader,environment={}){
 if(environment.createCanvas)factory=environment.createCanvas;
 return Promise.all(sourceHouseMaterialIds.map(id=>request(id,loader)));
}
/** Cached pixel shader: decode/mask once per source, shade once per colour.
 * The original PNG and every non-facade RGBA pixel remain unchanged. */
export function sourceHouseMaterial(id,color){
 if(!definitions[id])return null;const normalized=safeColor(color),key=id+':'+normalized;
 if(painted.has(key)){const hit=painted.get(key);painted.delete(key);painted.set(key,hit);return hit;}
 const source=prepareSource(id);if(!source){if(typeof Image!=='undefined')void request(id);return null;}
 const output=canvas(source.canvas.width,source.canvas.height);if(!output)return null;const c=output.getContext('2d'),pixels=c.createImageData(output.width,output.height);pixels.data.set(source.sourcePixels);
 const target=[1,3,5].map(i=>parseInt(normalized.slice(i,i+2),16));
 for(let n=0;n<source.mask.length;n++)if(source.mask[n]){
  const i=n*4,p=source.sourcePixels,luma=.2126*p[i]+.7152*p[i+1]+.0722*p[i+2],light=Math.max(-.76,Math.min(.55,(luma/source.reference-1)*.72));
  for(let channel=0;channel<3;channel++)pixels.data[i+channel]=Math.round(light<0?target[channel]*(1+light):target[channel]+(255-target[channel])*light);
 }
 c.putImageData(pixels,0,0);
 const material={canvas:output,color:normalized,sourcePixels:source.sourcePixels,mask:source.mask,protectedSamples:source.protectedSamples,url:output.toDataURL('image/png')};painted.set(key,material);
 // All six model thumbnails plus the city's saved colours fit here; obsolete
 // colour-picker previews are released rather than retaining unbounded canvases.
 if(painted.size>16)painted.delete(painted.keys().next().value);return material;
}
export function drawSourceHouseMaterial(c,layout,color){
 if(!c.drawImage||!layout)return false;const material=sourceHouseMaterial(layout.assetId,color),asset=resolveDesignAsset(layout.assetId),box=designDestination(asset,layout.anchor.x,layout.anchor.y,layout.width,layout.height,layout);if(!material||!box)return false;
 c.imageSmoothingEnabled=false;
 if(layout.crop==='solid'){const crop=designCrop(asset,layout);c.drawImage(material.canvas,crop.x,crop.y,crop.width,crop.height,Math.round(box.x),Math.round(box.y),box.width,box.height);}
 else c.drawImage(material.canvas,Math.round(box.x),Math.round(box.y),box.width,box.height);
 return true;
}
