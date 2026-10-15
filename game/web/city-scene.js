/** The modular scene is the single authority for native sprite instances and
 * their ground supports. Visual bounds never become guessed collisions. */
export const isModularCity=map=>map?.schema_version>=20||map?.design_source?.modular_scene===true;
export function citySceneEntities(map,{privateBases=false}={}){
 const groups=[map?.buildings,map?.background_buildings,map?.decor?.trees,map?.decor?.lamps,map?.bench_groups,map?.decor?.street_details,map?.architecture?.props,map?.scene_objects,(map?.activities||[]).filter(a=>a.design?.assetId)];
 if(privateBases)groups.push(map?.district?.buildings);
 const seen=new Set(),result=[];
 for(const list of groups)for(const item of list||[]){
  if(!item?.id||seen.has(item.id)||item.dynamic===true||item.kind==='boat')continue;
  seen.add(item.id);result.push(item);
 }
 return result;
}
export const cityGroundEntity=entity=>entity?.layer==='ground'||Number.isFinite(entity?.depth)&&entity.depth<0;
export function citySupport(entity){
 const f=entity?.footprint;
 return f&&['x','y','width','height'].every(k=>Number.isFinite(f[k]))&&f.width>0&&f.height>0?{x:f.x,y:f.y,width:f.width,height:f.height}:null;
}
