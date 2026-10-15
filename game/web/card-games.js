import {avatarSVG} from './avatar.js';
import {casinoRoomHTML} from './casino-room.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[character]));
const integer = value => Number.isSafeInteger(value) ? value : 0;
const signed = value => `${integer(value) > 0 ? '+' : ''}${integer(value)}`;
const gameName = game => ({blackjack:'21 с крупье',durak:'Подкидной дурак',poker:'Покер'}[game]||'Карты');
const states = {waiting:'Ожидание игроков',playing:'Раунд идёт',finished:'Раунд завершён',cancelled:'Комната закрыта'};
const suits = {S:{glyph:'♠',name:'пик'},H:{glyph:'♥',name:'червей'},D:{glyph:'♦',name:'бубен'},C:{glyph:'♣',name:'треф'}};
const ranks = {'2':'Двойка','3':'Тройка','4':'Четвёрка','5':'Пятёрка','6':'Шестёрка','7':'Семёрка',
  '8':'Восьмёрка','9':'Девятка','10':'Десятка',J:'Валет',Q:'Дама',K:'Король',A:'Туз'};
const rules = {
  poker:'2–4 игрока. Пять карт, один обмен от одной до пяти карт. Фиксированный взнос; лучшие комбинации делят банк.',
  durak:'2–4 игрока, 36 карт. Бейте старшей картой той же масти или козырем. Подкидывать можно ранги со стола. После отбоя или взятия добирайте до шести. Последний с картами проигрывает; остальные делят банк.',
  blackjack:'1–4 игрока и крупье. Туз — 1 или 11; крупье останавливается на 17. Победа, включая blackjack, — 2× взнос; ничья — возврат взноса.'
};
const back = () => '<span class="playing-card card-back" role="img" aria-label="Закрытая карта"><span aria-hidden="true">БЗИК</span></span>';

function cardHTML(card) {
  const match = typeof card === 'string' ? /^(10|[2-9JQKA])([SHDC])$/.exec(card) : null;
  if (!match) return back();
  const [,rank,suit] = match;
  return `<span class="playing-card${suit==='H'||suit==='D'?' card-red':''}" role="img" aria-label="${ranks[rank]} ${suits[suit].name}"><span class="card-rank" aria-hidden="true">${rank}</span><span class="card-suit" aria-hidden="true">${suits[suit].glyph}</span></span>`;
}

function hiddenHand(count) {
  return Array.from({length:Math.max(0,Math.min(52,integer(count)))},back).join('');
}

function tableRows(tables) {
  if (!tables.length) return '<p class="empty-state">Пока нет комнат. Создайте свою и пригласите игроков.</p>';
  return `<div class="card-room-list">${tables.map(table=>`<article class="card-room-row"><div><strong>${escapeHTML(table.title)}</strong><p>${gameName(table.game)} · ${integer(table.player_count)}/4 игроков · взнос ${integer(table.stake)} Бзинге</p><span class="badge">${states[table.state]||'Комната'}</span></div><button type="button" data-action="card-open" data-id="${escapeHTML(table.id)}">Открыть</button></article>`).join('')}</div>`;
}

export function cardGamesPanelHTML(data = {}, {source = 'casino', balance = 0, hasDeck = false} = {}) {
  const chosenSource = source === 'deck' ? 'deck' : 'casino';
  const needsDeck = chosenSource === 'deck' && hasDeck !== true;
  const createHint = chosenSource === 'deck'
    ? needsDeck ? 'Чтобы создать приватную комнату, купите карточную колоду в лавке маскота.' : 'Купленная колода остаётся в инвентаре. В приватную комнату входят по приглашению.'
    : 'Открытая комната доступна игрокам казино.';
  const tables = (Array.isArray(data.tables) ? data.tables : []).filter(table=>table.source===chosenSource);
  const invitations = Array.isArray(data.invitations) ? data.invitations : [];
  return `<section class="card-games-panel"><header><h2>${chosenSource==='casino'?'Казино':'Карточные комнаты'}</h2><p>Баланс: <strong>${integer(balance)} Бзинге</strong></p></header>
    ${invitations.length?`<section class="card-invitations"><h3>Приглашения</h3>${invitations.map(invite=>`<article class="card-room-row"><div>${avatarSVG(invite.from?.avatar)}<strong>${escapeHTML(invite.from?.name)}</strong><p>Приглашает в «${escapeHTML(invite.title)}» · ${gameName(invite.game)} · ${integer(invite.stake)} Бзинге</p></div><div class="card-actions"><button type="button" data-action="card-invite-accept" data-id="${escapeHTML(invite.id)}">Принять</button><button type="button" data-action="card-invite-dismiss" data-id="${escapeHTML(invite.id)}">Отклонить</button></div></article>`).join('')}</section>`:''}
    ${chosenSource==='casino'?`<section class="casino-slots"><h3>Слоты</h3><p>Три семёрки — 5× взнос; три одинаковых символа — 3×; пара — возврат взноса.</p><form id="slots-form"><label>Взнос, Бзинге<input name="stake" type="number" min="1" max="100" step="1" value="10" required></label><button type="submit"${integer(balance)<1?' disabled':''}>Крутить</button></form><div id="slots-result" aria-live="polite"></div></section>`:''}
    <section><h3>Комнаты</h3>${tableRows(tables)}</section>
    <section class="card-create"><h3>Создать комнату</h3><form id="card-create-form"><input type="hidden" name="source" value="${chosenSource}"><label>Игра<select name="game">${chosenSource==='deck'?'<option value="durak">Подкидной дурак</option>':''}<option value="poker">Покер</option><option value="blackjack">21 с крупье</option></select></label><label>Название<input name="title" maxlength="80" placeholder="Карточный вечер" required></label><label>Взнос с игрока, Бзинге<input name="stake" type="number" min="1" max="100" step="1" value="10" required></label><button type="submit"${needsDeck?' disabled':''}>Создать комнату</button></form><p>${createHint}</p></section>
  </section>`;
}

function playerHTML(player, table, selected) {
  const mine = player.id === table.my_id;
  const revealed = table.state === 'finished';
  const visible = mine || revealed;
  const cards = visible && Array.isArray(player.cards) ? player.cards : [];
  const selectable = mine && table.game === 'poker' && table.state === 'playing' && table.can_act;
  if(table.game==='durak')return `<article class="card-player durak-player${mine?' card-player-mine':''}${table.turn_id===player.id?' card-player-turn':''}">${avatarSVG(player.avatar)}<h3>${escapeHTML(player.name)}${mine?' <span class="badge">Вы</span>':''}</h3><p>${integer(player.hand_count??player.card_count)} карт${table.durak?.defender_id===player.id?' · защищается':table.durak?.attacker_id===player.id?' · атакует':''}${table.durak?.finished_ids?.includes(player.id)?' · вышел из игры':''}</p></article>`;
  const hand = cards.length ? cards.map((card,index)=>selectable
    ? `<label class="card-choice"><input type="checkbox" name="indices" value="${index}"${selected.includes(index)?' checked':''}>${cardHTML(card)}</label>`
    : cardHTML(card)).join('') : hiddenHand(player.card_count);
  return `<article class="card-player${mine?' card-player-mine':''}${table.turn_id===player.id?' card-player-turn':''}">${avatarSVG(player.avatar)}<h3>${escapeHTML(player.name)}${mine?' <span class="badge">Вы</span>':''}</h3><p>${table.state==='playing'?(table.turn_id===player.id?'Сейчас ходит':player.done?'Ход завершён':'Ждёт хода'):''}${visible&&Number.isSafeInteger(player.score)?` · ${player.score} очков`:''}</p>${selectable?`<form id="card-exchange-form"><div class="card-hand">${hand}</div><div class="card-actions"><button type="submit">Обменять выбранные</button><button type="button" data-action="card-keep">Оставить карты</button></div></form>`:`<div class="card-hand">${hand}</div>`}</article>`;
}

export function durakBoardHTML(table={},selection={}){
 const d=table.durak||{},hand=Array.isArray(table.own_hand)?table.own_hand:table.players?.find(p=>p.id===table.my_id)?.cards||[];
 const allowed=table.can_act&&table.state==='playing'&&Array.isArray(d.allowed_moves)?d.allowed_moves:[];
 const names={attack:'Атаковать / подкинуть',defend:'Побить карту',pickup:'Забрать карты',pass:'Пас / отбой'};
 const open=(d.board||[]).findIndex(pair=>!pair.defense),selectedAttack=Number.isInteger(selection.attackIndex)&&selection.attackIndex>=0&&selection.attackIndex<(d.board||[]).length&&!d.board[selection.attackIndex].defense?selection.attackIndex:open;
 return `<section class="durak-board"><div class="durak-meta"><span>Козырь ${suits[d.trump_suit]?.glyph||'—'}</span><span>Колода: ${integer(d.deck_count)}</span><span>Отбой: ${integer(d.discard_count)}</span></div><div class="durak-trump">${cardHTML(d.trump_card)}</div><div class="durak-pairs" role="group" aria-label="Карты на столе">${(d.board||[]).map((pair,index)=>`<label class="durak-pair${pair.defense?' covered':''}"><input form="durak-action-form" type="radio" name="attack_index" value="${index}" ${index===selectedAttack?'checked':''} ${pair.defense?'disabled':''}>${cardHTML(pair.attack)}${pair.defense?cardHTML(pair.defense):'<span class="durak-uncovered">Побить</span>'}</label>`).join('')||'<p class="hint">Первая карта открывает атаку.</p>'}</div><p class="durak-turn" role="status">${table.state==='playing'?(table.can_act?'Ваш ход':`Ход: ${escapeHTML(table.players?.find(p=>p.id===table.turn_id)?.name||'другой игрок')}`):'Ваши карты'}</p><form id="durak-action-form"><div class="durak-hand" role="group" aria-label="Ваши карты">${hand.map((card,index)=>`<label class="durak-card-choice"><input type="radio" name="card_index" value="${index}" ${index===selection.cardIndex?'checked':''}>${cardHTML(card)}</label>`).join('')||'<p class="hint">У вас не осталось карт.</p>'}</div><div class="card-actions durak-actions">${Object.entries(names).map(([move,label])=>`<button type="button" data-action="card-durak-${move}" ${allowed.includes(move)?'':'disabled'}>${label}</button>`).join('')}</div></form></section>`;
}

export function cardTableHTML(table = {}, selectedIndices = [], inviteDraft = '',durakSelection={}) {
  const players = Array.isArray(table.players) ? table.players : [];
  const selected = Array.isArray(selectedIndices) ? selectedIndices.filter(index=>Number.isInteger(index)&&index>=0&&index<5) : [];
  const joined = players.some(player=>player.id===table.my_id);
  const hostWaiting = joined && table.host_id===table.my_id && table.state==='waiting';
  const results = Array.isArray(table.results) ? table.results : [];
  let dealer = '';
  if (table.game==='blackjack' && table.dealer) {
    const dealerCards = Array.isArray(table.dealer.cards) ? table.dealer.cards : [];
    const revealed = table.state==='finished';
    const visibleCards = revealed ? dealerCards : dealerCards.slice(0,1);
    dealer = `<article class="card-dealer"><img class="seller-mascot" src="/assets/bzik-brand-mascot-reference.webp" alt="Маскот БЗИК — крупье"><h3>Крупье</h3>${revealed&&Number.isSafeInteger(table.dealer.score)?`<p>${table.dealer.score} очков</p>`:''}<div class="card-hand">${visibleCards.map(cardHTML).join('')}${hiddenHand(Math.max(0,integer(table.dealer.card_count)-visibleCards.length))}</div></article>`;
  }
  return `<section class="card-room" data-table-id="${escapeHTML(table.id)}"><header><span class="badge">${gameName(table.game)}</span><h1>${escapeHTML(table.title)}</h1><p>${states[table.state]||'Комната'} · взнос ${integer(table.stake)} Бзинге с игрока</p><p class="card-rules">${escapeHTML(table.rules||rules[table.game]||'')}</p></header>
    ${casinoRoomHTML(table)}
    <div class="card-table">${dealer}${players.map(player=>playerHTML(player,table,selected)).join('')}${table.game==='durak'&&table.state!=='waiting'?durakBoardHTML(table,durakSelection):''}</div>
    ${hostWaiting?`<form id="card-invite-form"><label>Закреплённый ник игрока<input name="nickname" maxlength="32" value="${escapeHTML(inviteDraft)}" required autocomplete="off"></label><button type="submit">Пригласить</button></form>`:''}
    <div class="card-actions">${hostWaiting?`<button type="button" data-action="card-start"${table.can_start?'':' disabled'}>Начать игру</button>`:''}${!joined&&table.state==='waiting'&&players.length<4?'<button type="button" data-action="card-join">Присоединиться</button>':''}${table.can_act&&table.state==='playing'&&table.game==='blackjack'?'<button type="button" data-action="card-hit">Взять карту</button><button type="button" data-action="card-stand">Остановиться</button>':''}${joined?`<button type="button" data-action="card-leave"${table.state==='playing'?' disabled':''}>${hostWaiting?'Закрыть комнату':'Выйти в город'}</button>`:''}</div>
    ${results.length?`<section class="card-results" aria-live="polite"><h2>Результаты</h2>${results.map(result=>{const participant=players.find(player=>player.id===result.id);return `<article><strong>${escapeHTML(participant?.name)}</strong><span>${escapeHTML(result.combination||({win:'Победа',push:'Ничья',lose:'Проигрыш'}[result.outcome]||''))}</span><p>Возврат ${integer(result.payout)} Бзинге · итог ${signed(result.net)}</p></article>`;}).join('')}</section>`:''}
  </section>`;
}

export function slotResultHTML(result) {
  if (!result) return '';
  const symbols = {cherry:['🍒','Вишня'],lemon:['🍋','Лимон'],bell:['🔔','Колокол'],diamond:['◆','Алмаз'],seven:['7','Семёрка']};
  const reels = Array.isArray(result.reels) ? result.reels.slice(0,3) : [];
  return `<section class="slots-outcome" aria-live="polite"><div class="slots-reels">${reels.map(reel=>{const symbol=symbols[reel]||['?','Неизвестный символ'];return `<span class="slot-reel" role="img" aria-label="${symbol[1]}">${symbol[0]}</span>`;}).join('')}</div><p>Начислено: <strong>${integer(result.payout)} Бзинге</strong> · итог ${signed(result.net)}</p><p>Баланс: ${integer(result.balance)} Бзинге</p></section>`;
}
