// Head-only review matrix: fixed96x80 window, identical2x zoom, no face resize.
import fs from'node:fs';import{createRequire}from'node:module';import{createHash}from'node:crypto';import{sourceActorsData as D}from'../game/web/source-actors-data.js';
const{createCanvas,loadImage}=createRequire(process.execPath)('@napi-rs/canvas');
const folder='art/drafts/locomotion-v27/shared-head-style-proposal';fs.mkdirSync(folder,{recursive:true});
const inside=(p,x,y)=>{let v=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])v=!v;}return v;};
const configs={
 male:{down:[[17,5],[80,5],[80,46],[73,51],[67,56],[59,61],[52,64],[44,64],[37,60],[29,56],[22,52],[17,45]],up:[[19,5],[80,5],[80,44],[72,50],[65,55],[56,59],[40,59],[32,56],[24,51],[19,45]]},
 female:{down:[[10,14],[87,14],[87,77],[75,77],[68,70],[61,68],[55,72],[42,72],[35,68],[29,72],[21,77],[10,77]],right:[[17,12],[92,12],[92,65],[82,69],[75,70],[68,73],[60,72],[54,69],[47,70],[41,74],[31,77],[21,77],[17,69]],up:[[12,10],[87,10],[87,77],[79,82],[68,82],[60,78],[52,80],[40,80],[31,83],[21,81],[12,75]],left:[[3,12],[83,12],[88,72],[82,79],[70,79],[59,74],[51,69],[44,71],[39,73],[32,72],[24,70],[18,66],[10,64],[3,57]]}
};
const femaleFaces={down:[[29,33],[65,33],[67,45],[74,47],[75,59],[69,63],[63,65],[57,70],[44,70],[38,66],[31,64],[25,60],[22,51],[28,48]],right:[[66,34],[81,34],[83,51],[86,56],[81,62],[77,66],[70,69],[62,70],[59,66],[54,63],[50,60],[48,51],[54,51],[57,54],[59,44]],left:[[18,34],[34,34],[37,43],[39,52],[43,50],[47,52],[48,59],[42,64],[36,67],[29,69],[22,68],[18,64],[12,61],[10,56],[15,53],[15,42]],up:[]};
const maleAnchors={down:{eye:[48,46],neck:[48,61],face:[[29,27],[65,27],[66,37],[73,39],[74,49],[69,52],[63,57],[56,62],[43,62],[36,58],[30,54],[22,51],[21,41],[29,39]]},right:{eye:[63,47],neck:[55,60]},up:{eye:[48,39],neck:[48,58],face:[]},left:{eye:[27,48],neck:[40,61]}};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const dirs=[['down','Спереди'],['right','Справа'],['up','Сзади'],['left','Слева']],heads={male:{},female:{}},evidence={status:'draft-proposal',zoom:2,window:[96,80],faceResize:false,rows:['native male','native female','candidate male shared','candidate female shared'],sources:[]};
for(const gender of['male','female'])for(const[dir,token]of dirs){
 const seq=Object.values(D.actors['human-'+gender].actions).find(s=>s.name.includes('Бег')&&s.name.includes(token)),r=seq.frames[0].detail,head=createCanvas(96,128),ctx=head.getContext('2d');
 if(gender==='male'&&['right','left'].includes(dir))ctx.drawImage(await loadImage(`art/drafts/locomotion-v27/male-${dir}-v2/native-head-composition/native-run0-alpha-head-fine.png`),0,0);
 else{
  ctx.drawImage(await loadImage('game/'+r.path),r.x,r.y,r.w,r.h,0,0,r.w,r.h);const p=ctx.getImageData(0,0,96,128),poly=configs[gender][dir];
  const warm=new Set();if(gender==='female')for(let n=0;n<96*128;n++){const k=n*4,r=p.data[k],g=p.data[k+1],b=p.data[k+2];if(p.data[k+3]&&r>g*1.15&&g>b*1.06)warm.add(n);}
  for(let y=0;y<128;y++)for(let x=0;x<96;x++){
   const n=y*96+x,k=n*4,face=gender==='female'&&femaleFaces[dir].length&&inside(femaleFaces[dir],x+.5,y+.5);
   const darkOutline=gender==='female'&&Math.max(p.data[k],p.data[k+1],p.data[k+2])<50&&[-1,0,1].some(dy=>[-1,0,1].some(dx=>warm.has((y+dy)*96+x+dx)));
   if(!inside(poly,x+.5,y+.5)||(gender==='female'&&!face&&!warm.has(n)&&!darkOutline))p.data[k+3]=0;
  }
  // Exclude isolated collar-edge dots from the old female reference extraction.
  if(gender==='female'){
   const seen=new Set();for(let n=0;n<96*128;n++)if(p.data[n*4+3]&&!seen.has(n)){const q=[n],component=[];seen.add(n);while(q.length){const v=q.pop(),x=v%96;component.push(v);for(const k of[x>0?v-1:-1,x<95?v+1:-1,v-96,v+96])if(k>=0&&k<96*128&&p.data[k*4+3]&&!seen.has(k)){seen.add(k);q.push(k);}}if(component.length<8)for(const v of component)p.data[v*4+3]=0;}
  }
  ctx.putImageData(p,0,0);
 }
 heads[gender][dir]=head;const bytes=head.toBuffer('image/png'),file=`${folder}/${gender}-${dir}-native-run0-head-fine.png`;fs.writeFileSync(file,bytes);
 const anchors=maleAnchors[dir],headMetadata=gender==='male'?{...seq.frames[0].head,eyeAnchor:anchors.eye.map(v=>v/2),eyeLine:anchors.eye[1]/2,neckAnchor:anchors.neck.map(v=>v/2),...(anchors.face?{facePolygon:anchors.face.map(p=>p.map(v=>v/2))}:{})}:seq.frames[0].head;
 evidence.sources.push({gender,dir,sourceKey:seq.sourceKey,rect:r,sourceAtlasSHA256:hash(fs.readFileSync('game/'+r.path)),file,headLayerSHA256:hash(bytes),head:headMetadata,mask:configs[gender][dir]||'authored male side curved mask from composition-evidence.json'});
}
const contact=createCanvas(1056,840),c=contact.getContext('2d');c.fillStyle='#20282c';c.fillRect(0,0,1056,840);c.font='17px sans-serif';c.fillStyle='#fff';c.fillText('DRAFT style choice / same96x80 window and2x zoom / native above, shared-male-head proposal below',8,25);c.imageSmoothingEnabled=false;
for(let row=0;row<4;row++)for(let i=0;i<4;i++){
 const dir=dirs[i][0],gender=row%2?'female':'male',head=row<2?heads[gender][dir]:heads.male[dir],x=i*264+36,y=60+row*194;
 c.fillStyle='#fff';c.fillText(`${row<2?'native':'shared proposal'} ${gender} ${dir}`,x-24,y-10);c.drawImage(head,0,0,96,80,x,y,192,160);
 if(row===3){const a=heads.male[dir].getContext('2d').getImageData(0,0,96,128).data,b=head.getContext('2d').getImageData(0,0,96,128).data;if(!a.every((v,n)=>v===b[n]))throw Error('Shared head proposal changed gender pixels');}
}
fs.writeFileSync('verification/gender-native-versus-shared-heads-v27.png',contact.toBuffer('image/png'));fs.writeFileSync(folder+'/proposal-evidence.json',JSON.stringify(evidence,null,2)+'\n');
console.log('Native and optional shared head style matrix written; no production identity changed.');
