import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from './helpers/minigame-runtime.mjs';

function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};}
const profile={id:'account1',name:'Viewer',avatar:{}};
const world={scene:'city',restricted:false,position:{x:5050,y:1575},clans:[],buildings:[]};

test('a delayed clan response cannot replace a newer phone application',async()=>{
 const pending=deferred();
 const rt=runtime(path=>{if(path==='/api/base-invitations')return pending.promise;throw Error(`Unexpected ${path}`);});
 rt.context.nextWorld=world;
 rt.run("worldSnapshot=nextWorld;phoneTab='clans';");
 const content=rt.nodes.get('#phone-content')||rt.context.document.querySelector('#phone-content');
 content.insertAdjacentHTML=(_position,html)=>content.innerHTML+=html;
 const task=rt.run('renderClans()');
 rt.run("phoneRevision++;phoneTab='search';");content.innerHTML='<form id="player-search-form">Current search</form>';
 pending.resolve({invitations:[],visits:[]});await task;
 assert.equal(content.innerHTML,'<form id="player-search-form">Current search</form>');
});

test('a delayed phone bootstrap cannot restore the previous account after logout',async()=>{
 const pending=deferred();
 const rt=runtime(path=>{if(path==='/api/bootstrap')return pending.promise;if(path==='/api/world')return world;throw Error(`Unexpected ${path}`);});
 const task=rt.run("openPhone('search')");
 rt.run("closePhone(true);accountRevision++;bootstrap={profile:null,csrf_token:'logout-csrf'};csrf='logout-csrf';worldSnapshot=null;");
 pending.resolve({profile,csrf_token:'old-csrf',lobbies:[]});await task;
 assert.equal(rt.run('bootstrap.profile'),null);
 assert.equal(rt.run('csrf'),'logout-csrf');
 assert.equal(rt.run('worldSnapshot'),null);
 assert.equal(rt.calls.filter(call=>call.path==='/api/world').length,0);
});

test('a delayed world response cannot restore phone state after the screen changes',async()=>{
 const pending=deferred(),entered=deferred();
 const rt=runtime(path=>{if(path==='/api/bootstrap')return{profile,csrf_token:'phone-csrf',lobbies:[]};if(path==='/api/world'){entered.resolve();return pending.promise;}throw Error(`Unexpected ${path}`);});
 const task=rt.run("openPhone('search')");await entered.promise;
 rt.run("setScreen('profile','<form>Character editor</form>');worldSnapshot=null;");
 pending.resolve(world);await task;
 assert.equal(rt.run('worldSnapshot'),null);
 assert.equal(rt.nodes.get('#phone-dialog').open,false);
 assert.equal(rt.run('screen'),'profile');
});

test('a delayed construction request cannot reopen a modal after leaving the city',async()=>{
 const pending=deferred();
 const rt=runtime(path=>{if(path==='/api/world')return pending.promise;throw Error(`Unexpected ${path}`);});
 rt.context.districtHouses=[{id:'base-1',door:{x:10,y:10}}];
 rt.run("screen='home';worldView={getState:()=>({scene:'city',position:{x:10,y:10}}),destroy(){}};");
 const task=rt.run("openConstruction('base-1')");
 rt.run("setScreen('profile','<form>Editor</form>');worldSnapshot=null;");
 pending.resolve({...world,buildings:[{id:'base-1'}]});
 await assert.doesNotReject(task);
 assert.equal(rt.run('worldSnapshot'),null);
 assert.equal(rt.nodes.get('#construction-dialog').open,false);
});

test('a delayed construction request cannot stack its modal over the game menu',async()=>{
 const pending=deferred();
 const rt=runtime(path=>{if(path==='/api/world')return pending.promise;throw Error(`Unexpected ${path}`);});
 rt.context.districtHouses=[{id:'base-1',door:{x:10,y:10}}];
 rt.context.worldMap={design_source:{}};
 rt.run("screen='home';worldView={getState:()=>({scene:'city',position:{x:10,y:10}}),destroy(){}};");
 const task=rt.run("openConstruction('base-1')");rt.run('openGameMenu();');
 pending.resolve({...world,buildings:[{id:'base-1'}]});await task;
 assert.equal(rt.nodes.get('#game-menu-dialog').open,true);
 assert.equal(rt.nodes.get('#construction-dialog').open,false);
});

for(const waitingFor of ['world','clan'])test(`closing the Escape menu cannot restore a construction request waiting for ${waitingFor}`,async()=>{
 const pending=deferred(),entered=deferred(),nextWorld={...world,my_clan:{id:'own-clan'},buildings:[{id:'base-1'}]};
 const rt=runtime(path=>{
  if(path==='/api/world'){if(waitingFor==='world'){entered.resolve();return pending.promise;}return nextWorld;}
  if(path==='/api/clans/own-clan'){entered.resolve();return pending.promise;}
  throw Error(`Unexpected ${path}`);
 });
 rt.context.districtHouses=[{id:'base-1',door:{x:10,y:10}}];rt.context.worldMap={design_source:{}};
 rt.run("screen='home';worldView={getState:()=>({scene:'city',position:{x:10,y:10}}),destroy(){}};");
 const task=rt.run("perform(()=>openConstruction('base-1'))");await entered.promise;
 const escape={key:'Escape',repeat:false,target:{closest(){return null;}},preventDefault(){}};
 for(const listener of rt.documentListeners.get('keydown'))listener(escape);
 assert.equal(rt.nodes.get('#game-menu-dialog').open,true);
 for(const listener of rt.documentListeners.get('keydown'))listener(escape);
 assert.equal(rt.nodes.get('#game-menu-dialog').open,false);
 pending.resolve(waitingFor==='world'?nextWorld:{id:'own-clan',is_leader:true,members:[],base:null});await task;
 assert.equal(rt.nodes.get('#construction-dialog').open,false,'Escape cancellation must survive closing the menu');
 assert.equal(rt.run('worldSnapshot'),null,'the cancelled request must not publish its world data');
});

test('the queued native phone close event does not cancel a valid construction request',async()=>{
 const pending=deferred(),nextWorld={...world,buildings:[{id:'base-1'}]};
 const rt=runtime(path=>{if(path==='/api/world')return pending.promise;throw Error(`Unexpected ${path}`);});
 rt.context.districtHouses=[{id:'base-1',door:{x:10,y:10}}];rt.context.worldMap={design_source:{}};
 rt.run("screen='home';worldView={getState:()=>({scene:'city',position:{x:10,y:10}}),setPhone(){},destroy(){}};phone.open=true;const queuedPhoneClose=phone.close.bind(phone);phone.close=()=>{phone.open=false;};");
 const task=rt.run("openConstruction('base-1')");
 // HTMLDialogElement.close queues its close event; it is not synchronous with
 // the opening request's initial closePhone call in the actual browser.
 rt.run('queuedPhoneClose();');pending.resolve(nextWorld);await task;
 assert.equal(rt.nodes.get('#construction-dialog').open,true);
 assert.equal(rt.run('constructionPlot.id'),'base-1');
});

test('a delayed conversation invitation list cannot replace the next conversation state',async()=>{
 const pending=deferred(),entered=deferred();
 const rt=runtime(path=>{
  if(path==='/api/messages/peer-old')return{peer:{name:'Old peer'},messages:[]};
  if(path==='/api/lobbies/old-room'){entered.resolve();return pending.promise;}
  throw Error(`Unexpected ${path}`);
 });
 rt.run("activePeer='peer-old';phoneTab='conversation';bootstrap.lobbies=[{id:'old-room',state:'waiting',role:'participant'}];");
 const task=rt.run('renderConversation(phoneRevision)');await entered.promise;
 rt.run("phoneRevision++;activePeer='peer-new';phoneInviteRooms=[{id:'new-room'}];");
 pending.resolve({id:'old-room',title:'Old room',player_code:'OLD-CODE',teams:[]});await task;
 assert.equal(rt.run('phoneInviteRooms[0].id'),'new-room');
});

test('a delayed conversation response stops before reading a logged-out account',async()=>{
 const pending=deferred();
 const rt=runtime(path=>{if(path==='/api/messages/peer-old')return pending.promise;throw Error(`Unexpected ${path}`);});
 rt.run("activePeer='peer-old';phoneTab='conversation';");
 const task=rt.run('renderConversation(phoneRevision)');
 rt.run("closePhone(true);accountRevision++;bootstrap={profile:null};activePeer=null;phoneInviteRooms=[];");
 pending.resolve({peer:{name:'Old peer'},messages:[]});await assert.doesNotReject(task);
 assert.equal(rt.calls.length,1);
 assert.equal(rt.run('phoneInviteRooms.length'),0);
});
