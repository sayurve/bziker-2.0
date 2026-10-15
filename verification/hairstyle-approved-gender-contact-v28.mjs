import{writeFile}from'node:fs/promises';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';
import{loadSourceActor,drawSourceAvatarCanvas}from'../game/web/source-actors.js';import{parts,defaultAvatar}from'../game/web/avatar.js';
const{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
for(const g of['male','female'])await loadSourceActor('human-'+g,{createCanvas,loadImage:p=>loadImage(fileURLToPath(new URL('../game/'+p.replace(/^\//,''),import.meta.url)))});
const c=createCanvas(12*112+100,8*150+40),x=c.getContext('2d');x.fillStyle='#e4e9e5';x.fillRect(0,0,c.width,c.height);x.imageSmoothingEnabled=false;x.fillStyle='#15202a';x.font='13px sans-serif';
for(let s=0;s<12;s++)x.fillText('style '+s,100+s*112,22);
for(const[di,facing]of['down','right','up','left'].entries())for(const gender of[0,1]){const row=di*2+gender;x.fillStyle='#15202a';x.fillText((gender?'female':'male')+' '+facing,2,64+row*150);for(let hairStyle=0;hairStyle<12;hairStyle++)drawSourceAvatarCanvas(x,{...defaultAvatar,gender,hairStyle},parts,100+hairStyle*112,32+row*150,{scale:2,facing,walking:true,running:true,walkFrame:0});}
await writeFile(new URL('./hairstyle-approved-v28/genders-same-scale.png',import.meta.url),c.toBuffer('image/png'));
