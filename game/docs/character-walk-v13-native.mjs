import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {drawAvatarCanvas} from '../web/avatar.js';
const {createCanvas}=createRequire(process.execPath)('@napi-rs/canvas');
const canvas=createCanvas(1200,840),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
ctx.fillStyle='#edeae1';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#263237';ctx.font='bold 22px sans-serif';ctx.fillText('Бзикер · восемь фаз ходьбы · четыре направления',24,34);
for(const [row,facing] of ['down','right','up','left'].entries())for(let walkFrame=0;walkFrame<8;walkFrame++){
 const x=24+walkFrame*148,y=58+row*194;ctx.fillStyle='#263237';ctx.font='14px sans-serif';ctx.fillText(`${facing} · ${walkFrame+1}`,x,y+14);
 ctx.fillStyle='#ccd3c3';ctx.fillRect(x+24,y+163,90,2);
 drawAvatarCanvas(ctx,{hairColor:3,shirtColor:3,pantsColor:1},x+20,y+22,{scale:3,facing,walkFrame,walking:true});
}
await writeFile(new URL('./character-walk-v13-contact.png',import.meta.url),canvas.toBuffer('image/png'));
