import {sourceFurnitureLayout} from './source-interiors.js';
import {sourceFurnitureGrid} from './source-furniture-grid.js';

/** Fit the complete native view above its ground anchor, using one scale. */
export function fitFurniturePreview(item,{width,height},canvas){
 const layout=sourceFurnitureLayout(item,item.source_theme,{x:0,y:0,width,height}),native=layout?.bounds;
 if(layout){
  const ratio=sourceFurnitureGrid.cell_width/sourceFurnitureGrid.cell_height,side=item.rotation===90||item.rotation===270;
  const frontWidth=side?height*ratio:width,frontHeight=side?width/ratio:height;
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  // Reserve the same native envelope for every facing so a turn doesn't zoom.
  for(const rotation of [0,90,180,270]){
   const odd=rotation%180!==0,view=sourceFurnitureLayout({...item,rotation},item.source_theme,{x:0,y:0,width:odd?frontHeight*ratio:frontWidth,height:odd?frontWidth/ratio:frontHeight});
   const b=view.bounds;left=Math.min(left,b.x-view.anchor.x);top=Math.min(top,b.y-view.anchor.y);
   right=Math.max(right,b.x+b.width-view.anchor.x);bottom=Math.max(bottom,b.y+b.height-view.anchor.y);
  }
  const scale=Math.min(1,(canvas.width-16)/(right-left),(canvas.height-16)/(bottom-top));
  const anchorX=(canvas.width-(right-left)*scale)/2-left*scale,anchorY=canvas.height-8-bottom*scale;
  return {scale,x:anchorX-layout.anchor.x*scale,y:anchorY-layout.anchor.y*scale};
 }
 // Keep the existing envelope for procedural fallback art while extending it
 // for native views whose tops rise farther than 80 units above the footprint.
 const left=Math.min(-4,native?.x??0),top=Math.min(-80,native?.y??0);
 const right=Math.max(width+4,native?native.x+native.width:width);
 const bottom=Math.max(height,native?native.y+native.height:height);
 const scale=Math.min(1,(canvas.width-16)/(right-left),(canvas.height-16)/(bottom-top));
 return {scale,x:(canvas.width-(right-left)*scale)/2-left*scale,y:canvas.height-8-bottom*scale};
}
