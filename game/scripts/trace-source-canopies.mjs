/** Conservative visible native vegetation supports, sampled from unchanged art. */
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {designData} from '../web/design-data.js';
const require=createRequire(process.execPath),{createCanvas,loadImage}=require('@napi-rs/canvas');
const root=new URL('../',import.meta.url),asset=designData.assets['city-source-map'];
const img=await loadImage(fileURLToPath(new URL(`..${asset.url}`,import.meta.url)));
const canvas=createCanvas(1536,1024),c=canvas.getContext('2d');c.drawImage(img,0,0);const data=c.getImageData(0,0,1536,1024).data;
const green=new Uint8Array(1536*1024),seen=new Uint8Array(green.length),rects=[];
for(let i=0;i<green.length;i++){const k=i*4,r=data[k],g=data[k+1],b=data[k+2];green[i]=g>45&&g>r*1.08&&g>b*1.16?1:0;}
for(let i=0;i<green.length;i++){
 if(!green[i]||seen[i])continue;const queue=[i];seen[i]=1;let left=1536,right=0,top=1024,bottom=0;
 for(let n=0;n<queue.length;n++){const p=queue[n],x=p%1536,y=Math.floor(p/1536);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);for(const q of[p-1,p+1,p-1536,p+1536])if(q>=0&&q<green.length&&Math.abs(q%1536-x)<=1&&green[q]&&!seen[q]){seen[q]=1;queue.push(q);}}
 if(queue.length<160||right-left<10||bottom-top<9)continue;
 // Foliage is a depth mask, not a solid ceiling. Each compact crown cluster
 // has only its lower ground support; the actor may walk behind its leaves.
 const cell=36;for(let yy=top;yy<=bottom;yy+=cell)for(let xx=left;xx<=right;xx+=cell){let count=0,last=0,sum=0;for(const p of queue){const x=p%1536,y=Math.floor(p/1536);if(x<xx||x>=xx+cell||y<yy||y>=yy+cell)continue;count++;last=Math.max(last,y);sum+=x;}if(count<120)continue;rects.push({x:Math.round(sum/count)-3,y:last-2,width:6,height:5,source_kind:'native-vegetation-support',crown:[xx,yy,Math.min(cell,right-xx+1),Math.min(cell,bottom-yy+1)]});}
}
writeFileSync(new URL('web/source-canopies-v19.json',root),JSON.stringify({native_size:[1536,1024],source_sha256:asset.source_sha256,geometry:'lower-native-crown-supports',rects},null,2)+'\n');console.log(JSON.stringify({canopy_supports:rects.length}));
