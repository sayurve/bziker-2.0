/** The physical centre line is shared with water.js/water.py. The bridge is
 * a ground object: the player stays above its deck and never enters boat mode. */
export function lakeWalkwayLayouts(lake){
 return (Array.isArray(lake?.walkways)?lake.walkways:[]).flatMap((walkway,index)=>{
  if(!Number.isFinite(walkway.width)||walkway.width<=0||!Array.isArray(walkway.points)||!walkway.points.every(p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite)))return [];
  return walkway.points.slice(1).flatMap((point,i)=>{
   const a=walkway.points[i].slice(0,2),b=point.slice(0,2),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)return [];
   const half=walkway.width/2+13,nx=-dy/length,ny=dx/length,points=[a,b].flatMap(p=>[-1,1].map(side=>[p[0]+nx*half*side,p[1]+ny*half*side])),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
   const x=Math.min(...xs)-Math.abs(dx/length)*13,y=Math.min(...ys)-Math.abs(dy/length)*13;
   return [{id:`${walkway.id||`lake-bridge-${index}`}:${i}`,a,b,width:walkway.width,length,angle:Math.atan2(dy,dx),bounds:{x,y,width:Math.max(...xs)-x+Math.abs(dx/length)*13,height:Math.max(...ys)-y+Math.abs(dy/length)*13},depth:-1}];
  });
 });
}
export function drawLakeWalkway(c,bridge){
 if(!bridge?.length)return false;
 c.save();c.translate(bridge.a[0],bridge.a[1]);c.rotate(bridge.angle);
 const half=bridge.width/2,paint=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
 paint(4,-half+8,bridge.length,bridge.width,'#23372655');
 paint(0,-half,bridge.length,bridge.width,'#5a3a27');
 for(let x=0;x<bridge.length;x+=15){const width=Math.min(13,bridge.length-x);paint(x,-half+5,width,bridge.width-10,(Math.floor(x/15)%3)?'#ac8251':'#bf9661');paint(x,-half+5,width,2,'#dbc18c');paint(x+4,-half+17,Math.max(2,width-7),2,'#936b41');}
 for(const y of[-half-5,half-3]){paint(0,y,bridge.length,8,'#533724');paint(0,y,bridge.length,2,'#c89d61');for(let x=8;x<bridge.length;x+=70){paint(x-3,y-3,8,14,'#453021');paint(x-3,y-3,8,3,'#e1c38a');}}
 c.restore();return true;
}
