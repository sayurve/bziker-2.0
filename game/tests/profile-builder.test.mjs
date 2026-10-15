import test from 'node:test';
import assert from 'node:assert/strict';
import {profileBuilderHTML,catalogHTML,avatarPartHTML} from '../web/profile-builder.js';
test('compact builder keeps preview and nickname before the internally scrollable groups',()=>{
 const html=profileBuilderHTML({avatar:{hairStyle:8},name:'Искра',category:'hair',genderExpanded:false});
 assert.ok(html.indexOf('id="avatar-preview"')<html.indexOf('id="catalog-parts"'));
 assert.match(html,/class="profile-builder-top"/);assert.match(html,/class="profile-builder-body"/);
 assert.match(html,/name="nickname"[^>]*value="Искра"/);
 assert.match(html,/<details id="gender-choice"[^>]*>/);assert.doesNotMatch(html,/<details id="gender-choice"[^>]* open/);
 assert.match(html,/<details[^>]*data-catalog-group="hairStyle"[^>]* open/);
 assert.match(html,/<details[^>]*data-catalog-group="hairColor"[^>]*>/);
});
test('miniatures and palette keep existing action contracts and actual selected parts',()=>{
 const hair=catalogHTML('hair',{avatar:{hairStyle:11,hairColor:3}});
 assert.equal((hair.match(/data-part="hairStyle"/g)||[]).length,12);
 assert.equal((hair.match(/data-part="hairColor"/g)||[]).length,10);
 assert.match(hair,/data-part="hairStyle" data-value="11"[^>]*aria-pressed="true"/);
 assert.match(hair,/data-part="hairColor" data-value="3"[^>]*aria-pressed="true"/);
 assert.match(hair,/headgear-preview/);assert.match(hair,/data-action="avatar-part"/);
});
test('owned outfits alone unlock their choices and all7costumes remain present',()=>{
 const html=avatarPartHTML('outfit',{avatar:{outfit:4},unlockedOutfits:[4,6]});
 assert.equal((html.match(/data-part="outfit"/g)||[]).length,7);
 const button=value=>html.match(new RegExp(`<button[^>]*data-value="${value}"[^>]*>`))[0];
 assert.doesNotMatch(button(0),/disabled/);assert.doesNotMatch(button(4),/disabled/);assert.doesNotMatch(button(6),/disabled/);assert.match(button(5),/disabled/);
});
test('locked nickname and all user strings are escaped; invalid groups use safe fallbacks',()=>{
 const html=profileBuilderHTML({name:'"><img src=x onerror=alert(1)>',editing:true,category:'"><script>'});
 assert.match(html,/readonly aria-readonly="true"/);assert.doesNotMatch(html,/<img src=x|<script>|data-tab="&quot;/);
 assert.match(html,/&lt;img/);assert.equal(avatarPartHTML('missing'), '');
 assert.equal(catalogHTML('unknown'),catalogHTML('hair'));
 assert.match(html,/data-action="preset" data-index="5"/);assert.match(html,/data-action="catalog-tab" data-tab="hair"/);
});

test('hairstyle options stay visible under an equipped hat or full outfit',()=>{
 const obscured=avatarPartHTML('hairStyle',{avatar:{hairStyle:7,headwear:2,outfit:6}});
 const bare=avatarPartHTML('hairStyle',{avatar:{hairStyle:7,headwear:0,outfit:0}});
 assert.equal(obscured,bare,'Hairstyle catalogue previews must show the hairstyle itself');
});
