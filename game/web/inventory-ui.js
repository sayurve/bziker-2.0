import {escapeHTML} from './city-features.js';
import {itemIconSVG} from './gameplay-ui.js';

export const bagKinds=Object.freeze(['food','consumable','deck','tool','pet','catch','litter']);
export function bagItems(economy={}){
 const rows=new Map();
 for(const row of economy.inventory||[]){
  const item=row.item||economy.catalog?.find(item=>item.id===row.item_id)||{},quantity=Math.max(0,Math.floor(Number(row.quantity)||0));
  if(!quantity||!bagKinds.includes(item.kind))continue;
  const previous=rows.get(row.item_id);
  rows.set(row.item_id,{item_id:row.item_id,item,quantity:quantity+(previous?.quantity||0)});
 }
 return [...rows.values()];
}
function itemAction(row,economy,busy){
 const {item_id:id,item}=row,disabled=busy?' disabled':'';
 if(['food','consumable','pet'].includes(item.kind)){
  const active=item.kind==='pet'&&economy.selected_pet===id;
  const label=active?'С вами':item.kind==='pet'?'Позвать':id==='coffee'?'Выпить':id==='snack'?'Съесть':'Использовать';
  return `<button type="button" class="inventory-use" data-action="inventory-use" data-item="${escapeHTML(id)}"${active||busy?' disabled':''}>${label}</button>`;
 }
 if(item.kind==='deck')return `<button type="button" class="inventory-use" data-action="inventory-cards"${disabled}>Играть</button>`;
 if(item.kind==='tool'&&id==='rod')return `<button type="button" class="inventory-use" data-action="inventory-rod"${disabled}>К озеру</button>`;
 return '';
}
export function inventoryHTML(economy={},selected=null,{busy=false}={}){
 const items=bagItems(economy),visible=items.slice(0,10),current=visible.find(row=>row.item_id===selected);
 const used=Number.isFinite(Number(economy.inventory_used))?Number(economy.inventory_used):items.length;
 const description=current?.item.kind==='litter'?'Подойдите к урне и нажмите кнопку действия.':current?.item.kind==='catch'?'Улов хранится в сумке.':current?.item.description||'';
 return `<header class="inventory-heading"><h2 id="inventory-title">Инвентарь <small>${used} / 10</small></h2><button type="button" class="inventory-close" data-action="inventory-close" aria-label="Закрыть инвентарь">×</button></header><div class="inventory-slots" role="group" aria-label="Десять слотов инвентаря">${Array.from({length:10},(_,index)=>{
  const row=visible[index],chosen=!!row&&row.item_id===selected;
  return `<button type="button" class="inventory-slot${chosen?' selected':''}${row?'':' empty'}" data-action="inventory-select" data-item="${escapeHTML(row?.item_id||'')}" aria-pressed="${chosen}" data-item-kind="${escapeHTML(row?.item.kind||'')}" aria-label="${escapeHTML(row?`${row.item.name||row.item_id}, количество ${row.quantity}`:`Пустой слот ${index+1}`)}"${!row||busy?' disabled':''}><span class="inventory-slot-number" aria-hidden="true">${index===9?'0':index+1}</span>${row?`<span class="inventory-item-icon" aria-hidden="true">${itemIconSVG(row.item_id,row.item.kind)}</span><span class="inventory-quantity" aria-hidden="true">${row.quantity}</span>`:''}</button>`;
 }).join('')}</div><div class="inventory-detail" aria-live="polite"><div>${current?`<strong>${escapeHTML(current.item.name||current.item_id)}</strong><p>Количество: ${current.quantity}${description?` · ${escapeHTML(description)}`:''}</p>`:`<strong>${busy?'Обновляем инвентарь…':'Выберите предмет'}</strong><p>${visible.length?'Коснитесь слота, затем нажмите действие.':'В сумке пока нет предметов.'}</p>`}</div>${current?itemAction(current,economy,busy):''}</div>`;
}
