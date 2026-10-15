import test from 'node:test';
import assert from 'node:assert/strict';
import * as builder from '../web/profile-builder.js';
import * as ui from '../web/gameplay-ui.js';
import {cityPhoneHTML} from '../web/city-features.js';

test('phone groups retain all12 apps with explicit navigation and pixel icons',()=>{
 assert.equal(typeof ui.phoneAppsHTML,'function');
 const html=ui.phoneAppsHTML({name:'<Искра>'});
 assert.equal((html.match(/data-action="phone-tab"/g)||[]).length,12);
 assert.equal(new Set([...html.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1])).size,12);
 for(const label of ['Общение','Клан и персонаж','Игры и город'])assert.match(html,new RegExp(label));
 assert.match(html,/&lt;Искра&gt;/);assert.match(html,/id="phone-unread"/);
 assert.equal((html.match(/class="pixel-icon"/g)||[]).length,12);
});

test('complex phone views expand automatically and quick tools retain the compact city view',()=>{
 assert.equal(typeof ui.phoneNeedsExpansion,'function');
 for(const tab of ['conversation','messages','clans','search','games','cards','casino','friends'])assert.equal(ui.phoneNeedsExpansion(tab),true,tab);
 for(const tab of ['apps','inventory','travel','profile','wallet','fishing'])assert.equal(ui.phoneNeedsExpansion(tab),false,tab);
});

test('inventory symbols distinguish food and pets while preserving item actions and counts',()=>{
 assert.equal(typeof ui.inventoryIconsHTML,'function');
 const economy={balance:25,inventory:[{item_id:'coffee',quantity:2,item:{name:'Кофе',kind:'food'}},{item_id:'pet-dog',quantity:1,item:{name:'Собака',kind:'pet'}},{item_id:'pet-cat',quantity:1,item:{name:'Кошка',kind:'pet'}}]};
 const before=cityPhoneHTML('inventory',{economy}),after=ui.inventoryIconsHTML(before,economy);
 assert.equal((after.match(/class="pixel-icon item-pixel-icon"/g)||[]).length,3);
 assert.match(after,/data-item-icon="coffee"/);assert.match(after,/data-item-icon="pet-dog"/);assert.match(after,/data-item-icon="pet-cat"/);
 assert.deepEqual([...after.matchAll(/data-item="([^"]+)"/g)].map(m=>m[1]),[...before.matchAll(/data-item="([^"]+)"/g)].map(m=>m[1]));
 assert.match(after,/Количество: 2/);assert.notEqual(ui.itemIconSVG('pet-cat'),ui.itemIconSVG('pet-dog'));
});

test('lobby offers mode and topic first while retaining every optional submit field',()=>{
 assert.equal(typeof ui.lobbyCreateHTML,'function');
 const html=ui.lobbyCreateHTML(),advanced=html.indexOf('<details');
 assert.ok(html.indexOf('name="mode"')<advanced);assert.ok(html.indexOf('name="theme"')<advanced);
 assert.doesNotMatch(html,/<details[^>]* open/);
 for(const field of ['title','answer_policy','max_teams','audience','goal','constraints','meeting_url'])assert.ok(html.indexOf(`name="${field}"`)>advanced,field);
 assert.match(html,/name="title"[^>]*value="Креатив над облаками"/);
 assert.ok(html.indexOf('</details>')<html.indexOf('type="submit"'));
});

test('catalog offers4 real directions without changing the locked nickname',()=>{
 assert.equal(typeof builder.avatarPreviewHTML,'function');
 const avatar={hairStyle:7,headwear:3,outfit:4},images=[];
 for(const facing of ['down','left','up','right']){
  const html=builder.avatarPreviewHTML(avatar,{name:'Главный ник',facing});
  assert.equal((html.match(/data-action="avatar-view"/g)||[]).length,4);
  assert.match(html,new RegExp(`data-facing="${facing}"[^>]*aria-pressed="true"`));
  assert.match(html,/id="nickname-preview">Главный ник/);images.push(html.split('<strong')[0]);
 }
 assert.equal(new Set(images).size,4);
});

test('hair previews crop to the head and costumes retain the fullbody frame',()=>{
 assert.match(builder.catalogPartSVG('hairStyle',7),/viewBox="0 0 48 40"/);
 assert.match(builder.catalogPartSVG('headwear',2),/headgear-preview/);
 assert.match(builder.catalogPartSVG('outfit',4),/viewBox="0 0 48 64"/);
});

test('the current answering unit is visible in sky while curator identities remain hidden',()=>{
 assert.equal(typeof ui.skySceneHTML,'function');
 const s={role:'participant',mode:'team',state:'answering',answer_policy:'first',buzz_owner_name:'Искра',chooser_name:'Ветер',jury_count:1,teams:[{id:'a',name:'Искра',captain_id:'p',score:10,members:[{id:'p',name:'Капитан',avatar:{}}]},{id:'b',name:'Ветер',members:[],score:0}],players:[]};
 const html=ui.skySceneHTML(s);
 assert.match(html,/<article class="cloud is-active"[^>]*data-unit="a"/);
 assert.match(html,/Отвечает: Искра/);assert.match(html,/captain-mark">Капитан/);
 assert.equal(ui.skySceneHTML({...s,role:'curator'}),'');
});

test('final podium preserves shared places, fractional points and real clan metadata',()=>{
 assert.equal(typeof ui.resultsPodiumHTML,'function');
 const s={role:'participant',mode:'individual',players:[{id:'a',name:'<Первый>',score:15.5,avatar:{}},{id:'b',name:'Второй',score:15.5,avatar:{}},{id:'c',name:'Третий',score:7,avatar:{}}]};
 const html=ui.resultsPodiumHTML(s,{id:'clan',name:'Звёзды',flag:'⚑',members:[{id:'a'},{id:'b'}]});
 assert.equal((html.match(/data-rank="1"/g)||[]).length,2);assert.match(html,/data-rank="3"/);
 assert.match(html,/15,5/);assert.match(html,/&lt;Первый&gt;/);assert.match(html,/⚑/);assert.match(html,/Звёзды/);
 assert.equal(ui.resultsPodiumHTML({...s,role:'curator'}),'');
});
