import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {defaultAvatar,parts} from '../web/avatar.js';
import {loadSourceActor,sourceActorFrame,drawSourceAvatarCanvas} from '../web/source-actors.js';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const output=new URL('../docs/bugfix-v25/',import.meta.url);
const actual={gender:0,skin:0,hairStyle:11,hairColor:6,shirtStyle:3,shirtColor:4,pantsStyle:2,pantsColor:1,accessory:0,shoesColor:0,outfit:0,headwear:4};
await loadSourceActor('human-male',{createCanvas,loadImage:path=>loadImage(fileURLToPath(new URL('../'+path,import.meta.url)))});
await loadSourceActor('human-female');fs.mkdirSync(output,{recursive:true});
const faces=['down','right','up','left'],poses=[{label:'idle'},...Array.from({length:4},(_,phase)=>({label:`run ${phase}`,walking:true,running:true,walkFrame:phase*2}))];
function bounds(p,predicate=()=>true){let left=96,top=128,right=-1,bottom=-1;for(let y=0;y<128;y++)for(let x=0;x<96;x++){const k=(y*96+x)*4;if(p[k+3]&&predicate(p,k,x,y)){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}return{left,top,right,bottom,width:right-left+1,height:bottom-top+1};}
const measurements=[];
function contact(base,name,title){
 const canvas=createCanvas(1050,1300),c=canvas.getContext('2d');c.fillStyle='#efeee7';c.fillRect(0,0,canvas.width,canvas.height);c.imageSmoothingEnabled=false;c.font='20px sans-serif';c.fillStyle='#20252c';c.fillText(title,20,27);c.font='12px sans-serif';c.fillText('Native fine 96×128 · same scale / foot anchor · complete four-phase frames',20,49);
 for(const gender of[0,1])for(let d=0;d<faces.length;d++)for(let phase=0;phase<poses.length;phase++){
  const facing=faces[d],mode=poses[phase],avatar={...base,gender},options={...mode,facing},frame=sourceActorFrame(avatar,options);
  assert.deepEqual([frame.rect.detail.w,frame.rect.detail.h],[96,128]);
  const x=phase*210,y=60+(gender*4+d)*155;c.fillStyle='#25333b';c.fillText(`${gender?'female':'male'} ${facing} ${mode.label}`,x+20,y+18);
  c.fillStyle='#c5cac7';c.fillRect(x+15,y+147,180,1);
  assert.equal(drawSourceAvatarCanvas(c,avatar,parts,x+57,y+20,{...options,scale:2}),true);
  const tiny=createCanvas(96,128).getContext('2d');drawSourceAvatarCanvas(tiny,avatar,parts,0,0,{...options,scale:2});const pixels=tiny.getImageData(0,0,96,128).data;
  measurements.push({sheet:name,gender,facing,pose:mode.label,body:bounds(pixels),catalogHeadRegion:frame.head});
 }
 fs.writeFileSync(new URL(name,output),canvas.toBuffer('image/png'));console.log(`${name}: ${canvas.width}×${canvas.height}`);
}
contact(defaultAvatar,'actor-native-motion-contact-after.png','Native source silhouettes — standing and four running phases');
contact({...defaultAvatar,hairColor:6},'actor-white-hair-contact-after.png','Hair material fix — light hair in every direction and phase');
contact(actual,'actor-live-avatar-contact-after.png','Actual account wardrobe — same head, torso and foot anchors');
fs.writeFileSync(new URL('actor-motion-evidence-after.json',output),JSON.stringify({actualAvatar:actual,logicalSize:[48,64],fineAtlasSize:[96,128],scale:2,footAnchor:[24,63],measurements},null,2)+'\n');
