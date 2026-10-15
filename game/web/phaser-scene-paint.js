import {animationPaintKey} from './phaser-world-renderer.js';

export function visibleGroundTiles(view,size=512){
 const tiles=[];
 for(let y=Math.floor(view.y/size);y<=Math.floor((view.y+view.height)/size);y++)
  for(let x=Math.floor(view.x/size);x<=Math.floor((view.x+view.width)/size);x++)tiles.push({x:x*size,y:y*size,width:size,height:size});
 return tiles;
}

/** Independent scene layers and depth-sorted native objects; no screen capture. */
export function paintWorldFrame(renderer,frame){
 const {view,sceneKey,revision,time,reducedMotion}=frame;
 renderer.setView(view);
 const tick=animationPaintKey(time,reducedMotion);
 for(const tile of visibleGroundTiles(view)){
  const key=`${sceneKey}:ground:${tile.x}:${tile.y}`;
  renderer.paint(key,tile,c=>frame.ground(c,tile),{depth:-100000,revision});
  if(frame.water&&frame.waterBounds&&tile.x+512>=frame.waterBounds.x&&tile.x<=frame.waterBounds.x+frame.waterBounds.width&&tile.y+512>=frame.waterBounds.y&&tile.y<=frame.waterBounds.y+frame.waterBounds.height)
   renderer.paint(key+':water',tile,c=>frame.water(c),{depth:-99999,revision:revision+':'+tick});
 }
 let order=0;
 for(const node of frame.groundObjects||[])renderer.paint(`${sceneKey}:floor:${node.id||order}`,node.bounds,node.draw,{depth:-90000+(order++),revision});
 order=0;
 for(const node of frame.nodes||[]){
  if(!node.bounds)throw new Error('Нет габаритов объекта Phaser: '+node.id);
  const nodeRevision=JSON.stringify([revision,node.revision??null]);
  renderer.paint(`${sceneKey}:object:${node.id||order}`,node.bounds,c=>node.draw(c,time),
   {depth:1000+(order++),revision:node.actor?nodeRevision+':'+tick:nodeRevision});
 }
 for(const node of frame.foregrounds||[])renderer.paint(`${sceneKey}:foreground:${node.id||order}`,node.bounds,node.draw,{depth:800000+(order++),revision});
 if(frame.lighting)renderer.night(view,frame.lighting.light,frame.lighting.lamps);else renderer.clearNight();
 for(const node of frame.labels||[])renderer.paint(`${sceneKey}:label:${node.id}`,node.bounds,node.draw,
  {depth:950000+(order++),revision:node.revision??revision});
 if(frame.action){const a=frame.action,b={x:a.x-39,y:a.y-15,width:78,height:31};
  renderer.paint(`${sceneKey}:action`,b,c=>{c.strokeStyle='#faf8f2';c.lineWidth=2;c.setLineDash([4,4]);c.strokeRect(a.x-37,a.y-13,74,27);},{depth:-80000,revision:JSON.stringify(a)});
 }
}
