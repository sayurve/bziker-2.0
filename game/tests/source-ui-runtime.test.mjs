import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from './helpers/minigame-runtime.mjs';

test('saved joystick side is applied at boot and the real setting persists a new side',()=>{
 const rt=runtime(()=>{throw Error('Control placement needs no server request');},{'bziker.controlLayout':'right'});
 assert.equal(rt.context.document.body.dataset.controlLayout,'right');
 for(const change of rt.documentListeners.get('change'))change({target:{name:'control-layout',value:'left',matches:()=>false,closest:()=>null}});
 assert.equal(rt.context.document.body.dataset.controlLayout,'left');
 assert.equal(rt.storage.get('bziker.controlLayout'),'left');
 assert.equal(rt.calls.length,0);
});

test('joystick settings name the controlling hand and preserve the left/right placement contract',()=>{
 const rt=runtime(()=>{throw Error('Hand preference requires no server request');});
 rt.run('openSettings();');
 const html=rt.nodes.get('#settings-content').innerHTML;
 assert.match(html,/Рука для джойстика/);
 assert.match(html,/<option value="left"[^>]*>Для левой руки \(джойстик слева\)<\/option>/);
 assert.match(html,/<option value="right"[^>]*>Для правой руки \(джойстик справа\)<\/option>/);
});

test('opening Telebzi selects the current account hands and closing restores game controls',async()=>{
 const rt=runtime(path=>{
  if(path==='/api/bootstrap')return{profile:{id:'account1',name:'Viewer',avatar:{gender:1}},csrf_token:'next-csrf',lobbies:[]};
  if(path==='/api/world')return{scene:'city',restricted:false,position:{x:5050,y:1575},wallet:{balance:17}};
  if(path==='/api/phone')return{restricted:false,unread:0,notifications:[],conversations:[]};
  throw Error(`Unexpected route ${path}`);
 });
 rt.run('worldView={setPhone:async value=>phonePoses.push(value),setWallet(){}};');
 rt.context.phonePoses=[];
 await rt.run("openPhone('apps')");
 assert.equal(rt.nodes.get('#phone-dialog').open,true);
 assert.equal(rt.context.document.body.dataset.phoneOpen,'true');
 assert.equal(rt.context.document.body.dataset.phoneHands,'female');
 assert.equal(rt.nodes.get('.source-phone-hands').src,'/assets/design-ui-hands-female.png');
 assert.deepEqual(rt.context.phonePoses,[true]);
 rt.run('closePhone(true)');
 assert.equal(rt.nodes.get('#phone-dialog').open,false);
 assert.equal(rt.context.document.body.dataset.phoneOpen,'false');
 assert.deepEqual(rt.context.phonePoses,[true,false]);
 assert.ok(!rt.calls.some(call=>call.path==='/api/world/move'),'Opening/closing must never teleport the player');
});

test('phone Home returns to apps and then closes without moving or changing the seated player',async()=>{
 const rt=runtime(path=>{
  if(path==='/api/bootstrap')return{profile:{id:'account1',name:'Viewer',avatar:{gender:0}},csrf_token:'next-csrf',lobbies:[]};
  if(path==='/api/world')return{scene:'city',pose:'sit',restricted:false,position:{x:5050,y:1575},wallet:{balance:17}};
  if(path==='/api/phone')return{restricted:false,unread:0,notifications:[],conversations:[]};
  throw Error(`Unexpected route ${path}`);
 });
 rt.context.phonePoses=[];rt.context.phoneHomeTasks=[];
 rt.run('worldView={setPhone:async value=>phonePoses.push(value),setWallet(){}};perform=fn=>phoneHomeTasks.push(fn());');
 await rt.run("openPhone('search')");
 const button={disabled:false,dataset:{action:'phone-back'}};
 const event={target:{closest:selector=>['[data-action]','button'].includes(selector)?button:null},preventDefault(){}};
 async function pressHome(){rt.context.phoneHomeTasks.length=0;for(const click of rt.documentListeners.get('click'))click(event);await Promise.all(rt.context.phoneHomeTasks);}
 await pressHome();
 assert.equal(rt.run('phoneTab'),'apps');assert.equal(rt.nodes.get('#phone-dialog').open,true);
 assert.deepEqual(rt.context.phonePoses,[true]);assert.equal(rt.run('worldSnapshot.pose'),'sit');
 await pressHome();
 assert.equal(rt.nodes.get('#phone-dialog').open,false);assert.deepEqual(rt.context.phonePoses,[true,false]);
 assert.ok(!rt.calls.some(call=>call.path==='/api/world/move'));
});

test('the separate game menu opens settings without a phone pose, teleport or server call',()=>{
 const rt=runtime(()=>{throw Error('Game preferences require no server request');});
 const attributes={};rt.nodes.get('#game-menu-toggle').setAttribute=(key,value)=>attributes[key]=value;
 rt.run("screen='home';openGameMenu();");
 assert.equal(rt.nodes.get('#game-menu-dialog').open,true);
 assert.equal(attributes['aria-expanded'],'true');
 rt.run('openSettings();');
 assert.equal(rt.nodes.get('#game-menu-dialog').open,false);
 assert.equal(rt.nodes.get('#settings-dialog').open,true);
 assert.equal(rt.nodes.get('#phone-dialog').open,false);
 assert.equal(rt.calls.length,0);
});
test('Escape can open the compact game menu and close inventory first without opening it underneath',()=>{
 const rt=runtime(()=>{throw Error('Menu controls require no server request');});
 rt.run("screen='home';");
 const escape={key:'Escape',repeat:false,target:{closest:()=>null},preventDefault(){}};
 for(const keydown of rt.documentListeners.get('keydown'))keydown(escape);
 assert.equal(rt.nodes.get('#game-menu-dialog').open,true);
 rt.run('closeGameMenu();inventoryOpen=true;');
 for(const keydown of rt.documentListeners.get('keydown'))keydown(escape);
 assert.equal(rt.nodes.get('#game-menu-dialog').open,false);
 assert.equal(rt.run('inventoryOpen'),false);
 assert.equal(rt.calls.length,0);
});
