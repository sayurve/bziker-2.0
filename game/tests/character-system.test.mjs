import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../web/character-system/definition.js';
import * as control from '../web/character-system/controller.js';
import * as render from '../web/character-system/phaser-view.js';
const dirs = ['down','left','right','up'];
function definition() {
 const d={id:'test-model',status:'approved',mode:'layered',canvas:{width:64,height:96},anchor:{x:32,y:90},layers:['far','body','near'],directions:[...dirs],layerOrder:{},actions:{idle:{loop:true,frames:[{durationMs:100}]},walk:{loop:true,distancePerCycle:40,frames:[{durationMs:100},{durationMs:100},{durationMs:100},{durationMs:100}]},wave:{loop:false,frames:[{durationMs:80},{durationMs:120}]}},poses:{}};
 for(const dir of dirs){d.layerOrder[dir]=dir==='up'?['near','body','far']:['far','body','near'];for(const [action,clip] of Object.entries(d.actions))for(let i=0;i<clip.frames.length;i++){const key=`${action}/${dir}/${i}`;d.poses[key]={layers:Object.fromEntries(d.layers.map(id=>[id,{texture:`${id}-${dir}`,frame:i}])),attachments:{hand:{x:10+i,y:20},seat:{x:32,y:75}}};}}
 return d;
}
function outfit(d=definition(),id='coat'){return {id,status:'approved',modelId:d.id,layers:{body:Object.fromEntries(Object.keys(d.poses).map(key=>[key,{texture:id,frame:key}]))}};}
function sceneHarness(){
 const images=[],containers=[];const textures={exists:key=>key!=='missing',get:key=>({has:frame=>frame!=='missing',get:()=>({realWidth:64,realHeight:96,sourceSizeW:64,sourceSizeH:96})})};
 const scene={textures,add:{container(x,y){const c={x,y,list:[],scaleX:1,scaleY:1,add(items){this.list.push(...(Array.isArray(items)?items:[items]));return this;},remove(items,destroy){for(const i of (Array.isArray(items)?items:[items])){this.list=this.list.filter(v=>v!==i);if(destroy)i.destroy();}return this;},setScale(n){this.scaleX=this.scaleY=n;return this;},setPosition(x,y){this.x=x;this.y=y;return this;},destroy(){for(const i of this.list)i.destroy();this.list=[];this.destroyed=true;}};containers.push(c);return c;},image(x,y,key,frame){if(key==='throw')throw Error('GPU allocation failed');const i={x,y,texture:key,frame,setOrigin(x,y){this.originX=x;this.originY=y;return this;},destroy(){this.destroyed=true;}};images.push(i);return i;}}};return {scene,images,containers};
}
test('definition contract exists and returns an immutable isolated value',()=>{
 assert.equal(typeof api.validateCharacterDefinition,'function');const raw=definition(),d=api.validateCharacterDefinition(raw);raw.canvas.width=1;assert.equal(d.canvas.width,64);assert.ok(Object.isFrozen(d.poses['walk/up/3'].layers.body));
});
test('model requires every authored direction, pose, constant layer canvas and attachments',()=>{
 for(const mutate of [d=>delete d.poses['walk/up/3'],d=>d.directions.pop(),d=>d.layerOrder.up=['body'],d=>d.poses['walk/up/0'].layers.body.width=35,d=>d.poses['wave/down/0'].attachments.hand.x=NaN,d=>d.actions.walk.distancePerCycle=0,d=>d.actions.idle.loop='yes',d=>d.poses['idle/down/0'].layers.body.flipX=true]){const d=definition();mutate(d);assert.throws(()=>api.validateCharacterDefinition(d));}
});
test('draft definitions and garments need explicit lab opt-in',()=>{
 const d=definition();d.status='draft';assert.throws(()=>api.validateCharacterDefinition(d),/approved|draft/);assert.equal(api.validateCharacterDefinition(d,{allowDraft:true}).status,'draft');const o=outfit();o.status='draft';assert.throws(()=>api.validateOutfit(definition(),o),/approved|draft/);assert.equal(api.validateOutfit(definition(),o,{allowDraft:true}).status,'draft');
});
test('garment validates model compatibility, all poses, layer identity and explicit texture reference',()=>{
 for(const mutate of [o=>o.modelId='other',o=>delete o.layers.body['walk/up/3'],o=>o.layers.ghost=o.layers.body,o=>o.layers.body['walk/up/0']={texture:'coat'},o=>o.layers.body['idle/down/0'].scaleX=2]){const o=outfit();mutate(o);assert.throws(()=>api.validateOutfit(definition(),o));}
 assert.equal(api.validateOutfit(definition(),outfit()).id,'coat');
});
test('distance alone selects one frame shared by every layer and direction ordering',()=>{
 const c=new control.CharacterController(definition());c.setState({action:'walk',direction:'up'});c.advance({deltaMs:50000,distance:15});assert.equal(c.snapshot.frameIndex,1);assert.equal(c.snapshot.poseKey,'walk/up/1');assert.deepEqual(c.snapshot.layers.map(x=>x.id),['near','body','far']);assert.ok(c.snapshot.layers.every(x=>x.frame===1));assert.equal(c.snapshot.attachments.hand.x,11);c.setState({action:'walk',direction:'right'});assert.equal(c.snapshot.frameIndex,1);c.advance({distance:25});assert.equal(c.snapshot.frameIndex,0);
});
test('repeated state does not restart and timed actions hold final pose',()=>{
 const c=new control.CharacterController(definition());c.setState({action:'wave',direction:'down'});c.advance({deltaMs:85});c.setState({action:'wave',direction:'down'});assert.equal(c.snapshot.frameIndex,1);c.advance({deltaMs:1000});assert.equal(c.snapshot.frameIndex,1);assert.equal(c.snapshot.complete,true);assert.throws(()=>c.advance({deltaMs:-1}));assert.throws(()=>c.advance({distance:Infinity}));
});
test('stop and teleport discard movement phase; reduced motion cannot accumulate hidden stride',()=>{
 const c=new control.CharacterController(definition());c.setState({action:'walk',direction:'up'});c.advance({distance:19});c.stop();assert.equal(c.snapshot.poseKey,'idle/up/0');c.setState({action:'walk'});assert.equal(c.snapshot.frameIndex,0);c.advance({distance:19});c.teleport({direction:'left'});c.setState({action:'walk'});assert.equal(c.snapshot.poseKey,'walk/left/0');c.setReducedMotion(true);c.advance({distance:999,deltaMs:999});assert.equal(c.snapshot.frameIndex,0);c.setReducedMotion(false);assert.equal(c.snapshot.frameIndex,0);
});
test('outfit changes preserve phase and invalid changes leave complete snapshot untouched',()=>{
 const c=new control.CharacterController(definition());c.setState({action:'walk',direction:'left'});c.advance({distance:23});const before=c.snapshot;c.setOutfit(outfit());assert.equal(c.snapshot.frameIndex,before.frameIndex);assert.equal(c.snapshot.phase,before.phase);assert.equal(c.snapshot.layers.find(x=>x.id==='body').frame,'walk/left/2');const after=c.snapshot;const bad=outfit();delete bad.layers.body['walk/up/0'];assert.throws(()=>c.setOutfit(bad));assert.deepEqual(c.snapshot,after);assert.throws(()=>c.setOutfit(outfit(definition(),'new'),{apply(){throw Error('texture unavailable');}}));assert.deepEqual(c.snapshot,after);
});
test('Phaser layers use common anchor and one uniform scale without resizing',()=>{
 const h=sceneHarness(),c=new control.CharacterController(definition()),v=new render.PhaserCharacterView(h.scene,definition(),{x:30,y:40,scale:2});v.apply(c.snapshot);assert.equal(v.container.list.length,3);assert.ok(v.container.list.every(i=>i.x===0&&i.y===0&&i.originX===.5&&i.originY===90/96));assert.equal(v.container.scaleX,v.container.scaleY);c.setState({action:'walk',direction:'up'});c.advance({distance:25});v.apply(c.snapshot);assert.deepEqual(v.container.list.map(i=>i.texture),['near-up','body-up','far-up']);assert.ok(h.images.slice(0,3).every(i=>i.destroyed));v.destroy();assert.ok(v.container.destroyed);
});
test('Phaser missing textures, missing atlas frames and allocation errors roll back whole outfit',()=>{
 for(const texture of ['missing','throw']){const h=sceneHarness(),d=definition(),c=new control.CharacterController(d),v=new render.PhaserCharacterView(h.scene,d);v.apply(c.snapshot);const children=[...v.container.list],before=c.snapshot,o=outfit(d,texture);assert.throws(()=>c.setOutfit(o,v));assert.deepEqual(c.snapshot,before);assert.deepEqual(v.container.list,children);assert.ok(children.every(i=>!i.destroyed));}
 const h=sceneHarness(),d=definition(),c=new control.CharacterController(d),v=new render.PhaserCharacterView(h.scene,d);v.apply(c.snapshot);const bad={...c.snapshot,layers:c.snapshot.layers.map(x=>({...x,frame:'missing'}))};assert.throws(()=>v.apply(bad),/frame/i);assert.equal(v.container.list.length,3);
});
test('outfit preflight checks every pose texture, including currently invisible frames',()=>{
 const h=sceneHarness(),d=definition(),c=new control.CharacterController(d),v=new render.PhaserCharacterView(h.scene,d);v.apply(c.snapshot);const children=[...v.container.list],before=c.snapshot,o=outfit();o.layers.body['walk/up/3'].texture='missing';assert.throws(()=>c.setOutfit(o,v),/texture/);assert.deepEqual(c.snapshot,before);assert.deepEqual(v.container.list,children);
});
test('view rejects mismatched logical frame dimensions before changing children',()=>{
 const h=sceneHarness(),d=definition(),c=new control.CharacterController(d),v=new render.PhaserCharacterView(h.scene,d);v.apply(c.snapshot);const children=[...v.container.list];h.scene.textures.get=()=>({has:()=>true,get:()=>({realWidth:10,realHeight:20})});assert.throws(()=>v.apply(c.snapshot),/canvas/);assert.deepEqual(v.container.list,children);
});
test('view releases its own objects without destroying attached foreign objects or shared textures',()=>{
 const h=sceneHarness(),d=definition(),c=new control.CharacterController(d),v=new render.PhaserCharacterView(h.scene,d);v.apply(c.snapshot);const owned=[...v.container.list],foreign={destroy(){this.destroyed=true;}};v.container.add(foreign);v.destroy();v.destroy();assert.ok(owned.every(i=>i.destroyed));assert.equal(foreign.destroyed,undefined);assert.equal(h.scene.textures.exists('body-down'),true);assert.throws(()=>v.apply(c.snapshot),/destroyed/);
});
test('all poses expose the same named attachment points',()=>{
 const d=definition();delete d.poses['walk/up/3'].attachments.hand;assert.throws(()=>api.validateCharacterDefinition(d),/attachment/i);
});
test('timed loops honor authored durations, PNG null frames and outfit clearing retain phase',()=>{
 const d=definition();d.actions.idle.frames=[{durationMs:10},{durationMs:90}];for(const dir of dirs){d.poses[`idle/${dir}/1`]=structuredClone(d.poses[`idle/${dir}/0`]);for(const ref of Object.values(d.poses[`idle/${dir}/1`].layers))ref.frame=null;}
 const c=new control.CharacterController(d);c.advance({deltaMs:11});assert.equal(c.snapshot.frameIndex,1);assert.ok(c.snapshot.layers.every(x=>x.frame===null));c.advance({deltaMs:90});assert.equal(c.snapshot.frameIndex,0);c.setState({action:'walk'});c.advance({distance:22});c.setOutfit(outfit(d));c.setOutfit(null);assert.equal(c.snapshot.frameIndex,2);assert.equal(c.snapshot.outfitId,null);
});
test('any looping distance action follows distance and repeated state retains its phase',()=>{
 const d=definition();d.actions.run={loop:true,distancePerCycle:60,frames:[{durationMs:70},{durationMs:70}]};for(const dir of dirs)for(let i=0;i<2;i++)d.poses[`run/${dir}/${i}`]=structuredClone(d.poses[`walk/${dir}/${i}`]);
 const c=new control.CharacterController(d);c.setState({action:'run',direction:'right'});c.advance({deltaMs:10000});assert.equal(c.snapshot.frameIndex,0);assert.equal(c.snapshot.phase,0);c.advance({distance:40});assert.equal(c.snapshot.frameIndex,1);assert.equal(c.snapshot.phase,2/3);c.setState({action:'run',direction:'right'});assert.equal(c.snapshot.phase,2/3);c.advance({distance:20,deltaMs:9999});assert.equal(c.snapshot.frameIndex,0);assert.equal(c.snapshot.phase,0);
});
test('every provided distance clock requires positive finite cycle and looping action',()=>{
 for(const change of [clip=>clip.distancePerCycle=0,clip=>clip.distancePerCycle=Infinity,clip=>clip.distancePerCycle=-10,clip=>clip.loop=false]){const d=definition();d.actions.wave.distancePerCycle=60;d.actions.wave.loop=true;change(d.actions.wave);assert.throws(()=>api.validateCharacterDefinition(d),/distancePerCycle|loop/);}
});
test('large page lag clamps a finite timed action to its authored end',()=>{
 const c=new control.CharacterController(definition());c.setState({action:'wave'});c.advance({deltaMs:Number.MAX_VALUE});assert.equal(c.snapshot.complete,true);assert.equal(c.snapshot.frameIndex,1);assert.equal(c.snapshot.phase,1);c.advance({deltaMs:Number.MAX_VALUE});assert.equal(c.snapshot.phase,1);
});
test('large finite looping durations retain finite wrapped phase',()=>{
 const d=definition();d.actions.idle.frames[0].durationMs=1e308;
 const c=new control.CharacterController(d);c.advance({deltaMs:9e307});c.advance({deltaMs:9e307});
 assert.ok(Number.isFinite(c.snapshot.phase));assert.ok(Math.abs(c.snapshot.phase-.8)<1e-12);
});
