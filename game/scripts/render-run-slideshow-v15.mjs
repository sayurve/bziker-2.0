import fs from 'node:fs';
import {createRequire} from 'node:module';
import {avatarRaster,defaultAvatar,parts} from '../web/avatar.js';
const {createCanvas}=createRequire(process.execPath)('@napi-rs/canvas');
const dirs=['down','left','up','right'],labels=['Вниз','Влево','Вверх','Вправо'];
const create=(w,h)=>{const c=createCanvas(w,h),ctx=c.getContext('2d');ctx.fillStyle='#f5f4ef';ctx.fillRect(0,0,w,h);ctx.imageSmoothingEnabled=false;return[c,ctx];};
function draw(ctx,a,o,x,y,label){
 const sprite=avatarRaster(a,o);
 ctx.fillStyle='#c5c8bf';ctx.fillRect(x+8,y+194,144,1);
 for(const r of sprite.runs){ctx.fillStyle=r.color;ctx.fillRect(x+8+r.x*3,y+2+r.y*3,r.w*3,r.h*3);}
 ctx.fillStyle='#343b37';ctx.font='12px sans-serif';ctx.fillText(label,x+8,y+214);
}
const [sheet,ctx]=create(800,8*224);
for(const gender of [0,1])for(let d=0;d<4;d++)for(let frame=-1;frame<4;frame++){
 draw(ctx,{...defaultAvatar,gender},{facing:dirs[d],walking:frame>=0,walkFrame:Math.max(0,frame)*2},(frame+1)*160,(gender*4+d)*224,`${gender?'Ж':'М'} · ${labels[d]} · ${frame<0?'Покой':frame+1}`);
}
fs.writeFileSync(new URL('../docs/run-slideshow-v15.png',import.meta.url),sheet.toBuffer('image/png'));
const [variants,vctx]=create(12*160,4*224);
for(let d=0;d<4;d++)for(let hairStyle=0;hairStyle<12;hairStyle++)draw(vctx,{...defaultAvatar,hairStyle,shirtColor:2,hairColor:3},{facing:dirs[d],walking:true,walkFrame:d*2},hairStyle*160,d*224,parts.hairStyle.options[hairStyle]);
fs.writeFileSync(new URL('../docs/run-customization-v15.png',import.meta.url),variants.toBuffer('image/png'));
fs.mkdirSync('/tmp/bziker-v15-frames',{recursive:true});
for(let frame=0;frame<4;frame++){
 const [image,ictx]=create(640,448);
 for(const gender of [0,1])for(let d=0;d<4;d++)draw(ictx,{...defaultAvatar,gender},{facing:dirs[d],walking:true,walkFrame:frame*2},d*160,gender*224,`${gender?'Ж':'М'} · ${labels[d]}`);
 fs.writeFileSync(`/tmp/bziker-v15-frames/${frame}.png`,image.toBuffer('image/png'));
}
console.log('Rendered40 idle/run poses,48 customized run poses and4 animation frames.');
