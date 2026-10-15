import {avatarSVG,avatarGeometry} from './avatar.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rect=(x,y,w,h,c)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
const text=(s,x,y,size=9,c='#ece7d8')=>`<text x="${x}" y="${y}" text-anchor="middle" font-family="monospace" font-size="${size}" font-weight="bold" fill="${c}">${escape(s)}</text>`;
const seats=[{x:168,y:238},{x:310,y:238},{x:168,y:146},{x:310,y:146}];

function chair(x,y){
 return rect(x-16,y-26,32,30,'#23262c')+rect(x-13,y-23,26,23,'#755363')+rect(x-10,y-20,20,14,'#ac7784')+rect(x-13,y-1,26,5,'#392f39')+rect(x-14,y+4,5,7,'#242831')+rect(x+9,y+4,5,7,'#242831');
}
function slots(x,y){
 let out=rect(x+3,y+5,32,53,'#272a31')+rect(x,y,32,51,'#565f69')+rect(x+3,y+3,26,6,'#e0c886')+rect(x+3,y+12,26,22,'#252c36');
 for(let i=0;i<3;i++)out+=rect(x+5+i*8,y+15,6,15,'#f0eee3')+text(i===1?'7':'◆',x+8+i*8,y+26,7,'#835969');
 return out+rect(x+4,y+38,24,3,'#202832')+rect(x+21,y+44,5,3,'#c9ad70')+rect(x+34,y+19,3,12,'#83949f')+rect(x+33,y+16,5,5,'#b4848e');
}

// Public room decoration never reads a player's hand or the dealer's hidden cards.
export function casinoRoomHTML(table={}){
 if(table.source!=='casino')return '';
 const players=(Array.isArray(table.players)?table.players:[]).slice(0,4);
 let art=rect(0,0,480,300,'#1d242d')+rect(12,10,456,276,'#969d9c')+rect(20,18,440,62,'#d0d1c8')+rect(20,80,440,200,'#a6aca7');
 for(let y=18;y<73;y+=9)for(let x=22+(y%2?0:8);x<458;x+=16)art+=rect(x,y,2,2,'#bcc0b9');
 art+=rect(20,64,440,4,'#747c7c')+rect(20,68,440,8,'#3f4c51')+rect(20,76,440,4,'#78898a');
 for(let y=82;y<277;y+=16)for(let x=22;x<458;x+=20){art+=rect(x,y,18,14,(Math.floor(y/16)+Math.floor(x/20))%2?'#a9afa9':'#9ba39e');art+=rect(x+1,y+1,16,1,'#b6bcb4');}
 // Raised side walls, inset windows, a cashier and the two slot machines.
 art+=rect(12,77,8,209,'#566567')+rect(460,77,8,209,'#566567')+rect(20,280,440,6,'#3f4c51');
 for(const x of [46,358]){art+=rect(x,28,74,33,'#697779')+rect(x+3,31,68,26,'#31424f')+rect(x+6,33,29,19,'#79979c')+rect(x+39,33,29,19,'#9bb2b1')+rect(x+6,51,62,3,'#d6d6c8')+rect(x+34,31,5,26,'#bac1b7');}
 art+=rect(184,25,112,27,'#39444b')+rect(187,28,106,21,'#f0eddc')+text('БЗИКЕР · КАЗИНО',240,42,10,'#364149');
 art+=rect(24,99,82,43,'#63696b')+rect(24,96,82,8,'#e2ddd0')+rect(29,107,72,28,'#a6aaa4')+rect(33,110,22,22,'#626e70')+rect(36,113,16,3,'#d4d6c9')+rect(73,109,24,18,'#34434b')+rect(77,112,16,10,'#9dbeaf')+text('КАССА',65,151,8,'#36434b');
 art+=slots(376,95)+slots(418,95);
 // Planters and lamps frame the walkway without covering the table.
 for(const x of [46,430]){art+=rect(x-11,221,22,18,'#333d46')+rect(x-8,217,16,7,'#a8b7b0')+rect(x-5,190,10,28,'#597963')+rect(x-13,198,9,10,'#759575')+rect(x+5,194,8,12,'#466650')+rect(x-3,182,6,13,'#86a17c');}
 for(const x of [143,333])art+=rect(x-1,28,3,17,'#566263')+rect(x-8,42,17,5,'#dcc69b')+rect(x-5,47,11,5,'#eee0b5');
 for(const s of seats)art+=chair(s.x,s.y);
 // Shadow, table thickness, wooden rail and a shaded felt surface.
 art+=rect(189,233,8,21,'#384047')+rect(280,233,8,21,'#384047')+rect(190,245,98,4,'#6c7773')+rect(189,155,104,83,'#485550')+rect(186,146,108,83,'#34383e')+rect(180,155,120,65,'#34383e')+rect(185,149,110,75,'#bdab88')+rect(181,159,118,56,'#bdab88')+rect(190,154,100,65,'#426f61')+rect(186,163,108,48,'#426f61')+rect(193,157,94,2,'#75a08b')+rect(188,211,104,4,'#31564f');
 for(const [x,y,c] of [[202,177,'#dfc6a2'],[276,194,'#b0808b'],[212,198,'#7e91b4']])art+=rect(x-2,y+2,10,5,'#263e3a')+rect(x,y,7,4,c)+rect(x+1,y-3,5,4,c);
 art+=rect(233,183,14,19,'#e6e3d7')+rect(235,186,10,13,'#687892')+text(table.game==='poker'?'ПОКЕР':table.game==='blackjack'?'21':'ДУРАК',240,172,9,'#e3ebd9');
 const actors=players.map((p,i)=>{const s=seats[i];const mine=p.id===table.my_id,active=p.id===table.turn_id;
  const scale=42/avatarGeometry.width;
  const portrait=avatarSVG(p.avatar,false,{pose:'sit',facing:'down'}).replace('<svg ',`<svg x="${s.x-avatarGeometry.anchorX*scale}" y="${s.y+8-avatarGeometry.anchorY*scale}" width="42" height="${avatarGeometry.height*scale}" `);
  return `<g data-casino-player="${escape(p.id)}">${portrait}${rect(s.x-28,s.y+15,56,13,mine?'#e7ecd9':'#34414b')}${text(p.name,s.x,s.y+25,7,mine?'#30483c':'#ece8dd')}${active?rect(s.x-3,s.y+31,6,3,'#e9c971'):''}</g>`;
 }).join('');
 return `<figure class="casino-room-scene"><svg viewBox="0 0 480 300" role="img" aria-label="Интерьер казино Бзикера: игроки за карточным столом" shape-rendering="crispEdges">${art}${actors}</svg><figcaption>Казино · ${players.length}/4 за столом</figcaption></figure>`;
}
