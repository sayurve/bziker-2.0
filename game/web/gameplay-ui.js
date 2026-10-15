import {avatarSVG} from './avatar.js';
import {escapeHTML} from './city-features.js';
import {sourcePhoneIconSVG} from './source-ui.js';

// Icons use the same integer pixel grid as the characters and city signage.
const iconShapes={
 messages:[[2,3,12,9],[4,12,3,2],[4,14,1,1]],friends:[[3,2,4,4],[9,3,4,4],[1,8,8,6],[10,9,5,5]],search:[[2,2,8,2],[2,4,2,6],[8,4,2,6],[4,10,4,2],[10,10,2,2],[12,12,3,3]],
 clans:[[3,1,2,14],[5,2,9,6],[5,8,6,2]],profile:[[5,1,6,6],[3,9,10,5]],character:[[6,1,4,4],[5,6,6,5],[3,7,2,6],[11,7,2,6],[5,11,2,4],[9,11,2,4]],inventory:[[5,1,6,2],[3,3,10,11],[5,8,6,2]],
 games:[[2,3,12,10],[4,7,4,2],[5,6,2,4],[11,6,2,2],[10,9,2,2]],cards:[[1,4,8,10],[7,1,8,11],[10,4,2,5],[9,5,4,3]],casino:[[1,3,14,10],[3,5,2,6],[7,5,2,6],[11,5,2,6]],
 travel:[[7,1,2,2],[5,3,6,2],[3,5,10,2],[2,7,12,2],[4,9,8,2],[6,11,4,2],[7,13,2,2]],wallet:[[2,3,12,10],[4,1,8,2],[9,6,6,4]],results:[[2,9,3,5],[6,5,4,9],[11,2,3,12]],
 coffee:[[3,5,8,8],[11,6,3,2],[12,8,2,2],[1,14,13,1],[5,1,1,3],[8,2,1,2]],snack:[[2,4,12,2],[1,7,14,2],[2,10,12,3]],cigarette:[[1,9,12,3],[13,9,2,3],[12,5,1,2],[14,2,1,2]],
 rod:[[2,13,2,2],[4,11,2,2],[6,9,2,2],[8,7,2,2],[10,5,2,2],[12,3,2,2],[13,5,1,8],[10,13,4,2]],fish:[[4,5,8,6],[2,7,2,2],[12,4,3,8],[6,3,3,2],[6,11,3,2]],
 'pet-dog':[[2,3,3,8],[5,5,7,7],[12,3,3,8],[7,12,3,2],[6,7,1,2],[10,7,1,2]],'pet-cat':[[3,2,3,3],[10,2,3,3],[3,5,10,7],[6,12,4,2],[1,8,2,1],[13,8,2,1]],
 litter:[[4,3,8,11],[6,1,4,2],[2,5,2,7],[12,5,2,7]],outfit:[[5,2,6,2],[2,4,12,4],[4,8,8,6]],furniture:[[2,4,3,7],[11,4,3,7],[5,7,6,4],[3,11,2,4],[11,11,2,4]]
};
export function pixelIconSVG(id){
 const shape=iconShapes[id]||iconShapes.inventory;
 return `<svg class="pixel-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${shape.map(([x,y,w,h],i)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${['games','casino'].includes(id)&&i>0?'#f1eee4':'currentColor'}"/>`).join('')}</svg>`;
}
// Bag art has its own 32px grid and fixed colors; phone and HUD glyphs stay compact.
// Each layer is a color followed by integer-grid rectangles, from outline to highlights.
const itemArtwork={
 coffee:[
  ['#293742',[[5,10,18,2],[5,12,2,12],[7,24,14,2],[21,12,2,12],[23,12,5,2],[27,14,2,6],[23,20,5,2],[3,27,24,2],[6,26,18,1]]],
  ['#8cabb0',[[11,3,2,3],[10,6,2,2],[11,8,2,1],[17,2,2,3],[18,5,2,2],[17,7,2,2]]],
  ['#d5e6e4',[[12,3,1,2],[18,2,1,2],[18,6,1,1],[24,14,3,2],[24,18,3,2],[6,27,17,1]]],
  ['#399f9a',[[7,12,14,12],[23,14,1,6]]],
  ['#63c7b9',[[7,14,11,7],[9,21,9,3]]],
  ['#b2e4d3',[[8,15,2,6],[10,21,5,1]]],
  ['#266c75',[[19,14,2,10],[17,22,2,2],[7,22,2,2]]],
  ['#684334',[[7,11,14,3]]],
  ['#ab7550',[[9,11,9,1]]],
  ['#d0a371',[[10,12,5,1]]]
 ],
 snack:[
  ['#293742',[[8,5,16,2],[5,7,22,2],[3,9,26,5],[2,14,28,3],[3,17,26,4],[2,21,28,4],[5,25,22,2]]],
  ['#b8793d',[[5,9,22,4],[4,22,24,3]]],
  ['#e5b66f',[[6,7,20,2],[4,9,24,3],[6,23,21,2]]],
  ['#f3d89b',[[9,6,13,1],[7,9,16,1],[5,10,3,2],[6,22,19,1]]],
  ['#fff0c2',[[9,8,2,1],[15,10,2,1],[22,8,2,1]]],
  ['#447e47',[[3,14,26,3],[5,17,3,1],[23,17,3,1]]],
  ['#86b95b',[[4,14,6,1],[12,15,7,1],[23,14,5,1],[8,16,4,1]]],
  ['#a8493c',[[4,18,24,3]]],
  ['#dd7655',[[5,18,9,2],[17,18,9,2]]],
  ['#f2ce6a',[[4,21,24,1],[18,22,5,1]]],
  ['#bc8a45',[[7,25,19,1],[25,23,3,2]]]
 ],
 cigarette:[
  ['#293742',[[2,18,28,6],[1,19,1,4]]],
  ['#9aa9b0',[[5,5,2,3],[4,8,2,3],[6,11,2,3],[5,14,2,2],[9,3,1,3],[8,6,2,2]]],
  ['#d3dce0',[[5,5,1,2],[6,11,1,2],[9,3,1,2],[6,15,1,1]]],
  ['#e4ded0',[[4,19,17,4]]],
  ['#fff4d8',[[5,19,15,2]]],
  ['#bdbaad',[[5,22,16,1],[18,21,3,1]]],
  ['#c18c51',[[21,19,7,4]]],
  ['#e4b96e',[[21,19,7,1],[22,20,2,2],[26,21,1,1]]],
  ['#9b633d',[[24,22,4,1],[21,21,1,2]]],
  ['#b45d48',[[2,19,2,4]]],
  ['#f3a05b',[[2,20,1,2]]]
 ],
 rod:[
  ['#293742',[[3,25,4,4],[6,22,4,4],[9,19,4,4],[12,16,4,4],[15,13,4,4],[18,10,4,4],[21,7,4,4],[24,4,4,4],[26,2,3,3],[7,20,7,8]]],
  ['#875738',[[4,26,2,2],[7,23,2,2],[10,20,2,2],[13,17,2,2],[16,14,2,2],[19,11,2,2],[22,8,2,2],[25,5,2,2]]],
  ['#d1a068',[[4,26,1,1],[7,23,1,1],[10,20,1,1],[13,17,1,1],[16,14,1,1],[19,11,1,1],[22,8,1,1],[25,5,1,1],[27,3,1,1]]],
  ['#7c9ba4',[[28,5,1,19],[26,24,3,1],[25,21,1,3]]],
  ['#d5e5e5',[[28,7,1,14],[27,24,1,1]]],
  ['#4d6e8d',[[8,21,5,6]]],
  ['#90bdcd',[[9,21,3,2],[8,23,1,2],[10,26,2,1]]],
  ['#d4dbca',[[10,23,2,2]]],
  ['#293742',[[11,24,1,1],[12,26,3,1]]]
 ],
 fish:[
  ['#293742',[[2,10,2,12],[4,12,2,8],[6,14,3,4],[9,10,4,12],[13,8,10,16],[23,10,3,12],[26,13,3,6],[13,5,5,3],[15,24,6,3]]],
  ['#3a8589',[[3,12,1,8],[4,14,2,4],[6,15,3,2],[10,11,3,10],[13,9,10,14],[23,11,2,10],[25,14,3,4]]],
  ['#4da6a0',[[11,12,12,7],[14,10,8,2],[23,13,2,5],[14,22,7,1]]],
  ['#83c7b2',[[12,15,10,4],[14,12,9,3],[23,16,4,2]]],
  ['#c5e1c3',[[14,18,9,3],[16,21,5,1]]],
  ['#426e8c',[[14,6,3,2],[16,24,4,2],[3,12,1,3],[3,18,1,3],[12,12,1,3]]],
  ['#dae9df',[[21,11,3,3],[17,10,2,1],[14,14,2,1]]],
  ['#293742',[[23,12,1,2],[27,17,1,1],[13,17,1,3]]],
  ['#65b8b2',[[16,15,1,1],[19,16,1,1],[17,18,1,1]]]
 ],
 'pet-dog':[
  ['#293742',[[8,6,16,2],[5,8,22,5],[3,11,6,11],[23,11,6,11],[7,13,18,11],[10,24,12,3],[12,27,8,1]]],
  ['#78513c',[[5,9,4,11],[23,9,4,11],[4,12,1,8],[27,12,1,8]]],
  ['#a7764b',[[9,8,14,16],[7,14,2,8],[23,14,2,8],[11,24,10,2]]],
  ['#c79662',[[10,8,11,9],[9,17,13,5],[12,24,8,2]]],
  ['#e1b980',[[12,8,6,2],[10,10,3,3],[9,18,2,3],[21,10,1,3]]],
  ['#513d35',[[5,11,2,7],[25,12,2,6],[7,18,1,3],[24,19,1,2]]],
  ['#efe0b6',[[12,18,8,7],[10,20,12,3],[14,17,4,1]]],
  ['#fff1d0',[[11,20,3,2],[15,23,3,1]]],
  ['#293742',[[10,14,3,3],[20,14,3,3],[14,18,4,3],[15,21,2,2],[13,23,2,1],[17,23,2,1]]],
  ['#f4ecdf',[[10,14,1,1],[20,14,1,1]]],
  ['#c47c70',[[15,24,2,2]]]
 ],
 'pet-cat':[
  ['#293742',[[5,4,3,8],[8,6,3,6],[21,6,3,6],[24,4,3,8],[7,10,18,14],[10,24,12,3],[3,18,5,1],[24,18,5,1],[2,21,6,1],[24,21,6,1]]],
  ['#b46c3b',[[6,6,2,5],[8,8,2,4],[22,8,2,4],[24,6,2,5],[8,11,16,12],[11,24,10,2]]],
  ['#da9650',[[9,11,14,11],[9,20,14,4],[12,24,8,2]]],
  ['#efc178',[[10,12,12,3],[9,15,14,5],[12,23,8,1]]],
  ['#e4a0a1',[[7,7,1,3],[24,7,1,3],[8,10,1,1],[23,10,1,1]]],
  ['#a46336',[[11,11,2,4],[16,11,2,3],[21,11,2,4],[8,20,3,1],[21,20,3,1]]],
  ['#65885d',[[10,16,4,2],[19,16,4,2]]],
  ['#293742',[[12,16,1,2],[20,16,1,2],[15,20,3,1],[16,21,1,2],[14,23,2,1],[17,23,2,1]]],
  ['#fff0c9',[[10,16,1,1],[19,16,1,1],[12,21,3,2],[18,21,3,2],[14,24,4,1]]],
  ['#d48578',[[16,20,1,1]]]
 ],
 litter:[
  ['#293742',[[12,3,4,4],[18,4,3,3],[14,7,5,3],[12,10,10,2],[9,12,16,3],[7,15,20,11],[9,26,16,2]]],
  ['#607985',[[13,4,2,2],[19,5,1,1],[15,8,3,2],[13,11,8,1],[10,13,14,2],[8,16,18,9],[10,25,14,2]]],
  ['#8eabb6',[[11,14,11,3],[9,17,15,6],[12,23,11,3],[14,9,1,1]]],
  ['#bed0cc',[[11,15,2,4],[10,19,2,3],[12,23,3,1],[15,13,5,1],[13,5,1,1]]],
  ['#465d6c',[[24,17,2,8],[22,24,3,2],[17,16,2,4],[18,20,2,4],[10,25,2,1]]],
  ['#c4b17a',[[10,20,3,2],[11,22,2,1]]],
  ['#8aaa86',[[20,19,3,2],[21,21,2,1]]]
 ],
 cards:[
  ['#293742',[[3,8,17,21],[10,3,18,23]]],
  ['#527da3',[[4,9,15,19]]],
  ['#8bb5cc',[[5,10,4,2],[5,12,2,12],[8,26,10,1]]],
  ['#375574',[[7,13,2,12],[10,27,8,1]]],
  ['#d3cbbb',[[11,4,16,21]]],
  ['#fff2d5',[[11,4,14,19]]],
  ['#e2d8c2',[[25,4,2,20],[11,23,14,2]]],
  ['#b94e4b',[[13,6,2,2],[16,6,2,2],[12,8,7,2],[13,10,5,1],[14,11,3,1],[15,12,1,1]]],
  ['#e28269',[[13,7,1,1],[16,7,1,1]]],
  ['#293742',[[20,17,2,2],[19,19,4,2],[20,21,2,1],[18,21,6,1]]],
  ['#9caaa9',[[13,17,1,3],[14,18,1,1]]]
 ],
 inventory:[
  ['#293742',[[12,3,9,3],[10,5,3,6],[20,5,3,6],[7,10,19,17],[9,27,15,2]]],
  ['#536d86',[[8,11,17,15],[10,26,13,2],[13,4,7,1]]],
  ['#789bb5',[[9,12,13,11],[11,25,10,2],[11,6,1,4],[21,6,1,4]]],
  ['#afc6cc',[[10,12,2,8],[12,12,9,1],[14,4,5,1]]],
  ['#354d68',[[23,13,2,12],[21,25,3,2],[10,17,13,8]]],
  ['#90b0bf',[[11,18,11,5]]],
  ['#e5be6d',[[16,16,3,4]]],
  ['#f9dda2',[[16,16,2,1]]]
 ]
};
const itemAliases={trash:'litter','card-deck':'cards'};
const itemKindIcons={deck:'cards',catch:'fish',litter:'litter'};
export function itemIconSVG(id,kind=''){
 const key=Object.hasOwn(itemArtwork,id)?id:Object.hasOwn(itemAliases,id)?itemAliases[id]:Object.hasOwn(itemKindIcons,kind)?itemKindIcons[kind]:'inventory';
 const rects=itemArtwork[key].flatMap(([color,shapes])=>shapes.map(([x,y,width,height])=>`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}"/>`)).join('');
 return `<svg class="pixel-icon item-pixel-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${rects}</svg>`;
}
export const phoneAppGroups=Object.freeze([
 {label:'Общение',apps:[['messages','Сообщения'],['friends','Друзья'],['search','Поиск']]},
 {label:'Клан и персонаж',apps:[['clans','Клан'],['profile','Каталог'],['character','Персонаж']]},
 {label:'Игры и город',apps:[['games','Игры'],['cards','Карты'],['casino','Казино'],['travel','Карта'],['wallet','Задания'],['results','Результаты']]}
]);
export function phoneAppsHTML({name='БЗИКЕР',available=true}={}){
 return `<p class="phone-owner">${escapeHTML(name)}</p><nav class="phone-apps" aria-label="Приложения телефона">${phoneAppGroups.map(group=>`<section class="phone-app-group"><h3>${group.label}</h3><div class="phone-app-grid">${group.apps.map(([id,label])=>`<button data-action="phone-tab" data-tab="${id}"${available?'':' disabled'}><span class="app-icon" aria-hidden="true">${sourcePhoneIconSVG(id)||pixelIconSVG(id)}</span><span>${label}</span>${id==='messages'?'<small id="phone-unread" aria-label="Непрочитанные сообщения"></small>':''}</button>`).join('')}</div></section>`).join('')}</nav>`;
}
export function phoneNeedsExpansion(tab){return ['conversation','messages','clans','search','games','cards','casino','friends'].includes(tab);}
export function inventoryIconsHTML(html,economy={}){
 const rows=(economy.inventory||[]).filter(row=>row.quantity>0);let index=0;
 return html.replace(/<article class="shop-product">([\s\S]*?)<\/article>/g,(article,body)=>{
  const row=rows[index++];if(!row)return article;
  const item=row.item||economy.catalog?.find(item=>item.id===row.item_id)||{};
  return `<article class="shop-product">${body.replace(/<span class="product-icon" aria-hidden="true">[^<]*<\/span>/,`<span class="product-icon" data-item-icon="${escapeHTML(row.item_id)}" aria-hidden="true">${itemIconSVG(row.item_id,item.kind)}</span>`)}</article>`;
 });
}
export function lobbyCreateHTML(){
 return `<section class="intro lobby-create"><h1>О чём придумываем?</h1><form id="create-form" class="panel"><div class="lobby-essentials"><label>Режим<select name="mode"><option value="team">Команды</option><option value="individual">Каждый за себя</option></select></label><label>Рабочая тема<input name="theme" required maxlength="1000" placeholder="Например, знакомство новых сотрудников"></label></div><details class="lobby-advanced"><summary>Дополнительные условия и встреча</summary><div class="form-grid"><label class="full">Название лобби<input name="title" required maxlength="80" value="Креатив над облаками"></label><label>Право ответа<select name="answer_policy"><option value="all">Отвечают все</option><option value="first">Кто первым нажал кнопку</option></select></label><label id="capacity-label">Максимум команд<select name="max_teams">${Array.from({length:8},(_,i)=>`<option value="${i+1}"${i===3?' selected':''}>${i+1}</option>`).join('')}</select></label><label>Для кого<input name="audience" maxlength="1000" placeholder="Новые сотрудники"></label><label>Цель<input name="goal" maxlength="1000" placeholder="Помочь начать совместную работу"></label><label class="full">Условия и ограничения<input name="constraints" maxlength="1000" placeholder="Инструменты, время, бюджет"></label><label class="full">Ссылка на встречу (необязательно)<input name="meeting_url" type="url" placeholder="https://…" maxlength="2000"></label></div></details><p class="hint">Задания подставят вашу тему. До старта нужен хотя бы один куратор. Ведущий тоже участвует.</p><div class="button-row"><button class="primary" type="submit">Создать лобби →</button><button type="button" data-action="home">Отмена</button></div></form></section>`;
}
const score=n=>Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:1});
function units(s){return s.mode==='team'?s.teams||[]:(s.players||[]).map(p=>({...p,members:[p]}));}
export function skySceneHTML(s){
 if(s.role==='curator')return '';
 const roster=units(s),activeName=s.state==='answering'&&s.answer_policy==='first'?s.buzz_owner_name:s.state==='choosing'?s.chooser_name:'';
 const active=roster.filter(t=>t.name===activeName).length===1?roster.find(t=>t.name===activeName)?.id:null;
 const caption=s.state==='choosing'?`Выбирает: ${s.chooser_name||'ведущий'}`:s.state==='answering'?(s.answer_policy==='first'?s.buzz_owner_name?`Отвечает: ${s.buzz_owner_name}`:'Ждём первого нажатия':'Отвечают все команды и игроки'):'Ответы у кураторов';
 return `<section class="scene sky-scene" aria-label="Участники на облаках"><header class="sky-turn"><span class="sky-turn-icon" aria-hidden="true">${pixelIconSVG('games')}</span><strong>${escapeHTML(caption)}</strong><span>Кураторов: ${Number(s.jury_count)||0}</span></header><div class="cloud-grid ${roster.length>4?'many':''}">${roster.map(t=>`<article class="cloud${t.id===active?' is-active':''}" data-unit="${escapeHTML(t.id)}"><div class="cloud-people">${(t.members||[]).map(p=>`<div class="cloud-person${s.mode==='team'&&p.id===t.captain_id?' captain':''}">${s.mode==='team'&&p.id===t.captain_id?'<span class="captain-mark">Капитан</span>':''}${avatarSVG(p.avatar)}<span>${escapeHTML(p.name)}</span></div>`).join('')}</div><div class="cloud-body"><div class="cloud-content"><h3>${escapeHTML(t.name)}</h3><p>${score(t.score)} балл.</p>${t.id===active?`<span class="cloud-current">${s.state==='choosing'?'Выбирает задание':'Отвечает'}</span>`:''}</div></div></article>`).join('')}</div></section>`;
}
export function resultsPodiumHTML(s,clan=null){
 if(s.role==='curator')return '';
 let rank=0,last=null;
 const ranked=units(s).slice().sort((a,b)=>Number(b.score)-Number(a.score)).map((u,i)=>{if(last!==Number(u.score))rank=i+1;last=Number(u.score);return {...u,rank};});
 const members=new Set((clan?.members||[]).map(p=>p.id));
 const belongs=u=>Boolean(clan&&(u.members||[]).some(p=>members.has(p.id)||p.id===clan.leader_id));
 return `<section class="results-podium" aria-label="Пьедестал победителей">${ranked.filter(u=>u.rank<=3).map(u=>`<article class="result-winner" data-rank="${u.rank}"><div class="result-roster">${(u.members||[]).slice(0,4).map(p=>avatarSVG(p.avatar)).join('')}</div><div class="result-step"><span class="result-place">${u.rank}<small>место</small></span><h3>${escapeHTML(u.name)}</h3>${belongs(u)?`<p class="result-clan"><span aria-hidden="true">${escapeHTML(clan.flag)}</span>${escapeHTML(clan.name)}</p>`:''}<p class="result-earned"><strong>${score(u.score)}</strong> балл. за игру</p></div></article>`).join('')}</section>`;
}
