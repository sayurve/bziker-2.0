/** Runtime limb sampling. The supplied artwork is never rewritten.
 * Face, body, palette and ground anchor stay fixed within a facing cycle. */
const visible=v=>v!==null&&v!==undefined&&v!==0;
function bounds(grid,w,h){let left=w,right=-1,top=h,bottom=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(visible(grid[y*w+x])){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 return right<left?null:{left,right,top,bottom};
}
export function alternatingGait(base,current,w,h,{anchor=[w/2,h-1],kind='human',facing='down',phase=0,headBottom,preserveArms=false}={}){
 const box=bounds(base,w,h);if(!box)return [...current];
 const empty=base.some(v=>v===null)?null:0,out=[...base],opposite=(Math.floor(phase)%4+4)%4>=2,axis=anchor[0];
 const head=headBottom??Math.round(box.top+(anchor[1]-box.top)*.38);
 let legTop=kind==='human'?Math.round(head+(anchor[1]-head)*.56):Math.round(box.top+(box.bottom-box.top+1)*.74);
 if(kind!=='human'){
  const longestRun=y=>{let run=0,longest=0;for(let x=0;x<w;x++){run=visible(base[y*w+x])?run+1:0;longest=Math.max(longest,run);}return longest;};
  while(legTop<box.bottom&&longestRun(legTop)>(box.right-box.left+1)*.55)legTop++;
 }
 const legPixels=[];for(let y=legTop;y<h;y++)for(let x=0;x<w;x++)if(visible(base[y*w+x]))legPixels.push(x);
 const midpoint=(Math.min(...legPixels)+Math.max(...legPixels)+1)/2;
 const sideAxes=[legPixels.filter(x=>x<midpoint),legPixels.filter(x=>x>=midpoint)]
  .map(xs=>xs.length?(Math.min(...xs)+Math.max(...xs)+1)/2:axis);
 const legX=x=>!opposite?x:kind==='human'||['front','back','up','down'].includes(facing)?Math.round(2*axis-1-x):Math.round(2*sideAxes[x<midpoint?0:1]-1-x);
 for(let y=legTop;y<h;y++)for(let x=0;x<w;x++)out[y*w+x]=empty;
 for(let y=legTop;y<h;y++)for(let x=0;x<w;x++)if(visible(current[y*w+x])){const target=legX(x);if(target>=0&&target<w)out[y*w+target]=current[y*w+x];}
 if(kind==='human'){
  const armTop=head+Math.max(2,Math.round(w*.09)),half=Math.max(2,Math.round((head-box.top)*.33));
  const arm=x=>x<axis-half||x>=axis+half;
  if(preserveArms){for(let y=head+1;y<legTop;y++)for(let x=0;x<w;x++)out[y*w+x]=current[y*w+x];}
  else{
   for(let y=armTop;y<legTop;y++)for(let x=0;x<w;x++)if(arm(x))out[y*w+x]=empty;
   for(let y=armTop;y<legTop;y++)for(let x=0;x<w;x++)if(arm(x)&&visible(current[y*w+x])){
    const target=opposite?Math.round(2*axis-1-x):x;if(target>=0&&target<w&&arm(target))out[y*w+target]=current[y*w+x];
   }
  }
 }
 return out;
}
