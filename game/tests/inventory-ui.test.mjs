import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../web/inventory-ui.js';
const economy={inventory:[{item_id:'coffee',quantity:2,item:{name:'Кофе',kind:'food'}},{item_id:'coffee',quantity:3,item:{name:'Кофе',kind:'food'}},{item_id:'pet-cat',quantity:1,item:{name:'Кот',kind:'pet'}},{item_id:'outfit-4',quantity:1,item:{name:'Спортивный костюм',kind:'outfit'}},{item_id:'furniture-chair',quantity:1,item:{name:'Кресло',kind:'furniture'}},{item_id:'rod',quantity:1,item:{name:'Удочка',kind:'tool'}},{item_id:'trash',quantity:0,item:{name:'Мусор',kind:'litter'}}]};
test('the10slot bag stacks quantities and excludes catalog cosmetics and furniture',()=>{
 assert.equal(typeof ui.bagItems,'function');
 const items=ui.bagItems(economy);
 assert.deepEqual(items.map(item=>item.item_id),['coffee','pet-cat','rod']);
 assert.equal(items[0].quantity,5);
});
test('bag has exactly10 finger-selectable slots and selection never consumes an item',()=>{
 assert.equal(typeof ui.inventoryHTML,'function');
 const html=ui.inventoryHTML(economy,'coffee');
 assert.equal((html.match(/<button[^>]*class="inventory-slot[ "]/g)||[]).length,10);
 assert.equal((html.match(/data-action="inventory-select"/g)||[]).length,10);
 assert.match(html,/data-item="coffee"[^>]*aria-pressed="true"/);
 assert.match(html,/data-action="inventory-use" data-item="coffee"/);
 assert.match(html,/data-action="inventory-close"/);
 assert.match(html,/Количество: 5/);assert.doesNotMatch(html,/outfit-4|furniture-chair|phone-tab/);
});
test('nonconsumable bag items retain meaningful actions and selected pets cannot be called twice',()=>{
 assert.equal(typeof ui.inventoryHTML,'function');
 const data={selected_pet:'pet-cat',inventory:[{item_id:'pet-cat',quantity:1,item:{name:'Кот',kind:'pet'}},{item_id:'cards',quantity:1,item:{name:'Колода карт',kind:'deck'}},{item_id:'fish',quantity:4,item:{name:'Рыба',kind:'catch'}}]};
 assert.match(ui.inventoryHTML(data,'pet-cat'),/data-action="inventory-use" data-item="pet-cat" disabled/);
 assert.match(ui.inventoryHTML(data,'cards'),/data-action="inventory-cards"/);
 assert.doesNotMatch(ui.inventoryHTML(data,'fish'),/data-action="inventory-use"/);
 assert.match(ui.inventoryHTML(data,'fish'),/Улов/);
});
test('missing selection leaves a choice prompt and all names are escaped',()=>{
 assert.equal(typeof ui.inventoryHTML,'function');
 const data={inventory:[{item_id:'coffee',quantity:1,item:{name:'<img src=x>',kind:'food'}}]};
 const html=ui.inventoryHTML(data,'absent');
 assert.match(html,/Выберите предмет/);assert.doesNotMatch(html,/<img src=x>/);assert.match(html,/&lt;img/);
});
