import {drawSourceBuilding,sourceBuildingLayout,drawSourceParking,drawSourceStreet,sourceEntityLayout} from './source-city.js';
import {isModularCity} from './city-scene.js';
/** Authored v12 architecture. The JSON plan owns physical footprints and access;
 * this renderer only paints them. All coordinates share the city pixel grid. */
const ink='#252c2e',paper='#f1f1e8',glass='#a3b8ba',glassDark='#6f898f',sage='#98aa98',sand='#c3b695';
const silhouettes={railway:'clock-canopy',clans:'community-tower',arena:'sawtooth-hall',profile:'glass-studio',results:'stepped-gallery',messages:'terrace-pergola',terrace:'clerestory-workshop','shop-food':'market-lantern','shop-clothes':'folded-boutique','shop-furniture':'industrial-sheds',casino:'recessed-portal'};
const accents={railway:'#a4b9bf',clans:'#a4b7ad',arena:'#c6bf96',profile:'#b7acbf',results:'#a7bac2',messages:'#c6aca0',terrace:'#aab59c','shop-food':'#abbc9a','shop-clothes':'#b9aebd','shop-furniture':'#baac95',casino:'#c4b58b'};
const rect=(c,x,y,w,h,color=ink)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
const poly=(c,p,color)=>{c.fillStyle=color;c.beginPath();c.moveTo(Math.round(p[0][0]),Math.round(p[0][1]));for(const a of p.slice(1))c.lineTo(Math.round(a[0]),Math.round(a[1]));c.closePath();c.fill();};
const label=(c,s,x,y,size=12,color=ink,max=400)=>{c.font=`bold ${size}px monospace`;c.textAlign='center';c.fillStyle=color;c.fillText(s,Math.round(x),Math.round(y),max);};
function glazing(c,x,y,w,h){rect(c,x,y,w,h,ink);rect(c,x+3,y+3,w-6,h-6,glass);rect(c,x+5,y+5,w-10,3,'#dce5df');poly(c,[[x+6,y+9],[x+12,y+9],[x+w-8,y+h-7],[x+w-14,y+h-7]],'#d4e1db');rect(c,x+w-7,y+5,3,h-10,glassDark);rect(c,x+4,y+h-6,w-8,2,'#78938e');}
function side(c,b,color='#727e7c'){const {x,y,width:w,height:h}=b;poly(c,[[x+w,y-35],[x+w+18,y-23],[x+w+18,y+h+10],[x+w,y+h]],color);rect(c,x+w+2,y+12,3,h-6,'#9ba8a0');for(let yy=y+30;yy<y+h-25;yy+=32)rect(c,x+w+4,yy,11,2,'#51605d');}
function slab(c,x,y,w,depth=36,color=paper){poly(c,[[x,y],[x+13,y-depth],[x+w+5,y-depth],[x+w+18,y-1]],'#b8c2ba');rect(c,x,y,w+18,8,ink);rect(c,x+2,y+1,w+14,4,color);}
function door(c,b,width=48){const x=b.door.x,y=b.y+b.height;rect(c,x-width/2-3,y-58,width+6,58,ink);glazing(c,x-width/2,y-54,width,54);rect(c,x,y-52,2,50,'#d1d8cd');rect(c,x+width/2-9,y-25,3,6,sand);rect(c,x-width/2-7,y,width+14,8,paper);rect(c,x-width/2-11,y+8,width+22,7,'#bbc2b6');rect(c,x-width/2-12,y-62,width+24,4,'#e2d6ad');}
function vents(c,b){const x=b.x+b.width+5,y=b.y+b.height-65;rect(c,x,y,12,25,'#c7ccc5');for(let i=0;i<5;i++)rect(c,x+2,y+3+i*4,8,1,'#6c7b78');}
export function publicBuildingGeometry(b){
 const source=sourceBuildingLayout(b);if(!source&&!silhouettes[b?.id])return null;
 const legacy={x:b.x-35,y:b.y-104,width:b.width+93,height:b.height+210},actual=source?.bounds;
 const bounds=actual?{x:actual.x-2,y:actual.y-2,width:actual.width+4,height:actual.height+4}:legacy;
 return {silhouette:silhouettes[b.id]||source.assetId,bounds,footprint:Object.hasOwn(b,'footprint')?source?.footprint:{x:b.x,y:b.y,width:b.width+18,height:b.height+10},depth:Object.hasOwn(b,'footprint')?source?.depth:b.y+b.height};
}
export function publicBuildingLights(b){
 if(b?.design?.assetId&&Object.hasOwn(b,'footprint'))return b.lights||[];
 const {x,y,width:w,id}=b;if(!silhouettes[id])return [];
 const panes=(offsets,yy,pw,ph)=>offsets.map(dx=>({x:x+dx+3,y:y+yy+3,w:pw-6,h:ph-6}));
 if(id==='railway')return panes(Array.from({length:Math.floor((w-19)/62)},(_,i)=>18+i*62),61,42,63);
 if(id==='clans')return panes([25,w-68],69,43,65);
 if(id==='profile')return panes([15,w-80],57,65,92);
 if(id==='results')return panes([23,w-76],64,53,73);
 if(id==='messages')return panes([16,w-79],58,63,68);
 if(id==='terrace')return panes([18,w-82],63,64,82);
 if(id==='shop-food')return panes([15,w-77],74,62,61);
 if(id==='shop-clothes')return panes([18,w-84],62,66,91);
 if(id==='shop-furniture')return panes([15,w-93],62,78,77);
 if(id==='casino')return panes([16,w-66],77,50,84);
 return [{x:b.door.x-27,y:y+b.height-50,w:54,h:40}];
}
export function drawPublicBuilding(c,b,time=0){
 if(b?.design?.assetId&&Object.hasOwn(b,'footprint'))return drawSourceBuilding(c,b);
 if(drawSourceBuilding(c,b))return true;
 if(!silhouettes[b?.id])return false;const {x,y,width:w,height:h,id}=b,a=accents[id];
 poly(c,[[x+14,y+h],[x+w+39,y+h+18],[x+w+30,y-12],[x+w,y-32]],'#283b3222');side(c,b);
 rect(c,x,y,w,h,paper);rect(c,x,y,w,4,'#fffdf2');rect(c,x,y+4,4,h-7,'#ffffff99');rect(c,x+w-5,y+4,5,h-4,'#adb7ae');rect(c,x,y+h-5,w,5,ink);
 if(id==='railway'){
  slab(c,x-10,y-15,w+8,45,a);rect(c,x+w/2-46,y-91,92,76,ink);rect(c,x+w/2-42,y-87,84,69,paper);rect(c,x+w/2-38,y-83,76,5,a);label(c,'БЗИКЕР',x+w/2,y-23,13);
  const cx=x+w/2,cy=y-57;rect(c,cx-15,cy-16,30,31,ink);rect(c,cx-12,cy-13,24,25,'#e4e5d8');rect(c,cx-1,cy-10,2,11,ink);rect(c,cx-1,cy,9,2,ink);for(const [dx,dy]of[[0,-10],[9,0],[0,10],[-9,0]])rect(c,cx+dx,cy+dy,2,2,ink);
  rect(c,x+8,y+14,w-16,27,a);label(c,'ВОКЗАЛ БЗИКЕР',x+w/2,y+34,19);for(let dx=18;dx<w-42;dx+=62)glazing(c,x+dx,y+61,42,63);slab(c,x-14,y+h-64,w+7,18,'#c2d0c5');for(const dx of[10,w-8]){rect(c,x+dx,y+h-55,5,52,ink);rect(c,x+dx+1,y+h-53,2,48,'#bdc9be');}door(c,b,64);
 }else if(id==='clans'){
  slab(c,x-7,y-12,w-5,48);rect(c,x+14,y-77,61,109,ink);rect(c,x+18,y-73,53,101,a);rect(c,x+21,y-70,47,8,'#d8e0d4');for(let dy=-51;dy<22;dy+=25)glazing(c,x+29,y+dy,30,16);rect(c,x+81,y+16,w-99,24,a);label(c,'ДОМ КЛАНОВ',x+83+(w-103)/2,y+34,14);for(const dx of[25,w-68])glazing(c,x+dx,y+69,43,65);rect(c,x+18,y+142,4,38,ink);rect(c,x+22,y+143,32,21,'#b9a2a0');rect(c,x+w-49,y+142,4,38,ink);rect(c,x+w-45,y+143,30,21,'#a2b7c2');label(c,'ВСТРЕЧА / ИДЕИ / КОМАНДА',x+w/2,y+h-67,9);door(c,b,56);
 }else if(id==='arena'){
  for(let dx=0;dx<w;dx+=90){poly(c,[[x+dx,y],[x+dx+65,y-78],[x+Math.min(w,dx+90),y]],'#4d6269');poly(c,[[x+dx+65,y-78],[x+Math.min(w,dx+90),y-59],[x+Math.min(w,dx+90),y]],glass);rect(c,x+dx,y-2,Math.min(90,w-dx),6,ink);}
  rect(c,x+8,y+11,w-16,41,ink);label(c,'СВОЯ ИГРА',x+w/2,y+39,21,a);rect(c,x+22,y+71,w-44,63,'#414e51');label(c,'БЗИКЕР',x+w/2,y+114,35,paper);for(let i=0;i<6;i++)rect(c,x+23+i*(w-46)/6,y+143,24,15,i%2?a:'#d8ddd2');door(c,b,62);
 }else if(id==='profile'){
  rect(c,x-6,y-71,w+12,73,ink);glazing(c,x-2,y-67,w+4,63);for(let dx=38;dx<w;dx+=43)rect(c,x+dx,y-64,3,60,'#6f858a');rect(c,x+8,y+14,w-16,26,a);label(c,'СТУДИЯ ОБРАЗОВ',x+w/2,y+33,16);for(const dx of[15,w-80]){glazing(c,x+dx,y+57,65,92);rect(c,x+dx+22,y+79,22,13,paper);rect(c,x+dx+16,y+92,34,37,dx===15?'#b89b98':ink);rect(c,x+dx+31,y+129,3,16,ink);}label(c,'ФОРМА / ЦВЕТ / ХАРАКТЕР',x+w/2,y+h-66,8);door(c,b,48);
 }else if(id==='results'){
  slab(c,x-7,y-9,w-7,35);rect(c,x+60,y-78,w-100,70,'#6e8289');slab(c,x+56,y-78,w-105,23,a);rect(c,x+85,y-58,w-150,38,paper);rect(c,x+90,y-53,w-160,6,a);label(c,'АРХИВ ПОБЕД',x+w/2,y-33,11);rect(c,x+12,y+15,w-24,25,a);label(c,'ГАЛЕРЕЯ РЕЗУЛЬТАТОВ',x+w/2,y+33,13);for(const dx of[23,w-76]){glazing(c,x+dx,y+64,53,73);rect(c,x+dx+10,y+76,33,27,'#667f82');rect(c,x+dx+19,y+82,14,20,sand);rect(c,x+dx+13,y+107,28,4,paper);}door(c,b,56);
 }else if(id==='messages'){
  slab(c,x-7,y-8,w-8,50,'#c5b9a3');rect(c,x+8,y+12,w-16,25,a);label(c,'КАФЕ БЗИКЕР',x+w/2,y+31,17);for(const dx of[16,w-79])glazing(c,x+dx,y+58,63,68);rect(c,x-9,y+43,w+18,9,'#566d64');for(let dx=-5;dx<w+9;dx+=22)rect(c,x+dx,y+47,13,13,'#bac6b2');for(const dx of[4,w-8])rect(c,x+dx,y+52,5,h-54,'#65766c');label(c,'КОФЕ · ВСТРЕЧИ · ИДЕИ',x+w/2,y+136,9);door(c,b,48);
 }else if(id==='terrace'){
  poly(c,[[x-8,y],[x+17,y-51],[x+w+6,y-70],[x+w+9,y]],'#82918b');glazing(c,x+20,y-36,w-40,27);rect(c,x-8,y-3,w+17,7,ink);rect(c,x+12,y+14,w-24,26,a);label(c,'ТВОРЧЕСКАЯ ГОСТИНАЯ',x+w/2,y+33,13);for(const dx of[18,w-82])glazing(c,x+dx,y+63,64,82);for(let dx=22;dx<w-10;dx+=26)rect(c,x+dx,y+153,16,7,'#b9ae97');door(c,b,48);
 }else if(id==='shop-food'){
  slab(c,x-7,y-8,w-7,38);rect(c,x+65,y-72,w-130,64,ink);glazing(c,x+70,y-67,w-140,47);rect(c,x+77,y-60,w-154,6,a);rect(c,x+10,y+12,w-20,27,a);label(c,'ЛАВКА МАСКОТА',x+w/2,y+32,16);rect(c,x+5,y+47,w-10,14,'#899c81');for(let dx=5;dx<w-10;dx+=21)rect(c,x+dx,y+47,11,14,'#dde3d0');for(const dx of[15,w-77]){glazing(c,x+dx,y+74,62,61);for(let i=0;i<4;i++)rect(c,x+dx+8+i*12,y+113,9,13,i%2?sand:sage);}door(c,b,46);
 }else if(id==='shop-clothes'){
  poly(c,[[x-8,y],[x+65,y-77],[x+w+10,y-23],[x+w+10,y]],'#495b64');poly(c,[[x+65,y-77],[x+73,y-68],[x+w+8,y-16],[x+w+8,y-23]],'#abb8b9');rect(c,x-8,y-4,w+18,8,ink);rect(c,x+12,y+15,w-24,28,a);label(c,'ГАРДЕРОБ БЗИКЕР',x+w/2,y+35,18);for(const dx of[18,w-84]){glazing(c,x+dx,y+62,66,91);rect(c,x+dx+22,y+82,22,13,paper);rect(c,x+dx+14,y+94,38,37,dx===18?'#b6a4b9':'#7b8e93');rect(c,x+dx+31,y+132,3,17,ink);}door(c,b,48);
 }else if(id==='shop-furniture'){
  for(let dx=0;dx<w;dx+=145){poly(c,[[x+dx-5,y],[x+dx+68,y-72],[x+Math.min(w,dx+145)+4,y]],'#8c9390');poly(c,[[x+dx+68,y-72],[x+Math.min(w,dx+145)+4,y-48],[x+Math.min(w,dx+145)+4,y]],'#63777a');rect(c,x+dx+Math.min(120,w-dx-6),y-43,20,26,glass);}
  rect(c,x,y-3,w,8,ink);rect(c,x+9,y+16,w-18,29,a);label(c,'МЕБЕЛЬНАЯ МАСТЕРСКАЯ',x+w/2,y+36,14);for(const dx of[15,w-93])glazing(c,x+dx,y+62,78,77);rect(c,x+25,y+104,57,23,'#b7a693');rect(c,x+29,y+93,48,14,'#d8d5c5');rect(c,x+w-81,y+93,54,7,'#a39b87');rect(c,x+w-77,y+100,4,32,ink);rect(c,x+w-35,y+100,4,32,ink);door(c,b,48);
 }else if(id==='casino'){
  slab(c,x-8,y-10,w-4,49,'#4a5b5d');rect(c,x,y,w,h,'#35494b');rect(c,x+7,y+10,w-14,40,ink);label(c,'КАЗИНО БЗИКЕР',x+w/2,y+36,21,a);for(const dx of[16,w-66])glazing(c,x+dx,y+77,50,84);const px=b.door.x-47;rect(c,px,y+56,94,h-49,a);rect(c,px+8,y+63,78,h-56,ink);rect(c,px+12,y+67,70,h-60,'#455659');label(c,'♠ ♥ ♣ ♦',b.door.x,y+96,15,paper);rect(c,px-5,y+h+3,104,5,'#d5caaa');door(c,b,58);for(let dx=14;dx<w-7;dx+=24)rect(c,x+dx,y+55,5,3,a);
 }
 vents(c,b);return true;
}
const propShapes={shelter:{x:-90,y:-142,width:192,height:180},'event-board':{x:-33,y:-96,width:78,height:118},'parked-car':{x:-48,y:-45,width:108,height:83},landmark:{x:-38,y:-99,width:91,height:125},wayfinder:{x:-42,y:-77,width:96,height:94},'terrace-table':{x:-33,y:-31,width:78,height:68}};
export function architecturePropGeometry(p){const native=p?.design&&sourceEntityLayout(p);if(native)return {bounds:native.bounds,footprint:native.footprint,depth:native.depth};const s=propShapes[p?.kind];if(!s||!p.footprint)return null;return {bounds:{x:p.x+s.x,y:p.y+s.y,width:s.width,height:s.height},footprint:{...p.footprint},depth:p.footprint.y+p.footprint.height};}
function paintArchitectureProp(c,p){const {x,y,kind}=p,color=p.color||'#aab8aa';
 if(p.design?.assetId&&drawSourceBuilding(c,{id:p.id,x:p.footprint.x,y:p.footprint.y,width:p.footprint.width,height:p.footprint.height,design:p.design}))return;
 if(kind==='terrace-table'&&drawSourceStreet(c,'bench',x-60,y-20,{assetId:'bar-pivkovy-tuz-interior-pub-table'}))return;
 if(kind==='shelter'){rect(c,x-78,y+27,170,7,'#25342e22');rect(c,x-81,y-118,170,143,ink);rect(c,x-76,y-112,159,130,glass);for(const dx of[-74,-23,29,81])rect(c,x+dx,y-110,3,133,'#526d70');for(const dx of[-66,-14,38])poly(c,[[x+dx,y-106],[x+dx+7,y-106],[x+dx+39,y+10],[x+dx+32,y+10]],'#d9e4de65');slab(c,x-87,y-126,169,13,color);rect(c,x-68,y-22,94,8,'#b1b3a1');rect(c,x-64,y-14,5,35,ink);rect(c,x+14,y-14,5,35,ink);rect(c,x+47,y-87,29,54,paper);label(c,'БЗИКЕР',x+61,y-70,9);for(let i=0;i<4;i++)rect(c,x+52,y-58+i*7,19-i*2,2,'#788c83');label(c,p.label||'ОСТАНОВКА',x,y-130,10,paper,150);
 }else if(kind==='event-board'){rect(c,x-28,y-90,59,86,ink);rect(c,x-25,y-87,53,79,paper);rect(c,x-21,y-83,45,28,color);label(c,'БЗИКЕР',x+1,y-64,15);label(c,'СВОЯ ИГРА',x+1,y-44,8);for(let i=0;i<3;i++)rect(c,x-18,y-36+i*6,37-i*6,2,'#9eada1');for(const dx of[-24,25])rect(c,x+dx,y-5,4,19,ink);rect(c,x-29,y+12,60,3,'#aab7a9');
 }else if(kind==='parked-car'){rect(c,x-45,y+26,99,5,'#26332c22');rect(c,x-42,y-8,92,33,ink);rect(c,x-44,y-12,94,23,color);rect(c,x-35,y-31,66,21,color);rect(c,x-31,y-29,57,18,'#536d76');rect(c,x-29,y-27,23,13,'#a4bdc1');rect(c,x-3,y-27,26,13,'#8eacb4');rect(c,x-31,y-31,54,3,'#c5d0c8');rect(c,x-37,y+16,17,15,ink);rect(c,x+22,y+16,17,15,ink);rect(c,x-34,y+20,11,7,'#8a9791');rect(c,x+25,y+20,11,7,'#8a9791');rect(c,x-42,y-4,8,6,'#e5e3c9');rect(c,x+39,y-4,8,6,'#b9a09c');rect(c,x+3,y-7,20,2,'#e1e5d7');rect(c,x+18,y-3,5,2,ink);rect(c,x-40,y+10,85,3,'#85968e');
 }else if(kind==='landmark'){rect(c,x-29,y+4,66,19,ink);rect(c,x-26,y+4,60,5,paper);rect(c,x-20,y-12,47,15,'#a9b8ab');rect(c,x-26,y-75,15,64,ink);rect(c,x+12,y-91,15,80,ink);rect(c,x-12,y-57,26,15,sage);rect(c,x-12,y-27,26,15,sand);rect(c,x-24,y-73,4,58,'#798e87');rect(c,x+14,y-89,4,72,'#788f91');label(c,'БЗИКЕР',x+3,y+18,11,paper);rect(c,x-10,y-78,22,6,'#bccac2');
 }else if(kind==='wayfinder'){rect(c,x-3,y-62,6,73,ink);rect(c,x-38,y-69,80,27,ink);rect(c,x-35,y-66,74,20,paper);label(c,p.label||'БЗИКЕР →',x+2,y-52,9,ink,70);rect(c,x-7,y+5,17,7,'#aab9a8');rect(c,x-1,y-40,2,44,'#94a999');
 }else if(kind==='terrace-table'){for(const dx of[-23,24]){rect(c,x+dx,y+5,4,25,ink);rect(c,x+dx+1,y+5,1,23,'#99aaa0');}rect(c,x-29,y-23,64,31,paper);rect(c,x-28,y-22,62,2,'#fffdf2');rect(c,x-29,y+7,64,4,'#a7b3a6');rect(c,x-19,y-13,14,10,'#b8b8a7');rect(c,x-16,y-15,8,8,'#f8f6eb');rect(c,x-14,y-14,4,2,'#937e6e');rect(c,x+8,y-17,14,16,'#899e91');rect(c,x+10,y-15,10,12,paper);rect(c,x+12,y-12,6,1,'#85968e');}
}
export function createCityArchitectureObjects(map){return (map?.architecture?.props||[]).flatMap(p=>{const g=architecturePropGeometry(p);return g?[{...p,...g,draw(c){paintArchitectureProp(c,p);}}]:[];});}
function path(c,points,width,color){if(!Array.isArray(points)||points.length<2)return;c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.lineWidth=width;c.lineCap='butt';c.lineJoin='round';c.strokeStyle=color;c.stroke();}
function excludeGroundPath(c,map,points,width,roundCaps=true){
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],radius=width/2,n=Math.atan2(b[1]-a[1],b[0]-a[0])+Math.PI/2,dx=Math.cos(n)*radius,dy=Math.sin(n)*radius;
  c.beginPath();c.rect(0,0,map.width,map.height);c.moveTo(a[0]+dx,a[1]+dy);c.lineTo(b[0]+dx,b[1]+dy);
  if(roundCaps||i<points.length-1)c.arc(b[0],b[1],radius,n,n-Math.PI,true);else c.lineTo(b[0]-dx,b[1]-dy);
  c.lineTo(a[0]-dx,a[1]-dy);if(roundCaps||i>1)c.arc(a[0],a[1],radius,n+Math.PI,n,true);c.closePath();c.clip('evenodd');
 }
}
function excludeGroundRect(c,map,r){c.beginPath();c.rect(0,0,map.width,map.height);c.rect(r.x,r.y,r.width,r.height);c.clip('evenodd');}
export function drawCityArchitectureGround(c,map,tile){
 if(isModularCity(map))return;
 if(map?.design_source?.exact_scene)return;
 c.save();
 // Subtract the union of every carriageway capsule. Additional apartment
 // paths join the sidewalk without covering asphalt or a street junction.
 for(const r of (map.roads||[]).filter(r=>r.kind==='road'))for(let i=1;i<r.points.length;i++){
  const a=r.points[i-1],b=r.points[i],angle=Math.atan2(b[1]-a[1],b[0]-a[0]),radius=r.width/2+3,n=angle+Math.PI/2;
  c.beginPath();c.rect(0,0,map.width,map.height);c.moveTo(a[0]+Math.cos(n)*radius,a[1]+Math.sin(n)*radius);c.lineTo(b[0]+Math.cos(n)*radius,b[1]+Math.sin(n)*radius);c.arc(b[0],b[1],radius,n,n-Math.PI,true);c.lineTo(a[0]-Math.cos(n)*radius,a[1]-Math.sin(n)*radius);c.arc(a[0],a[1],radius,n+Math.PI,n,true);c.closePath();c.clip('evenodd');
 }
 const frontages=map?.architecture?.frontages||[];
 c.save();
 // A new entrance keeps its border on grass. Existing connected pedestrian
 // interiors own their surface, so no apartment curb crosses a sidewalk join.
 for(const r of map.roads||[])if(r.kind==='road')excludeGroundPath(c,map,r.points,r.width+48);else if(!r.id.startsWith('door-')&&!r.id.startsWith('access-'))excludeGroundPath(c,map,r.points,r.width);
 for(const f of frontages.filter(f=>!f.building_id.startsWith('apartment-'))){excludeGroundPath(c,map,f.path,f.width,false);const a=f.forecourt;excludeGroundRect(c,map,{x:a.x+3,y:a.y+3,width:a.width-6,height:a.height-6});}
 for(const r of [map.decor?.plaza,map.smoking].filter(Boolean))excludeGroundRect(c,map,r);
 for(const f of frontages.filter(f=>f.building_id.startsWith('apartment-')))path(c,f.path,f.width+6,'#909d93');
 c.restore();
 for(const f of frontages){
  // Public and clan approaches already share city-ground's continuous pavement.
  // Only apartment connections need the additional ground pass.
  if(f.building_id.startsWith('apartment-')){path(c,f.path,f.width,'#c9cec5');const a=f.forecourt;rect(c,a.x,a.y,a.width,a.height,'#c9cec5');for(let yy=a.y+16;yy<a.y+a.height;yy+=24)rect(c,a.x+3,yy,a.width-6,1,'#b7c0b6');}
  const p=f.parking;path(c,p.drive,32,'#b1bcb0');if(!drawSourceParking(c,p)){rect(c,p.x,p.y,p.width,p.height,'#aeb8b0');rect(c,p.x+3,p.y+3,p.width-6,p.height-6,'#727e7b');for(const bay of p.bays){rect(c,bay.x+3,bay.y+3,2,bay.height-6,'#dbe0d4');rect(c,bay.x+bay.width-5,bay.y+3,2,bay.height-6,'#dbe0d4');rect(c,bay.x+3,bay.y+3,bay.width-6,2,'#dbe0d4');}label(c,'P',p.x+p.width/2,p.y+p.height-9,13,'#dce2d5');}
  if(f.terrace){path(c,f.terrace_path,44,'#c9cec5');const t=f.terrace;rect(c,t.x,t.y,t.width,t.height,'#bbc7b3');for(let yy=t.y+15;yy<t.y+t.height;yy+=20)rect(c,t.x+4,yy,t.width-8,1,'#a5b5a0');}
 }
 c.restore();
}
