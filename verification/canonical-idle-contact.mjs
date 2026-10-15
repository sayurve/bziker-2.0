import {writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {defaultAvatar,parts} from '../game/web/avatar.js';
import {loadSourceActor,drawSourceAvatarCanvas} from '../game/web/source-actors.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const dirs=['down','left','right','up'],root=new URL('../game/',import.meta.url);
const gender=process.argv[2]==='female'?'female':'male',avatar={...defaultAvatar,gender:gender==='female'?1:0};
await loadSourceActor(`human-${gender}`,{createCanvas,loadImage:p=>loadImage(fileURLToPath(new URL(p,root)))});
const c=createCanvas(900,820),g=c.getContext('2d');g.fillStyle='#182432';g.fillRect(0,0,900,820);g.imageSmoothingEnabled=false;g.fillStyle='#f1f4f8';g.font='17px sans-serif';g.fillText(`${gender}: idle export vs running reference — same uniform art scale`,20,25);
for(let row=0;row<dirs.length;row++)for(let col=0;col<5;col++){
 const x=col*180+35,y=row*190+70;g.fillStyle='#26394a';g.fillRect(col*180+15,row*190+45,165,170);g.fillStyle='#d9e3ed';g.font='12px sans-serif';g.fillText(`${dirs[row]} / ${col===0?'new idle':`run ${(col-1)}`}`,col*180+20,row*190+62);g.strokeStyle='#d5b678';g.beginPath();g.moveTo(x,y+126);g.lineTo(x+96,y+126);g.stroke();
 if(col===0){const im=await loadImage(fileURLToPath(new URL(`assets/canonical-idle-v2/${gender}-${dirs[row]}-fine.png`,root)));g.drawImage(im,x,y);}else drawSourceAvatarCanvas(g,avatar,parts,x,y,{scale:2,facing:dirs[row],walking:true,running:true,walkFrame:(col-1)*2});
}
writeFileSync(new URL(gender==='female'?'canonical-female-idle-contact.png':'canonical-idle-contact.png',import.meta.url),c.toBuffer('image/png'));
