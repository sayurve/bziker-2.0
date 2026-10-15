import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {buildLegacyLabModel,prepareLabResources,stepLabController,rejectIncompleteLabOutfit} from '../web/character-lab.js';
import {CharacterController} from '../web/character-system/controller.js';
import {drawSourceAvatarCanvas} from '../web/source-actors.js';
import {defaultAvatar,parts} from '../web/avatar.js';
import {validateCharacterDefinition,validateOutfit} from '../web/character-system/definition.js';
const require=createRequire(process.execPath),{createCanvas,loadImage}=require('@napi-rs/canvas');
const directions=['down','left','right','up'];
function textureScene(){const textures=new Map();return {textures:{addCanvas(key,canvas){assert.ok(!textures.has(key));const t={canvas,refresh(){},has:()=>false,get:()=>({realWidth:canvas.width,realHeight:canvas.height})};textures.set(key,t);return t;},exists:key=>textures.has(key),get:key=>textures.get(key),remove:key=>textures.delete(key)},saved:textures};}
test('lab manifests explicitly preview complete source poses, with all palettes and four authored directions',()=>{
 for(const gender of [0,1]){const {definition,outfits}=buildLegacyLabModel(gender);assert.throws(()=>validateCharacterDefinition(definition),/draft/);const d=validateCharacterDefinition(definition,{allowDraft:true});assert.equal(d.mode,'legacy-composite');assert.deepEqual(d.layers,['composite']);assert.deepEqual(d.anchor,{x:48,y:126});assert.deepEqual(d.canvas,{width:96,height:128});assert.equal(Object.keys(d.poses).length,68);assert.equal(d.actions.run.distancePerCycle>0,true);assert.deepEqual(Object.keys(outfits),['native','green','purple']);for(const o of Object.values(outfits)){validateOutfit(d,o,{allowDraft:true});assert.equal(Object.keys(o.layers.composite).length,68);}for(const dir of directions)assert.ok(d.poses[`run/${dir}/7`]);}
});
test('lab steps one controller frame by distance and invalid outfit preserves snapshot',()=>{
 const {definition,outfits}=buildLegacyLabModel(0),c=new CharacterController(definition,{allowDraft:true});c.setState({action:'run',direction:'left'});stepLabController(c);assert.equal(c.snapshot.poseKey,'run/left/1');const before=c.snapshot;let applied=0;const result=rejectIncompleteLabOutfit(c,outfits.green,{apply(){applied++;}});assert.equal(result.rejected,true);assert.equal(result.unchanged,true);assert.deepEqual(c.snapshot,before);assert.equal(applied,0);
});
test('lab renders actual source artwork into constant native canvases without manufacturing garment layers',async()=>{
 const scene=textureScene();const resources=await prepareLabResources(scene,{createCanvas,loadImage:path=>loadImage(fileURLToPath(new URL('../'+path,import.meta.url)))});assert.equal(resources.size,2);assert.equal(scene.saved.size,408);const hash=canvas=>createHash('sha256').update(canvas.getContext('2d').getImageData(0,0,96,128).data).digest('hex');
 for(const gender of [0,1]){const {definition,outfits}=resources.get(gender);const refs=outfits.native.layers.composite;for(const [key,ref] of Object.entries(refs)){const canvas=scene.saved.get(ref.texture).canvas;assert.equal(canvas.width,96);assert.equal(canvas.height,128);assert.ok(canvas.getContext('2d').getImageData(0,0,96,128).data.some((v,i)=>i%4===3&&v>0),`${gender}/${key} blank`);}
 for(const dir of directions){assert.equal(hash(scene.saved.get(refs[`walk/${dir}/0`].texture).canvas),hash(scene.saved.get(refs[`walk/${dir}/1`].texture).canvas),'existing held phases preserved');assert.notEqual(hash(scene.saved.get(refs[`walk/${dir}/0`].texture).canvas),hash(scene.saved.get(refs[`walk/${dir}/2`].texture).canvas),'authored poses differ');}
 const native=scene.saved.get(refs['idle/down/0'].texture).canvas,reference=createCanvas(96,128);drawSourceAvatarCanvas(reference.getContext('2d'),{...defaultAvatar,gender},parts,0,0,{scale:2,facing:'down',walking:false,running:false,walkFrame:0});assert.equal(hash(native),hash(reference),'native whole figure matches source renderer exactly');const green=scene.saved.get(outfits.green.layers.composite['idle/down/0'].texture).canvas;assert.notEqual(hash(native),hash(green));assert.equal(definition.status,'draft');}
 const crown=gender=>{const canvas=scene.saved.get(resources.get(gender).outfits.native.layers.composite['idle/down/0'].texture).canvas,data=canvas.getContext('2d').getImageData(0,0,96,128).data;for(let y=0;y<128;y++)for(let x=0;x<96;x++)if(data[(y*96+x)*4+3])return y;};assert.ok(crown(1)>crown(0),'native female stature remains distinct');
});
test('standalone lab exposes deterministic QA fields and account-free local Phaser entrypoint',()=>{
 const html=readFileSync(new URL('../web/character-lab.html',import.meta.url),'utf8'),js=readFileSync(new URL('../web/character-lab.js',import.meta.url),'utf8'),css=readFileSync(new URL('../web/character-lab.css',import.meta.url),'utf8');assert.match(html,/\/web\/vendor\/phaser\.min\.js/);assert.match(html,/Совместимость: полные позы; новые слои одежды ещё не одобрены/);assert.match(html,/id="lab-proof"/);assert.doesNotMatch(js,/\/api\/|setDisplaySize|\.anims\.|scaleX\s*=/);assert.match(css,/aspect-ratio/);assert.match(js,/new PhaserCharacterView/);assert.match(js,/new CharacterController/);
});
