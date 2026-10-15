/** The approved BZIK silhouette sampled into authored integer pixel runs.
 * Its proportions stay unchanged; diagonals use crisp one-pixel steps. */
const outer=[[-24,0],[-28,-12],[-28,-58],[-40,-62],[-40,-78],[-32,-93],[-13,-102],[-13,-108],[-23,-110],[-23,-132],[-17,-145],[-7,-151],[10,-151],[22,-140],[24,-117],[14,-108],[14,-103],[32,-93],[41,-77],[40,-62],[28,-57],[28,-12],[34,0],[5,0],[1,-36],[-2,0]];
const inner=[[-20,-5],[-22,-62],[-31,-66],[-34,-76],[-28,-89],[-9,-98],[-9,-113],[-18,-116],[-18,-130],[-13,-141],[-5,-146],[7,-146],[17,-136],[19,-119],[9,-113],[9,-98],[27,-89],[35,-76],[33,-66],[22,-62],[22,-5],[7,-5],[4,-39],[-4,-39],[-7,-5]];
const tie=[[-22,-87],[-4,-88],[1,-83],[22,-89],[25,-78],[4,-75],[-4,-79],[-21,-77]];
function contains(poly,x,y){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
const runs=[];
for(let y=-64;y<0;y++){
 let start=-18,previous=null;for(let x=-18;x<=19;x++){
  const px=(x+.5)/.42,py=(y+.5)/.42;let color=contains(outer,px,py)?'#141414':null;if(color&&contains(inner,px,py))color='#faf8f2';
  if(color&&contains(tie,px,py))color='#141414';
  if(color&&((px>=-10&&px<-5&&py>=-134&&py<-129)||(px>=4&&px<9&&py>=-134&&py<-129)||(px>=-4&&px<9&&py>=-121&&py<-117)))color='#141414';
  if(x===19)color=null;
  if(color!==previous){if(previous)runs.push({x:start,y,width:x-start,color:previous});start=x;previous=color;}
 }
}
export const mascotPixelRuns=Object.freeze(runs.map(Object.freeze));
export function drawPixelMascot(c,x,y){
 c.fillStyle='#0002';c.fillRect(Math.round(x)-15,Math.round(y)+1,33,5);
 for(const run of mascotPixelRuns){c.fillStyle=run.color;c.fillRect(Math.round(x)+run.x,Math.round(y)+run.y,run.width,1);}
}
