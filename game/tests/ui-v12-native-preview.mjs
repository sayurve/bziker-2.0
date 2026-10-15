import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {drawAvatarCanvas} from '../web/avatar.js';
import {catalogPartSVG} from '../web/profile-builder.js';
import {pixelIconSVG,phoneAppGroups} from '../web/gameplay-ui.js';
let createCanvas,loadImage;
try{({createCanvas,loadImage}=createRequire(import.meta.url)('@napi-rs/canvas'));}catch{({createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas'));}
const canvas=createCanvas(960,650),ctx=canvas.getContext('2d');
ctx.fillStyle='#dbe4e3';ctx.fillRect(0,0,960,650);ctx.imageSmoothingEnabled=false;
ctx.fillStyle='#28313e';ctx.font='bold 22px sans-serif';ctx.fillText('Бзикер v12 · ракурсы, миниатюры и пиксельные значки',24,36);
const appearance={hairStyle:7,hairColor:3,shirtStyle:3,shirtColor:2,pantsStyle:3};
for(const [index,facing] of ['down','left','up','right'].entries()){
 const x=32+index*230;ctx.fillStyle='#f1eee4';ctx.fillRect(x,60,204,184);
 drawAvatarCanvas(ctx,appearance,x+55,66,{scale:3,facing});
 ctx.fillStyle='#28313e';ctx.font='14px sans-serif';ctx.fillText(['Спереди','Слева','Сзади','Справа'][index],x+16,230);
}
const samples=[['hairStyle',7],['hairStyle',8],['hairStyle',11],['headwear',1],['headwear',2],['outfit',4]];
for(const [index,[part,value]] of samples.entries()){
 const x=32+index*154,y=275,svg=catalogPartSVG(part,value,appearance),image=await loadImage(Buffer.from(svg));
 ctx.fillStyle='#f1eee4';ctx.fillRect(x,y,140,136);
 ctx.drawImage(image,x+34,y+10,72,part==='outfit'?108:72);
 ctx.fillStyle='#28313e';ctx.font='12px sans-serif';ctx.fillText(`${part} ${value}`,x+8,y+124);
}
const apps=phoneAppGroups.flatMap(group=>group.apps);
for(const [index,[id,label]] of apps.entries()){
 const x=32+(index%6)*154,y=440+Math.floor(index/6)*94;
 ctx.fillStyle='#f1eee4';ctx.fillRect(x,y,140,78);
 const svg=pixelIconSVG(id).replaceAll('currentColor','#28313e');
 ctx.drawImage(await loadImage(Buffer.from(svg)),x+54,y+6,32,32);
 ctx.fillStyle='#28313e';ctx.font='12px sans-serif';ctx.fillText(label,x+10,y+62);
}
await writeFile(new URL('../docs/ui-v12-avatar-icons.png',import.meta.url),canvas.toBuffer('image/png'));
