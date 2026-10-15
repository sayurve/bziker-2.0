import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {drawAvatarCanvas} from '../web/avatar.js';
import {drawAnimal} from '../web/waterfront.js';
import {actionPoseState} from '../web/action-effects.js';
let createCanvas;
try{({createCanvas}=createRequire(import.meta.url)('@napi-rs/canvas'));}catch{({createCanvas}=createRequire(process.execPath)('@napi-rs/canvas'));}
const canvas=createCanvas(1200,1460),c=canvas.getContext('2d');
c.fillStyle='#edeae1';c.fillRect(0,0,canvas.width,canvas.height);c.imageSmoothingEnabled=false;
const actions=['smoke','eat','drink','pick-litter','throw-litter','pet'],samples=[.04,.18,.32,.48,.66,.8,.9,.98];
c.fillStyle='#334148';c.font='bold 20px sans-serif';c.fillText('Бзикер · локальные позы v12 · нативный Canvas',24,32);
for(let row=0;row<actions.length;row++)for(let col=0;col<samples.length;col++){
 const x=col*148+23,y=row*186+50,type=actions[row],actionProgress=samples[col];
 c.fillStyle='#334148';c.font='13px sans-serif';c.fillText(`${type} · ${actionPoseState(type,actionProgress).stage}`,x,y+15);
 drawAvatarCanvas(c,{},x+17,y+30,{scale:3,facing:'right',action:type,actionProgress});
}
for(let i=0;i<4;i++){
 const x=24+i*180,y=1215,facing=['down','right','up','left'][i];c.fillStyle='#334148';c.font='13px sans-serif';c.fillText(`${facing} · seated phone`,x,y);
 drawAvatarCanvas(c,{hairStyle:5},x+32,y+18,{scale:3,facing,pose:'sit',phoneOpen:true,action:'smoke',actionProgress:.48});
}
for(const [i,kind] of ['dog','cat'].entries()){
 const x=824+i*180,y=1290;c.fillStyle='#334148';c.font='14px sans-serif';c.fillText(`${kind} · reaction`,x-65,y-66);
 c.save();c.translate(x,y);c.scale(2,2);drawAnimal(c,{kind,x:0,y:0,facing:'right',walking:false},{kind,started_at:100,duration:3},false,101);c.restore();
}
await writeFile(new URL('./actor-actions-v12-contact.png',import.meta.url),canvas.toBuffer('image/png'));
