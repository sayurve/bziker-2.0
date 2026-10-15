import {createRequire}from'node:module';import{fileURLToPath}from'node:url';import{readFile,writeFile}from'node:fs/promises';
const{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const game=new URL('../../../game/',import.meta.url),load=p=>loadImage(fileURLToPath(new URL(p.replace(/^\//,''),game)));
const a=await import('./before-avatar.mjs'),b=await import('./after-avatar.mjs'),as=await import('./before-source-actors.mjs'),bs=await import('./after-source-actors.mjs');
for(const module of[as,bs])for(const id of['human-male','human-female'])await module.loadSourceActor(id,{createCanvas,loadImage:load});
const canvas=createCanvas(1600,780),c=canvas.getContext('2d');c.fillStyle='#e8e5dc';c.fillRect(0,0,1600,780);c.font='16px sans-serif';c.fillStyle='#202629';c.fillText('Native renderer: BEFORE left / isolated skirt candidate AFTER right; shared snapshot for hair/poses',8,21);
const rows=[-1,0,1,2,3],dirs=['down','right','up','left'];
for(let row=0;row<5;row++)for(const gender of[0,1])for(let d=0;d<4;d++){
 const phase=rows[row],options=phase<0?{facing:dirs[d]}:{facing:dirs[d],walking:true,walkFrame:phase*2},x=(gender*4+d)*200,y=row*150+28,avatar={...a.defaultAvatar,gender,pantsStyle:2};c.fillStyle='#18212a';c.fillRect(x+1,y+18,198,129);a.drawAvatarCanvas(c,avatar,x+18,y+28,{...options,scale:1.5});b.drawAvatarCanvas(c,avatar,x+112,y+28,{...options,scale:1.5});c.fillStyle='#202629';c.font='13px sans-serif';c.fillText(`G${gender} ${dirs[d]} ${phase<0?'idle':'walk '+phase}`,x+3,y+13);
}
await writeFile(new URL('before-after.png',import.meta.url),canvas.toBuffer('image/png'));console.log('before-after.png');
