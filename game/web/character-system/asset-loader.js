import {validateCharacterDefinition,validateOutfit} from './definition.js';

const queues=new WeakMap(),sources=new WeakMap();
const refsOf=definition=>Object.values(definition.poses).flatMap(p=>Object.values(p.layers));
const pathOK=file=>typeof file==='string'&&file===file.trim()&&file.endsWith('.png')&&!/^[\/]|[:\\?#%\u0000-\u001f\u007f]/.test(file)&&file.split('/').every(v=>v&&v!=='.'&&v!=='..');
function decode(scene,files){
 if(!files.length)return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const keys=new Set(files.map(file=>file.key)),errors=[],error=file=>{if(keys.has(file.key))errors.push(file.src||file.key);};
  scene.load.on('loaderror',error);
  scene.load.once('complete',()=>{scene.load.off('loaderror',error);errors.length?reject(new Error('Character PNG load failed: '+errors.join(', '))):resolve();});
  files.forEach(({key,url})=>scene.load.image(key,url));scene.load.start();
 });
}

/** Complete native PNG layers only. Loading validates compatibility, not artistry. */
export async function loadCharacterBundle(scene,bundle,{assetRoot,allowDraft=false}={}){
 // Phaser shares a TextureManager across its scenes: ownership and loading
 // transactions must share that scope too, otherwise a scene switch conflicts.
 const textureManager=scene.textures;
 const task=(queues.get(textureManager)||Promise.resolve()).catch(()=>{}).then(async()=>{
  if(bundle?.schema!=='bziker-character-bundle/v1')throw new TypeError('Expected bziker-character-bundle/v1');
  const definition=validateCharacterDefinition(bundle.definition,{allowDraft});
  const outfits=(bundle.outfits||[]).map(v=>validateOutfit(definition,v,{allowDraft}));
  if(!allowDraft&&!(bundle.artReview?.checked===true&&Array.isArray(bundle.artReview.evidence)&&bundle.artReview.evidence.length&&bundle.artReview.evidence.every(v=>typeof v==='string'&&v.trim())))
   throw new TypeError('Production art requires recorded visual review evidence');
  if(!assetRoot)throw new TypeError('Explicit assetRoot directory URL required');
  const root=new URL(assetRoot,import.meta.url);if(!['http:','https:'].includes(root.protocol)||root.search||root.hash||!root.pathname.endsWith('/'))throw new TypeError('assetRoot must be an HTTP directory path');
  const entries=Object.entries(bundle.textures||{}),files=entries.map(([key,resource])=>{
   if(!key||!pathOK(resource?.file))throw new TypeError('Character PNG requires a relative path inside assetRoot');
   const url=new URL(resource.file,root).href;
   const resolved=new URL(url);if(resolved.origin!==root.origin||!resolved.pathname.startsWith(root.pathname))throw new TypeError('Character PNG path must stay inside assetRoot');
   return {key,url};
  });
  const keys=new Set(files.map(f=>f.key)),refs=[...refsOf(definition),...outfits.flatMap(o=>Object.values(o.layers).flatMap(p=>Object.values(p)))];
  if(refs.some(ref=>!keys.has(ref.texture)))throw new TypeError('Every character texture must be declared in this bundle');
  if(refs.some(ref=>ref.frame!==null))throw new TypeError('This loader requires separate full PNG frames; atlas frames use an explicit atlas importer');
  let provenance=sources.get(textureManager);if(!provenance){provenance=new Map();sources.set(textureManager,provenance);}
  for(const file of files)if(scene.textures.exists(file.key)&&provenance.get(file.key)!==file.url)
   throw new Error('Character texture key collision; use versioned keys: '+file.key);
  const added=files.filter(file=>!scene.textures.exists(file.key));
  try{
   await decode(scene,added);
   for(const {key}of files){
    const source=scene.textures.get(key)?.getSourceImage(),width=source?.naturalWidth||source?.width,height=source?.naturalHeight||source?.height;
    if(width!==definition.canvas.width||height!==definition.canvas.height)
     throw new Error('Character PNG size must preserve model canvas: '+key);
   }
   added.forEach(file=>provenance.set(file.key,file.url));
   return {definition,outfits,artReview:structuredClone(bundle.artReview||{checked:false}),textures:files.map(f=>f.key)};
  }catch(error){for(const {key}of added){if(scene.textures.exists(key))scene.textures.remove(key);provenance.delete(key);}throw error;}
 });
 queues.set(textureManager,task);return task;
}
