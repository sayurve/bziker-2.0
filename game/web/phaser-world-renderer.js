/** Phaser owns the game canvas, clock, camera and individual world objects.
 * Existing object painters produce bounded textures, never a flattened map. */
export function rasterBounds(b){
 if(!b||!['x','y','width','height'].every(k=>Number.isFinite(b[k]))||b.width<=0||b.height<=0)return null;
 const x=Math.floor(b.x),y=Math.floor(b.y);
 return {x,y,width:Math.ceil(b.x+b.width)-x,height:Math.ceil(b.y+b.height)-y};
}
export const visibleWorldBounds=view=>({x:view.x,y:view.y,width:view.width,height:view.height});
export const animationPaintKey=(milliseconds,reducedMotion=false)=>reducedMotion?0:Math.floor(milliseconds*12/1000);
const intersects=(a,b)=>a.x+a.width>=b.x&&a.x<=b.x+b.width&&a.y+a.height>=b.y&&a.y<=b.y+b.height;

export class PhaserWorldRenderer{
 constructor(canvas,{onFrame,onError=console.error}={}){
  if(!globalThis.Phaser)throw new Error('Не загрузился движок Phaser');
  this.canvas=canvas;this.entries=new Map();this.serial=0;this.frame=0;this.bytes=0;this.maxBytes=64*1024*1024;
  const host=this;
  canvas.dataset.engineState='constructing';
  this.game=new Phaser.Game({type:Phaser.WEBGL,canvas,width:390,height:650,
   backgroundColor:'#dfe5dc',pixelArt:true,roundPixels:true,antialias:false,banner:false,
   scene:{key:'BzikerWorld',create(){host.scene=this;canvas.dataset.engineState='scene-ready';canvas.dataset.renderer='Phaser '+Phaser.VERSION;},
    update(time){if(host.dead)return;host.begin();try{onFrame?.(time);}catch(error){onError(error);throw error;}finally{host.end();}}}});
  canvas.dataset.engineState='game-created';
 }
 resize(width,height,dpr=1){
  this.width=width;this.height=height;this.dpr=dpr;
  if(this.scene)this.game.scale.resize(Math.max(1,Math.round(width*dpr)),Math.max(1,Math.round(height*dpr)));
  this.canvas.style.width='100%';this.canvas.style.height='100%';
 }
 begin(){this.frame++;for(const entry of this.entries.values())entry.image.setVisible(false);}
 setView(view){
  if(!this.scene)return;
  const w=Math.round(this.width*this.dpr),h=Math.round(this.height*this.dpr);
  if(this.game.scale.width!==w||this.game.scale.height!==h)this.resize(this.width,this.height,this.dpr);
  this.view=visibleWorldBounds(view);
  this.scene.cameras.main.setScroll(view.x,view.y).setZoom(view.scale*this.dpr).setOrigin(0,0);
 }
 /** One source object or ground tile becomes one native Phaser Sprite. */
 paint(key,bounds,draw,{revision=0,depth=0}={}){
  if(!this.scene||!intersects(bounds,this.view))return;
  const b=rasterBounds(bounds);if(!b)return;
  // Reserve fractional-edge coverage from size alone. A moving origin must
  // not alternate canvas/GPU capacity at each integer-pixel crossing.
  b.width=Math.ceil(bounds.width)+1;b.height=Math.ceil(bounds.height)+1;
  let entry=this.entries.get(key);
  if(entry&&(entry.width!==b.width||entry.height!==b.height)){this.release(key);entry=null;}
  if(!entry){
   const canvas=document.createElement('canvas');canvas.width=b.width;canvas.height=b.height;
   const textureKey='world-object-'+(++this.serial),texture=this.scene.textures.addCanvas(textureKey,canvas);
   const image=this.scene.add.sprite(bounds.x,bounds.y,textureKey).setOrigin(0,0);
   entry={canvas,texture,textureKey,image,width:b.width,height:b.height,revision:null,bytes:b.width*b.height*4};
   this.bytes+=entry.bytes;this.entries.set(key,entry);
  }
  if(entry.revision!==revision){
   const context=entry.canvas.getContext('2d');context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,b.width,b.height);
   context.save();context.imageSmoothingEnabled=false;context.translate(-bounds.x,-bounds.y);draw(context);context.restore();
   entry.texture.refresh();entry.revision=revision;
  }
  entry.seen=this.frame;entry.image.setPosition(bounds.x,bounds.y).setDepth(depth).setVisible(true);
 }
 night(view,light,lamps){
  if(!this.scene)return;
  const scene=this.scene;
  if(!this.light){this.light=scene.add.graphics().setDepth(900000);this.glow=scene.add.graphics().setDepth(900001).setBlendMode(Phaser.BlendModes.SCREEN);}
  this.light.clear();this.glow.clear();
  if(light>=.98)return;
  this.light.fillStyle(0x131f34,(1-light)*.56).fillRect(view.x,view.y,view.width,view.height);
  for(const lamp of lamps){if(!intersects({x:lamp.x-100,y:lamp.y-70,width:200,height:140},view))continue;
   for(const [rx,ry,alpha]of[[92,49,.035],[68,35,.065],[43,24,.10]])this.glow.fillStyle(0xfcdb8c,alpha*(1-light)).fillEllipse(lamp.x,lamp.y+7,rx*2,ry*2);
  }
 }
 clearNight(){this.light?.clear();this.glow?.clear();}
 end(){
  // Retain nearby props briefly; prune cold GPU textures and their canvases.
  const cold=[...this.entries].filter(([,v])=>v.seen!==this.frame).sort((a,b)=>a[1].seen-b[1].seen);
  for(const [key,entry]of cold)if(this.bytes>this.maxBytes||this.frame-entry.seen>120)this.release(key);
  this.canvas.dataset.phaserObjects=String(this.scene?.children.length||0);
  this.canvas.dataset.phaserTextureBytes=String(this.bytes);
 }
 release(key){const entry=this.entries.get(key);if(!entry)return;entry.image.destroy();this.scene.textures.remove(entry.textureKey);entry.canvas.width=entry.canvas.height=1;this.entries.delete(key);this.bytes-=entry.bytes;}
 invalidate(){for(const entry of this.entries.values())entry.revision=null;}
 destroy(){this.dead=true;for(const key of [...this.entries.keys()])this.release(key);this.game.destroy(false);}
}
