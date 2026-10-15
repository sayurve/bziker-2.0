import test from 'node:test';
import assert from 'node:assert/strict';
import * as features from '../web/city-features.js';

test('shop availability uses real wallet and owned durable items',()=>{
 const e={balance:20,catalog:[{id:'coffee',name:'Кофе',shop:'shop-food',price:15,kind:'food'},{id:'outfit-1',name:'Куртка',shop:'shop-clothes',price:100,kind:'clothes'}],inventory:[]};
 assert.equal(features.purchaseAvailable(e,'coffee'),true);
 assert.equal(features.purchaseAvailable(e,'outfit-1'),false);
 assert.equal(features.purchaseAvailable(e,'not-a-product'),false);
 assert.equal(features.purchaseAvailable({...e,balance:200,inventory:[{item_id:'outfit-1',quantity:1}]},'outfit-1'),false);
});
test('locked outfit choices do not become free through catalog rendering',()=>{
 assert.equal(features.outfitUnlocked(0,[]),true);
 assert.equal(features.outfitUnlocked(2,[0,1]),false);
 assert.equal(features.outfitUnlocked(2,[0,2]),true);
});
test('quest and friend labels are escaped and invitations identify actual sender',()=>{
 const html=features.cityPhoneHTML('quests',{economy:{balance:0,quests:[{id:'firstprofile',name:'<img src=x>',reward:30,eligible:true,claimed:false}]}});
 assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img src=x>/);assert.match(html,/data-quest="firstprofile"/);
 const friends=features.cityPhoneHTML('friends',{friends:{friends:[],requests:[{id:'r1',from:{id:'u1',name:'Настоящий игрок',avatar:{}}}],sent:[]}});
 assert.match(friends,/Настоящий игрок/);assert.match(friends,/friend-accept/);
});

test('fishing needs a rod and only enables catching after server ready time',()=>{
 assert.match(features.fishingPhoneHTML({}),/Нужна удочка/);
 const state={economy:{inventory:[{item_id:'rod',quantity:1}]},fishing:{active:{id:'cast1',ready_at:100,state:'waiting'}},spotId:'lake-1'};
 assert.match(features.fishingPhoneHTML({...state,now:99}),/data-id="cast1" disabled/);
 assert.match(features.fishingPhoneHTML({...state,now:100}),/Клюёт!/);
 assert.match(features.fishingPhoneHTML({...state,fishing:{active:{...state.fishing.active,state:'caught'}},now:101}),/Рыба поймана/);
});

test('a cast at a different fishing spot does not block casting at the current spot',()=>{
 const economy={inventory:[{item_id:'rod',quantity:1}]};
 const fishing={active:{id:'old-cast',spot_id:'lake-1',ready_at:100,state:'ready'}};
 const html=features.fishingPhoneHTML({economy,fishing,spotId:'boat:boat-1',now:101});
 assert.match(html,/data-action="fishing-start" data-spot="boat:boat-1"/);
 assert.doesNotMatch(html,/data-action="fishing-catch"/);
 assert.match(html,/Рыбалка с лодки/);
});
test('pet selection and addressed base invitations keep stored identity and escape text',()=>{
 const e={balance:200,selected_pet:'pet-dog',inventory:[{item_id:'pet-dog',quantity:1,item:{id:'pet-dog',name:'Собака',kind:'pet'}}],catalog:[{id:'pet-dog',price:180,kind:'pet'}]};
 assert.equal(features.purchaseAvailable(e,'pet-dog'),false);
 assert.match(features.cityPhoneHTML('inventory',{economy:e}),/data-item="pet-dog" disabled>С вами/);
 const invite=features.baseInvitationsHTML({invitations:[{id:'inv1',state:'pending',from:{name:'<Лидер>'},clan:{name:'Клан'}}]});
 assert.match(invite,/&lt;Лидер&gt;/);assert.match(invite,/base-invite-accept/);
 assert.match(features.baseVisitsHTML({visits:[{id:'clan1',name:'Клан'}]}),/data-action="base-visit" data-clan="clan1"/);
});
