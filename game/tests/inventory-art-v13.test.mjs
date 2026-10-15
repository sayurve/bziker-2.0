import test from 'node:test';
import assert from 'node:assert/strict';
import * as gameplay from '../web/gameplay-ui.js';
import {inventoryHTML} from '../web/inventory-ui.js';

const itemIds=['coffee','snack','cigarette','rod','fish','pet-dog','pet-cat','litter','cards'];
const iconBody=svg=>svg.slice(svg.indexOf('>')+1,svg.lastIndexOf('</svg>'));

test('every bag item has its own detailed colored pixel drawing',()=>{
 assert.equal(typeof gameplay.itemIconSVG,'function');
 const bodies=itemIds.map(id=>{
  const svg=gameplay.itemIconSVG(id),colors=new Set([...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map(match=>match[1]));
  assert.ok(colors.size>=5,`${id} needs outline, shading and colored details`);
  assert.ok((svg.match(/<rect /g)||[]).length>=18,`${id} needs recognizable internal details`);
  assert.doesNotMatch(svg,/currentColor/);
  return iconBody(svg);
 });
 assert.equal(new Set(bodies).size,itemIds.length);
});

test('item drawings stay on a safe crisp 32px grid',()=>{
 assert.equal(typeof gameplay.itemIconSVG,'function');
 for(const id of [...itemIds,'missing','__proto__','<script>alert(1)</script>']){
  const svg=gameplay.itemIconSVG(id);
  assert.match(svg,/viewBox="0 0 32 32"/);
  assert.match(svg,/shape-rendering="crispEdges"/);
  assert.match(svg,/aria-hidden="true" focusable="false"/);
  assert.doesNotMatch(svg,/<(?:script|foreignObject|image)|\bon\w+=|<path|<circle|<ellipse|transform=/i);
  for(const rect of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="#[0-9a-f]{6}"\/>/g)){
   const [x,y,width,height]=rect.slice(1).map(Number);
   assert.ok(width>0&&height>0&&x+width<=32&&y+height<=32,`${id}: ${rect[0]}`);
  }
  assert.equal((svg.match(/<rect /g)||[]).length,[...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="#[0-9a-f]{6}"\/>/g)].length);
 }
});

test('actual catalog ids and category fallbacks resolve without drawing arbitrary input',()=>{
 assert.equal(typeof gameplay.itemIconSVG,'function');
 assert.equal(gameplay.itemIconSVG('trash'),gameplay.itemIconSVG('litter'));
 assert.equal(gameplay.itemIconSVG('card-deck'),gameplay.itemIconSVG('cards'));
 for(const [kind,id] of [['deck','cards'],['catch','fish'],['litter','litter']])assert.equal(gameplay.itemIconSVG('new-item',kind),gameplay.itemIconSVG(id));
 const fallback=gameplay.itemIconSVG('unknown');
 assert.equal(fallback,gameplay.itemIconSVG('<img src=x onerror=alert(1)>','__proto__'));
 assert.ok(new Set([...fallback.matchAll(/fill="(#[0-9a-f]{6})"/g)].map(match=>match[1])).size>=5);
 assert.ok(!itemIds.map(id=>iconBody(gameplay.itemIconSVG(id))).includes(iconBody(fallback)));
});

test('colored bag rendering preserves ten explicit selection targets and existing actions',()=>{
 const economy={inventory:itemIds.map((id,index)=>({item_id:id,quantity:index+1,item:{name:id,kind:{coffee:'food',snack:'food',cigarette:'consumable',rod:'tool',fish:'catch','pet-dog':'pet','pet-cat':'pet',litter:'litter',cards:'deck'}[id]}}))};
 const html=inventoryHTML(economy,'coffee');
 assert.equal((html.match(/data-action="inventory-select"/g)||[]).length,10);
 assert.equal((html.match(/class="pixel-icon item-pixel-icon"/g)||[]).length,9);
 assert.match(html,/data-item="coffee"[^>]*aria-pressed="true"/);
 assert.match(html,/data-item-kind="food"/);
 assert.match(html,/data-action="inventory-use" data-item="coffee"/);
 assert.match(html,/Количество: 1/);
 assert.match(inventoryHTML(economy,'cards'),/data-action="inventory-cards"/);
 assert.match(inventoryHTML(economy,'rod'),/data-action="inventory-rod"/);
 assert.doesNotMatch(inventoryHTML(economy,'fish'),/data-action="inventory-use"/);
 assert.equal((inventoryHTML(economy,'coffee',{busy:true}).match(/aria-pressed="(?:true|false)"[^>]* disabled/g)||[]).length,10);
});

test('phone apps render all12 approved phone glyphs independently of bag art',()=>{
 const html=gameplay.phoneAppsHTML();
 const views=[...html.matchAll(/viewBox="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(views.length,12);
 assert.equal(new Set(views).size,12,'Each app uses its own supplied glyph');
 assert.ok(views.every(v=>v.split(' ').slice(2).join(' ')==='70 70'));
 assert.equal((html.match(/href="\/assets\/design-ui-hands-male\.png"/g)||[]).length,12);
 assert.equal((html.match(/class="pixel-icon"/g)||[]).length,12);
 assert.equal((html.match(/data-action="phone-tab"/g)||[]).length,12);
 assert.match(html,/data-tab="character"/);
 assert.doesNotMatch(html,/data-tab="inventory"/);
 assert.doesNotMatch(html,/item-pixel-icon|viewBox="0 0 32 32"/);
});
