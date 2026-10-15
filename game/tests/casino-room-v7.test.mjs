import test from 'node:test';
import assert from 'node:assert/strict';
import {casinoRoomHTML} from '../web/casino-room.js';
import {cardTableHTML} from '../web/card-games.js';

const room={id:'poker',source:'casino',game:'poker',state:'playing',my_id:'one',turn_id:'two',players:[{id:'one',name:'Анна',avatar:{skin:1,hairStyle:6},cards:['AS']},{id:'two',name:'Пётр',avatar:{skin:4,hairStyle:3},cards:['SECRET-RIVAL-CARD']}]};
test('casino visual seats the actual participants and never renders secret hand data',()=>{
 const visual=casinoRoomHTML(room);
 assert.match(visual,/data-casino-player="one"/);assert.match(visual,/data-casino-player="two"/);
 assert.equal((visual.match(/class="pixel-avatar"/g)||[]).length,2);
 assert.match(visual,/ПОКЕР/);assert.match(visual,/КАССА/);
 assert.doesNotMatch(visual,/SECRET-RIVAL-CARD|AS/);
 const updated=casinoRoomHTML({...room,players:room.players.map(p=>({...p,avatar:{skin:0,hairStyle:1}}))});
 assert.notEqual(visual,updated,'A saved avatar change must appear in the casino');
});
test('private card rooms do not become a casino and actual action forms remain available',()=>{
 assert.equal(casinoRoomHTML({...room,source:'deck'}),'');
 const html=cardTableHTML({...room,can_act:true});
 assert.match(html,/casino-room-scene/);assert.match(html,/id="card-exchange-form"/);
 assert.doesNotMatch(cardTableHTML({...room,source:'deck'}),/casino-room-scene/);
});
test('casino visual escapes names and IDs and caps seats to four',()=>{
 const p={id:'"><script>alert(1)</script>',name:'<img onerror="oops">',avatar:{}};
 const html=casinoRoomHTML({...room,players:Array(8).fill(p)});
 assert.doesNotMatch(html,/<script|<img/);assert.match(html,/&lt;img/);
 assert.equal((html.match(/data-casino-player=/g)||[]).length,4);
});
