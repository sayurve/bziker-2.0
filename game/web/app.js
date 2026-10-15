import {parts,defaultAvatar,shuffleAvatar,avatarSVG,avatarPresets,lobbySurface,shouldTakeoff,answerCaption,profileAvatar,worldArenaLobby,canFollowArena,headgearSVG,mascotCoinSVG,worldCardTable} from './avatar.js';
import {mountWorld,travelDestinations,districtHouses,worldMap} from './world.js';
import {createGameAudio,notificationDelta} from './audio.js';
import {normalizeHouseColor,pickScreenColor,previewElementColor} from './color-picker.js';
import {constructionEligibility,constructionHTML,constructionPayload} from './construction-ui.js';
import {houseCatalog,housePreviewSVG} from './house-models.js';
import {cityPhoneHTML,outfitUnlocked,baseInvitationsHTML,baseVisitsHTML} from './city-features.js';
import {cardGamesPanelHTML,cardTableHTML,slotResultHTML} from './card-games.js';
import {profileBuilderHTML,avatarPreviewHTML,catalogPartSVG,catalogHTML as builderCatalogHTML} from './profile-builder.js';
import {phoneAppsHTML,phoneNeedsExpansion,inventoryIconsHTML,lobbyCreateHTML,skySceneHTML,resultsPodiumHTML} from './gameplay-ui.js';
import {bagItems,inventoryHTML} from './inventory-ui.js';
import {accountGate,accountFormHTML,accountCredentials,accountSettingsHTML} from './account-ui.js';
import {sourceLoadingHTML,sourceSplashHTML,readControlLayout,saveControlLayout,setSourcePhoneState,togglePasswordVisibility,sourceUIAsset,preloadSourceUI} from './source-ui.js';
import {loadSourceActor} from './source-actors.js';
// PHONE_STATE_HELPERS_START
export function normalizeViewSettings(input={}){const zoom=Number(input.zoom);return {zoom:Number.isFinite(zoom)?Math.max(.8,Math.min(1.6,zoom)):1.25,showNicknames:input.showNicknames!==false,lightingMode:['day','night'].includes(input.lightingMode)?input.lightingMode:'auto'};}
export function phoneCanPoll({open,hidden,restricted,tab}){return Boolean(open&&!hidden&&!restricted&&['apps','messages','search','conversation','friends','cards','casino','smoking','wallet','quests','fishing'].includes(tab));}
export function messageDraftKey(sender,peer){return `bziker:message:${sender}:${peer}`;}
export function initialCityScene(snapshot){if(snapshot?.restricted)return 'city';if(snapshot?.scene==='base')return 'base';if(snapshot?.scene==='interior'&&snapshot.restricted===false&&typeof snapshot.interior_id==='string'&&snapshot.interior_id&&snapshot.interior?.id===snapshot.interior_id)return 'interior';return 'city';}
// PHONE_STATE_HELPERS_END
const app=document.querySelector('#app');
app.setAttribute('aria-busy','false');
app.innerHTML=sourceLoadingHTML();
document.body.dataset.controlLayout=readControlLayout();
preloadSourceUI();
const dialog=document.querySelector('#grade-dialog');
const escape=(value)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=(selector)=>document.querySelector(selector);
const states={waiting:'Сбор игроков',choosing:'Выбор задания',answering:'Приём ответов',reviewing:'Оценка кураторов',finished:'Игра завершена'};
let bootstrap=null,snapshot=null,screen='loading',signature='',csrf='',pollBusy=false,mutationBusy=false,selectedCard=null,selectedGrade=null,avatar={...defaultAvatar},profileStep='name',editing=false;
let activePerformCount=0;
let mutationEpoch=0, worldView=null, worldSnapshot=null, phoneTab='apps', arenaLobby=null, lastLobby=null, pendingArena=null, arenaRouting=false;
let economySnapshot=null,economyRevision=0,accountRevision=0,cardSnapshot=null,cardSignature='',cardRouting=false,pendingCard=null,lastSlotResult=null,pendingSlotRequest=null;
let soundEnabled=stored('bziker:sound')!=='off';
let soundVolume=Math.max(0,Math.min(1,Number(stored('bziker:volume')??.65)));
const gameAudio=createGameAudio({isEnabled:()=>soundEnabled,isHidden:()=>document.hidden,volume:()=>soundVolume});
let lastNotificationPoll=0;
const phone=document.querySelector('#phone-dialog');
const settingsDialog=document.querySelector('#settings-dialog');
const gameMenu=document.querySelector('#game-menu-dialog');
const constructionDialog=document.querySelector('#construction-dialog');
let constructionPlot=null,constructionOwn=null,constructionRevision=0;
let viewSettings=normalizeViewSettings({zoom:stored('bziker:zoom')??1.25,showNicknames:stored('bziker:nicknames')!=='off',lightingMode:stored('bziker:lighting')});
let accountMode='register',genderExpanded=true,profileRenderEpoch=0;
let fishingSpot=null;
let avatarFacing='down',inventoryOpen=false,inventorySelected=null,inventoryBusy=false,inventoryRevision=0;
let catalogCategory='hair',phoneRevision=0,phoneTimer=null,phonePollBusy=false,phoneClosing=null,activePeer=null,phoneData=null,suggestedBuilding=null,phoneInviteRooms=[];
let worldControllerToken=null,worldControllerOwner=null,worldControllerPending=null,worldControlLost=false;
function worldControlError(){const error=new Error('Игра открыта в другой вкладке. Вернитесь в город, чтобы продолжить здесь.');error.code='world_controller_lost';error.status=409;return error;}
function worldControlLostScreen(){setScreen('control-lost','<section class="waiting panel"><h1>Игра открыта в другой вкладке</h1><p>Персонажем сейчас управляет другая вкладка. Ваш прогресс сохранён.</p><button class="primary wide" data-action="world-control-return">Вернуться в город здесь</button></section>');}
function loseWorldControl(){
 if(worldControlLost)return;
 worldControlLost=true;worldControllerToken=null;worldControllerOwner=null;worldControllerPending=null;mutationEpoch++;phoneRevision++;inventoryRevision++;
 pendingArena=null;pendingCard=null;stopPhonePolling();
 // Destroy before closing overlays: stale cleanup must not close the new
 // controller's phone or overwrite its pose.
 worldView?.destroy();worldView=null;worldControlLostScreen();
}
async function acquireWorldControl(explicit=false){
 const owner=bootstrap?.profile?.id;if(!owner)return;
 if(worldControlLost&&!explicit)throw worldControlError();
 if(worldControllerToken&&worldControllerOwner===owner&&!explicit)return worldControllerToken;
 if(worldControllerPending?.owner===owner)return worldControllerPending.promise;
 const revision=accountRevision,pending={owner,promise:null};
 pending.promise=(async()=>{
  const result=await api('/api/world/controller',{});
  if(worldControllerPending!==pending||revision!==accountRevision||owner!==bootstrap?.profile?.id)return;
  if(typeof result.controller_token!=='string'||!result.controller_token)throw new Error('Не удалось получить управление городом.');
  worldControllerToken=result.controller_token;worldControllerOwner=owner;worldControlLost=false;
  return worldControllerToken;
 })();
 worldControllerPending=pending;
 try{return await pending.promise;}finally{if(worldControllerPending===pending)worldControllerPending=null;}
}
async function returnWorldControl(){if(await acquireWorldControl(true))await home();}
const phoneApps=[['games','✦','Игры'],['travel','↗','Карта'],['wallet','◈','Задания'],['character','◉','Персонаж'],['clans','⚑','Клан'],['profile','◉','Каталог'],['friends','♡','Друзья'],['search','⌕','Поиск'],['messages','▤','Сообщения'],['cards','♠','Карты'],['casino','7','Казино'],['results','▥','Результаты']];
const cityPhoneTabs=['wallet','quests','inventory','travel','friends','smoking','shop-food','shop-clothes','shop-furniture','fishing'];
function updateWallet(economy){economyRevision++;economySnapshot=economy;worldView?.setWallet(economy);if(inventoryOpen)renderInventory();if($('#phone-wallet'))$('#phone-wallet').innerHTML=`${mascotCoinSVG()}<span>${Number(economy?.balance)||0}</span>`;}
async function refreshEconomy(){const revision=++economyRevision,sender=bootstrap?.profile?.id;const economy=await api('/api/economy');if(revision===economyRevision&&sender===bootstrap?.profile?.id)updateWallet(economy);return economySnapshot;}
function stopPhonePolling(){clearTimeout(phoneTimer);phoneTimer=null;}
function closePhone(immediate=false){stopPhonePolling();phoneRevision++;clearTimeout(phoneClosing);if(!phone.open)return;playTone('phone-close');worldView?.setPhone(false);phone.classList.add('closing');if(immediate||matchMedia('(prefers-reduced-motion: reduce)').matches){phone.close();return;}phoneClosing=setTimeout(()=>phone.close(),180);}
function updateViewSettings(next){viewSettings=normalizeViewSettings({...viewSettings,...next});saveLocal('bziker:zoom',String(viewSettings.zoom));saveLocal('bziker:nicknames',viewSettings.showNicknames?'on':'off');saveLocal('bziker:lighting',viewSettings.lightingMode);worldView?.setSettings(viewSettings);}
function settingsHTML(){return `<section class="settings-section"><label>Рука для джойстика<select name="control-layout"><option value="left" ${document.body.dataset.controlLayout==='left'?'selected':''}>Для левой руки (джойстик слева)</option><option value="right" ${document.body.dataset.controlLayout==='right'?'selected':''}>Для правой руки (джойстик справа)</option></select></label><label>Масштаб города <output id="zoom-value">${viewSettings.zoom.toFixed(2)}×</output><input name="city-zoom" type="range" min=".8" max="1.6" step=".05" value="${viewSettings.zoom}"></label><label>Время суток<select name="lighting-mode">${[['auto','Смена дня и ночи'],['day','День'],['night','Ночь']].map(([id,label])=>`<option value="${id}" ${viewSettings.lightingMode===id?'selected':''}>${label}</option>`).join('')}</select></label><label class="toggle-row"><span>Показывать ники</span><input name="show-nicknames" type="checkbox" ${viewSettings.showNicknames?'checked':''}></label><label class="toggle-row"><span>Звук игры</span><input name="game-sound" type="checkbox" ${soundEnabled?'checked':''}></label><label>Громкость <output id="sound-volume-value">${Math.round(soundVolume*100)}%</output><input name="sound-volume" type="range" min="0" max="100" step="5" value="${Math.round(soundVolume*100)}"></label><button class="wide" data-action="sound-preview" ${soundEnabled?'':'disabled'}>Послушать звук оплаты</button><div class="row"><button data-action="sound-preview" data-sound="dog-bark" ${soundEnabled?'':'disabled'}>Послушать лай</button><button data-action="sound-preview" data-sound="cat-meow" ${soundEnabled?'':'disabled'}>Послушать мяуканье</button></div><p class="hint">Короткие 8-битные звуки действий, дверей, животных и уведомлений. Настройки сохраняются на этом устройстве.</p>${accountSettingsHTML(bootstrap?.account,bootstrap?.profile)}</section>`;}
function closeGameMenu(){if(gameMenu.open)gameMenu.close();$('#game-menu-toggle').setAttribute('aria-expanded','false');}
function openGameMenu(){closeInventory();closePhone(true);if(settingsDialog.open||constructionDialog.open||dialog.open)return;constructionRevision++;if(!gameMenu.open)gameMenu.showModal();$('#game-menu-toggle').setAttribute('aria-expanded','true');}
function openSettings(){closeGameMenu();closeInventory();closePhone(true);$('#settings-content').innerHTML=settingsHTML();if(!settingsDialog.open)settingsDialog.showModal();}
function resetAccountCaches(){closeInventory();accountRevision++;economyRevision++;worldControllerToken=null;worldControllerOwner=null;worldControllerPending=null;worldControlLost=false;lastNotificationPoll=0;gameAudio.stop();constructionDialog.close();constructionPlot=null;constructionOwn=null;worldSnapshot=null;economySnapshot=null;snapshot=null;cardSnapshot=null;cardSignature='';lastSlotResult=null;pendingSlotRequest=null;activePeer=null;phoneData=null;phoneInviteRooms=[];fishingSpot=null;suggestedBuilding=null;arenaLobby=null;pendingArena=null;pendingCard=null;lastLobby=null;}
function accountScreen(mode='register'){if(settingsDialog.open)settingsDialog.close();accountMode=mode;setScreen('account',accountFormHTML({mode,profile:bootstrap?.profile,login:mode==='claim'?bootstrap?.account?.login||'':''}));}
async function submitAccount(data){
 const errorNode=$('#account-error');errorNode.hidden=true;
 try{const credentials=accountCredentials(data,accountMode);const next=await api(`/api/account/${accountMode==='claim'?'claim':accountMode==='login'?'login':'register'}`,credentials);bootstrap=next;csrf=next.csrf_token;resetAccountCaches();$('#mode-badge').textContent='Локальная версия';if(bootstrap.profile)await restoreAccountRoute();else splash();}
 catch(error){errorNode.textContent=error.message;errorNode.hidden=false;}
}

let invite=new URL(location.href).searchParams.get('invite')||'';
const currentLobby=()=>new URL(location.href).searchParams.get('lobby');
let noticeTimer;
const renderedHTML=new WeakMap();
function writeHTML(element,html){if(renderedHTML.get(element)===html)return;renderedHTML.set(element,html);element.innerHTML=html;}
function notice(message){$('#notice').textContent=message;$('#notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').hidden=true,6500);}
function stored(key){try{return localStorage.getItem(key);}catch{return null;}}
function saveLocal(key,value){try{localStorage.setItem(key,value);}catch{/* Draft remains in the live textarea if storage is unavailable. */}}
function draftKey(){return `bziker:draft:${bootstrap.profile?.id}:${snapshot.id}:${snapshot.question?.id}`;}
async function api(path,data){
 const controllerAtSend=worldControllerToken,ownerAtSend=bootstrap?.profile?.id,accountAtSend=accountRevision;
 const options={credentials:'same-origin',headers:{}};
 if(data!==undefined){
  if(worldControlLost&&path!=='/api/world/controller'&&!path.startsWith('/api/account/')&&!path.startsWith('/api/auth/'))throw worldControlError();
  options.method='POST';options.headers={'Content-Type':'application/json','X-CSRF-Token':csrf};
  if(worldControllerToken&&worldControllerOwner===bootstrap?.profile?.id)options.headers['X-World-Controller']=worldControllerToken;
  options.body=JSON.stringify(data);
 }
 const response=await fetch(path,options);let result;try{result=await response.json();}catch{throw new Error('Сервер не ответил. Проверьте подключение и повторите действие.');}
 if(!response.ok){const error=new Error(result.error?.message||'Действие недоступно. Обновите страницу.');error.status=response.status;error.code=result.error?.code;
  if(error.code==='world_controller_lost'&&controllerAtSend===worldControllerToken&&ownerAtSend===bootstrap?.profile?.id&&accountAtSend===accountRevision)loseWorldControl();
  throw error;
 }
 return result;
}
function setScreen(value,html){
  profileRenderEpoch++;
  closeGameMenu();
  closeInventory();
  closePhone(true);
  if(settingsDialog.open)settingsDialog.close();
  if(constructionDialog.open)constructionDialog.close();
  worldView?.destroy(); worldView=null;
  screen=value;signature='';app.innerHTML=html;
  $('#home-button').hidden=!bootstrap?.profile||value==='splash'||value==='profile'||(value==='cards'&&cardSnapshot?.state==='playing')||(value==='lobby'&&snapshot?.state!=='waiting'&&snapshot?.state!=='finished')||(snapshot?.role==='curator'&&snapshot.state!=='finished');
  document.body.dataset.screen=value;
}
function playTone(name='success'){return gameAudio.play(name);}
function updateNotifications(data){if(notificationDelta(phoneData,data))playTone('notify');phoneData=data;}
function soundButton(){return `<button class="quiet sound-control" data-action="sound" aria-pressed="${soundEnabled}">Звук ${soundEnabled?'вкл.':'выкл.'}</button>`;}
function updateAvatarPreview(){
  $('#avatar-preview').innerHTML=avatarPreviewHTML(avatar,{name:$('#avatar-form [name="nickname"]').value,facing:avatarFacing});
  document.querySelectorAll('[data-part]').forEach(b=>{b.setAttribute('aria-pressed',String(avatar[b.dataset.part]===Number(b.dataset.value)));if(b.classList.contains('avatar-miniature'))b.querySelector('svg').outerHTML=catalogPartSVG(b.dataset.part,Number(b.dataset.value),avatar);});
  document.querySelectorAll('[data-catalog-group]').forEach(group=>{const key=group.dataset.catalogGroup;group.querySelector('summary small').textContent=parts[key].options[avatar[key]];});
  if($('#gender-choice summary small'))$('#gender-choice summary small').textContent=parts.gender.options[avatar.gender];
}

function splash(){setScreen('splash',sourceSplashHTML());}
async function profileForm(edit=false){
 const epoch=++profileRenderEpoch,revision=accountRevision,owner=bootstrap?.profile?.id;
 const draft=screen==='profile'?$('#avatar-form [name="nickname"]')?.value:null;
 await Promise.all([loadSourceActor('human-male'),loadSourceActor('human-female'),bootstrap?.profile?refreshEconomy():Promise.resolve()]);
 if(epoch!==profileRenderEpoch||revision!==accountRevision||owner!==bootstrap?.profile?.id)return;
 const name=screen==='profile'?$('#avatar-form [name="nickname"]')?.value??draft:draft;
 editing=edit;genderExpanded=!edit;catalogCategory='hair';avatarFacing='down';avatar={...defaultAvatar,...bootstrap.profile?.avatar};avatarForm(name??bootstrap.profile?.name??'');
}
function catalogHTML(){return builderCatalogHTML(catalogCategory,{avatar,unlockedOutfits:economySnapshot?.unlocked_outfits||[]});}
function avatarForm(name){profileStep='avatar';setScreen('profile',profileBuilderHTML({avatar,name,editing,category:catalogCategory,genderExpanded,facing:avatarFacing,unlockedOutfits:economySnapshot?.unlocked_outfits||[]}));}
async function home(){
  if(worldControlLost){worldControlLostScreen();return;}
  bootstrap=await api('/api/bootstrap');csrf=bootstrap.csrf_token;if(bootstrap.authenticated===false){accountScreen('login');return;}if(accountGate(bootstrap)){accountScreen('register');return;}
  if(bootstrap?.profile&&!await acquireWorldControl())return;
  const restricted=bootstrap.lobbies.find(l=>l.role==='curator'&&l.state!=='finished');
  if(restricted){await openLobby(restricted.id);notice('Сначала завершите назначенную оценку.');return;}
  worldSnapshot=await api('/api/world');
  if(worldSnapshot.restricted){setScreen('restricted','<section class="panel waiting"><h1>Вы на оценке</h1><p>Завершите назначенную игру куратора, чтобы вернуться в город.</p></section>');return;}
  const activeLobby=worldArenaLobby(worldSnapshot);
  if(activeLobby){await openLobby(activeLobby);return;}
  const activeTable=worldCardTable(worldSnapshot);
  if(activeTable){await openCardTable(activeTable);return;}
  if(worldSnapshot.phone_open||worldSnapshot.pose==='phone')worldSnapshot=await api('/api/world/activity',{action:'phone',open:false});
  await refreshEconomy();
  if(worldControlLost)return;
  arenaLobby=null;pendingArena=null;
  snapshot=null;lastLobby=null;cardSnapshot=null;cardSignature='';pendingCard=null;
  const url=new URL(location.href);url.searchParams.delete('lobby');url.searchParams.delete('invite');url.searchParams.delete('table');history.replaceState({},'',url);
  setScreen('home',`<section class="city-home"><div id="world-container"></div><section id="inventory-drawer" class="inventory-drawer" role="dialog" aria-modal="false" aria-labelledby="inventory-title" tabindex="-1" hidden></section></section>`);
  attachCity(initialCityScene(worldSnapshot));window.scrollTo({top:0,behavior:'instant'});
}
function attachCity(scene){
 const controller=worldControllerToken,owner=bootstrap.profile?.id,revision=accountRevision;
 const currentController=()=>controller===worldControllerToken&&owner===bootstrap?.profile?.id&&revision===accountRevision;
 const cityAPI=(path,data)=>{
  // Durable cleanup belongs to the mount that queued it, even after another mount takes control.
  if(data!==undefined&&!currentController())return Promise.reject(worldControlError());
  return api(path,data);
 };
 worldView?.destroy();worldView=mountWorld($('#world-container'),{profile:bootstrap.profile,api:cityAPI,onControllerLost:()=>{if(currentController())loseWorldControl();},onInteract:(entry,details)=>perform(()=>worldInteraction(entry,details)),settings:viewSettings,onSettings:()=>perform(openSettings),onSound:playTone,onPhone:()=>perform(()=>openPhone('apps')),onInventory:()=>inventoryOpen?closeInventory():perform(openInventory),onArena:id=>routeToArena(id),onCards:id=>routeToCards(id),initialScene:scene,diagnostics:new URL(location.href).searchParams.get('diagnostics')==='1'});if(economySnapshot)worldView.setWallet(economySnapshot);
}
async function routeToArena(id,queued=false){
  const target=worldArenaLobby({restricted:false,scene:'arena',arena_lobby_id:id});
  if(!target||(!queued&&!canFollowArena(screen,bootstrap?.profile,snapshot)))return;
  pendingArena=target;
  if(mutationBusy||arenaRouting)return;
  arenaRouting=true;mutationBusy=true;mutationEpoch++;pendingArena=null;
  try{
   // A completed form may have changed role while the city callback was queued.
   if(queued&&worldArenaLobby(await api('/api/world'))!==target)return;
   await openLobby(target,true);
  }catch(error){notice(error.message);}finally{
   mutationBusy=false;arenaRouting=false;
   if(pendingArena)await routeToArena(pendingArena,true);
  }
}
async function worldInteraction(entry,details={}){
 suggestedBuilding=details.building_id||entry?.building_id||null;
 const id=typeof entry==='string'?entry:entry?.id||entry?.type||entry?.action;
 if(suggestedBuilding){await openConstruction(suggestedBuilding);return;}
 if(id==='city'){await home();return;}
 if(id==='fishing'){fishingSpot=details.spot_id||entry?.spot_id||null;await openPhone('fishing');return;}
 if(['pet-dog','pet-cat','pet','pick-litter','trash-bin'].includes(id)){
  const result=await api('/api/world/action',{action:id,target_id:details.target_id||entry?.target_id});updateWallet(result);
  if(id==='pick-litter'&&result.picked===false){notice('Этот мусор уже убран сегодня.');return;}
  worldView?.setActionState?.(result);await worldView?.refresh();
  if(!id.startsWith('pet'))notice(id==='pick-litter'?'Мусор убран в инвентарь.':'Мусор выброшен. Награда доступна в заданиях.');
  return;
 }
 if(/base/.test(id)&&worldSnapshot?.my_clan){await enterBase();return;}
 if(cityPhoneTabs.includes(id)||id==='casino'||id==='cards'){await openPhone(id);return;}
 if(id==='railway'){notice('Добро пожаловать в Бзикер! Пройдите вперёд от вокзала.');return;}
 await openPhone(/clan|base/.test(id)?'clans':/leader|result|board/.test(id)?'results':/profile|kiosk/.test(id)?'profile':/message|cafe/.test(id)?'messages':'games');
}
async function enterBase(){
 closePhone(true);if(screen!=='home')await home();await worldView?.travel('base');
}
function gamesHTML(finished=false){
 const rooms=bootstrap.lobbies.filter(l=>finished?l.state==='finished':l.state!=='finished');
 return rooms.length?rooms.map(l=>`<article class="room-entry"><div><h3>${escape(l.title)}</h3><span class="meta">${l.mode==='team'?'Команды':'Каждый за себя'} · ${states[l.state]} · ${l.role==='curator'?'Куратор':'Игрок'}</span></div><button data-action="open-lobby" data-id="${escape(l.id)}">Открыть →</button></article>`).join(''):`<p class="no-rooms">${finished?'Завершённых игр пока нет. Результаты появятся после игры.':'У вас пока нет игр. Создайте лобби или введите код приглашения.'}</p>`;
}
function renderInventory(){
 if(!inventoryOpen)return;
 if(!bagItems(economySnapshot||{}).some(row=>row.item_id===inventorySelected))inventorySelected=null;
 const drawer=$('#inventory-drawer');if(!drawer)return;
 drawer.hidden=false;drawer.setAttribute('aria-busy',String(inventoryBusy));drawer.innerHTML=inventoryHTML(economySnapshot||{},inventorySelected,{busy:inventoryBusy});
}
function closeInventory(){
 const wasOpen=inventoryOpen;inventoryOpen=false;inventoryBusy=false;inventoryRevision++;
 const drawer=$('#inventory-drawer');if(drawer)drawer.hidden=true;
 if(wasOpen){worldView?.setInventory?.(false);if(screen==='home')$('.world-canvas')?.focus?.({preventScroll:true});}
}
async function openInventory(){
 if(screen!=='home'||!worldView||worldSnapshot?.restricted)return;
 closePhone(true);if(settingsDialog.open)settingsDialog.close();if(constructionDialog.open)constructionDialog.close();
 const revision=++inventoryRevision,sender=bootstrap?.profile?.id,inventoryWorld=worldView;inventoryOpen=true;inventoryBusy=true;renderInventory();
 $('#inventory-drawer')?.focus?.({preventScroll:true});
 try{await inventoryWorld.setInventory?.(true);if(revision!==inventoryRevision||sender!==bootstrap?.profile?.id||!inventoryOpen)return;await refreshEconomy();}
 catch(error){if(revision===inventoryRevision&&[401,403].includes(error.status))closeInventory();throw error;}
 finally{if(revision===inventoryRevision&&sender===bootstrap?.profile?.id&&inventoryOpen){inventoryBusy=false;renderInventory();}}
}
async function openPhone(tab='apps'){
 if(worldControlLost){worldControlLostScreen();return;}
 if(tab==='inventory'){await openInventory();return;}
 closeInventory();
 if(snapshot?.role==='curator'&&snapshot.state!=='finished')return;
 const opening=!phone.open||phone.classList.contains('closing'),walletVersion=economyRevision;stopPhonePolling();clearTimeout(phoneClosing);phone.classList.remove('closing');const revision=++phoneRevision,accountVersion=accountRevision,owner=bootstrap?.profile?.id;phoneTab=tab;
 const current=()=>revision===phoneRevision&&accountVersion===accountRevision&&owner===bootstrap?.profile?.id;
 if(bootstrap?.profile){const nextBootstrap=await api('/api/bootstrap');if(!current())return;const nextWorld=await api('/api/world');if(!current())return;bootstrap=nextBootstrap;csrf=bootstrap.csrf_token;worldSnapshot=nextWorld;if(worldSnapshot.restricted){closePhone(true);await home();return;}}
 const title=phoneApps.find(a=>a[0]===tab)?.[2]||({'shop-food':'Лавка маскота','shop-clothes':'Гардероб','shop-furniture':'Мебельная','smoking':'Курилка','quests':'Задания','conversation':'Переписка','fishing':'Рыбалка'}[tab]||'Телебзи');
 setPhoneExpanded(phoneNeedsExpansion(tab));$('#phone-title').textContent=title;$('#phone-back').setAttribute('aria-label',tab==='apps'?'Закрыть телефон':'Назад к приложениям');
 const content=$('#phone-content');
 if(tab==='apps')content.innerHTML=phoneAppsHTML({name:bootstrap?.profile?.name||'БЗИКЕР',available:!!bootstrap?.profile});
 else if(tab==='settings'){openSettings();return;}
 else if(tab==='games')content.innerHTML=`<p class="hint">Соберите компанию для игры над облаками.</p><button class="primary wide" data-action="create-screen">Создать лобби →</button><form id="join-form" class="phone-section"><label>Код приглашения<input name="code" required maxlength="100" autocomplete="off" value="${escape(invite)}" placeholder="Игрок, команда или куратор"></label><button type="submit" class="wide">Войти по коду →</button></form><section class="phone-section"><h3>Ваши игры</h3>${gamesHTML()}</section>`;
 else if(tab==='clans')await renderClans(revision);
 else if(tab==='results')content.innerHTML=`<section class="phone-section"><h3>История игр</h3>${gamesHTML(true)}</section><section class="phone-section"><h3>Кланы города</h3>${worldSnapshot.leaderboard.map((c,i)=>`<div class="clan-entry"><span class="rank">${i+1}</span><div><strong>${escape(c.flag)} ${escape(c.name)}</strong><p class="meta">${formatScore(c.score)} балл. · побед: ${c.wins}</p></div></div>`).join('')||'<p class="hint">Кланы ещё не набрали баллы.</p>'}</section>`;
 else if(tab==='profile'||tab==='character')content.innerHTML=`<div class="phone-identity">${avatarSVG(bootstrap.profile.avatar)}<h3>${escape(bootstrap.profile.name)}</h3></div><p class="hint">Ник закреплён. Причёску, одежду и детали можно менять.</p><button class="primary wide" data-action="edit-profile">${tab==='character'?'Изменить внешность':'Открыть каталог'}</button>`;
 else if(tab==='search')content.innerHTML=`<form id="player-search-form"><label>Найти по нику<input name="q" type="search" maxlength="32" autocomplete="off" placeholder="Ник игрока"></label><button class="primary wide" type="submit">Найти</button></form><div id="player-search-results" aria-live="polite"></div>`;
 else if(tab==='messages')content.innerHTML='<button class="wide" data-action="phone-tab" data-tab="search">Найти собеседника ⌕</button><section class="phone-section"><h3>Приглашения</h3><div id="phone-notifications"></div></section><section class="phone-section"><h3>Переписки</h3><div id="phone-conversations"></div></section>';
 else if(tab==='conversation')await renderConversation(revision);
 else if(cityPhoneTabs.includes(tab)||tab==='cards'||tab==='casino')await renderFeaturePhone(tab,revision);
 if(revision!==phoneRevision)return;
 if(worldSnapshot?.wallet&&walletVersion===economyRevision)updateWallet({...economySnapshot,...worldSnapshot.wallet});
 setSourcePhoneState(document.body,true,bootstrap?.profile?.avatar);const hands=$('.source-phone-hands');if(hands)hands.src=sourceUIAsset(bootstrap?.profile?.avatar?.gender===1?'hands-female.png':'hands-male.png');if(!phone.open)phone.show();if(opening){await worldView?.setPhone(true);playTone('phone-open');}content.scrollTop=0;
 if(phoneCanPoll({open:phone.open,hidden:document.hidden,restricted:worldSnapshot?.restricted,tab:phoneTab}))await pollPhone();
}
function playerRow(p,preview=''){return `<article class="social-row">${avatarSVG(p.avatar)}<div><strong>${escape(p.name)}</strong><p class="meta">${escape(preview|| (p.online?'В сети':'Не в сети'))}</p></div><div class="social-actions"><button data-action="message-peer" data-peer="${escape(p.id)}">Написать</button>${p.id!==bootstrap?.profile?.id?`<button data-action="friend-request" data-peer="${escape(p.id)}">Дружить</button>`:''}</div></article>`;}
function preservePhoneFields(html){
 const content=$('#phone-content'),scroll=content.scrollTop,focused=document.activeElement;
 const fields=[...content.querySelectorAll('form [name]')].map(field=>({form:field.form?.id,name:field.name,value:field.value,checked:field.checked}));
 const focus=content.contains(focused)?{form:focused.form?.id,name:focused.name,start:focused.selectionStart,end:focused.selectionEnd}:null;
 writeHTML(content,html);
 for(const saved of fields){const field=[...content.querySelectorAll('form [name]')].find(f=>f.form?.id===saved.form&&f.name===saved.name);if(field){field.value=saved.value;if(field.type==='checkbox')field.checked=saved.checked;}}
 if(focus?.name){const field=[...content.querySelectorAll('form [name]')].find(f=>f.form?.id===focus.form&&f.name===focus.name);if(field){field.focus({preventScroll:true});if(typeof focus.start==='number'&&field.setSelectionRange&&['text','search'].includes(field.type))field.setSelectionRange(focus.start,focus.end);}}
 content.scrollTop=scroll;
}
async function renderFeaturePhone(tab,revision,preserve=false){
 let friends=null,cards=null,fishing=null;
 const current=()=>revision===phoneRevision&&phoneTab===tab&&(!preserve||(phone.open&&!document.hidden&&!worldSnapshot?.restricted));
 if(!current())return;
 if(tab==='casino'){await recoverSlotRequest();if(!current())return;}
 if(tab==='friends'){friends=await api('/api/friends');if(!current())return;}
 if(tab==='fishing'){fishing=await api('/api/fishing');if(!current())return;}
 if(tab!=='travel'){await refreshEconomy();if(!current())return;}
 if(tab==='cards'||tab==='casino'){cards=await api('/api/cards');if(!current())return;}
 let html=cards?cardGamesPanelHTML(cards,{source:tab==='cards'?'deck':'casino',balance:economySnapshot.balance,hasDeck:(economySnapshot.inventory||[]).some(item=>item.item_id==='cards'&&item.quantity>0)}):cityPhoneHTML(tab,{economy:economySnapshot,profile:bootstrap.profile,friends,fishing,spotId:fishingSpot,destinations:travelDestinations,hasBase:!!worldSnapshot?.my_clan?.base?.building_id});
 if(tab==='inventory')html=inventoryIconsHTML(html,economySnapshot);
 if(preserve)preservePhoneFields(html);else $('#phone-content').innerHTML=html;
 if(tab==='casino'&&$('#slots-result'))$('#slots-result').innerHTML=slotResultHTML(lastSlotResult);
}
async function recoverSlotRequest(){
 const sender=bootstrap.profile.id,revision=accountRevision,key=`bziker:slot-request:${sender}`;
 if(!pendingSlotRequest){try{pendingSlotRequest=JSON.parse(stored(key)||'null');}catch{pendingSlotRequest=null;}}
 if(!pendingSlotRequest)return;
 const pending=pendingSlotRequest,current=()=>sender===bootstrap?.profile?.id&&revision===accountRevision&&pendingSlotRequest===pending;
 const retire=()=>{try{const saved=JSON.parse(stored(key)||'null');if(saved?.request_id===pending.request_id&&saved.stake===pending.stake)saveLocal(key,'null');}catch{}};
 try{const result=await api('/api/casino/slots',pending);retire();if(current()){lastSlotResult=result;pendingSlotRequest=null;}}
 catch(error){const temporary=['active_card_game','active_match_scene','jury_restricted','unauthorized'];if(error.status&&error.status<500&&!temporary.includes(error.code)&&error.status!==429){retire();if(current())pendingSlotRequest=null;}throw error;}
}
async function clearCityIdentity(){cardSnapshot=null;cardSignature='';setScreen('restricted','<section class="panel waiting"><h1>Обновляем доступ</h1></section>');await home();}
async function inviteChoices(){const candidates=bootstrap.lobbies.filter(l=>l.state==='waiting'&&l.role!=='curator');const rooms=await Promise.all(candidates.map(l=>api(`/api/lobbies/${encodeURIComponent(l.id)}`)));return rooms.filter(l=>l.player_code||l.jury_code||l.teams?.some(t=>t.code));}
function inviteRoleOptions(room){return `${room&&(room.player_code||room.teams?.some(t=>t.code))?'<option value="player">Игрок</option>':''}${room?.jury_code?'<option value="curator">Куратор</option>':''}`;}
async function renderConversation(revision){const peer=activePeer,accountVersion=accountRevision,owner=bootstrap?.profile?.id;const current=()=>revision===phoneRevision&&peer===activePeer&&accountVersion===accountRevision&&owner===bootstrap?.profile?.id;const data=await api(`/api/messages/${encodeURIComponent(peer)}`);if(!current())return;const rooms=await inviteChoices();if(!current())return;phoneInviteRooms=rooms;$('#phone-title').textContent=data.peer.name;$('#phone-content').innerHTML=`<div id="message-history" class="message-history" role="log" aria-label="Переписка"></div><form id="message-form"><label>Сообщение<textarea name="text" required maxlength="2000" rows="3" placeholder="Напишите сообщение"></textarea></label><button class="primary wide" type="submit">Отправить</button></form><form id="invitation-form" class="phone-section"><h3>Пригласить в игру</h3><label>Ожидающее лобби<select name="lobby_id" required><option value="">Выберите игру</option>${phoneInviteRooms.map(l=>`<option value="${escape(l.id)}">${escape(l.title)}</option>`).join('')}</select></label><label>Роль<select name="role">${inviteRoleOptions(null)}</select></label><button type="submit" class="wide">Отправить приглашение</button><p class="hint">Доступ и команду определяет ваше право приглашения.</p></form>`;$('#message-form textarea').value=stored(messageDraftKey(bootstrap.profile.id,peer))||'';updateMessages(data);if(worldSnapshot?.my_clan?.leader_id===bootstrap.profile.id&&worldSnapshot.my_clan.base?.building_id)$('#phone-content').insertAdjacentHTML('beforeend','<section class="phone-section"><button class="wide" data-action="base-invite-peer">Пригласить на базу клана</button></section>');}
function updateMessages(data){const history=$('#message-history');if(!history)return;const nearBottom=history.scrollHeight-history.scrollTop-history.clientHeight<60;writeHTML(history,data.messages.map(m=>`<p class="message-bubble ${m.from_id===bootstrap.profile.id?'mine':''}"><span>${escape(m.text)}</span><time>${escape(new Date(Number(m.created)*1000).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))}</time></p>`).join('')||'<p class="hint">Начните переписку.</p>');if(nearBottom)history.scrollTop=history.scrollHeight;}
async function pollPhone(){
 stopPhonePolling();if(!bootstrap?.profile||phonePollBusy||!phoneCanPoll({open:phone.open,hidden:document.hidden,restricted:worldSnapshot?.restricted,tab:phoneTab}))return;
 phonePollBusy=true;const revision=phoneRevision,peer=activePeer;
 const current=()=>revision===phoneRevision&&phoneCanPoll({open:phone.open,hidden:document.hidden,restricted:worldSnapshot?.restricted,tab:phoneTab});
 try{const data=await api('/api/phone');if(!current())return;if(data.restricted){closePhone(true);return;}updateNotifications(data);
 if($('#phone-unread'))$('#phone-unread').textContent=data.unread?String(data.unread):'';
 if(phoneTab==='messages'&&$('#phone-notifications')){const baseInvites=await api('/api/base-invitations');if(!current())return;writeHTML($('#phone-notifications'),baseInvitationsHTML(baseInvites)+baseVisitsHTML(baseInvites)+data.notifications.filter(n=>n.state==='pending').map(n=>`<article class="invite-notification"><strong>${escape(n.from.name)}</strong><p>${escape(n.lobby.title)} · ${n.role==='curator'?'Куратор':'Игрок'}</p><div class="row"><button data-action="invite-accept" data-id="${escape(n.id)}">Принять</button><button data-action="invite-dismiss" data-id="${escape(n.id)}">Скрыть</button></div></article>`).join('')||'<p class="hint">Новых приглашений нет.</p>');}
 if($('#phone-conversations'))writeHTML($('#phone-conversations'),data.conversations.map(c=>playerRow(c.peer,`${c.unread?'● ':''}${c.last_text||'Переписка'}`)).join('')||'<p class="hint">Переписок пока нет.</p>');
 if(phoneTab==='conversation'&&peer){const conversation=await api(`/api/messages/${encodeURIComponent(peer)}`);if(!current())return;if(peer===activePeer)updateMessages(conversation);}
 if(['friends','cards','casino','smoking','wallet','quests','fishing'].includes(phoneTab)&&!mutationBusy)await renderFeaturePhone(phoneTab,revision,true);
 }catch(error){if(revision===phoneRevision){if(error.status===403){closePhone(true);await home();}else notice(error.message);}}finally{phonePollBusy=false;if(phoneCanPoll({open:phone.open,hidden:document.hidden,restricted:worldSnapshot?.restricted,tab:phoneTab}))phoneTimer=setTimeout(pollPhone,phoneTab==='fishing'?1000:4000);}
}
async function renderClans(revision=phoneRevision){
 const content=$('#phone-content'),world=worldSnapshot,accountVersion=accountRevision,owner=bootstrap?.profile?.id;
 const current=()=>revision===phoneRevision&&phoneTab==='clans'&&accountVersion===accountRevision&&owner===bootstrap?.profile?.id;
 let own=world.my_clan;const baseInvites=await api('/api/base-invitations');if(!current())return;
 if(own){own=await api(`/api/clans/${encodeURIComponent(own.id)}`);if(!current())return;}
 content.innerHTML=own?`<section class="phone-section"><p class="eyebrow">${own.is_leader?'Вы лидер':'Ваш клан'} · ${formatScore(own.score)} балл.</p><h2>${escape(own.flag)} ${escape(own.name)}</h2><button class="primary wide" data-action="base-entry" ${own.base?.building_id?'':'disabled'}>Войти на базу →</button>${own.base?.building_id?`<button class="wide" data-action="clan-building" data-building="${escape(own.base.building_id)}">Каталог домов · 6 моделей</button>`:''}<h3 class="section-title">Участники · ${own.members.length}</h3>${own.members.map(m=>`<div class="member-row">${avatarSVG(m.avatar)}<div><strong>${escape(m.name)}</strong><p class="meta">${m.id===own.leader_id?'Лидер':'Участник'}</p></div>${own.is_leader&&m.id!==own.leader_id?`<button data-action="clan-transfer" data-id="${escape(own.id)}" data-member="${escape(m.id)}">Назначить лидером</button>`:''}</div>`).join('')}${own.is_leader?`<h3 class="section-title">Заявки · ${own.requests.length}</h3>${own.requests.map(m=>`<div class="member-row">${avatarSVG(m.avatar)}<strong>${escape(m.name)}</strong><button data-action="clan-accept" data-id="${escape(own.id)}" data-member="${escape(m.id)}">Принять</button></div>`).join('')||'<p class="hint">Новых заявок пока нет.</p>'}`:''}<button class="quiet" data-action="clan-leave" data-id="${escape(own.id)}">Выйти из клана</button></section>`:`<form id="clan-form" class="phone-section"><h3>Создайте свой клан</h3><label>Название<input name="name" required maxlength="40" placeholder="Например, Искра"></label><div class="form-grid"><label>Цвет<select name="color"><option value="#FF8562">Коралловый</option><option value="#B8A4F5">Сиреневый</option><option value="#CDF17C">Лаймовый</option><option value="#111111">Чёрный</option></select></label><label>Флаг<select name="flag"><option value="✦">✦ Звезда</option><option value="⚑">⚑ Флаг</option><option value="●">● Круг</option><option value="▲">▲ Треугольник</option></select></label></div><button type="submit" class="primary wide">Создать клан</button></form><section class="phone-section"><h3>Или подайте заявку</h3>${worldSnapshot.clans.map(c=>`<div class="clan-entry"><div><strong>${escape(c.flag)} ${escape(c.name)}</strong><p class="meta">Участников: ${c.member_count} · ${formatScore(c.score)} балл.</p></div><button data-action="clan-apply" data-id="${escape(c.id)}">Подать заявку</button></div>`).join('')||'<p class="hint">Кланов пока нет. Ваш может стать первым.</p>'}</section>`;
 content.insertAdjacentHTML('beforeend',`<section class="phone-section"><h3>Гостевые базы</h3>${baseVisitsHTML(baseInvites)||'<p class="hint">Принимайте приглашения в сообщениях телефона.</p>'}</section>`);
 const buildings=world.buildings||[];
 content.insertAdjacentHTML('afterbegin','<button class="wide" data-action="district-entry">Посетить район кланов →</button>');
 content.insertAdjacentHTML('beforeend',`<section class="phone-section"><h3>${own?.base?.building_id?'Построенный дом':'Участки для стройки'}</h3><p class="hint">${own?.base?.building_id?'Внешний вид и участок закреплены. Обстановку внутри можно менять.':own?.is_leader?'Соберите минимум четыре участника и подойдите к свободному участку. До строительства выберите модель и цвет фасада. После строительства их изменить нельзя.':own?'Соберите минимум четыре участника. Дом строит лидер рядом с участком.':'Создайте клан, чтобы построить общий дом.'}</p><div class="building-choices">${buildings.map(b=>{const current=b.id===own?.base?.building_id,occupied=Boolean(b.clan&&!current);return `<button data-action="clan-building" data-building="${escape(b.id)}" aria-pressed="${current}" ${!own?.is_leader||own?.base?.building_id||occupied?'disabled':''}><span aria-hidden="true">⌂</span><strong>${escape(b.name)}</strong><small>${current?'Ваш дом':occupied?`Занято: ${escape(b.clan.name)}`:'Свободный участок'}</small></button>`;}).join('')}</div></section>`);
}

async function openConstruction(buildingId){
 closeInventory();closePhone(true);if(!worldView||screen!=='home'){notice('Подойдите к участку в городе.');return;}
 const view=worldView,epoch=profileRenderEpoch,accountVersion=accountRevision,owner=bootstrap?.profile?.id,revision=++constructionRevision;
 const current=()=>revision===constructionRevision&&view===worldView&&screen==='home'&&epoch===profileRenderEpoch&&accountVersion===accountRevision&&owner===bootstrap?.profile?.id&&!gameMenu.open&&!settingsDialog.open;
 const world=await api('/api/world');if(!current())return;
 const plot=districtHouses.find(h=>h.id===buildingId),summary=world.buildings.find(h=>h.id===buildingId);
 if(!plot||!summary){notice('Участок не найден.');return;}
 const own=world.my_clan?await api(`/api/clans/${encodeURIComponent(world.my_clan.id)}`):null;if(!current())return;
 worldSnapshot=world;constructionPlot={...plot,...summary};constructionOwn=own;
 $('#construction-content').innerHTML=constructionHTML({own:constructionOwn,plot:constructionPlot,state:worldView.getState(),style:constructionOwn?.base?.exterior_style??0,color:constructionOwn?.base?.exterior_color||'#faf8f2',exactScene:worldMap.design_source?.exact_scene===true});
 if(!constructionDialog.open)constructionDialog.showModal();
}
function updateConstructionPreview(){
 const form=$('#construction-form');if(!form)return;
 const data=Object.fromEntries(new FormData(form)),style=Number(data.exterior_style),color=data.exterior_color;
 $('#construction-preview').innerHTML=housePreviewSVG(style,color);
 form.querySelectorAll('.house-option').forEach(option=>{const input=option.querySelector('input');option.querySelector('svg').outerHTML=housePreviewSVG(Number(input.value),color);});
 playTone('select');
}
function setConstructionColor(value){
 const color=normalizeHouseColor(value),form=$('#construction-form');if(!color||!form)return false;
 form.querySelector('[name="exterior_color"]').value=color;
 form.querySelector('[name="house-color-hex"]').value=color;
 form.querySelectorAll('[data-action="house-color"]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.color===color)));
 updateConstructionPreview();return true;
}
async function constructionEyedropper(){
 const form=$('#construction-form'),preview=$('#construction-preview');preview.dataset.sampling='true';
 $('#house-color-hint').textContent='Коснитесь нужного цвета на предпросмотре дома. Можно также выбрать свой оттенок рядом.';
 if(typeof window.EyeDropper==='function'){
  try{const selected=await pickScreenColor(window.EyeDropper);if(selected&&form===$('#construction-form')&&constructionDialog.open){preview.dataset.sampling='false';setConstructionColor(selected);$('#house-color-hint').textContent='Цвет выбран с экрана.';}}
  catch{/* Preview sampling remains available if the browser cannot open its screen picker. */}
 }
}
async function submitConstruction(data){
 const eligibility=constructionEligibility(constructionOwn,constructionPlot,worldView?.getState());
 if(!eligibility.allowed)throw new Error(eligibility.message);
 const payload=constructionPayload(data);await api(`/api/clans/${encodeURIComponent(constructionOwn.id)}/building`,payload);
 constructionDialog.close();playTone('success');notice('Дом построен. Модель и внешний цвет закреплены; обстановку внутри можно менять.');
 worldSnapshot=await api('/api/world');await worldView?.refresh();
}

function createForm(){setScreen('create',lobbyCreateHTML());}
async function openLobby(id,fromCity=false){const data=await api(`/api/lobbies/${encodeURIComponent(id)}`);if(worldControlLost)return;if(phone.open)closePhone(true);worldView?.destroy();worldView=null;cardSnapshot=null;cardSignature='';const url=new URL(location.href);url.searchParams.set('lobby',id);url.searchParams.delete('invite');url.searchParams.delete('table');history.replaceState({},'',url);snapshot=data;screen='lobby';signature='';lastLobby=null;renderLobby(fromCity);window.scrollTo({top:0,behavior:'instant'});}
function contextHTML(s){return `<details class="context"><summary>Тема и условия игры</summary><dl>${[['theme','Тема'],['audience','Аудитория'],['goal','Цель'],['constraints','Условия']].map(([key,label])=>`<dt>${label}</dt><dd>${escape(s.context[key]||'Не указаны')}</dd>`).join('')}</dl></details>`;}
function inviteHTML(label,code){const link=new URL('/',location.href);link.searchParams.set('invite',code);return `<div class="invite-row"><label>${escape(label)}<input readonly aria-label="${escape(label)}" value="${escape(code)}"></label><div class="row"><button data-action="copy" data-copy="${escape(code)}">Копировать код</button><button data-action="copy" data-copy="${escape(link.href)}">Копировать ссылку</button><a href="${escape(link.href)}" target="_blank" rel="noopener">Открыть ссылку ↗</a></div></div>`;}
function renderScene(){const s=snapshot;if(s.state==='waiting'){writeHTML($('#scene-slot'),`<section class="preflight"><img src="/assets/bzik-brand-mascot-reference.webp" alt="Маскот БЗИК"><div><p class="eyebrow">Готовимся к взлёту</p><h2>Компания собирается в городе.</h2><p>Участников: ${s.players.length} · кураторов: ${s.jury_count}</p><div class="preflight-roster">${s.players.map(p=>`<div>${avatarSVG(p.avatar)}<span>${escape(p.name)}</span></div>`).join('')}</div></div></section>`);return;}writeHTML($('#scene-slot'),skySceneHTML(s));}
function formatScore(n){return Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:1});}
function scoresHTML(s,final=false){const rows=(s.mode==='team'?s.teams:s.players).slice().sort((a,b)=>b.score-a.score);let rank=0,last=null;return `${final?resultsPodiumHTML(s,worldSnapshot?.my_clan):''}<section class="scores"><h2>${final?'Итоговые места':'Счёт'}</h2><table><thead><tr>${final?'<th>Место</th>':''}<th>${s.mode==='team'?'Команда':'Игрок'}</th><th>Баллы</th></tr></thead><tbody>${rows.map((u,i)=>{if(last!==u.score)rank=i+1;last=u.score;return `<tr>${final?`<td>${rank}</td>`:''}<td>${escape(u.name)}</td><td>${formatScore(u.score)}</td></tr>`;}).join('')}</tbody></table>${final?'<p class="hint">При равном счёте участники делят место.</p>':''}</section>`;}
function renderLobby(fromCity=false){const s=snapshot;const takeoff=shouldTakeoff(lastLobby,s)||(fromCity&&lobbySurface(s)==='sky');lastLobby={id:s.id,state:s.state,role:s.role};if(lobbySurface(s)==='sky'&&arenaLobby!==s.id){arenaLobby=s.id;api('/api/world/move',{scene:'arena',lobby_id:s.id,x:600,y:510}).catch(e=>notice(e.message));}const sig=JSON.stringify([s.id,s.role,s.state,s.question?.id||s.question?.title,s.my_team_id,s.can_answer,s.can_buzz]);const changed=sig!==signature;if(changed){if(dialog.open)dialog.close();setScreen('lobby',`<section><div class="screen-heading"><div><p class="eyebrow">${s.role==='curator'?'Куратор · анонимная оценка':`${s.state==='waiting'?'Перед взлётом':'Небо / Своя игра'} · ${s.mode==='team'?'Команды':'Каждый за себя'}`}</p><h1>${escape(s.title)}</h1><p id="phase-caption" class="meta"></p></div><span class="state-chip">${states[s.state]}</span></div><div id="lobby-content"></div><div id="context-slot"></div></section>`);signature=sig;$('#context-slot').innerHTML=contextHTML(s);if(s.role==='curator')buildCurator();else buildParticipant();}if(s.role==='curator')updateCurator();else updateParticipant();if(takeoff){window.scrollTo({top:0,behavior:'instant'});app.classList.remove('takeoff');void app.offsetWidth;app.classList.add('takeoff');playTone('takeoff');setTimeout(()=>app.classList.remove('takeoff'),950);}}
function buildParticipant(){const s=snapshot;const c=$('#lobby-content');if(s.state==='finished'){c.innerHTML=`<section class="finished panel"><p class="eyebrow">Полёт завершён</p><h1>Идеи приземлились!</h1><div id="final-scores"></div><p>Спасибо за игру. В следующем лобби можно попробовать другую тему.</p><button class="primary" data-action="home">Вернуться в город ↓</button></section>`;return;}c.innerHTML='<div id="scene-slot"></div><div id="play-slot"></div><div id="score-slot"></div>';if(s.state==='waiting'){$('#play-slot').innerHTML=`<div class="lobby-controls"><section class="panel"><h2>${s.mode==='team'?'Выберите команду':'Собираемся перед полётом'}</h2>${s.mode==='team'&&!s.my_team_id?`<form id="team-form"><label>Название вашей команды<input name="name" required maxlength="40" placeholder="Например, Искра"></label><div class="button-row"><button class="primary" type="submit">Создать команду</button></div></form><p class="hint">Создатель становится капитаном. Чтобы войти в готовую команду, попросите её код у капитана.</p><form id="team-join-form"><label>Код команды<input name="code" required maxlength="100" autocomplete="off"></label><div class="button-row"><button type="submit">Войти в команду</button></div></form>`:`<p>${s.mode==='team'?'Обсуждайте идеи вместе. Только капитан отправляет ответ команды и выбирает задание на её ходу.':'Каждый игрок отправляет свой ответ и выбирает задание на своём ходу.'}</p>`}<div id="start-slot"></div></section><section class="panel invites"><h2>Приглашения</h2><div id="invite-slot"></div><p class="hint">Для куратора нужен отдельный аккаунт: участник этой игры не может оценивать ответы.</p><div id="meeting-slot"></div></section></div>`;}else if(s.state==='choosing'){$('#play-slot').innerHTML=`<section class="panel"><p class="eyebrow">Поле заданий</p><h2 id="chooser-label"></h2><p class="hint">Выбирает капитан на своём ходу или ведущий. ${s.answer_policy==='first'?'Право ответа получает первый нажавший кнопку.':'Ответ дают все.'} Баллы начисляются после оценок всех кураторов.</p><div id="board-slot" class="board"></div><div id="finish-slot" class="button-row"></div></section>`;}else{$('#play-slot').innerHTML=`<div class="play-layout"><section id="question-slot" class="panel question-card"></section><section class="panel answer-box"><h2>${s.state==='reviewing'?'Ответы на оценке':s.can_answer?(s.mode==='team'?'Ответ команды':'Ваш ответ'):'Работа команды'}</h2>${s.state==='answering'&&s.can_answer?'<form id="answer-form"><label>Текст ответа<textarea name="text" maxlength="4000" required placeholder="Расскажите идею и объясните, как она работает."></textarea></label><p class="hint">Не подписывайте ответ: кураторы увидят текст без вашего профиля.</p><button class="primary" type="submit">Отправить ответ</button></form>':'<p id="answer-readonly"></p>'}<div id="buzz-slot"></div><p id="answer-status" class="answer-status" role="status"></p><div id="my-answer-slot"></div><div id="review-slot"></div></section></div>`;if($('#answer-form textarea'))$('#answer-form textarea').value=stored(draftKey())??s.my_answer??'';}}
function updateParticipant(){const s=snapshot;$('#phase-caption').textContent=s.is_host?'Вы ведущий: приглашайте игроков, запускайте игру и закрывайте приём ответов.':s.mode==='team'?'Капитан отправляет общий ответ. Остальные участники помогают придумать идею.':'Каждый отвечает за свою идею.';if(s.state==='finished'){writeHTML($('#final-scores'),scoresHTML(s,true));return;}renderScene();if(s.state==='waiting'){writeHTML($('#start-slot'),s.is_host?`<p class="hint">${s.can_start?'Все готовы. После старта состав игроков и кураторов фиксируется.':'Для старта нужен куратор; в командном режиме каждый игрок должен войти в команду.'}</p><button class="primary" data-action="start" ${s.can_start?'':'disabled'}>Начать игру →</button>`:'<p class="hint">Ведущий запустит игру, когда компания будет готова.</p>');let codes='';if(s.player_code)codes+=inviteHTML('Для игроков',s.player_code);if(s.jury_code)codes+=inviteHTML('Для кураторов',s.jury_code);const team=s.teams.find(t=>t.code);if(team)codes+=inviteHTML(`В команду «${team.name}»`,team.code);writeHTML($('#invite-slot'),codes||'<p>Приглашения есть у ведущего и капитанов. Попросите нужный код.</p>');writeHTML($('#meeting-slot'),s.meeting_url?`<a href="${escape(s.meeting_url)}" target="_blank" rel="noopener">Открыть встречу ↗</a>`:'');return;}writeHTML($('#score-slot'),scoresHTML(s));if(s.state==='choosing'){$('#chooser-label').textContent=`Ход: ${s.chooser_name||'ведущий'}`;writeHTML($('#board-slot'),s.board.map(t=>`<section class="board-column"><h3>${escape(t.title)}</h3>${t.questions.map(q=>`<button data-action="question" data-id="${escape(q.id)}" aria-label="${escape(t.title)}, ${q.value} баллов${q.used?', использован':''}" ${q.used||!s.can_choose?'disabled':''}>${q.used?'✓':q.value}</button>`).join('')}</section>`).join(''));writeHTML($('#finish-slot'),s.can_finish?'<button data-action="finish" class="secondary">Завершить игру и показать места</button>':'<p class="hint">Ждём выбора задания.</p>');return;}if($('#buzz-slot'))writeHTML($('#buzz-slot'),s.state==='answering'&&s.answer_policy==='first'?`<p class="hint">${escape(answerCaption(s))}</p>${s.can_buzz?'<button class="primary wide buzz-button" data-action="buzz">✦ Нажать первым</button>':''}`:'');const q=s.question;writeHTML($('#question-slot'),`<img class="mascot" src="/assets/bzik-brand-mascot-reference.webp" alt="Маскот задаёт вопрос"><p class="eyebrow">Раунд ${s.round_number} · ${escape(q.topic)} · ${q.value} баллов</p><h2>${escape(q.title)}</h2><p class="question-prompt">${escape(q.prompt)}</p><p class="question-focus">На что смотрят кураторы: ${escape(q.evaluation_focus)}</p>`);$('#answer-status').textContent=s.state==='reviewing'?`Ждём, пока все кураторы завершат оценку. Ответов: ${s.answers_received} / ${s.total_units}.`:`Получено ответов: ${s.answers_received} / ${s.total_units}.${s.my_answer?' Ваш ответ сохранён.':''}`;if($('#answer-readonly')){$('#answer-readonly').hidden=s.state==='answering'&&s.answer_policy==='first'&&s.can_buzz;$('#answer-readonly').textContent=s.state==='reviewing'?'Приём ответов закрыт. Оценки появятся после завершения раунда.':s.answer_policy==='first'?answerCaption(s):'Отправить и заменить ответ может только капитан. Обсудите с ним свою идею.';}if($('#answer-form button'))$('#answer-form button').textContent=s.my_answer?'Заменить ответ':'Отправить ответ';writeHTML($('#my-answer-slot'),s.my_answer?`<details><summary>Сохранённый ${s.mode==='team'?'ответ команды':'ответ'}</summary><p class="readonly-answer">${escape(s.my_answer)}</p></details>`:s.can_answer||s.answer_policy==='first'?'':'<p class="hint">Капитан ещё не отправил ответ. Общий текст появится здесь после отправки.</p>');writeHTML($('#review-slot'),s.can_review?'<p class="hint">После закрытия приёма отсутствующие ответы получают ноль. Тексты больше нельзя изменить.</p><button data-action="review" class="secondary">Закрыть приём и передать куратору</button>':'');}
function buildCurator(){const s=snapshot;if(s.state!=='reviewing'){$('#lobby-content').innerHTML=`<section class="waiting panel"><img class="mascot" src="/assets/bzik-brand-mascot-reference.webp" alt="Маскот Бзикера"><h2>${s.state==='finished'?'Игра завершена':'Ждём ответы'}</h2><p>${s.state==='finished'?'Спасибо за ваши оценки. Результаты доступны участникам.':'Когда ведущий закроет приём, здесь появятся анонимные карточки.'}</p><p class="hint">Состав участников и их счёт на экране куратора не показываются.</p>${s.state==='finished'?'<button class="primary" data-action="home">Вернуться в город ↓</button>':''}</section>`;return;}const n=s.cards.length;$('#lobby-content').innerHTML=`<section class="orbit ${n!==4?'radial':''} ${n>8?'orbit-list':''}" data-count="${n}" aria-label="Анонимные ответы вокруг вопроса">${s.cards.map((card,i)=>`<button class="answer-tile pos-${i}" data-action="card" data-token="${escape(card.token)}" aria-label="Открыть анонимный ответ ${i+1}"><span class="answer-tile-content">${avatarSVG({},true)}<span class="answer-preview">${escape(card.text)}</span><span class="answer-action"></span></span></button>`).join('')}<div class="orbit-center"><img class="mascot" src="/assets/bzik-brand-mascot-reference.webp" alt="Маскот"><p class="eyebrow">${escape(s.question.topic)} · ${s.question.value}</p><h2>${escape(s.question.title)}</h2><p>Откройте карточку,<br>чтобы прочитать задание и ответ</p></div></section><footer class="jury-footer"><p id="jury-progress" role="status"></p><button id="finish-review" data-action="finish-review" class="primary">Завершить оценку</button></footer><p class="hint">Позиции карточек не обозначают команды. Порядок сохраняется на весь раунд. Не используйте текстовую подпись автора для оценки.</p>`;}
function updateCurator(){const s=snapshot;$('#phase-caption').textContent=s.state==='reviewing'?`Оценено ${s.graded_count} / ${s.total_cards}. Кураторов в игре: ${s.jury_count}.`:'Ваш отдельный экран куратора';if(s.state!=='reviewing')return;s.cards.forEach(c=>{const tile=Array.from(document.querySelectorAll('.answer-tile')).find(el=>el.dataset.token===c.token);if(tile){tile.classList.toggle('rated',c.my_grade!==null);tile.querySelector('.answer-action').textContent=c.my_grade===null?'Открыть ответ →':`Оценка ${c.my_grade} / 10`;}});$('#jury-progress').textContent=s.review_finished?'Ваши оценки зафиксированы. Ждём остальных кураторов.':`Оценено ${s.graded_count} из ${s.total_cards}. Оценку можно заменить до завершения.`;$('#finish-review').disabled=s.review_finished||s.graded_count!==s.total_cards;$('#finish-review').textContent=s.review_finished?'Оценивание завершено':'Завершить оценку';if(dialog.open&&s.review_finished)updateGradeButtons();}
function openCard(token){const card=snapshot.cards.find(c=>c.token===token);if(!card)return;selectedCard=token;selectedGrade=card.my_grade;$('#grade-question').textContent=`${snapshot.question.title}\n\n${snapshot.question.prompt}\n\nНа что смотрим: ${snapshot.question.evaluation_focus}`;$('#grade-answer').textContent=card.text;$('#grade-status').textContent=snapshot.review_finished?'Оценивание завершено. Оценки зафиксированы.':'';$('#grade-buttons').innerHTML=Array.from({length:11},(_,i)=>`<button type="button" data-action="select-grade" data-score="${i}" aria-pressed="${i===selectedGrade}">${i}</button>`).join('');updateGradeButtons();dialog.showModal();}
function updateGradeButtons(){const locked=snapshot.review_finished;document.querySelectorAll('#grade-buttons button').forEach(b=>{b.setAttribute('aria-pressed',String(Number(b.dataset.score)===selectedGrade));b.disabled=locked;});$('#save-grade').disabled=locked||selectedGrade===null;}
async function mutate(action,data={}){snapshot=await api(`/api/lobbies/${encodeURIComponent(snapshot.id)}/${action}`,data);renderLobby();}
async function perform(fn,followArena=false){
 if(mutationBusy)return;mutationBusy=true;mutationEpoch++;
 activePerformCount++;app.setAttribute('aria-busy','true');
 try{
  try{await fn();}catch(error){playTone('error');notice(error.message);}finally{
   mutationBusy=false;
   if(worldControlLost)return;
   let target=pendingArena;
   if(!target&&followArena){try{target=worldArenaLobby(await api('/api/world'));}catch(error){notice(error.message);}}
   if(target)await routeToArena(target,true);
   if(pendingCard)await routeToCards(pendingCard,true);
  }
 }finally{app.setAttribute('aria-busy',String(--activePerformCount>0));}
}
async function openCardTable(id){
 const table=await api(`/api/cards/${encodeURIComponent(id)}`);
 if(worldControlLost)return;
 cardSnapshot=table;snapshot=null;pendingCard=null;cardSignature='';
 const url=new URL(location.href);url.searchParams.delete('lobby');url.searchParams.delete('invite');url.searchParams.set('table',id);history.replaceState({},'',url);
 setScreen('cards','');renderCardTable();window.scrollTo({top:0,behavior:'instant'});
}
function renderCardTable(){
 const table=cardSnapshot;if(!table)return;
 const next=JSON.stringify(table);if(cardSignature===next)return;
 const ownHand=JSON.stringify(table.own_hand||table.players?.find(p=>p.id===table.my_id)?.cards||[]),sameHand=app.dataset.ownHand===ownHand;
 const durakSelection={cardIndex:sameHand?Number($('#durak-action-form [name="card_index"]:checked')?.value??-1):-1,attackIndex:Number($('.durak-pairs [name="attack_index"]:checked')?.value??-1)};
 const selected=sameHand?[...app.querySelectorAll('#card-exchange-form [name="indices"]:checked')].map(i=>Number(i.value)):[];
 const draft=$('#card-invite-form [name="nickname"]')?.value||'';
 const focused=document.activeElement,focusInvite=focused?.matches('#card-invite-form [name="nickname"]'),start=focusInvite?focused.selectionStart:null,end=focusInvite?focused.selectionEnd:null;
 app.innerHTML=cardTableHTML(table,selected,draft,durakSelection);app.dataset.ownHand=ownHand;cardSignature=next;
 $('#home-button').hidden=table.state==='playing';
 if(focusInvite&&$('#card-invite-form [name="nickname"]')){const input=$('#card-invite-form [name="nickname"]');input.focus({preventScroll:true});input.setSelectionRange(start,end);}
}
async function routeToCards(id,queued=false){
 if(!id||screen==='cards'&&cardSnapshot?.id===id)return;
 if(!queued&&!['home','profile','create','cards'].includes(screen)&&!canFollowArena(screen,bootstrap?.profile,snapshot))return;
 pendingCard=id;if(mutationBusy||cardRouting)return;
 cardRouting=true;mutationBusy=true;mutationEpoch++;pendingCard=null;
 try{if(worldCardTable(await api('/api/world'))!==id)return;await openCardTable(id);}catch(error){notice(error.message);}finally{mutationBusy=false;cardRouting=false;}
}
async function cardAction(action,data={}){cardSnapshot=await api(`/api/cards/${encodeURIComponent(cardSnapshot.id)}/${action}`,data);renderCardTable();}
const cityActions=new Set(['quest-claim','shop-buy','inventory-use','city-travel','friend-request','friend-accept','friend-dismiss','smoking-request','smoking-give','smoking-decline','card-open','card-join','card-start','card-hit','card-stand','card-keep','card-leave','card-invite-accept','card-invite-dismiss','fishing-start','fishing-catch','base-invite-accept','base-invite-dismiss','base-visit','base-invite-peer','card-durak-attack','card-durak-defend','card-durak-pickup','card-durak-pass']);
async function handleCityAction(button){
 const action=button.dataset.action;
 if(action==='base-visit'){closePhone(true);if(screen!=='home')await home();await worldView?.travel('base',{clan_id:button.dataset.clan});return;}
 if(action==='base-invite-peer'){await api(`/api/clans/${encodeURIComponent(worldSnapshot.my_clan.id)}/invite`,{to_id:activePeer});notice('Приглашение на базу отправлено.');return;}
 if(action==='base-invite-accept'||action==='base-invite-dismiss'){await api(`/api/base-invitations/${encodeURIComponent(button.dataset.id)}/${action==='base-invite-accept'?'accept':'dismiss'}`,{});await openPhone('messages');return;}
 if(action.startsWith('card-durak-')){const move=action.replace('card-durak-',''),data={move};if(['attack','defend'].includes(move)){const choice=$('#durak-action-form [name="card_index"]:checked');if(!choice)throw new Error('Выберите карту из своей руки.');data.card_index=Number(choice.value);}if(move==='defend'){const pair=$('.durak-pairs [name="attack_index"]:checked');if(!pair)throw new Error('Выберите непокрытую карту на столе.');data.attack_index=Number(pair.value);}await cardAction('act',data);if(cardSnapshot.state==='finished')await refreshEconomy();return;}
 if(action==='fishing-start'){await api('/api/fishing/start',{spot_id:button.dataset.spot});worldView?.refresh();playTone('action');}
 else if(action==='fishing-catch'){await api(`/api/fishing/${encodeURIComponent(button.dataset.id)}/catch`,{});await refreshEconomy();worldView?.refresh();playTone();}
 else if(action==='city-travel'){closeInventory();closePhone(true);if(screen!=='home')await home();await worldView?.travel(button.dataset.destination);return;}
 if(action==='quest-claim'){updateWallet(await api(`/api/quests/${encodeURIComponent(button.dataset.quest)}/claim`,{}));playTone('success');notice('Награда за задание получена.');}
 else if(action==='shop-buy'){updateWallet(await api('/api/shop/buy',{item_id:button.dataset.item,quantity:1}));playTone('pay');notice('Покупка в инвентаре.');}
 else if(action==='inventory-use'){
  const item=economySnapshot?.catalog?.find(i=>i.id===button.dataset.item);
  if(item?.kind==='outfit'){bootstrap.profile=await api('/api/profile',{name:bootstrap.profile.name,avatar:{...bootstrap.profile.avatar,...item.avatar}});worldView?.setProfile(bootstrap.profile);notice('Новый образ надет.');}
  else {const result=await api('/api/inventory/use',{item_id:button.dataset.item});updateWallet(result);worldView?.setActionState?.(result);await worldView?.refresh();if(!['coffee','snack'].includes(button.dataset.item))notice('Предмет использован.');}
 }
 else if(action==='friend-request'){await api('/api/friends/request',{to_id:button.dataset.peer});notice('Запрос дружбы отправлен.');return;}
 else if(action==='friend-accept'||action==='friend-dismiss'){await api(`/api/friends/requests/${encodeURIComponent(button.dataset.id)}/${action==='friend-accept'?'accept':'dismiss'}`,{});}
 else if(action==='smoking-request'){await api('/api/smoking/request',{to_id:button.dataset.peer});notice('Просьба отправлена игроку.');}
 else if(action==='smoking-give'||action==='smoking-decline')await api(`/api/smoking/requests/${encodeURIComponent(button.dataset.id)}/${action==='smoking-give'?'give':'decline'}`,{});
 else if(action==='card-open'){await openCardTable(button.dataset.id);return;}
 else if(action==='card-join'){await cardAction('join');return;}
 else if(action==='card-start'){await cardAction('start');return;}
 else if(['card-hit','card-stand','card-keep'].includes(action)){await cardAction('act',{move:action.replace('card-','')});if(cardSnapshot.state==='finished')await refreshEconomy();return;}
 else if(action==='card-leave'){await api(`/api/cards/${encodeURIComponent(cardSnapshot.id)}/leave`,{});await home();return;}
 else if(action==='card-invite-accept'){const table=await api(`/api/card-invitations/${encodeURIComponent(button.dataset.id)}/accept`,{});await openCardTable(table.id);return;}
 else if(action==='card-invite-dismiss'){await api(`/api/card-invitations/${encodeURIComponent(button.dataset.id)}/dismiss`,{});}
 if(inventoryOpen)renderInventory();
 if(phone.open)await renderFeaturePhone(phoneTab,phoneRevision,true);
}
async function handleCityForm(form,data){
 if(form.id==='card-create-form'){const table=await api('/api/cards',{game:data.game,title:data.title.trim(),stake:Number(data.stake),source:data.source});await openCardTable(table.id);}
 else if(form.id==='card-invite-form'){await api(`/api/cards/${encodeURIComponent(cardSnapshot.id)}/invite`,{to_name:data.nickname.trim()});notice('Приглашение отправлено в телефон игрока.');form.reset();}
 else if(form.id==='card-exchange-form'){await cardAction('act',{move:'exchange',indices:new FormData(form).getAll('indices').map(Number)});if(cardSnapshot.state==='finished')await refreshEconomy();}
 else if(form.id==='slots-form'){
  const stake=Number(data.stake),key=`bziker:slot-request:${bootstrap.profile.id}`;
  // Retain the nonce after an unknown response, including a reload or form refresh.
  if(!pendingSlotRequest){try{pendingSlotRequest=JSON.parse(stored(key)||'null');}catch{pendingSlotRequest=null;}}
  if(pendingSlotRequest){await recoverSlotRequest();if($('#slots-result'))$('#slots-result').innerHTML=slotResultHTML(lastSlotResult);await refreshEconomy();return;}
  pendingSlotRequest={stake,request_id:crypto.randomUUID()};
  saveLocal(key,JSON.stringify(pendingSlotRequest));lastSlotResult=await api('/api/casino/slots',pendingSlotRequest);pendingSlotRequest=null;saveLocal(key,'null');
  if($('#slots-result'))$('#slots-result').innerHTML=slotResultHTML(lastSlotResult);await refreshEconomy();
 }
}
document.addEventListener('click',event=>{const preview=$('#construction-preview');if(preview?.dataset.sampling==='true'&&event.target.closest('#construction-preview svg,.house-option svg')){event.preventDefault();const color=previewElementColor(event.target,$('#construction-form'));if(color){preview.dataset.sampling='false';setConstructionColor(color);$('#house-color-hint').textContent='Цвет выбран из предпросмотра.';}}});
document.addEventListener('pointerdown',()=>gameAudio.unlock(),{capture:true,passive:true});
document.addEventListener('keydown',()=>gameAudio.unlock(),{capture:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)gameAudio.stop();});
document.addEventListener('click',event=>{if(event.target.closest('button')&&!event.target.closest('[data-action]'))playTone('click');});
document.addEventListener('click',event=>{const button=event.target.closest('[data-action="account-password"]');if(button){event.preventDefault();togglePasswordVisibility(document.getElementById(button.dataset.input),button);}});
document.addEventListener('change',event=>{if(event.target.name==='control-layout')document.body.dataset.controlLayout=saveControlLayout(event.target.value);});
document.addEventListener('submit',event=>{event.preventDefault();const form=event.target;const data=Object.fromEntries(new FormData(form));const followArena=canFollowArena(screen,bootstrap?.profile,snapshot);if(['card-create-form','card-invite-form','card-exchange-form','slots-form'].includes(form.id)){perform(()=>handleCityForm(form,data));return;}perform(async()=>{if(form.id==='construction-form'){await submitConstruction(data);}
else if(form.id==='account-form'){await submitAccount(data);}
else if(form.id==='player-search-form'){const revision=phoneRevision;const result=await api(`/api/players?q=${encodeURIComponent(data.q.trim())}`);if(revision===phoneRevision&&$('#player-search-results'))$('#player-search-results').innerHTML=result.players.map(p=>playerRow(p)).join('')||'<p class="hint">Игроки не найдены.</p>';}
else if(form.id==='message-form'){const peer=activePeer,revision=phoneRevision,sender=bootstrap.profile.id;const result=await api(`/api/messages/${encodeURIComponent(peer)}`,{text:data.text});if(revision===phoneRevision&&peer===activePeer&&sender===bootstrap.profile?.id&&$('#message-form')){const field=$('#message-form textarea');if(field.value===data.text){field.value='';saveLocal(messageDraftKey(sender,peer),'');}updateMessages(result);playTone('action');}}
else if(form.id==='invitation-form'){await api('/api/invitations',{to_id:activePeer,lobby_id:data.lobby_id,role:data.role,...(data.role==='player'&&phoneInviteRooms.find(l=>l.id===data.lobby_id)?.teams?.find(t=>t.code)?{team_id:phoneInviteRooms.find(l=>l.id===data.lobby_id).teams.find(t=>t.code).id}:{})});notice('Приглашение отправлено.');}
else if(form.id==='name-form'){avatarForm(data.name.trim());}else if(form.id==='avatar-form'){bootstrap.profile=await api('/api/profile',{name:bootstrap.profile?.name||data.nickname.trim(),avatar:profileAvatar(avatar)});if(invite){const result=await api('/api/lobbies/join',{code:invite});invite='';await openLobby(result.id);}else await home();}else if(form.id==='create-form'){const result=await api('/api/lobbies',{title:data.title,mode:data.mode,max_teams:Number(data.max_teams||4),answer_policy:data.answer_policy,context:{theme:data.theme,audience:data.audience,goal:data.goal,constraints:data.constraints},meeting_url:data.meeting_url||''});await openLobby(result.id);}else if(form.id==='join-form'||form.id==='team-join-form'){const result=await api('/api/lobbies/join',{code:data.code.trim()});invite='';await openLobby(result.id);}else if(form.id==='clan-form'){await api('/api/clans',{name:data.name.trim(),color:data.color,flag:data.flag});notice('Клан создан. Вы его лидер.');await openPhone('clans');}else if(form.id==='team-form'){await mutate('teams',{name:data.name});}else if(form.id==='answer-form'){await mutate('answer',{text:data.text});notice('Ответ сохранён. До оценки его можно заменить.');}},followArena);});
document.addEventListener('change',event=>{if(event.target.matches('#invitation-form [name="lobby_id"]'))$('#invitation-form [name="role"]').innerHTML=inviteRoleOptions(phoneInviteRooms.find(l=>l.id===event.target.value));if(event.target.closest('#construction-form')){if(['exterior_color','house-color-hex'].includes(event.target.name))setConstructionColor(event.target.value);else updateConstructionPreview();}if(event.target.name==='lighting-mode')updateViewSettings({lightingMode:event.target.value});if(event.target.name==='show-nicknames')updateViewSettings({showNicknames:event.target.checked});if(event.target.name==='game-sound'){soundEnabled=event.target.checked;if(soundEnabled){gameAudio.unlock();playTone('select');}else gameAudio.stop();saveLocal('bziker:sound',soundEnabled?'on':'off');document.querySelectorAll('#settings-content [data-action="sound-preview"]').forEach(button=>button.disabled=!soundEnabled);}if(event.target.closest('#avatar-form')&&Object.hasOwn(parts,event.target.name)){avatar[event.target.name]=Number(event.target.value);updateAvatarPreview();}if(event.target.matches('#create-form [name="mode"]')){$('#capacity-label').hidden=event.target.value==='individual';}});
document.addEventListener('input',event=>{if(event.target.closest('#construction-form')&&['exterior_color','house-color-hex'].includes(event.target.name))setConstructionColor(event.target.value);if(event.target.name==='sound-volume'){soundVolume=Number(event.target.value)/100;saveLocal('bziker:volume',String(soundVolume));$('#sound-volume-value').textContent=`${Math.round(soundVolume*100)}%`;}if(event.target.matches('[name="city-zoom"]')){updateViewSettings({zoom:event.target.value});$('#zoom-value').textContent=`${viewSettings.zoom.toFixed(2)}×`;}if(event.target.matches('#message-form textarea'))saveLocal(messageDraftKey(bootstrap.profile.id,activePeer),event.target.value);if(event.target.matches('#avatar-form [name="nickname"]'))updateAvatarPreview();if(event.target.matches('#answer-form textarea'))saveLocal(draftKey(),event.target.value);});
document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(!button||button.disabled)return;const action=button.dataset.action;playTone('click');if(action==='inventory-select'){if(!inventoryBusy&&bagItems(economySnapshot||{}).some(row=>row.item_id===button.dataset.item)){inventorySelected=button.dataset.item;renderInventory();}return;}if(action==='inventory-close'){closeInventory();return;}if(cityActions.has(action)){perform(()=>handleCityAction(button));return;}gameAudio.unlock();if(action==='house-eyedropper'){constructionEyedropper().catch(error=>notice(error.message));return;}perform(async()=>{if(action==='inventory-cards'){closeInventory();await openPhone('cards');}else if(action==='inventory-rod'){closeInventory();await worldView?.travel('park');}else if(action==='house-color'){setConstructionColor(button.dataset.color);}else if(action==='catalog-tab'){catalogCategory=button.dataset.tab;$('#catalog-parts').innerHTML=catalogHTML();document.querySelectorAll('[data-action="catalog-tab"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===catalogCategory)));}
else if(action==='settings')openSettings();
else if(action==='sound-preview')playTone(['dog-bark','cat-meow'].includes(button.dataset.sound)?button.dataset.sound:'pay');
else if(action==='close-construction')constructionDialog.close();
else if(action==='close-settings')settingsDialog.close();
else if(action==='close-game-menu')closeGameMenu();
else if(action==='account-screen')accountScreen(button.dataset.mode);
else if(action==='account-logout'){bootstrap=await api('/api/account/logout',{});csrf=bootstrap.csrf_token;resetAccountCaches();accountScreen('login');}
else if(action==='splash')splash();
else if(action==='message-peer'){activePeer=button.dataset.peer;await openPhone('conversation');}
else if(action==='phone-back'){if(phoneTab==='apps')closePhone();else await openPhone('apps');}
else if(action==='world-control-return')await returnWorldControl();
else if(action==='district-entry'){closePhone(true);if(screen!=='home')await home();await worldView?.travel('district');}
else if(action==='clan-building'){await openConstruction(button.dataset.building);}
else if(action==='invite-accept'){const result=await api(`/api/invitations/${encodeURIComponent(button.dataset.id)}/accept`,{});await openLobby(result.lobby_id);}
else if(action==='invite-dismiss'){await api(`/api/invitations/${encodeURIComponent(button.dataset.id)}/dismiss`,{});await pollPhone();}
else if(action==='sound'){soundEnabled=!soundEnabled;if(!soundEnabled)gameAudio.stop();saveLocal('bziker:sound',soundEnabled?'on':'off');document.querySelectorAll('[data-action="sound"]').forEach(b=>{b.textContent=`Звук ${soundEnabled?'вкл.':'выкл.'}`;b.setAttribute('aria-pressed',String(soundEnabled));});playTone();}else if(action==='avatar-view'){avatarFacing=['down','left','up','right'].includes(button.dataset.facing)?button.dataset.facing:'down';updateAvatarPreview();}else if(action==='avatar-part'){avatar[button.dataset.part]=Number(button.dataset.value);if(button.dataset.part==='gender'){genderExpanded=false;const gender=$('#gender-choice');if(gender)gender.open=false;}updateAvatarPreview();}else if(action==='preset'){avatar={...avatarPresets[Number(button.dataset.index)].avatar};updateAvatarPreview();}else if(action==='phone')await openPhone();else if(action==='phone-tab')await openPhone(button.dataset.tab);else if(action==='base-entry')await enterBase();else if(action==='clan-apply'){await api(`/api/clans/${encodeURIComponent(button.dataset.id)}/apply`,{});notice('Заявка отправлена лидеру клана.');await openPhone('clans');}else if(['clan-accept','clan-transfer','clan-leave'].includes(action)){await api(`/api/clans/${encodeURIComponent(button.dataset.id)}/${action.replace('clan-','')}`,button.dataset.member?{account_id:button.dataset.member}:{});notice(action==='clan-transfer'?'Лидер клана назначен.':action==='clan-leave'?'Вы вышли из клана.':'Участник принят в клан.');await openPhone('clans');}else if(action==='retry')location.reload();else if(action==='enter')await profileForm();else if(action==='home')await home();else if(action==='edit-profile')await profileForm(true);else if(action==='back-name'){const name=$('#avatar-form').dataset.name;profileForm(editing);$('#name-form input').value=name;}else if(action==='shuffle'){avatar=shuffleAvatar();updateAvatarPreview();}else if(action==='create-screen')createForm();else if(action==='open-lobby')await openLobby(button.dataset.id);else if(action==='copy'){try{await navigator.clipboard.writeText(button.dataset.copy);notice('Скопировано.');}catch{notice('Выделите и скопируйте код из поля приглашения.');}}else if(action==='question')await mutate('question',{question_id:button.dataset.id});else if(action==='card')openCard(button.dataset.token);else if(action==='select-grade'){selectedGrade=Number(button.dataset.score);updateGradeButtons();}else if(action==='finish-review')await mutate('review/finish');else if(['start','review','finish','buzz'].includes(action))await mutate(action);});});
$('#close-phone').addEventListener('click',()=>closePhone());
function setPhoneExpanded(expanded){if(expanded)phone.classList.add('expanded');else phone.classList.remove('expanded');$('#expand-phone').setAttribute('aria-pressed',String(expanded));$('#expand-phone').setAttribute('aria-label',expanded?'Уменьшить телефон':'Развернуть телефон');}
$('#expand-phone').addEventListener('click',()=>setPhoneExpanded(!phone.classList.contains('expanded')));
document.addEventListener('keydown',event=>{if(event.key!=='Escape'||event.repeat)return;if(inventoryOpen){event.preventDefault();closeInventory();return;}if(phone.open){event.preventDefault();closePhone();return;}if(gameMenu.open){event.preventDefault();closeGameMenu();return;}if(screen==='home'&&!settingsDialog.open&&!constructionDialog.open&&!dialog.open&&!event.target.closest?.('input,textarea,select,[contenteditable=true]')){event.preventDefault();openGameMenu();}});
$('#game-menu-toggle').addEventListener('click',()=>perform(openGameMenu));
gameMenu.addEventListener('close',()=>$('#game-menu-toggle').setAttribute('aria-expanded','false'));
phone.addEventListener('cancel',event=>{event.preventDefault();closePhone();});
phone.addEventListener('close',()=>{stopPhonePolling();phoneRevision++;clearTimeout(phoneClosing);phone.classList.remove('closing');setPhoneExpanded(false);setSourcePhoneState(document.body,false,bootstrap?.profile?.avatar);});
phone.addEventListener('click',event=>{if(event.target===phone){const r=phone.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closePhone();}});

$('#home-button').addEventListener('click',()=>perform(home));$('#close-grade').addEventListener('click',()=>dialog.close());$('#save-grade').addEventListener('click',()=>perform(async()=>{const token=selectedCard,score=selectedGrade;await mutate('grade',{token,score});dialog.close();notice(`Оценка ${score} сохранена.`);}));
async function poll(){
 if(worldControlLost||document.hidden||pollBusy||mutationBusy)return;
 if(screen==='home'){
  if(phone.open||Date.now()-lastNotificationPoll<4000)return;
  lastNotificationPoll=Date.now();pollBusy=true;const epoch=mutationEpoch;
  try{const data=await api('/api/phone');if(screen==='home'&&epoch===mutationEpoch&&!data.restricted)updateNotifications(data);}
  catch(error){if(screen==='home'&&epoch===mutationEpoch&&error.status===403)await clearCityIdentity();}
  finally{pollBusy=false;}return;
 }
 if(screen==='cards'&&cardSnapshot){
  pollBusy=true;const epoch=mutationEpoch,id=cardSnapshot.id;
  try{const world=await api('/api/world');if(epoch!==mutationEpoch)return;if(world.restricted){await clearCityIdentity();return;}const arena=worldArenaLobby(world),table=worldCardTable(world);
   if(arena){await routeToArena(arena,true);return;}if(table&&table!==id){await routeToCards(table,true);return;}
   const fresh=await api(`/api/cards/${encodeURIComponent(id)}`);if(screen==='cards'&&cardSnapshot?.id===id&&epoch===mutationEpoch){cardSnapshot=fresh;renderCardTable();if(fresh.state==='finished'&&world.wallet)updateWallet({...economySnapshot,...world.wallet});}
  }catch(error){if(epoch===mutationEpoch&&error.status===403)await clearCityIdentity();else notice(error.message);}finally{pollBusy=false;}
  return;
 }
 if(screen==='create'||(screen==='profile'&&bootstrap?.profile)){
  pollBusy=true;const epoch=mutationEpoch;
  try{const world=await api('/api/world');if(epoch===mutationEpoch){if(world.restricted){await clearCityIdentity();return;}const target=worldArenaLobby(world);if(target)await routeToArena(target);else if(worldCardTable(world))await routeToCards(worldCardTable(world));}}catch(error){if(epoch===mutationEpoch&&error.status===403)await clearCityIdentity();else notice(error.message);}finally{pollBusy=false;}
  return;
 }
 if(screen!=='lobby'||!snapshot)return;pollBusy=true;try{const id=snapshot.id,epoch=mutationEpoch;const fresh=await api(`/api/lobbies/${encodeURIComponent(id)}`);if(screen==='lobby'&&snapshot?.id===id&&epoch===mutationEpoch){snapshot=fresh;renderLobby();if(lobbySurface(fresh)==='sky')await api('/api/world/move',{scene:'arena',lobby_id:fresh.id,x:600,y:510});else if(canFollowArena('lobby',bootstrap?.profile,fresh)){const world=await api('/api/world');if(epoch===mutationEpoch){const target=worldArenaLobby(world);if(target)await routeToArena(target);else if(worldCardTable(world))await routeToCards(worldCardTable(world));}}}}catch(error){notice(error.message);}finally{pollBusy=false;}}
setInterval(poll,3000);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPhonePolling();else{poll();if(phone.open)pollPhone();}});
async function restoreAccountRoute(){
 if(bootstrap?.profile&&!await acquireWorldControl())return;
 const world=await api('/api/world'),arena=worldArenaLobby(world),table=worldCardTable(world),id=currentLobby(),requestedTable=new URL(location.href).searchParams.get('table');
 if(arena)await openLobby(arena);else if(table)await openCardTable(table);else if(id)await openLobby(id);else if(requestedTable)await openCardTable(requestedTable);else if(invite){const joined=await api('/api/lobbies/join',{code:invite});invite='';await openLobby(joined.id);}else await home();
}
async function init(){try{bootstrap=await api('/api/bootstrap');csrf=bootstrap.csrf_token;const bridge=window.Telegram?.WebApp;if(bridge?.initData){bootstrap=await api('/api/auth/telegram',{init_data:bridge.initData});csrf=bootstrap.csrf_token;bridge.ready();bridge.expand();}$('#mode-badge').textContent=bootstrap.auth_mode==='demo'?'Локальная версия':'Telegram';if(accountGate(bootstrap)){accountScreen('register');return;}if(!bootstrap.authenticated&&bootstrap.auth_mode==='demo'){accountScreen('login');return;}if(!bootstrap.authenticated){setScreen('auth',`<section class="waiting panel"><h1>Откройте игру в Telegram</h1><p>Для входа нужен запуск Mini App через настроенного бота.</p></section>`);return;}if(!bootstrap.profile){splash();return;}
 await restoreAccountRoute();
 }catch(error){setScreen('error',`<section class="waiting panel"><h1>Не удалось войти</h1><p>${escape(error.message)}</p><button data-action="home">Вернуться в город</button><button data-action="retry">Повторить вход</button><p class="hint">Если сервер недоступен, запустите его и обновите страницу.</p></section>`);}}
init();
