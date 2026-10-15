import {houseCatalog,housePreviewSVG} from './house-models.js';
import {normalizeHouseColor} from './color-picker.js';
import {interactionRadii} from './interaction-radii.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function constructionEligibility(own,plot,state={}){
 const deny=(code,message)=>({allowed:false,code,message});
 if(!own)return deny('clan','Сначала создайте клан или вступите в него.');
 if(own.base?.building_id)return deny('built','Дом уже построен. Участок, модель и внешний цвет закреплены.');
 if(!own.is_leader)return deny('leader','Дом строит лидер клана.');
 if((own.member_count??own.members?.length??0)<4)return deny('members','Для стройки нужны минимум четыре участника клана. Заявки не учитываются.');
 if(!plot||plot.clan)return deny('occupied','Этот участок уже занят. Выберите свободный.');
 if(state.scene!=='city'||!state.position||Math.hypot(state.position.x-plot.door.x,state.position.y-plot.door.y)>interactionRadii.door)return deny('distance','Подойдите к табличке выбранного участка в клановом квартале.');
 return {allowed:true,code:'ready',message:'Можно строить. Проверьте модель и внешний цвет перед подтверждением.'};
}
export function constructionPayload(data){
 const style=Number(data.exterior_style),color=normalizeHouseColor(data.exterior_color);
 if(typeof data.building_id!=='string'||!/^base-\d+$/.test(data.building_id))throw new Error('Выберите участок.');
 if(data.exterior_style===''||data.exterior_style===undefined||!Number.isInteger(style)||!houseCatalog.styles.some(s=>s.id===style))throw new Error('Выберите модель дома из каталога.');
 if(!color)throw new Error('Укажите цвет дома в формате #RRGGBB.');
 return {building_id:data.building_id,exterior_style:style,exterior_color:color};
}
export function constructionHTML({own,plot,state,style=0,color='#faf8f2',exactScene=false}={}){
 color=normalizeHouseColor(color)||'#faf8f2';
 const eligibility=constructionEligibility(own,plot,state),count=own?.member_count??own?.members?.length??0;
 return `<form id="construction-form" data-clan="${esc(own?.id)}">${exactScene?'<p class="hint">В этой карте дом сохраняет фасад, нарисованный на выбранном месте. Модель и цвет в каталоге сохраняются в профиле дома; внешний фасад здесь не меняется. Флаг и название клана будут видны у входа. Обстановку внутри можно менять.</p>':''}<input type="hidden" name="building_id" value="${esc(plot?.id)}"><div class="construction-summary"><div><p class="eyebrow">${esc(plot?.name||'Участок клана')}</p><h3>${own?.base?.building_id||exactScene?'Каталог домов':'Ваш будущий дом'}</h3><p class="meta">Участников: ${count} / минимум 4</p></div><div id="construction-preview">${housePreviewSVG(style,color)}</div></div><fieldset class="construction-models"><legend>1. Модель дома</legend>${houseCatalog.styles.map(model=>`<label class="house-option"><input type="radio" name="exterior_style" value="${model.id}" ${model.id===style?'checked':''}><span>${housePreviewSVG(model.id,color)}<strong>${esc(model.label)}</strong></span></label>`).join('')}</fieldset><fieldset class="construction-colors"><legend>2. Внешний цвет</legend>${houseCatalog.palette.map((value,i)=>`<button type="button" class="house-swatch" data-action="house-color" data-color="${esc(value)}" aria-label="Цвет ${i+1}: ${esc(value)}" aria-pressed="${value===color}"><svg viewBox="0 0 38 38" aria-hidden="true"><rect width="38" height="38" fill="${esc(value)}"/></svg></button>`).join('')}<div class="house-custom-color"><label>Свой цвет<input type="color" name="exterior_color" value="${esc(color)}" aria-label="Выбрать свой цвет дома"></label><label>HEX<input name="house-color-hex" value="${esc(color)}" pattern="#[0-9a-fA-F]{6}" maxlength="7" autocomplete="off" spellcheck="false" aria-label="Цвет дома HEX"></label><button type="button" data-action="house-eyedropper">Пипетка</button></div><p id="house-color-hint" class="hint" role="status">Выберите оттенок из палитры или задайте свой цвет.</p></fieldset><p class="construction-status" role="status">${esc(eligibility.message)}</p><p class="hint">После стройки модель, участок и внешний цвет изменить нельзя. Мебель и палитры внутри можно менять.</p><div class="construction-footer"><button class="primary wide" type="submit" ${eligibility.allowed?'':'disabled'}>Построить</button></div></form>`;
}
