import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {drawAvatarCanvas,parts} from '../web/avatar.js';
const {createCanvas}=createRequire(process.execPath)('@napi-rs/canvas');
const directions=['down','right','up','left'];
const canvas=createCanvas(1260,2250),c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.fillStyle='#edeae1';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#263237';c.font='bold 22px sans-serif';c.fillText('Бзикер · 12 причёсок · 4 направления · оба персонажа',20,32);
for(let g=0;g<2;g++)for(let di=0;di<4;di++){c.font='16px sans-serif';c.fillText(`${g===0?'М':'Ж'} · ${directions[di]}`,190+(g*4+di)*132,60);}
for(let row=0;row<parts.hairStyle.options.length;row++){
 const y=76+row*154;c.fillStyle='#263237';c.font='16px sans-serif';c.fillText(`${row+1}. ${parts.hairStyle.options[row]}`,16,y+72);
 for(let g=0;g<2;g++)for(let di=0;di<4;di++){
  const x=180+(g*4+di)*132;drawAvatarCanvas(c,{gender:g,hairStyle:row,hairColor:row===6?1:0,shirtColor:g?11:3},x,y,{scale:3,facing:directions[di],walking:false});
 }
}
c.fillStyle='#263237';c.font='bold 20px sans-serif';c.fillText('8 оттенков кожи · фронтальный вид',20,1970);
for(let i=0;i<8;i++){drawAvatarCanvas(c,{skin:i,hairStyle:0,hairColor:0,shirtColor:5},185+i*132,1994,{scale:3,facing:'down'});c.fillStyle='#263237';c.font='15px sans-serif';c.fillText(parts.skin.options[i],185+i*132,2155);}
await writeFile(new URL('./v13-character-catalog-audit.png',import.meta.url),canvas.toBuffer('image/png'));console.log('docs/v13-character-catalog-audit.png');
