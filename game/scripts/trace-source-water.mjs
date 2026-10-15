/** Trace the largest visible water region of the unchanged approved raster. */
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {designData} from '../web/design-data.js';
const require=createRequire(process.execPath),{createCanvas,loadImage}=require('@napi-rs/canvas'),a=designData.assets['city-source-map'];
const image=await loadImage(fileURLToPath(new URL(`..${a.url}`,import.meta.url))),c=createCanvas(1536,1024).getContext('2d');c.drawImage(image,0,0);const rgba=c.getImageData(0,0,1536,1024).data;
const step=4,wet=new Set();for(let y=320;y<760;y+=step)for(let x=850;x<1378;x+=step){let n=0;for(let yy=y;yy<y+step;yy++)for(let xx=x;xx<x+step;xx++){const i=(yy*1536+xx)*4,r=rgba[i],g=rgba[i+1],b=rgba[i+2];if(b>45&&g>r*1.3&&b>r*1.4&&b>g*.7)n++;}if(n>=5)wet.add(`${x},${y}`);}
const components=[];while(wet.size){const first=wet.values().next().value;wet.delete(first);const component=new Set([first]),queue=[first];for(let n=0;n<queue.length;n++){const [x,y]=queue[n].split(',').map(Number);for(const p of [[x-step,y],[x+step,y],[x,y-step],[x,y+step]]){const k=p.join(',');if(wet.has(k)){wet.delete(k);component.add(k);queue.push(k);}}}components.push(component);}
const water=components.sort((a,b)=>b.size-a.size)[0],edges=new Map();const edge=(a,b)=>{const k=a.join(',');if(!edges.has(k))edges.set(k,[]);edges.get(k).push(b);};
for(const key of water){const[x,y]=key.split(',').map(Number);if(!water.has(`${x},${y-step}`))edge([x,y],[x+step,y]);if(!water.has(`${x+step},${y}`))edge([x+step,y],[x+step,y+step]);if(!water.has(`${x},${y+step}`))edge([x+step,y+step],[x,y+step]);if(!water.has(`${x-step},${y}`))edge([x,y+step],[x,y]);}
const polygons=[];while(edges.size){const start=edges.keys().next().value,poly=[start.split(',').map(Number)];let key=start;for(let n=0;n<20000;n++){const list=edges.get(key);if(!list?.length)break;const next=list.pop();if(!list.length)edges.delete(key);key=next.join(',');if(key===start)break;poly.push(next);}if(poly.length>=3)polygons.push(poly);}
const area=p=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0));const poly=polygons.sort((a,b)=>area(b)-area(a))[0];
// Keep actual turning points; native cell-edge noise cannot bend movement paths.
const contour=poly.filter((p,i)=>{const a=poly[(i+poly.length-1)%poly.length],b=poly[(i+1)%poly.length];return(a[0]-p[0])*(b[1]-p[1])!==(a[1]-p[1])*(b[0]-p[0]);});
const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
const simplify=p=>{if(p.length<3)return p;let at=0,max=0;for(let i=1;i<p.length-1;i++){const d=distance(p[i],p[0],p.at(-1));if(d>max){max=d;at=i;}}return max>2?simplify(p.slice(0,at+1)).slice(0,-1).concat(simplify(p.slice(at))):[p[0],p.at(-1)];};
const mid=Math.floor(contour.length/2),outline=simplify(contour.slice(0,mid+1)).slice(0,-1).concat(simplify(contour.slice(mid).concat([contour[0]])).slice(0,-1));
writeFileSync(new URL('../web/source-water-trace-v19.json',import.meta.url),JSON.stringify({source_sha256:a.source_sha256,native_size:[1536,1024],grid_step:step,outline},null,2)+'\n');console.log(JSON.stringify({vertices:outline.length,bounds:[Math.min(...contour.map(p=>p[0])),Math.min(...contour.map(p=>p[1])),Math.max(...contour.map(p=>p[0])),Math.max(...contour.map(p=>p[1]))]}));
