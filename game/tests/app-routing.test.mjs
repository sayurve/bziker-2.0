import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as avatar from '../web/avatar.js';
import * as city from '../web/city-features.js';
import * as cards from '../web/card-games.js';
import * as account from '../web/account-ui.js';
import * as construction from '../web/construction-ui.js';
import * as color from '../web/color-picker.js';
import {houseCatalog,housePreviewSVG} from '../web/house-models.js';
import {profileBuilderHTML,catalogPartSVG,avatarPreviewHTML,catalogHTML as builderCatalogHTML} from '../web/profile-builder.js';
import * as gameplayUI from '../web/gameplay-ui.js';
import * as inventoryUI from '../web/inventory-ui.js';
import * as sourceUI from '../web/source-ui.js';
import * as sourceActors from '../web/source-actors.js';
const sourceWorldMap=JSON.parse(readFileSync(new URL('../web/world-map.json',import.meta.url),'utf8'));

const appSource=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replace(/\ninit\(\);\s*$/,'\n');

function runtime(responder, saved={}, source=appSource) {
  const nodes=new Map(),storage=new Map(Object.entries(saved)),calls=[],requestHeaders=[],events=[],sounds=[],documentListeners=new Map();
  const node=selector=>{
    if(!nodes.has(selector)){
      const classes=new Set(),listeners=new Map();
      nodes.set(selector,{innerHTML:'',textContent:'',hidden:false,open:false,dataset:{},scrollTop:0,
        classList:{add(...values){values.forEach(value=>classes.add(value));},remove(...values){values.forEach(value=>classes.delete(value));},
          contains:value=>classes.has(value),toggle(value){if(classes.has(value)){classes.delete(value);return false;}classes.add(value);return true;}},
        addEventListener(name,callback){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(callback);},
        setAttribute(){},querySelectorAll(){return[];},contains(){return false;},
        close(){this.open=false;(listeners.get('close')||[]).forEach(callback=>callback());},show(){this.open=true;},showModal(){this.open=true;},
        getBoundingClientRect(){return{left:0,right:10,top:0,bottom:10};}});
    }
    return nodes.get(selector);
  };
  const context={...avatar,...city,...cards,...account,...construction,...color,...gameplayUI,...inventoryUI,...sourceUI,...sourceActors,houseCatalog,housePreviewSVG,createGameAudio:()=>({play:name=>sounds.push(name),unlock(){},stop(){}}),notificationDelta:(old,next)=>!!old&&Number(next.unread)>Number(old.unread),profileBuilderHTML,catalogPartSVG,avatarPreviewHTML,builderCatalogHTML,URL,JSON,console,
    document:{querySelector:node,querySelectorAll:()=>[],addEventListener(name,callback){if(!documentListeners.has(name))documentListeners.set(name,[]);documentListeners.get(name).push(callback);},body:{dataset:{}},hidden:false,activeElement:null},
    window:{scrollTo(){},Telegram:null},location:{href:'http://localhost/'},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    readControlLayout:()=>sourceUI.readControlLayout(context.localStorage),
    saveControlLayout:value=>sourceUI.saveControlLayout(value,context.localStorage),
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,matchMedia:()=>({matches:true}),
    mountWorld:()=>null,travelDestinations:[],districtHouses:[],worldMap:sourceWorldMap,crypto:{randomUUID:()=> 'new-nonce'},
    fetch:async(path,options)=>{
      const body=options.body===undefined?undefined:JSON.parse(options.body);
      calls.push({path,body});requestHeaders.push({...options.headers});events.push(path);
      const reply=await responder(path,body);
      return {ok:reply.status===undefined||reply.status<400,status:reply.status??200,json:async()=>reply.data??reply};
    },
    cardGamesPanelHTML:(...args)=>{events.push('render-card-panel');return cards.cardGamesPanelHTML(...args);},
    homeCalls:0,
  };
  vm.createContext(context);vm.runInContext(source,context);
  context.actualHome=vm.runInContext('home',context);
  vm.runInContext(`bootstrap={profile:{id:'account1',name:'Viewer',avatar:{}},lobbies:[]};csrf='test-csrf';
    home=async()=>{homeCalls++;cardSnapshot=null;setScreen('home','<p>City without cached roster</p>');};`,context);
  return {context,nodes,calls,requestHeaders,events,storage,sounds,documentListeners,run:code=>vm.runInContext(code,context)};
}

test('entering the actual city claims control once and phone or repeat home reuses the private token',async()=>{
 const rt=runtime(path=>path==='/api/world/controller'?{controller_token:'private-controller-1'}:path==='/api/world/activity'?phoneResponder('/api/world'):path==='/api/economy'?{balance:0,inventory:[],catalog:[]}:phoneResponder(path));
 rt.context.mountWorld=()=>({destroy(){},setWallet(){},setPhone(){}});
 await rt.context.actualHome();await rt.run("openPhone('apps')");await rt.context.actualHome();
 await rt.run("api('/api/world/activity',{action:'phone',open:true})");
 assert.equal(rt.calls.filter(c=>c.path==='/api/world/controller').length,1);
 const i=rt.calls.findIndex(c=>c.path==='/api/world/activity');
 assert.equal(rt.requestHeaders[i]['X-World-Controller'],'private-controller-1');
 assert.ok(![...rt.storage.values()].some(v=>String(v).includes('private-controller-1')),'A private controller token stays in this page’s memory');
});

test('a stale controller gets an explicit return screen and never automatically reclaims on home or polling',async()=>{
 const rt=runtime(path=>path==='/api/world/controller'?{controller_token:'old-controller'}:path==='/api/world/activity'?{status:409,data:{error:{code:'world_controller_lost',message:'Игра открыта в другой вкладке'}}}:path==='/api/economy'?{balance:0,inventory:[]}:phoneResponder(path));
 let destroyed=0;rt.context.mountWorld=()=>({destroy(){destroyed++;},setWallet(){},setPhone(){}});
 await rt.context.actualHome();
 await assert.rejects(rt.run("api('/api/world/activity',{action:'phone',open:true})"),/другой вкладке/);
 assert.equal(rt.run('screen'),'control-lost');assert.equal(destroyed,1);
 assert.match(rt.nodes.get('#app').innerHTML,/data-action="world-control-return"/);
 assert.doesNotMatch(rt.nodes.get('#app').innerHTML,/old-controller/);
 const count=rt.calls.length;await rt.context.actualHome();await rt.run('poll()');
 await assert.rejects(rt.run("api('/api/world/move',{scene:'city',x:1,y:1})"),/другой вкладке/);
 assert.equal(rt.calls.length,count,'Loss of control must stop writes and background reacquisition');
});

test('an explicit return reacquires control and an account reset drops the previous private token',async()=>{
 let claimCount=0;
 const rt=runtime(path=>path==='/api/world/controller'?{controller_token:`controller-${++claimCount}`}:
  path==='/api/world/activity'?{status:409,data:{error:{code:'world_controller_lost',message:'Игра открыта в другой вкладке'}}}:
  path==='/api/economy'?{balance:0,inventory:[]}:path==='/api/profile'?{id:'account1',name:'Viewer',avatar:{}}:phoneResponder(path));
 rt.context.mountWorld=()=>({destroy(){},setWallet(){},setPhone(){}});await rt.context.actualHome();
 await assert.rejects(rt.run("api('/api/world/activity',{action:'phone',open:true})"));
 await rt.run('returnWorldControl()');assert.equal(claimCount,2);assert.equal(rt.run('worldControlLost'),false);
 rt.run('resetAccountCaches()');
 await rt.run("api('/api/profile',{name:'Viewer',avatar:{}})");
 assert.equal(rt.requestHeaders.at(-1)['X-World-Controller'],undefined);
});

test('a late denial from the previous token cannot switch off an explicitly recovered controller',async()=>{
 let claims=0;const pending=[];
 const rt=runtime(path=>path==='/api/world/controller'?{controller_token:`controller-${++claims}`}:
  path==='/api/world/activity'?new Promise(resolve=>pending.push(resolve)):
  path==='/api/economy'?{balance:0,inventory:[]}:phoneResponder(path));
 rt.context.mountWorld=()=>({destroy(){},setWallet(){},setPhone(){}});await rt.context.actualHome();
 const first=rt.run("api('/api/world/activity',{action:'phone',open:true})"),old=rt.run("api('/api/world/activity',{action:'phone',open:false})");
 const denied={status:409,data:{error:{code:'world_controller_lost',message:'Игра открыта в другой вкладке'}}};
 pending[0](denied);await assert.rejects(first);await rt.run('returnWorldControl()');
 pending[1](denied);await assert.rejects(old);
 assert.equal(rt.run('worldControlLost'),false);assert.equal(rt.run('worldControllerToken'),'controller-2');assert.equal(rt.run('screen'),'home');
 assert.equal(claims,2);
});

test('a controller claim completed after an account reset cannot install the old private token',async()=>{
 let release;const rt=runtime(path=>path==='/api/world/controller'?new Promise(resolve=>{release=resolve;}):phoneResponder(path));
 const claim=rt.run('acquireWorldControl()');rt.run('resetAccountCaches()');
 release({controller_token:'old-account-controller'});await claim;
 assert.equal(rt.run('worldControllerToken'),null);assert.equal(rt.run('worldControllerOwner'),null);
});

test('durable cleanup from an old city mount cannot borrow the recovered controller token',async()=>{
 let claims=0;const mounted=[];
 const rt=runtime(path=>path==='/api/world/controller'?{controller_token:`controller-${++claims}`}:
  path==='/api/world/activity'?phoneResponder('/api/world'):path==='/api/economy'?{balance:0,inventory:[]}:phoneResponder(path));
 rt.context.mountWorld=(_container,options)=>{mounted.push(options);return {destroy(){},setWallet(){},setPhone(){}};};
 await rt.context.actualHome();await rt.run('acquireWorldControl(true);');rt.run("attachCity('city')");
 const count=rt.calls.length;
 await assert.rejects(mounted[0].api('/api/world/activity',{action:'phone',open:false}),/другой вкладке/);
 assert.equal(rt.calls.length,count,'Old durable cleanup must not be sent with the new token');
 await mounted[1].api('/api/world/activity',{action:'phone',open:true});
 assert.equal(rt.requestHeaders.at(-1)['X-World-Controller'],'controller-2');assert.equal(rt.run('worldControlLost'),false);
 mounted[0].onControllerLost();
 assert.equal(rt.run('worldControlLost'),false,'A late loss callback from the discarded generation must not disable the recovered city');
 assert.equal(rt.run('worldControllerToken'),'controller-2');
});

test('first character form waits for both actual native human atlases before rendering previews',async()=>{
 const {createRequire}=await import('node:module'),{fileURLToPath}=await import('node:url'),{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
 const rt=runtime(()=>{throw Error('A new character needs no economy request');}),requested=[];
 let ready;const gate=new Promise(resolve=>{ready=resolve;});
 rt.context.loadSourceActor=async id=>{requested.push(id);await gate;return sourceActors.loadSourceActor(id,{createCanvas,loadImage:path=>loadImage(fileURLToPath(new URL('../'+path,import.meta.url)))});};
 rt.run("bootstrap={authenticated:true,profile:null,lobbies:[]};screen='splash';app.innerHTML='<p>Choose a character</p>';");
 const opening=rt.run('profileForm(false)');
 assert.equal(rt.run('screen'),'splash','Do not install a form filled with legacy fallback previews while native atlases load');
 assert.deepEqual(requested,['human-male','human-female']);
 ready();await opening;assert.equal(rt.run('screen'),'profile');assert.match(rt.nodes.get('#app').innerHTML,/data-art="source-v17"/);
});

test('profile atlas loading retains a nickname typed while the same form is still visible',async()=>{
 const rt=runtime(()=>({balance:0,inventory:[],catalog:[]}));let ready;const gate=new Promise(resolve=>{ready=resolve;});rt.context.loadSourceActor=()=>gate;
 rt.run("screen='profile';$('#avatar-form [name=\"nickname\"]').value='First draft';");
 const opening=rt.run('profileForm(true)');
 rt.run("$('#avatar-form [name=\"nickname\"]').value='Typed during loading';");ready();await opening;
 assert.match(rt.nodes.get('#app').innerHTML,/value="Typed during loading"/);
});

test('an old pending profile opening cannot overwrite a later screen or account',async()=>{
 for(const change of ["setScreen('account','<p>Login</p>')","accountRevision++;bootstrap={profile:{id:'account2',name:'Other',avatar:{}},lobbies:[]};app.innerHTML='<p>Other account</p>'"]){
  const rt=runtime(()=>({balance:0,inventory:[],catalog:[]}));let ready;const gate=new Promise(resolve=>{ready=resolve;});rt.context.loadSourceActor=()=>gate;
  const opening=rt.run('profileForm(true)');rt.run(change);const expected=rt.nodes.get('#app').innerHTML;ready();await opening;
  assert.equal(rt.nodes.get('#app').innerHTML,expected,'Asset completion must not restore the previous account or screen');
 }
});

function cardRoom(runtime) {
  runtime.run(`screen='cards';cardSnapshot={id:'room1',state:'waiting',players:[{id:'p1',name:'Cached private player'}]};
    app.innerHTML='<article>Cached private player</article>';`);
}

test('card polling removes cached roster immediately when world becomes jury restricted',async()=>{
  const rt=runtime(path=>path==='/api/world'?{restricted:true,scene:null,players:[]}:
    {status:403,data:{error:{code:'jury_restricted',message:'Jury duty'}}});
  cardRoom(rt);await rt.run('poll()');
  assert.equal(rt.context.homeCalls,1,'Restricted world must leave the previous card-room surface');
  assert.equal(rt.calls.filter(call=>call.path.startsWith('/api/cards/')).length,0,'No roster read after world blackout');
  assert.doesNotMatch(rt.nodes.get('#app').innerHTML,/Cached private player/);
  assert.equal(rt.run('cardSnapshot'),null);
});

test('card polling clears the old roster when another member causes a card snapshot privacy denial',async()=>{
  const rt=runtime(path=>path==='/api/world'?{restricted:false,scene:'city',players:[]}:
    {status:403,data:{error:{code:'card_unavailable',message:'Room unavailable'}}});
  cardRoom(rt);await rt.run('poll()');
  assert.equal(rt.context.homeCalls,1,'A denied card read must clear previously cached player identities');
  assert.doesNotMatch(rt.nodes.get('#app').innerHTML,/Cached private player/);
  assert.equal(rt.run('cardSnapshot'),null);
});

test('profile and create polling follows a new jury assignment instead of retaining a city editor',async()=>{
  for(const screen of ['profile','create']){
    const rt=runtime(()=>({restricted:true,scene:null,players:[]}));
    rt.run(`screen='${screen}';app.innerHTML='<p>City editor</p>';`);
    await rt.run('poll()');
    assert.equal(rt.context.homeCalls,1,`${screen} must route through the current authorized home state`);
    assert.doesNotMatch(rt.nodes.get('#app').innerHTML,/City editor/);
  }
});

test('opening casino replays a saved spin at zero balance before rendering a new default stake form',async()=>{
  const pending={stake:7,request_id:'saved-lost-response'};
  const rt=runtime(path=>{
    if(path==='/api/economy')return {balance:0,currency:'Бзинге',inventory:[],catalog:[]};
    if(path==='/api/cards')return {tables:[],invitations:[]};
    if(path==='/api/casino/slots')return {...pending,reels:['cherry','lemon','bell'],payout:0,net:-7,balance:0,currency:'Бзинге'};
    throw new Error(`Unexpected route ${path}`);
  },{'bziker:slot-request:account1':JSON.stringify(pending)});
  rt.run(`phoneRevision=1;phoneTab='casino';pendingSlotRequest=null;`);
  await rt.run("renderFeaturePhone('casino',1)");
  const replay=rt.calls.filter(call=>call.path==='/api/casino/slots');
  assert.equal(replay.length,1,'Casino opening must recover the known nonce even when a new spin is unaffordable');
  assert.deepEqual(replay[0].body,pending,'The restored stake and nonce must be sent unchanged');
  assert.ok(rt.events.indexOf('/api/casino/slots')<rt.events.indexOf('render-card-panel'));
  assert.equal(JSON.parse(rt.storage.get('bziker:slot-request:account1')),null);
  assert.match(rt.nodes.get('#slots-result').innerHTML,/Вишня|Лимон|Колокол/);
});

test('a temporarily locked slot replay retains the saved nonce for later recovery',async()=>{
 const pending={stake:7,request_id:'saved-lost-response'};
 const rt=runtime(()=>({status:409,data:{error:{code:'active_card_game',message:'Сначала закончите игру'}}}),{'bziker:slot-request:account1':JSON.stringify(pending)});
 await assert.rejects(rt.run('recoverSlotRequest()'),/Сначала закончите/);
 assert.deepEqual(JSON.parse(rt.storage.get('bziker:slot-request:account1')),pending);
 assert.deepEqual(JSON.parse(rt.run('JSON.stringify(pendingSlotRequest)')),pending);
});

function phoneResponder(path){
  if(path==='/api/bootstrap')return {profile:{id:'account1',name:'Viewer',avatar:{}},lobbies:[],csrf_token:'test-csrf'};
  if(path==='/api/world')return {restricted:false,scene:'city',players:[],wallet:{balance:0,currency:'Бзинге'}};
  if(path==='/api/phone')return {restricted:false,notifications:[],conversations:[],unread:0};
  throw new Error(`Unexpected route ${path}`);
}

test('phone home refreshes its balance from the current world without losing inventory',async()=>{
 const rt=runtime(path=>path==='/api/world'?{restricted:false,scene:'city',players:[],wallet:{balance:65,currency:'Бзинге'}}:phoneResponder(path));
 rt.run("updateWallet({balance:100,inventory:[{item_id:'coffee',quantity:1}],catalog:[]})");
 await rt.run("openPhone('apps')");
 assert.equal(rt.run('economySnapshot.balance'),65);
 assert.equal(rt.run('economySnapshot.inventory[0].item_id'),'coffee');
 assert.match(rt.nodes.get('#phone-wallet').innerHTML,/>65</);
});

test('an older phone opening cannot overwrite a newer wallet update',async()=>{
 let release;
 const rt=runtime(path=>path==='/api/world'?new Promise(resolve=>{release=resolve;}):phoneResponder(path));
 rt.run('updateWallet({balance:100,inventory:[]})');
 const opening=rt.run("openPhone('apps')");
 while(!release)await Promise.resolve();
 rt.run("updateWallet({balance:40,inventory:[{item_id:'snack',quantity:1}]})");
 release({restricted:false,scene:'city',players:[],wallet:{balance:65,currency:'Бзинге'}});await opening;
 assert.equal(rt.run('economySnapshot.balance'),40);
 assert.equal(rt.run('economySnapshot.inventory[0].item_id'),'snack');
});

test('private card creation reads deck ownership from the current server inventory',async()=>{
 for(const [inventory,enabled] of [[[],false],[[{item_id:'cards',quantity:0}],false],[[{item_id:'cards',quantity:1}],true]]){
  const rt=runtime(path=>path==='/api/economy'?{balance:90,inventory}:path==='/api/cards'?{tables:[],invitations:[]}:null);
  rt.run("phoneRevision=1;phoneTab='cards'");
  await rt.run("renderFeaturePhone('cards',1)");
  const html=rt.nodes.get('#phone-content').innerHTML;
  assert.equal(/<button type="submit"[^>]*disabled/.test(html),!enabled);
 }
});

async function reopenClosingPhone(source=appSource){
  const rt=runtime(phoneResponder,{},source);
  rt.context.matchMedia=()=>({matches:false});rt.context.poseRequests=[];
  rt.run(`phone.open=true;worldView={setPhone:async value=>poseRequests.push(value),setWallet(){}};closePhone();`);
  await rt.run("openPhone('apps')");
  return rt;
}

test('reopening the still-visible closing phone restores its server-visible phone pose',async()=>{
  const rt=await reopenClosingPhone();
  assert.deepEqual(rt.context.poseRequests,[false,true]);
  assert.equal(rt.nodes.get('#phone-dialog').open,true);
  assert.equal(rt.nodes.get('#phone-dialog').classList.contains('closing'),false);
});

test('closing an expanded phone restores the compact default for its next opening',()=>{
  const rt=runtime(phoneResponder);
  rt.run("phone.open=true;phone.classList.add('expanded');closePhone(true)");
  assert.equal(rt.nodes.get('#phone-dialog').open,false);
  assert.equal(rt.nodes.get('#phone-dialog').classList.contains('expanded'),false);
});

test('complex phone search expands on navigation and apps return to compact mode',async()=>{
 const rt=runtime(phoneResponder);rt.run('pollPhone=async()=>{};');
 await rt.run("openPhone('search')");
 assert.equal(rt.nodes.get('#phone-dialog').classList.contains('expanded'),true);
 await rt.run("openPhone('apps')");
 assert.equal(rt.nodes.get('#phone-dialog').classList.contains('expanded'),false);
 assert.match(rt.nodes.get('#phone-content').innerHTML,/Общение/);
});

test('world inventory opens a separate bag without phone pose or position changes',async()=>{
 const rt=runtime(path=>path==='/api/economy'?{balance:40,inventory:[]}:phoneResponder(path));
 rt.context.pauseCalls=[];rt.context.phoneCalls=[];
 rt.context.mountWorld=(_container,options)=>{rt.context.worldOptions=options;return{setWallet(){},setPhone(open){rt.context.phoneCalls.push(open);},setInventory(open){rt.context.pauseCalls.push(open);}};};
 rt.run('screen="home";attachCity("city")');
 assert.equal(typeof rt.context.worldOptions.onInventory,'function');
 await rt.context.worldOptions.onInventory();
 assert.equal(rt.nodes.get('#phone-dialog').open,false);
 assert.equal(rt.nodes.get('#inventory-drawer').hidden,false);
 assert.deepEqual(rt.context.phoneCalls,[]);assert.deepEqual(rt.context.pauseCalls,[true]);
 assert.equal(rt.calls.some(call=>call.path==='/api/world/move'||call.path==='/api/world/activity'),false);
});

test('phone inventory app closes the phone and redirects to a10slot bag',async()=>{
 const rt=runtime(path=>path==='/api/economy'?{balance:40,inventory:[]}:phoneResponder(path));
 rt.context.phoneCalls=[];rt.run('screen="home";phone.open=true;worldView={setWallet(){},setInventory(){},setPhone(open){phoneCalls.push(open);}};');
 await rt.run("openPhone('inventory')");
 assert.equal(rt.nodes.get('#phone-dialog').open,false);
 assert.equal(rt.nodes.get('#inventory-drawer').hidden,false);
 assert.deepEqual(rt.context.phoneCalls,[false]);
 assert.equal((rt.nodes.get('#inventory-drawer').innerHTML.match(/<button[^>]*class="inventory-slot[ "]/g)||[]).length,10);
});

test('slot taps select locally and require a separate explicit use action',async()=>{
 const rt=runtime(path=>path==='/api/economy'?{inventory:[{item_id:'coffee',quantity:2,item:{name:'Кофе',kind:'food'}}]}:phoneResponder(path));
 rt.run('screen="home";worldView={setWallet(){},setInventory(){}};');await rt.run('openInventory()');
 const before=rt.calls.length,handler=rt.documentListeners.get('click').at(-1);
 handler({target:{closest:()=>({dataset:{action:'inventory-select',item:'coffee'},disabled:false})}});
 assert.equal(rt.run('inventorySelected'),'coffee');assert.equal(rt.calls.length,before);
 assert.match(rt.nodes.get('#inventory-drawer').innerHTML,/data-action="inventory-use" data-item="coffee"/);
 rt.run('closeInventory()');assert.equal(rt.nodes.get('#inventory-drawer').hidden,true);
});

test('a late inventory read cannot reopen a closed drawer',async()=>{
 let release;const rt=runtime(()=>new Promise(resolve=>{release=resolve;}));
 rt.context.pauseCalls=[];rt.run('screen="home";worldView={setWallet(){},setInventory(open){pauseCalls.push(open);}};');
 const pending=rt.run('openInventory()');while(!release)await Promise.resolve();rt.run('closeInventory()');
 release({inventory:[{item_id:'coffee',quantity:2,item:{name:'Кофе',kind:'food'}}]});await pending;
 assert.equal(rt.run('inventoryOpen'),false);assert.equal(rt.nodes.get('#inventory-drawer').hidden,true);
 assert.deepEqual(rt.context.pauseCalls,[true,false]);
});

test('inventory use stays disabled until the current world position is confirmed',async()=>{
 let flush;const economy={inventory:[{item_id:'cigarette',quantity:2,item:{name:'Сигарета',kind:'consumable'}}]};
 const rt=runtime(()=>economy);rt.context.testEconomy=economy;
 rt.context.confirmPosition=()=>new Promise(resolve=>{flush=resolve;});
 rt.run('screen="home";worldView={setWallet(){},setInventory(open){if(open)return confirmPosition();}};updateWallet(testEconomy);inventorySelected="cigarette";');
 const pending=rt.run('openInventory()');
 assert.equal(rt.run('inventoryBusy'),true);
 assert.match(rt.nodes.get('#inventory-drawer').innerHTML,/data-action="inventory-use" data-item="cigarette" disabled/);
 assert.equal(rt.calls.length,0,'Economy read waits for the authoritative position update');
 flush();await pending;
 assert.equal(rt.run('inventoryBusy'),false);
 assert.doesNotMatch(rt.nodes.get('#inventory-drawer').innerHTML,/data-action="inventory-use" data-item="cigarette" disabled/);
});

test('closing during position confirmation cancels the later bag opening and economy read',async()=>{
 let flush;const rt=runtime(()=>({inventory:[]}));
 rt.context.confirmPosition=()=>new Promise(resolve=>{flush=resolve;});
 rt.run('screen="home";worldView={setWallet(){},setInventory(open){if(open)return confirmPosition();}};');
 const pending=rt.run('openInventory()');rt.run('closeInventory()');flush();await pending;
 assert.equal(rt.run('inventoryOpen'),false);assert.equal(rt.nodes.get('#inventory-drawer').hidden,true);
 assert.equal(rt.calls.length,0);
});

test('using a selected bag item updates its stack and never changes the phone pose',async()=>{
 const inventory=quantity=>({inventory:quantity?[{item_id:'coffee',quantity,item:{name:'Кофе',kind:'food'}}]:[]});
 const rt=runtime(path=>path==='/api/economy'?inventory(2):path==='/api/inventory/use'?inventory(1):phoneResponder(path));
 rt.context.phoneCalls=[];rt.run('screen="home";worldView={setWallet(){},setInventory(){},setPhone(open){phoneCalls.push(open);},async refresh(){}};');
 await rt.run('openInventory()');rt.run('inventorySelected="coffee";renderInventory();');
 await rt.run('handleCityAction({dataset:{action:"inventory-use",item:"coffee"}})');
 assert.equal(rt.calls.filter(call=>call.path==='/api/inventory/use').length,1);
 assert.match(rt.nodes.get('#inventory-drawer').innerHTML,/Количество: 1/);
 assert.equal(rt.run('inventorySelected'),'coffee');assert.deepEqual(rt.context.phoneCalls,[]);
});

test('a denied inventory refresh clears the cached drawer',async()=>{
 const rt=runtime(()=>({status:403,data:{error:{code:'jury_restricted',message:'Сначала завершите оценку'}}}));
 rt.run('screen="home";worldView={setWallet(){},setInventory(){}};');
 await assert.rejects(rt.run('openInventory()'),/Сначала завершите/);
 assert.equal(rt.run('inventoryOpen'),false);assert.equal(rt.nodes.get('#inventory-drawer').hidden,true);
});

test('avatar direction click updates the image while preserving profile values and nickname',()=>{
 const rt=runtime(()=>({}));rt.nodes.set('#avatar-form [name="nickname"]',{value:'ГлавныйНик'});
 rt.run("avatar={...defaultAvatar,hairStyle:7};avatarFacing='down';");
 const handler=rt.documentListeners.get('click').at(-1);
 handler({target:{closest:()=>({dataset:{action:'avatar-view',facing:'left'},disabled:false})}});
 assert.equal(rt.run('avatarFacing'),'left');
 assert.equal(rt.run('avatar.hairStyle'),7);
 assert.match(rt.nodes.get('#avatar-preview').innerHTML,/id="nickname-preview">ГлавныйНик/);
 assert.match(rt.nodes.get('#avatar-preview').innerHTML,/data-facing="left"[^>]*aria-pressed="true"/);
});

test('claim keeps the returned profile and rotates CSRF without storing a password',async()=>{
 const rt=runtime(path=>path==='/api/account/claim'?{authenticated:true,csrf_token:'new-csrf',account:{has_credentials:true},profile:{id:'account1',name:'Viewer',avatar:{}},lobbies:[]}:path==='/api/world/controller'?{controller_token:'claimed-account-controller'}:path==='/api/world'?{restricted:false,scene:'city'}:null);
 rt.run("accountMode='claim';lastSlotResult={balance:7777};activePeer='previous-peer';");
 await rt.run("submitAccount({login:'Viewer',password:'abcdefgh',confirm_password:'abcdefgh'})");
 assert.equal(rt.calls[0].path,'/api/account/claim');assert.equal(rt.run('csrf'),'new-csrf');
 assert.equal(rt.run('bootstrap.profile.id'),'account1');assert.equal(rt.context.homeCalls,1);
 assert.equal(rt.run('lastSlotResult'),null);assert.equal(rt.run('activePeer'),null);
 assert.equal([...rt.storage.values()].some(value=>value.includes('abcdefgh')),false);
});

test('invalid confirmation never submits and failed login keeps the form usable',async()=>{
 const rt=runtime(()=>({status:401,data:{error:{code:'invalid_credentials',message:'Неверные данные входа'}}}));
 rt.run("accountMode='register'");await rt.run("submitAccount({login:'viewer',password:'abcdefgh',confirm_password:'different'})");
 assert.equal(rt.calls.length,0);assert.match(rt.nodes.get('#account-error').textContent,/не совпадают/);
 rt.run("accountMode='login'");await rt.run("submitAccount({login:'viewer',password:'abcdefgh'})");
 assert.equal(rt.nodes.get('#account-error').hidden,false);assert.match(rt.nodes.get('#account-error').textContent,/Неверные/);
 assert.equal(rt.context.homeCalls,0);
});

test('Durak defense reads the selected public pair outside the hand form',async()=>{
 const rt=runtime(()=>({id:'room1',state:'playing'}));
 rt.run("cardSnapshot={id:'room1',state:'playing'};renderCardTable=()=>{};");
 rt.nodes.set('#durak-action-form [name="card_index"]:checked',{value:'2'});
 rt.nodes.set('.durak-pairs [name="attack_index"]:checked',{value:'1'});
 const original=rt.context.document.querySelector;
 rt.context.document.querySelector=selector=>selector==='#durak-action-form [name="attack_index"]:checked'?null:original(selector);
 await rt.run("handleCityAction({dataset:{action:'card-durak-defend'}})");
 assert.deepEqual(rt.calls[0],{path:'/api/cards/room1/act',body:{move:'defend',card_index:2,attack_index:1}});
});

test('construction sends the chosen fixed exterior once and retains the world position',async()=>{
 const rt=runtime(path=>path.includes('/building')?{id:'clan1',base:{building_id:'base-1'}}:{my_clan:{id:'clan1'}});
 rt.run(`screen='home';constructionOwn={id:'clan1',is_leader:true,members:[{},{},{},{}],base:{building_id:null}};constructionPlot={id:'base-1',door:{x:100,y:100}};worldView={getState:()=>({scene:'city',position:{x:100,y:124}}),refresh:async()=>{}};`);
 await rt.run(`submitConstruction({building_id:'base-1',exterior_style:'5',exterior_color:'#b697d7'})`);
 assert.deepEqual(rt.calls[0].body,{building_id:'base-1',exterior_style:5,exterior_color:'#b697d7'});
 assert.ok(rt.sounds.includes('success'));
 assert.equal(rt.calls.filter(c=>c.path==='/api/world/move').length,0);
});

test('insufficient clan members do not send a construction request or a success cue',async()=>{
 const rt=runtime(()=>{throw Error('Unexpected request');});
 rt.run(`constructionOwn={id:'clan1',is_leader:true,members:[{},{},{}],base:{}};constructionPlot={id:'base-1',door:{x:100,y:100}};worldView={getState:()=>({scene:'city',position:{x:100,y:124}})};`);
 await assert.rejects(rt.run(`submitConstruction({building_id:'base-1',exterior_style:'0',exterior_color:'#faf8f2'})`),/четыре/);
 assert.equal(rt.calls.length,0);assert.equal(rt.sounds.length,0);
});

test('payment cue is emitted after a successful shop response and never after a rejected purchase',async()=>{
 const ok=runtime(()=>({balance:40}));
 await ok.run(`handleCityAction({dataset:{action:'shop-buy',item:'apple'}})`);
 assert.ok(ok.sounds.includes('pay'));
 const denied=runtime(()=>({status:409,data:{error:{code:'balance',message:'Недостаточно средств'}}}));
 await assert.rejects(denied.run(`handleCityAction({dataset:{action:'shop-buy',item:'apple'}})`),/Недостаточно/);
 assert.equal(denied.sounds.includes('pay'),false);
});

test('new messages can notify while the phone is closed, repeated snapshots stay quiet',async()=>{
 const rt=runtime(()=>({unread:2,notifications:[],conversations:[]}));
 rt.run(`screen='home';phoneData={unread:1};`);await rt.run('poll()');
 assert.equal(rt.sounds.filter(s=>s==='notify').length,1);
 rt.run('lastNotificationPoll=0');await rt.run('poll()');
 assert.equal(rt.sounds.filter(s=>s==='notify').length,1);
});

test('world interaction failures become a visible notice rather than an unhandled promise',async()=>{
 const rt=runtime(()=>({status:409,data:{error:{code:'missing_item',message:'Предмет отсутствует в инвентаре'}}}));
 rt.context.mountWorld=(_container,options)=>{rt.context.worldOptions=options;return{setWallet(){}};};
 rt.run('attachCity("city")');
 await rt.context.worldOptions.onInteract('trash-bin',{target_id:'bin-1'});
 assert.match(rt.nodes.get('#notice').textContent,/Предмет отсутствует/);
 assert.ok(rt.sounds.includes('error'));
});

test('pet interaction refreshes the authoritative effect without duplicating its animal sound',async()=>{
 const rt=runtime(()=>({balance:15,pet_effect:{id:'e1',kind:'cat'}}));
 rt.run('refreshCalls=0;worldView={setWallet(){},async refresh(){refreshCalls++;}};');
 await rt.run("worldInteraction('pet-cat',{target_id:'park-cat'})");
 assert.deepEqual(rt.calls[0].body,{action:'pet-cat',target_id:'park-cat'});
 assert.equal(rt.run('refreshCalls'),1);
 assert.equal(rt.sounds.length,0,'World plays each new pet event once');
 assert.equal(rt.nodes.get('#notice')?.textContent||'','', 'Petting reacts in the world without a confirmation toast');
 const denied=runtime(()=>({status:409,data:{error:{code:'activity_distance',message:'Подойдите ближе'}}}));
 denied.run('refreshCalls=0;worldView={setWallet(){},async refresh(){refreshCalls++;}};');
 await assert.rejects(denied.run("worldInteraction('pet',{target_id:'pet-dog'})"),/Подойдите/);
 assert.equal(denied.run('refreshCalls'),0);assert.equal(denied.sounds.length,0);
});

test('unavailable screen pipette enters local preview sampling without changing colour',async()=>{
 const rt=runtime(()=>({}));
 await rt.run('constructionEyedropper()');
 assert.equal(rt.nodes.get('#construction-preview').dataset.sampling,'true');
 assert.match(rt.nodes.get('#house-color-hint').textContent,/Коснитесь/);
 assert.equal(rt.calls.length,0);
});

test('screen pipette keeps preview sampling available while browser picker is pending',async()=>{
 const rt=runtime(()=>({}));let release;
 rt.context.window.EyeDropper=class {open(){return new Promise(resolve=>{release=resolve;});}};
 const pending=rt.run('constructionEyedropper()');
 assert.equal(rt.nodes.get('#construction-preview').dataset.sampling,'true');
 assert.match(rt.nodes.get('#house-color-hint').textContent,/Коснитесь/);
 release({sRGBHex:null});await pending;
 assert.equal(rt.nodes.get('#construction-preview').dataset.sampling,'true');
});

test('browser picker failure leaves local colour sampling usable',async()=>{
 const rt=runtime(()=>({}));
 rt.context.window.EyeDropper=class {async open(){throw new Error('Picker unavailable');}};
 await rt.run('constructionEyedropper()');
 assert.equal(rt.nodes.get('#construction-preview').dataset.sampling,'true');
 assert.match(rt.nodes.get('#house-color-hint').textContent,/Коснитесь/);
});

test('a pending browser pipette does not lock closing the house catalogue',async()=>{
 const rt=runtime(()=>({}));let release;
 rt.context.window.EyeDropper=class {open(){return new Promise(resolve=>{release=resolve;});}};
 const handler=rt.documentListeners.get('click').at(-1);
 const event=action=>({target:{closest:()=>({dataset:{action},disabled:false})}});
 handler(event('house-eyedropper'));
 assert.equal(rt.run('mutationBusy'),false,'An optional browser picker must not hold the gameplay mutation lock');
 rt.nodes.get('#construction-dialog').open=true;
 handler(event('close-construction'));
 assert.equal(rt.nodes.get('#construction-dialog').open,false);
 release({sRGBHex:null});
});

test('sampling a model colour prevents the label from changing the chosen house style',async()=>{
 const rt=runtime(()=>({})),native={value:'#faf8f2'},hex={value:'#faf8f2'};
 rt.nodes.set('#construction-form',{contains:()=>true,querySelector:selector=>selector.includes('house-color-hex')?hex:native,querySelectorAll:()=>[]});
 rt.context.FormData=class {[Symbol.iterator](){return [['exterior_style','0'],['exterior_color',native.value]][Symbol.iterator]();}};
 await rt.run('constructionEyedropper()');
 let prevented=false;
 rt.documentListeners.get('click')[0]({target:{closest:()=>({}),getAttribute:()=> '#486bb0'},preventDefault(){prevented=true;}});
 assert.equal(prevented,true,'Colour sampling must cancel radio-label activation');
 assert.equal(native.value,'#486bb0');assert.equal(hex.value,'#486bb0');
 assert.equal(rt.nodes.get('#construction-preview').dataset.sampling,'false');
});

test('sampling a translucent highlight keeps house style and colour unchanged',async()=>{
 const rt=runtime(()=>({}));
 rt.nodes.set('#construction-form',{contains:()=>true});
 await rt.run('constructionEyedropper()');let prevented=false;
 rt.documentListeners.get('click')[0]({target:{closest:()=>({}),getAttribute:()=> '#ffffff50'},preventDefault(){prevented=true;}});
 assert.equal(prevented,true,'An unsupported highlight must not activate its model label');
 assert.equal(rt.nodes.get('#construction-preview').dataset.sampling,'true');
 assert.equal(rt.nodes.get('#construction-preview').innerHTML,'');
});

test('a late screen colour cannot repaint a newly opened house catalogue',async()=>{
 const rt=runtime(()=>({}));let release;
 rt.context.window.EyeDropper=class {open(){return new Promise(resolve=>{release=resolve;});}};
 const native={value:'#faf8f2'},hex={value:'#faf8f2'};
 const form=()=>({querySelector:selector=>selector.includes('house-color-hex')?hex:native,querySelectorAll:()=>[]});
 rt.nodes.set('#construction-form',form());rt.nodes.get('#construction-dialog').open=true;
 rt.context.FormData=class {[Symbol.iterator](){return [['exterior_style','0'],['exterior_color',native.value]][Symbol.iterator]();}};
 const pending=rt.run('constructionEyedropper()');
 rt.nodes.set('#construction-form',form());native.value=hex.value='#486bb0';
 release({sRGBHex:'#3ac891'});await pending;
 assert.equal(native.value,'#486bb0');assert.equal(hex.value,'#486bb0');
});

test('custom RGB synchronizes native and HEX values and invalid partial input retains preview',()=>{
 const rt=runtime(()=>({})),native={value:'#faf8f2'},hex={value:'#faf8f2'},pressed=[];
 const form={querySelector:selector=>selector.includes('house-color-hex')?hex:native,querySelectorAll:selector=>selector.includes('house-color')?[{dataset:{color:'#3ac891'},setAttribute:(_key,value)=>pressed.push(value)}]:[]};
 rt.nodes.set('#construction-form',form);
 rt.context.FormData=class {constructor(){this.entries=[['exterior_style','0'],['exterior_color',native.value]];}[Symbol.iterator](){return this.entries[Symbol.iterator]();}};
 assert.equal(rt.run("setConstructionColor('#3AC891')"),true);
 assert.equal(native.value,'#3ac891');assert.equal(hex.value,'#3ac891');
 assert.match(rt.nodes.get('#construction-preview').innerHTML,/#3ac891/);
 assert.deepEqual(pressed,['true']);
 const previous=rt.nodes.get('#construction-preview').innerHTML;
 assert.equal(rt.run("setConstructionColor('#3a')"),false);
 assert.equal(native.value,'#3ac891');assert.equal(rt.nodes.get('#construction-preview').innerHTML,previous);
});

test('resetting account state invalidates an already pending economy read',async()=>{
 let release;
 const rt=runtime(()=>new Promise(resolve=>{release=resolve;}));
 const old=rt.run('refreshEconomy()');
 rt.run('resetAccountCaches()');
 release({balance:20});await old;
 assert.equal(rt.run('economySnapshot'),null,'A prior account lifecycle must not repopulate a cleared wallet');
});

test('world diagnostics are off normally and enabled only by the explicit local URL flag',()=>{
 for(const enabled of [false,true]){
  const rt=runtime(()=>({}));
  rt.context.location.href=`http://localhost/${enabled?'?diagnostics=1':''}`;
  rt.context.mountWorld=(_container,options)=>{rt.context.worldOptions=options;return{setWallet(){}};};
  rt.run('attachCity("city")');
  assert.equal(rt.context.worldOptions.diagnostics,enabled);
 }
});

test('a late recovered spin cannot replace another account request or result',async()=>{
 let release;
 const pending={stake:7,request_id:'account1-pending'};
 const rt=runtime(()=>new Promise(resolve=>{release=resolve;}),{'bziker:slot-request:account1':JSON.stringify(pending)});
 const old=rt.run('recoverSlotRequest()');
 rt.run("resetAccountCaches();bootstrap.profile.id='account2';pendingSlotRequest={stake:3,request_id:'account2-pending'};");
 rt.storage.set('bziker:slot-request:account2',JSON.stringify({stake:3,request_id:'account2-pending'}));
 release({balance:123,payout:35});await old;
 assert.equal(rt.run('lastSlotResult'),null);
 assert.equal(rt.run('pendingSlotRequest.request_id'),'account2-pending');
 assert.equal(JSON.parse(rt.storage.get('bziker:slot-request:account2')).request_id,'account2-pending');
 assert.equal(JSON.parse(rt.storage.get('bziker:slot-request:account1')),null,'Completed old per-account nonce may be retired safely');
});

test('a late recovered spin cannot discard a newer nonce after re-entering the same account',async()=>{
 let release;
 const pending={stake:7,request_id:'old-lifecycle'};
 const rt=runtime(()=>new Promise(resolve=>{release=resolve;}),{'bziker:slot-request:account1':JSON.stringify(pending)});
 const old=rt.run('recoverSlotRequest()');
 rt.run("resetAccountCaches();pendingSlotRequest={stake:3,request_id:'new-lifecycle'};");
 rt.storage.set('bziker:slot-request:account1',JSON.stringify({stake:3,request_id:'new-lifecycle'}));
 release({balance:123,payout:35});await old;
 assert.equal(rt.run('lastSlotResult'),null);
 assert.equal(rt.run('pendingSlotRequest.request_id'),'new-lifecycle');
 assert.equal(JSON.parse(rt.storage.get('bziker:slot-request:account1')).request_id,'new-lifecycle');
});

test('the built house catalogue starts with its actual model and saved custom colour',async()=>{
 const own={id:'clan1',is_leader:true,members:[{}],base:{building_id:'base-1',exterior_style:5,exterior_color:'#FF8562'}};
 const rt=runtime(path=>path==='/api/world'?{my_clan:own,buildings:[{id:'base-1'}]}:own);
 rt.context.districtHouses=[{id:'base-1',door:{x:100,y:100}}];
 rt.run("screen='home';worldView={getState:()=>({scene:'base',position:{x:600,y:670}})};");
 await rt.run("openConstruction('base-1')");
 const html=rt.nodes.get('#construction-content').innerHTML;
 assert.match(html,/name="exterior_style" value="5" checked/);
 assert.match(html,/name="exterior_color" value="#ff8562"/);
 assert.match(html,/type="submit" disabled>Построить/,'A preview must not unlock a built facade');
 assert.doesNotMatch(html,/внешний фасад здесь не меняется/,'modular houses use their chosen native model and facade colour');
});
