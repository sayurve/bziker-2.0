// Deterministic scene clock for gameplay tests. Native Phaser is exercised in
// the browser; these fixtures observe the same individual object painters.
export function fixtureRenderer(canvas,{onFrame}){
 const context=canvas.getContext('2d');let dead=false,raf,view;
 const frame=time=>{if(dead)return;onFrame(time);raf=requestAnimationFrame(frame);};
 raf=requestAnimationFrame(frame);
 return {resize(w,h,dpr=1){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);},setView(v){view=v;},paint(key,bounds,draw){if(bounds.x+bounds.width>=view.x&&bounds.x<=view.x+view.width&&bounds.y+bounds.height>=view.y&&bounds.y<=view.y+view.height)draw(context);},night(){},clearNight(){},
  destroy(){dead=true;cancelAnimationFrame(raf);}};
}
