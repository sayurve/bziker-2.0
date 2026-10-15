// Share the authored cell proportions without importing the world renderer.
const url=new URL('./furniture-map.json',import.meta.url);
let catalog;
if(typeof process!=='undefined'&&process.versions?.node){
 const {readFile}=await import('node:fs/promises');catalog=JSON.parse(await readFile(url,'utf8'));
}else{
 const response=await fetch(url);if(!response.ok)throw Error('Не удалось загрузить размеры мебели');catalog=await response.json();
}
export const sourceFurnitureGrid=Object.freeze({...catalog.grid});
