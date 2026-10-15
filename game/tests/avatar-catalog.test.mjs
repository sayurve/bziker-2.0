import test from 'node:test';
import assert from 'node:assert/strict';
import * as avatar from '../web/avatar.js';
import {render as nativeRender} from './helpers/character-core-native-fixture-v30.mjs';

test('catalog exposes two body choices and broad named visual parts',()=>{
 assert.equal(avatar.parts.gender?.options.length,2);
 assert.equal(avatar.parts.hairStyle.options.length,12);
 assert.equal(avatar.parts.shirtStyle?.options.length,4);
 assert.equal(avatar.parts.pantsStyle?.options.length,4);
 assert.equal(avatar.parts.accessory.options.length,6);
 assert.equal(avatar.avatarPresets.length,6);
});
test('legacy avatar retains saved part values and new parts get safe defaults',()=>{
 const old={skin:2,hairStyle:1,hairColor:3,shirtColor:4,pantsColor:2,accessory:1};
 assert.deepEqual(avatar.profileAvatar({...old,nickname:'not-avatar'}),{...avatar.defaultAvatar,...old});
 assert.equal(avatar.profileAvatar({gender:99,hairStyle:NaN}).gender,0);
 assert.equal(avatar.profileAvatar({gender:1,hairStyle:11,shirtStyle:3,pantsStyle:3}).hairStyle,11);
});
test('all hairstyle thumbnails and body/outfit choices visibly differ',()=>{
 assert.equal(new Set(Array.from({length:12},(_,hairStyle)=>avatar.avatarSVG({hairStyle}))).size,12);
 assert.notEqual(avatar.avatarSVG({gender:0}),avatar.avatarSVG({gender:1}));
 assert.equal(new Set(Array.from({length:4},(_,shirtStyle)=>avatar.avatarSVG({shirtStyle}))).size,4);
 assert.equal(new Set(Array.from({length:4},(_,pantsStyle)=>avatar.avatarSVG({pantsStyle}))).size,4);
});
test('jury silhouette cannot reveal author customization',()=>{
 assert.equal(avatar.avatarSVG({gender:1,hairStyle:11,shirtStyle:3,accessory:5},true),avatar.avatarSVG({},true));
});
test('same avatar has walking/facing canvas frames and no dynamic unsafe colors',()=>{
 assert.equal(typeof avatar.drawAvatarCanvas,'function');
 const render=options=>nativeRender({hairStyle:11,shirtStyle:2,pantsStyle:1},options).rects;
 assert.notDeepEqual(render({facing:'down'}),render({facing:'up'}));
 assert.notDeepEqual(render({facing:'down',walking:true,walkFrame:0}),render({facing:'down',walking:true,walkFrame:2}));
 assert.ok(render({facing:'left'}).every(p=>[p.x,p.y,p.w,p.h].every(Number.isFinite)&&/^#[0-9a-f]{6}$/i.test(p.color)));
});
test('phone, sitting and smoking poses are visible and cannot reveal jury appearance',()=>{
 const render=pose=>nativeRender({}, {pose}).grid;
 const idle=render('idle');
 for(const pose of ['phone','sit','smoke'])assert.notDeepEqual(render(pose),idle);
});
test('new shop outfits and face-free headgear previews use safe shared parts',()=>{
 assert.equal(avatar.parts.outfit?.options.length,7);
 assert.equal(avatar.parts.headwear?.options.length,5);
 assert.equal(new Set([0,1,2,3,4,5,6].map(outfit=>avatar.avatarSVG({outfit}))).size,7);
 assert.equal(typeof avatar.headgearSVG,'function');
 const svg=avatar.headgearSVG({headwear:2});
 assert.match(svg,/viewBox="0 0 48 40"/);
 assert.equal(svg,avatar.headgearSVG({headwear:2,shirtStyle:3,pantsStyle:2,outfit:6,accessory:5}),'Headwear preview must ignore clothes, costume and face accessories');
 assert.notEqual(avatar.avatarSVG({},false,{headOnly:true}),avatar.avatarSVG({},false,{headOnly:true,face:false}),'Face masking must remove facial details without removing the head');
 assert.equal(typeof avatar.mascotCoinSVG,'function');
 assert.match(avatar.mascotCoinSVG(),/mascot-coin/);
});
test('card room routing is based on authorized canonical world assignment',()=>{
 assert.equal(avatar.worldCardTable?.({restricted:false,scene:'cards',card_table_id:'room1'}),'room1');
 assert.equal(avatar.worldCardTable?.({restricted:true,scene:'cards',card_table_id:'room1'}),null);
 assert.equal(avatar.worldCardTable?.({restricted:false,scene:'city',card_table_id:'room1'}),null);
});
