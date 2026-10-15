import {actorGeometry,actorGrid} from 'file:///Users/sapp/Desktop/%D0%98%D0%B3%D1%80%D0%B0/Bzikert%202.0/verification/customization-audit/skirt/before-sprite.mjs';
import {drawSourceAvatarCanvas,sourceAvatarRaster} from 'file:///Users/sapp/Desktop/%D0%98%D0%B3%D1%80%D0%B0/Bzikert%202.0/verification/customization-audit/skirt/before-source-actors.mjs';
// One fixed-pixel catalog serves city sprites, cloud avatars and preview tiles.
export const parts = {
 gender:{label:'Персонаж',options:['Мужской','Женский']},
 skin:{label:'Кожа',options:['Светлый','Тёплый','Смуглый','Тёмный','Фарфоровый','Песочный','Карамельный','Глубокий'],colors:['#ffdab7','#e9ac7c','#b97850','#77482f','#f6e5d5','#d9b18c','#a8673d','#503629']},
 hairStyle:{label:'Причёски',options:['Короткая','Каре','Кудри','Пучок','Ёжик','Пробор','Длинные','Хвост','Пикси','Ирокез','Два пучка','Волны']},
 hairColor:{label:'Волосы',options:['Каштановый','Чёрный','Русый','Рыжий','Фиолетовый','Седой','Белый','Розовый','Бирюзовый','Шоколадный'],colors:['#603b28','#1c202d','#f2c35d','#bb4a23','#7850a8','#96949b','#f4eeee','#dc6d9d','#419f9d','#3c271f']},
 shirtStyle:{label:'Верх',options:['Футболка','Худи','Куртка','Рубашка']},
 shirtColor:{label:'Цвет верха',options:['Розовый','Сиреневый','Синий','Зелёный','Жёлтый','Белый','Чёрный','Коралловый','Лаймовый','Молочный','Голубой','Красный'],colors:['#d31973','#a46bce','#357fcc','#348d70','#e8b63e','#f4f4f4','#262626','#ff8562','#cdf17c','#e8dcc8','#80bce5','#c54a43']},
 pantsStyle:{label:'Низ',options:['Прямые брюки','Шорты','Юбка','Широкие брюки']},
 pantsColor:{label:'Цвет низа',options:['Синий','Чёрный','Серый','Белый','Песочный','Хаки','Сиреневый','Коралловый'],colors:['#234f6c','#232535','#797f8c','#e6ecee','#c0a27d','#727c58','#9b86bb','#c36e61']},
 accessory:{label:'Аксессуары',options:['Без аксессуара','Очки','Значок','Кепка','Наушники','Сумка']},
 headwear:{label:'Головные уборы',options:['Без убора','Кепка','Шапка','Панама','Берет']},
 outfit:{label:'Костюмы из магазина',options:['Своя одежда','Хромовая куртка','Неон-худи','Креативное пальто','Спортивный костюм','Костюм зверя','Дождевик']},
 shoesColor:{label:'Обувь',options:['Чёрная','Белая','Коралловая','Синяя','Песочная','Сиреневая'],colors:['#202020','#f0f0f0','#e26e54','#315b8f','#b89970','#9b83bd']}
};
export const defaultAvatar={gender:0,skin:0,hairStyle:0,hairColor:0,shirtStyle:2,shirtColor:6,pantsStyle:0,pantsColor:1,accessory:0,shoesColor:0,headwear:0,outfit:0};
export function profileAvatar(input={}){
 return Object.fromEntries(Object.entries(parts).map(([key,part])=>[key,Number.isInteger(input?.[key])&&input[key]>=0&&input[key]<part.options.length?input[key]:defaultAvatar[key]]));
}
export function shuffleAvatar(){return {...Object.fromEntries(Object.entries(parts).map(([key,p])=>[key,Math.floor(Math.random()*p.options.length)])),outfit:0};}

// Source-driven raster sprites replace the former geometric character artwork.
export const avatarGeometry=actorGeometry;
const bitmapCache=new Map();
function spriteBitmap(sprite,scale=1){
 if(typeof HTMLCanvasElement==='undefined'||typeof document==='undefined')return null;
 const key=sprite.key+':'+scale;if(bitmapCache.has(key))return bitmapCache.get(key);
 const canvas=document.createElement('canvas');canvas.width=Math.round(sprite.width*scale);canvas.height=Math.round(sprite.height*scale);
 const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;
 for(const r of sprite.runs){context.fillStyle=r.color;const x=Math.round(r.x*scale),y=Math.round(r.y*scale);context.fillRect(x,y,Math.round((r.x+r.w)*scale)-x,Math.round((r.y+r.h)*scale)-y);}
 if(bitmapCache.size>=256)bitmapCache.delete(bitmapCache.keys().next().value);bitmapCache.set(key,canvas);return canvas;
}
export function avatarRaster(input={},options={}){
 const avatar=options.generic?defaultAvatar:profileAvatar(input);
 return sourceAvatarRaster(avatar,parts,options)||actorGrid(avatar,parts,options);
}
export function avatarSVG(input={},generic=false,options={}){
 const sprite=avatarRaster(input,{...options,generic});
 const bitmap=spriteBitmap(sprite);
 const artwork=sprite.key.startsWith('source-v17:')?'source-v17':'reference-v14';
 if(bitmap)return `<svg class="pixel-avatar" viewBox="0 0 ${sprite.width} ${sprite.height}" aria-hidden="true" focusable="false" data-art="${artwork}"><image width="${sprite.width}" height="${sprite.height}" href="${bitmap.toDataURL('image/png')}"/></svg>`;
 return `<svg class="pixel-avatar" viewBox="0 0 ${sprite.width} ${sprite.height}" aria-hidden="true" focusable="false" shape-rendering="crispEdges" data-art="${artwork}">${sprite.runs.map(r=>`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.color}"/>`).join('')}</svg>`;
}
/** One physical pixel origin for the whole native sprite, including its items. */
export function drawAvatarCanvas(ctx,input,x,y,options={}){
 if(drawSourceAvatarCanvas(ctx,profileAvatar(input),parts,x,y,options))return true;
 const scale=options.scale??1.25,transform=ctx.getTransform?.(),sprite=avatarRaster(input,options);
 let ox=Math.round(x),oy=Math.round(y);
 if(transform&&transform.b===0&&transform.c===0&&transform.a>0&&transform.d>0){
  const ax=(options.anchorX||0)*scale,ay=(options.anchorY||0)*scale;
  ox=(Math.round((x+ax)*transform.a+transform.e)-Math.round(ax*transform.a)-transform.e)/transform.a;
  oy=(Math.round((y+ay)*transform.d+transform.f)-Math.round(ay*transform.d)-transform.f)/transform.d;
 }
 const bitmap=ctx.canvas instanceof (typeof HTMLCanvasElement==='undefined'?class{}:HTMLCanvasElement)?spriteBitmap(sprite,scale):null;
 if(bitmap){ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(bitmap,ox,oy);ctx.restore();return;}
 for(const r of sprite.runs){
  ctx.fillStyle=r.color;const left=Math.round(r.x*scale),top=Math.round(r.y*scale);
  ctx.fillRect(ox+left,oy+top,Math.round((r.x+r.w)*scale)-left,Math.round((r.y+r.h)*scale)-top);
 }
}
export function headgearSVG(input={}){return avatarSVG({...input,accessory:0,outfit:0,shirtStyle:defaultAvatar.shirtStyle,shirtColor:defaultAvatar.shirtColor,pantsStyle:defaultAvatar.pantsStyle,pantsColor:defaultAvatar.pantsColor},false,{face:false,headOnly:true}).replace('class="pixel-avatar"','class="pixel-avatar headgear-preview"');}
export function mascotCoinSVG(){return '<svg class="mascot-coin" viewBox="0 0 32 32" aria-hidden="true" shape-rendering="crispEdges"><path fill="#f2ce61" d="M8 2h16v4h4v4h2v14h-4v4h-4v2H8v-4H4v-4H2V10h4V6h2z"/><path fill="#141414" d="M12 6h10v2h4v6h2v6h-6v6h-8v-4H8v-6H6v-4h4V8h2z"/><path fill="#ffffff" d="M14 8h8v2h2v6h2v2h-6v6h-4v-4h-6v-6H8v-2h4v-2h2z"/><path fill="#141414" d="M18 12h2v2h-2zM22 12h2v2h-2zM20 16h4v2h-4z"/></svg>';}
export function worldCardTable(world){return world?.restricted===false&&world.scene==='cards'&&typeof world.card_table_id==='string'&&world.card_table_id.trim()?world.card_table_id:null;}

// Scene decisions use only the role-filtered snapshot; never infer jury identities.
export function lobbySurface(lobby) {
  if (lobby.role === 'curator') return 'jury';
  if (lobby.state === 'waiting') return 'preflight';
  return lobby.state === 'finished' ? 'results' : 'sky';
}
export function shouldTakeoff(previous, next) {
  return Boolean(previous && previous.id === next.id && previous.state === 'waiting' && lobbySurface(next) === 'sky');
}
export function answerCaption(lobby) {
  if (lobby.answer_policy !== 'first') return 'Все участники могут отправить ответ.';
  if (lobby.can_answer && lobby.buzzed_by_me) return 'Право ответа у вас. Отправьте идею.';
  if (lobby.buzz_owner_name) return `Отвечает: ${lobby.buzz_owner_name}.`;
  if (lobby.can_buzz) return 'Первым нажмите кнопку, чтобы получить право ответа.';
  return 'Кнопку нажимает капитан или индивидуальный игрок.';
}

export const avatarPresets=[
 {name:'Искра',avatar:profileAvatar({gender:1,skin:0,hairStyle:2,hairColor:3,shirtColor:0,pantsColor:1,accessory:2})},
 {name:'Мыслитель',avatar:profileAvatar({gender:0,skin:1,hairStyle:0,hairColor:1,shirtStyle:3,shirtColor:5,pantsColor:1,accessory:1})},
 {name:'Бунтарь',avatar:profileAvatar({gender:0,skin:2,hairStyle:9,hairColor:4,shirtStyle:2,shirtColor:6,pantsColor:2,accessory:4})},
 {name:'Архитектор',avatar:profileAvatar({gender:1,skin:5,hairStyle:1,hairColor:1,shirtStyle:2,shirtColor:5,pantsStyle:3,pantsColor:1,shoesColor:1})},
 {name:'Исследователь',avatar:profileAvatar({gender:0,skin:3,hairStyle:5,hairColor:9,shirtStyle:1,shirtColor:3,pantsStyle:1,pantsColor:5,accessory:5})},
 {name:'Визионер',avatar:profileAvatar({gender:1,skin:4,hairStyle:11,hairColor:7,shirtStyle:1,shirtColor:1,pantsStyle:2,pantsColor:6,shoesColor:5})}
];

export function worldArenaLobby(world) {
  if (!world || world.restricted !== false || world.scene !== 'arena') return null;
  return typeof world.arena_lobby_id === 'string' && world.arena_lobby_id.trim() ? world.arena_lobby_id : null;
}
export function canFollowArena(screen,hasProfile,lobby=null) {
  if(!hasProfile)return false;
  if(['home','create','profile'].includes(screen))return true;
  return screen==='lobby'&&lobby?.role==='participant'&&['preflight','results'].includes(lobbySurface(lobby));
}
