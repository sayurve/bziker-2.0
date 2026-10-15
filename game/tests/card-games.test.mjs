import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {avatarSVG} from '../web/avatar.js';

const moduleURL = new URL('../web/card-games.js', import.meta.url);
const cards = existsSync(moduleURL) ? await import(moduleURL) : {};
const player = (id, name, hand, extra = {}) => ({id, name, avatar:{skin:id==='a'?2:4}, card_count:hand.length, cards:hand, ...extra});
const table = extra => ({id:'room1',title:'Вечер',game:'poker',source:'casino',state:'playing',host_id:'a',stake:10,
  my_id:'a',turn_id:'a',can_act:true,can_start:false,
  players:[player('a','Анна',['AS','10H','KD','2C','3S']),player('b','Борис',['AH','QS','4D','5C','6S'])],results:[],...extra});

test('panel shows actual source tables and addressed invitations with stable form contracts',()=>{
  assert.equal(typeof cards.cardGamesPanelHTML,'function','Card panel helper is required');
  const data={tables:[{id:'casino1',title:'Публичный',source:'casino',game:'blackjack',state:'waiting',stake:5,player_count:1},
    {id:'deck1',title:'Приватный',source:'deck',game:'poker',state:'waiting',stake:10,player_count:2}],
    invitations:[{id:'invite1',table_id:'deck1',from:{name:'Анна'},title:'Вечер',game:'poker',stake:10}]};
  const casino=cards.cardGamesPanelHTML(data,{source:'casino',balance:25});
  assert.match(casino,/data-action="card-open" data-id="casino1"/);
  assert.doesNotMatch(casino,/data-action="card-open" data-id="deck1"/);
  assert.match(casino,/id="slots-form"/);
  assert.match(casino,/id="card-create-form"/);
  assert.match(casino,/name="source" value="casino"/);
  assert.match(casino,/data-action="card-invite-accept" data-id="invite1"/);
  assert.match(casino,/data-action="card-invite-dismiss" data-id="invite1"/);
  const deck=cards.cardGamesPanelHTML(data,{source:'deck',balance:25});
  assert.match(deck,/name="source" value="deck"/);
  assert.match(deck,/data-action="card-open" data-id="deck1"/);
  assert.doesNotMatch(deck,/id="slots-form"/);
});

const createFormHTML=html=>html.match(/<form id="card-create-form"[\s\S]*?<\/form>/)?.[0]||'';
const createSubmitHTML=html=>createFormHTML(html).match(/<button\b[^>]*type="submit"[^>]*>/)?.[0]||'';

test('private room creation without a purchased deck is disabled and explains how to unlock it',()=>{
 const html=cards.cardGamesPanelHTML({}, {source:'deck',balance:25,hasDeck:false});
 assert.match(createSubmitHTML(html),/\bdisabled\b/);
 assert.match(html,/купите.*колод|колод.*купить/i);
 assert.match(html,/лавк[аеуы]/i);
 assert.match(createFormHTML(html),/name="source" value="deck"/);
});

test('a purchased deck enables private room creation and retains its inventory explanation',()=>{
 const html=cards.cardGamesPanelHTML({}, {source:'deck',balance:25,hasDeck:true});
 assert.ok(createSubmitHTML(html));
 assert.doesNotMatch(createSubmitHTML(html),/\bdisabled\b/);
 assert.match(html,/Купленная колода остаётся в инвентаре/);
 assert.doesNotMatch(html,/купите.*колод/i);
});

test('casino room creation does not require a purchased deck',()=>{
 const html=cards.cardGamesPanelHTML({}, {source:'casino',balance:25,hasDeck:false});
 assert.ok(createSubmitHTML(html));
 assert.doesNotMatch(createSubmitHTML(html),/\bdisabled\b/);
 assert.match(createFormHTML(html),/name="source" value="casino"/);
 assert.doesNotMatch(html,/купите.*колод/i);
});

test('playing room hides rival hand even if data contains it and preserves own selections',()=>{
  assert.equal(typeof cards.cardTableHTML,'function','Card table helper is required');
  const html=cards.cardTableHTML(table(),[1,4]);
  assert.match(html,/Туз пик/);
  assert.doesNotMatch(html,/Туз червей|Дама пик/);
  assert.equal((html.match(/class="playing-card card-back"/g)||[]).length,5);
  assert.match(html,/id="card-exchange-form"/);
  assert.match(html,/name="indices" value="1" checked/);
  assert.match(html,/name="indices" value="4" checked/);
  assert.ok(html.includes(avatarSVG({skin:2})));
  assert.ok(html.includes(avatarSVG({skin:4})));
  assert.doesNotMatch(html,/Крупье|card-dealer/);
});

test('finished room reveals actual cards and payouts; waiting nonmember can join',()=>{
  assert.equal(typeof cards.cardTableHTML,'function');
  const html=cards.cardTableHTML(table({state:'finished',turn_id:null,can_act:false,
    results:[{id:'a',payout:20,net:10,outcome:'win',combination:'Пара'}, {id:'b',payout:0,net:-10,outcome:'lose',combination:'Старшая карта'}]}));
  assert.match(html,/Туз червей/);
  assert.match(html,/Пара/);
  assert.match(html,/data-action="card-leave"/);
  assert.doesNotMatch(html,/id="card-exchange-form"|card-back/);
  const waiting=cards.cardTableHTML(table({state:'waiting',my_id:'outside',can_act:false}));
  assert.match(waiting,/data-action="card-join"/);
  assert.doesNotMatch(waiting,/id="card-invite-form"|data-action="card-start"/);
});

test('blackjack dealer second card remains closed until finish and host invitation draft is escaped',()=>{
  assert.equal(typeof cards.cardTableHTML,'function');
  const html=cards.cardTableHTML(table({game:'blackjack',dealer:{name:'Крупье',card_count:2,cards:['7D','KS']},
    players:[player('a','Анна',['AS','10H'],{score:21})]}));
  assert.match(html,/Семёрка бубен/);
  assert.doesNotMatch(html,/Король пик/);
  assert.match(html,/data-action="card-hit"/);
  assert.match(html,/data-action="card-stand"/);
  assert.match(html,/seller-mascot/);
  const waiting=cards.cardTableHTML(table({state:'waiting',can_act:false,can_start:true}),[],`"><script>alert(1)</script>`);
  assert.match(waiting,/id="card-invite-form"/);
  assert.match(waiting,/name="nickname"/);
  assert.match(waiting,/data-action="card-start"/);
  assert.doesNotMatch(waiting,/<script>|value="">/);
});

test('all user text is escaped while invalid card and slot codes never become markup',()=>{
  assert.equal(typeof cards.cardGamesPanelHTML,'function');
  assert.equal(typeof cards.slotResultHTML,'function');
  const attack=`"><img src=x onerror=alert(1)>`;
  const html=cards.cardTableHTML(table({id:attack,title:attack,players:[player('a',attack,[attack])],rules:attack}));
  assert.doesNotMatch(html,/<img src=x|<script|onerror="/);
  assert.match(html,/&lt;img/);
  const panel=cards.cardGamesPanelHTML({tables:[{id:attack,title:attack,source:'casino',game:'poker',stake:1,player_count:1}],
    invitations:[{id:attack,from:{name:attack},title:attack,stake:1}]},{source:'casino',balance:0});
  assert.doesNotMatch(panel,/<img src=x/);
  const slots=cards.slotResultHTML({reels:['seven','bell',attack],stake:5,payout:0,net:-5,balance:10});
  assert.match(slots,/Семёрка|Колокол/);
  assert.doesNotMatch(slots,/<img src=x/);
});

test('Durak presents only own hand and public board, with server-authorized moves',()=>{
 const room=table({game:'durak',own_hand:['6H','KS'],durak:{trump_suit:'S',trump_card:'AS',deck_count:24,discard_count:0,attacker_id:'b',defender_id:'a',board:[{attack:'6D',defense:null}],allowed_moves:['defend','pickup'],finished_ids:[]}});
 const html=cards.cardTableHTML(room,[],'',{cardIndex:1,attackIndex:0});
 assert.match(html,/Подкидной дурак/);assert.match(html,/Король пик/);assert.match(html,/Шестёрка бубен/);
 assert.doesNotMatch(html,/Туз червей|Дама пик/);
 assert.match(html,/name="card_index" value="1" checked/);
 assert.match(html,/data-action="card-durak-attack" disabled/);
 assert.match(html,/data-action="card-durak-defend" >/);
 const waiting=cards.cardTableHTML({...room,can_act:false});
 assert.match(waiting,/data-action="card-durak-defend" disabled/);
 assert.match(cards.cardGamesPanelHTML({}, {source:'deck'}),/option value="durak"/);
});

test('rendered suit and turn classes have matching visual selectors',()=>{
 const html=cards.cardTableHTML(table());
 const css=readFileSync(new URL('../web/styles.css',import.meta.url),'utf8');
 assert.match(html,/playing-card card-red/);
 assert.ok(/\.playing-card\.card-red(?:[\s,{:]|$)/.test(css),'Red suits must use the renderer class');
 assert.match(html,/card-player-turn/);
 assert.ok(/\.card-player\.card-player-turn(?:[\s,{:]|$)/.test(css),'Current turn must use the renderer class');
});
