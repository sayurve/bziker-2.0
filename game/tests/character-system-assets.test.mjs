import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCharacterBundle} from '../web/character-system/asset-loader.js';

function bundle(){
 const directions=['down','left','right','up'],poses={};
 for(const a of ['idle','walk'])for(const d of directions)poses[`${a}/${d}/0`]={layers:{body:{texture:'body',frame:null},shirt:{texture:'shirt',frame:null}},attachments:{}};
 return {schema:'bziker-character-bundle/v1',artReview:{checked:true,evidence:['review.png']},definition:{id:'test',mode:'layered',status:'approved',canvas:{width:48,height:64},anchor:{x:24,y:63},layers:['body','shirt'],directions,layerOrder:Object.fromEntries(directions.map(d=>[d,['body','shirt']])),actions:{idle:{loop:true,frames:[{durationMs:125}]},walk:{loop:true,distancePerCycle:128,frames:[{durationMs:125}]}},poses},outfits:[],textures:{body:{file:'body.png'},shirt:{file:'shirt.png'}}};
}
function scene({badSize=false,fail=false,unrelatedError=false}={}){
 const values=new Map(),events=new Map(),tasks=[];
 return {textures:{exists:k=>values.has(k),get:k=>values.get(k),remove:k=>values.delete(k)},values,
 load:{on(k,fn){events.set(k,fn);},off(k){events.delete(k);},once(k,fn){events.set(k,fn);},image(k,url){tasks.push({k,url});},start(){for(const {k,url}of tasks.splice(0)){if(fail&&k==='shirt')events.get('loaderror')?.({key:k});else values.set(k,{getSourceImage:()=>({width:48,height:badSize&&k==='shirt'?65:64})});}if(unrelatedError)events.get('loaderror')?.({key:'unrelated-audio',src:'missing-audio.ogg'});events.get('complete')();}}};
}
test('asset bundle loads explicit full PNGs and retains authored source metadata',async()=>{
 const s=scene(),b=bundle(),value=await loadCharacterBundle(s,b,{assetRoot:'http://localhost/assets/'});
 assert.equal(value.definition.id,'test');assert.equal(s.values.size,2);assert.deepEqual(b.textures.body,{file:'body.png'});
});
test('unreviewed or draft assets cannot be admitted as production art',async()=>{
 const b=bundle();b.artReview.checked=false;await assert.rejects(loadCharacterBundle(scene(),b,{assetRoot:'http://localhost/assets/'}),/review/i);
 b.definition.status='draft';assert.equal((await loadCharacterBundle(scene(),b,{assetRoot:'http://localhost/assets/',allowDraft:true})).definition.status,'draft');
});
test('a size error removes only newly loaded textures and preserves prior assets',async()=>{
 const s=scene({badSize:true});s.values.set('unrelated',{getSourceImage:()=>({width:1,height:1})});
 await assert.rejects(loadCharacterBundle(s,bundle(),{assetRoot:'http://localhost/assets/'}),/canvas|size/i);
 assert.deepEqual([...s.values.keys()],['unrelated']);
});
test('a failed decode leaves no half-loaded outfit and next request can retry',async()=>{
 const s=scene({fail:true});await assert.rejects(loadCharacterBundle(s,bundle(),{assetRoot:'http://localhost/assets/'}),/load/i);assert.equal(s.values.size,0);
});
test('asset paths stay in the bundle and every texture reference is declared',async()=>{
 for(const file of ['../escape.png','https://example.com/a.png','/absolute.png',' https:example.invalid/body.png','h\tttps:example.invalid/body.png','sub/../../body.png']){const b=bundle();b.textures.body.file=file;await assert.rejects(loadCharacterBundle(scene(),b,{assetRoot:'http://localhost/assets/'}),/relative|path/i);}
 const b=bundle();delete b.textures.shirt;await assert.rejects(loadCharacterBundle(scene(),b,{assetRoot:'http://localhost/assets/'}),/declared/i);
});
test('scenes reuse the same bundle through the shared Phaser TextureManager',async()=>{
 const a=scene(),b=scene();b.textures=a.textures;
 const first=await loadCharacterBundle(a,bundle(),{assetRoot:'http://localhost/assets/'});
 const second=await loadCharacterBundle(b,bundle(),{assetRoot:'http://localhost/assets/'});
 assert.deepEqual(second.textures,first.textures);assert.equal(a.values.size,2);assert.equal(b.values.size,0);
});
test('concurrent scene loads serialize and a rejected bundle preserves the first one',async()=>{
 const a=scene(),b=scene();b.textures=a.textures;
 const good=loadCharacterBundle(a,bundle(),{assetRoot:'http://localhost/assets/'});
 const bad=loadCharacterBundle(b,bundle(),{assetRoot:'http://localhost/other-assets/'});
 await good;await assert.rejects(bad,/collision/);assert.equal(a.values.size,2);
});
test('an unrelated loader error cannot roll back valid character textures',async()=>{
 const s=scene({unrelatedError:true});await loadCharacterBundle(s,bundle(),{assetRoot:'http://localhost/assets/'});assert.equal(s.values.size,2);
});
