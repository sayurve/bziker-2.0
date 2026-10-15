import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const {createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const root='art/drafts/canonical-actions-v30';
const specs=JSON.parse(fs.readFileSync('verification/phone-action-audit/generated-family-inputs-v30.json'));
specs.unshift({family:'seated',gender:'male',dir:'right',key:'seated/male-right',sourceOutput:JSON.parse(fs.readFileSync(root+'/seated/male-right/metadata.json')).sourceOutput,refs:[root+'/references/male-right-runtime-8x.png']});
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const s of specs){
 const folder=root+'/'+s.key,path=folder+'/'+s.family+'-four-master.png',bytes=fs.readFileSync(path),im=await loadImage(path),cw=im.width/2,ch=im.height/2,scale=128/ch;
 if(Math.abs(cw*scale-96)>1e-8)throw Error('Nonuniform sheet aspect '+path);
 const poses=s.family==='seated'?['neutral','hand-chest','hand-mouth','reach']:['cast','hold','reel','row'];
 const contact=createCanvas(1050,328),g=contact.getContext('2d');g.fillStyle='#c2cbd0';g.fillRect(0,0,1050,328);g.imageSmoothingEnabled=false;g.fillStyle='#101010';g.font='14px sans-serif';g.fillText(s.key+' RAW draft: C + 4 fixed-cell frames. No head compositor/registration yet.',8,20);
 g.drawImage(await loadImage(root+'/references/'+s.gender+'-'+s.dir+'-runtime-8x.png'),8,40,192,256);
 const records=[];
 for(let i=0;i<4;i++){
  const cell=createCanvas(cw,ch);cell.getContext('2d').drawImage(im,i%2*cw,Math.floor(i/2)*ch,cw,ch,0,0,cw,ch);fs.writeFileSync(folder+'/'+poses[i]+'-source-cell.png',cell.toBuffer('image/png'));
  const c=createCanvas(96,128),q=c.getContext('2d');q.imageSmoothingEnabled=false;q.drawImage(cell,0,0,96,128);const d=q.getImageData(0,0,96,128).data;let bounds=[96,128,0,0],edge=0,opaque=0;
  for(let y=0;y<128;y++)for(let x=0;x<96;x++)if(d[(y*96+x)*4+3]>127){opaque++;bounds=[Math.min(bounds[0],x),Math.min(bounds[1],y),Math.max(bounds[2],x+1),Math.max(bounds[3],y+1)];if(!x||!y||x===95||y===127)edge++;}
  const file=folder+'/'+poses[i]+'-fine-raw.png';fs.writeFileSync(file,c.toBuffer('image/png'));g.drawImage(c,(i+1)*210+8,40,192,256);g.fillStyle='#101010';g.fillText(poses[i]+' '+bounds.join(','),(i+1)*210+8,318);records.push({pose:poses[i],file,sourceCell:[i%2*cw,Math.floor(i/2)*ch,cw,ch],uniformScale:scale,opaqueBounds:bounds,opaquePixels:opaque,edgeInk:edge});
 }
 fs.writeFileSync(folder+'/native-raw-contact.png',contact.toBuffer('image/png'));
 fs.writeFileSync(folder+'/raw-export-evidence.json',JSON.stringify({status:'draft',family:s.family,gender:s.gender,dir:s.dir,master:path,sourceOutput:s.sourceOutput,rawMasterUnchanged:sha(bytes)===sha(fs.readFileSync(s.sourceOutput)),masterSHA256:sha(bytes),actualSize:[im.width,im.height],requestedSize:[1536,2048],cell:[cw,ch],fixedUniformScale:scale,referencePaths:s.refs,poses:records},null,2));
 console.log(s.key,im.width,im.height,records.map(r=>r.opaqueBounds));
}
