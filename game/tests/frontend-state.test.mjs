import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as ui from '../web/avatar.js';
test('jury never enters identifiable city or sky during unfinished assignment',()=>{
 assert.equal(ui.lobbySurface?.({role:'curator',state:'waiting'}),'jury');
 assert.equal(ui.lobbySurface?.({role:'curator',state:'reviewing'}),'jury');
});
test('waiting participants remain in preflight and active participants enter sky',()=>{
 assert.equal(ui.lobbySurface?.({role:'player',state:'waiting'}),'preflight');
 assert.equal(ui.lobbySurface?.({role:'player',state:'answering'}),'sky');
 assert.equal(ui.lobbySurface?.({role:'player',state:'finished'}),'results');
});
test('takeoff occurs once on same lobby waiting to active transition',()=>{
 const waiting={id:'a',state:'waiting',role:'player'};
 assert.equal(ui.shouldTakeoff?.(waiting,{...waiting,state:'choosing'}),true);
 assert.equal(ui.shouldTakeoff?.({...waiting,state:'answering'},{...waiting,state:'reviewing'}),false);
 assert.equal(ui.shouldTakeoff?.(waiting,{...waiting,id:'b',state:'choosing'}),false);
 assert.equal(ui.shouldTakeoff?.({...waiting,role:'curator'},{...waiting,role:'curator',state:'choosing'}),false);
});
test('first buzz captions reflect server authorization and winning unit',()=>{
 assert.equal(ui.answerCaption?.({answer_policy:'first',can_buzz:true}),'Первым нажмите кнопку, чтобы получить право ответа.');
 assert.equal(ui.answerCaption?.({answer_policy:'first',can_answer:true,buzzed_by_me:true}),'Право ответа у вас. Отправьте идею.');
 assert.equal(ui.answerCaption?.({answer_policy:'first',buzz_owner_name:'Искра'}),'Отвечает: Искра.');
 assert.equal(ui.answerCaption?.({answer_policy:'all',can_answer:true}),'Все участники могут отправить ответ.');
});
test('nickname edits cannot add arbitrary fields to saved avatar payload',()=>{
 const candidate={...ui.defaultAvatar,nickname:NaN,skin:3};
 assert.deepEqual(ui.profileAvatar?.(candidate),{...ui.defaultAvatar,skin:3});
 assert.equal(Object.hasOwn(ui.profileAvatar?.(candidate)||{},'nickname'),false);
});
test('city automatically routes an authorized arena snapshot to its active lobby',()=>{
 assert.equal(ui.worldArenaLobby?.({restricted:false,scene:'arena',arena_lobby_id:'active-game'}),'active-game');
 assert.equal(ui.worldArenaLobby?.({restricted:false,scene:'city',arena_lobby_id:null}),null);
});
test('restricted jury and malformed world snapshots never route to identifiable arena',()=>{
 assert.equal(ui.worldArenaLobby?.({restricted:true,scene:'arena',arena_lobby_id:'hidden-game'}),null);
 assert.equal(ui.worldArenaLobby?.({restricted:false,scene:'arena',arena_lobby_id:42}),null);
 assert.equal(ui.worldArenaLobby?.({restricted:false,scene:'arena',arena_lobby_id:''}),null);
 assert.equal(ui.worldArenaLobby?.({scene:'arena',arena_lobby_id:'unverified-game'}),null);
 assert.equal(ui.worldArenaLobby?.(null),null);
});
test('all existing participants follow arena routing from city or editing screens only',()=>{
 for(const screen of ['home','create','profile'])assert.equal(ui.canFollowArena?.(screen,true),true);
 for(const screen of ['loading','lobby','restricted','splash'])assert.equal(ui.canFollowArena?.(screen,true),false);
 assert.equal(ui.canFollowArena?.('profile',false),false);
});
test('participants waiting in another lobby or viewing results follow an active arena assignment',()=>{
 for(const state of ['waiting','finished'])assert.equal(ui.canFollowArena?.('lobby',true,{role:'participant',state}),true);
 for(const state of ['choosing','answering','reviewing'])assert.equal(ui.canFollowArena?.('lobby',true,{role:'participant',state}),false);
 for(const state of ['waiting','reviewing','finished'])assert.equal(ui.canFollowArena?.('lobby',true,{role:'curator',state}),false);
});

const appSource=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
const helpersSource=appSource.match(/\/\/ PHONE_STATE_HELPERS_START([\s\S]*?)\/\/ PHONE_STATE_HELPERS_END/)?.[1]||'';
const phoneState=await import(`data:text/javascript;base64,${Buffer.from(helpersSource).toString('base64')}`);
test('view settings clamp zoom and preserve explicit hidden nickname choice',()=>{
 assert.deepEqual(phoneState.normalizeViewSettings?.({zoom:9,showNicknames:false}),{zoom:1.6,showNicknames:false,lightingMode:'auto'});
 assert.deepEqual(phoneState.normalizeViewSettings?.({zoom:'bad'}),{zoom:1.25,showNicknames:true,lightingMode:'auto'});
 assert.deepEqual(phoneState.normalizeViewSettings?.({zoom:.2,lightingMode:'night'}),{zoom:.8,showNicknames:true,lightingMode:'night'});
 assert.equal(phoneState.normalizeViewSettings({lightingMode:'invalid'}).lightingMode,'auto');
});
test('social polling is confined to an open visible unrestricted phone',()=>{
 assert.equal(phoneState.phoneCanPoll?.({open:true,hidden:false,restricted:false,tab:'messages'}),true);
 for(const state of [{open:false},{hidden:true},{restricted:true},{tab:'settings'}])assert.equal(phoneState.phoneCanPoll?.({open:true,hidden:false,restricted:false,tab:'messages',...state}),false);
 assert.equal(phoneState.phoneCanPoll?.({open:true,hidden:false,restricted:false,tab:'friends'}),true);
});
test('message drafts are separated by sender and recipient',()=>{
 assert.notEqual(phoneState.messageDraftKey?.('me','one'),phoneState.messageDraftKey?.('me','two'));
 assert.notEqual(phoneState.messageDraftKey?.('me','one'),phoneState.messageDraftKey?.('other','one'));
});
test('city mounting preserves base and migrates district into unified city',()=>{
 assert.equal(phoneState.initialCityScene?.({scene:'district',restricted:false}),'city');
 assert.equal(phoneState.initialCityScene?.({scene:'base',restricted:false}),'base');
 for(const snapshot of [{scene:'arena'},{scene:'bad'},{scene:'base',restricted:true},null])assert.equal(phoneState.initialCityScene?.(snapshot),'city');
});
test('reload mounts only an authorized matching public interior and rejects stale room metadata',()=>{
 const room={scene:'interior',restricted:false,interior_id:'shop-food',interior:{id:'shop-food'}};
 assert.equal(phoneState.initialCityScene(room),'interior');
 for(const changed of [{restricted:true},{interior_id:'casino'},{interior:null},{interior_id:''}])assert.equal(phoneState.initialCityScene({...room,...changed}),'city');
});
