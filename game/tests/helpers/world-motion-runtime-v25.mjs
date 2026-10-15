export function motionRuntimeV25(bounds={width:390,height:600,left:0,top:0}){
 // RAF timestamps and performance.now share a deterministic clock. A slower
 // rendering suite must not make its first synthetic 1000ms frame go backwards.
 let frameTime=0;globalThis.performance={now:()=>frameTime};
 const texts=[],textPositions=[],rects=[],drawImages=[];const context=()=>new Proxy({measureText:s=>({width:s.length*6}),drawImage(image,...args){drawImages.push({image,args});},fillText(t,x,y){texts.push(t);textPositions.push({text:t,x,y});},fillRect(x,y,w,h){rects.push({x,y,w,h,color:this.fillStyle});}},{get:(t,k)=>t[k]??(()=>{})});
 class Element {
  constructor(){this.dataset={};this.handlers={};this.children=new Map();this.attributes=new Map();this.isConnected=true;this.classList={toggle(){}};}
  addEventListener(k,fn){(this.handlers[k]??=[]).push(fn);}
  removeEventListener(k,fn){this.handlers[k]=(this.handlers[k]||[]).filter(f=>f!==fn);}
  querySelector(k){if(!this.children.has(k))this.children.set(k,new Element());return this.children.get(k);}
  setAttribute(key,value){this.attributes.set(key,String(value));} append(child){this.appended=child;} remove(){this.isConnected=false;}
  getBoundingClientRect(){return {...bounds};}
  setPointerCapture(){} getContext(){return context();} closest(){return null;} focus(){}
 }
 const win=new Element();globalThis.window=win;win.devicePixelRatio=1;
 const doc=new Element();doc.hidden=false;doc.head=new Element();doc.getElementById=()=>true;doc.createElement=()=>new Element();
 let modal=false;doc.querySelector=k=>k==='dialog[open]'&&modal?new Element():null;globalThis.document=doc;
 globalThis.ResizeObserver=class {observe(){} disconnect(){}};
 let frame;globalThis.requestAnimationFrame=fn=>(frame=fn,1);globalThis.cancelAnimationFrame=()=>{};
 const event=(key,code)=>({key,code,repeat:false,target:new Element(),preventDefault(){}});
 const container=new Element();
 return {container,texts,textPositions,rects,drawImages,stick(x,y){const element=container.appended.querySelector(".world-stick"),event={pointerId:1,clientX:bounds.left+bounds.width/2+x*32,clientY:bounds.top+bounds.height/2+y*32,preventDefault(){}};for(const fn of element.handlers.pointerdown||[])fn(event);},click(selector){for(const fn of container.appended.querySelector(selector).handlers.click||[])fn({});},modal(value){modal=value;},key(key,code){for(const fn of win.handlers.keydown||[])fn(event(key,code));},keyUp(key,code){for(const fn of win.handlers.keyup||[])fn(event(key,code));},element(selector){return container.appended.querySelector(selector);},frame(time){frameTime=time;frame(time);}};
}
