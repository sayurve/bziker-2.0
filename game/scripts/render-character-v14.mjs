import fs from 'node:fs';
import {createRequire} from 'node:module';
import {avatarRaster,parts,defaultAvatar} from '../web/avatar.js';
const {createCanvas}=createRequire(process.execPath)('@napi-rs/canvas');
const cases=[];
for(const gender of [0,1])for(const facing of ['down','left','up','right'])cases.push({label:`${gender?'Женский':'Мужской'} · ${facing}`,a:{...defaultAvatar,gender},o:{facing}});
for(let hairStyle=0;hairStyle<12;hairStyle++)cases.push({label:parts.hairStyle.options[hairStyle],a:{...defaultAvatar,hairStyle},o:{}});
for(const facing of ['down','left','up','right'])for(const walkFrame of [0,2,4,6])cases.push({label:`Шаг ${facing} · ${walkFrame/2+1}`,a:defaultAvatar,o:{facing,walking:true,walkFrame}});
for(const pose of ['sit','phone','eat','drink','pick-litter','throw-litter','pet','smoke'])cases.push({label:pose,a:defaultAvatar,o:{pose,actionProgress:.32}});
const width=8*160,height=Math.ceil(cases.length/8)*230,canvas=createCanvas(width,height),ctx=canvas.getContext('2d');ctx.fillStyle='#f5f4ef';ctx.fillRect(0,0,width,height);
for(const [i,{a,o,label}] of cases.entries()){
 const sprite=avatarRaster(a,o),x=(i%8)*160,y=Math.floor(i/8)*230;
 ctx.fillStyle='#dfddd6';ctx.fillRect(x+4,y+202,152,1);
 for(const r of sprite.runs){ctx.fillStyle=r.color;ctx.fillRect(x+20+r.x*3,y+9+r.y*3,r.w*3,r.h*3);}
 ctx.fillStyle='#343b37';ctx.font='11px sans-serif';ctx.fillText(label,x+7,y+220);
}
const target=new URL('../docs/v14-character-contact-sheet.png',import.meta.url);fs.writeFileSync(target,canvas.toBuffer('image/png'));
console.log(JSON.stringify({frames:cases.length,path:target.pathname}));
