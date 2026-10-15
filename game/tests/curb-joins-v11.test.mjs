import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createCityGroundPlan,drawCityGround,drawMiniMapGround} from '../web/city-ground.js';
let createCanvas;
try{({createCanvas}=createRequire(import.meta.url)('@napi-rs/canvas'));}
catch{({createCanvas}=createRequire(process.execPath)('@napi-rs/canvas'));}
const map=JSON.parse(await readFile(new URL('../web/world-layout-v18.json',import.meta.url),'utf8'));
const rgb=color=>color.match(/\w\w/g).map(n=>parseInt(n,16));
function nativeGround(source,region,mini=false,scale=1){
 const plan=createCityGroundPlan(source),canvas=createCanvas(region.width*scale,region.height*scale),c=canvas.getContext('2d');
 c.scale(scale,scale);c.translate(-region.x,-region.y);
 if(mini)drawMiniMapGround(c,plan);else drawCityGround(c,plan,region);
 const pixels=c.getImageData(0,0,canvas.width,canvas.height).data;
 return {plan,at:(x,y)=>{const i=(Math.floor((y-region.y)*scale)*canvas.width+Math.floor((x-region.x)*scale))*4;return [...pixels.slice(i,i+3)];}};
}
function fixture(roads){return {...map,width:900,height:500,roads,buildings:[],district:{...map.district,buildings:[]},solids:[],decor:{...map.decor,plaza:{x:700,y:400,width:40,height:40},crosswalks:[]},smoking:{...map.smoking,x:750,y:300,width:40,height:40},lake:{...map.lake,x:2000,y:2000}};}
for(const mini of [false,true])test(`${mini?'overview':'city'} smoking platform has no path curb or diagonal paving seams through its interior`,()=>{
 const smoke=map.smoking,{plan,at}=nativeGround(map,{x:smoke.x-35,y:smoke.y-35,width:smoke.width+70,height:smoke.height+70},mini),expected=rgb(plan.materials.pavement);
 const paving=[expected,rgb('#aea690'),rgb('#a9a18d')];
 for(let y=smoke.y+8;y<smoke.y+smoke.height-8;y+=2)for(let x=smoke.x+8;x<smoke.x+smoke.width-8;x+=2)assert.ok(paving.some(color=>color.every((v,i)=>at(x,y)[i]===v)),`foreign road or curb inside platform at ${x},${y}: ${at(x,y)}`);
});
test('public paths join each other without leaving an interior curb at their shared mouth',()=>{
 const roads=[{id:'horizontal',kind:'walkway',width:44,points:[[70,160],[350,160]]},{id:'vertical',kind:'walkway',width:44,points:[[350,160],[350,300]]}],region={x:250,y:110,width:160,height:130};
 for(const ordered of [roads,[...roads].reverse()])for(const mini of [false,true]){
  const {plan,at}=nativeGround(fixture(ordered),region,mini),curb=rgb(plan.materials.curb);
  for(let x=321;x<=369;x++)for(let y=141;y<=190;y++){const horizontal=Math.hypot(Math.max(x-350,0),y-160),vertical=Math.hypot(x-350,Math.max(160-y,0));if(Math.min(horizontal,vertical)<19)assert.notDeepEqual(at(x,y),curb,`interior curb at shared path mouth ${x},${y}`);}
 }
});
test('a walkway mouth cannot paint its cap curb over the adjoining street sidewalk',()=>{
 const roads=[{id:'street',kind:'road',width:110,points:[[100,20],[100,400]]},{id:'entry',kind:'walkway',width:44,points:[[190,160],[360,160]]}],region={x:135,y:100,width:150,height:130};
 for(const ordered of [roads,[...roads].reverse()])for(const mini of [false,true]){
  const {plan,at}=nativeGround(fixture(ordered),region,mini);
  assert.ok([plan.materials.pavement,'#aea690','#a9a18d'].some(color=>rgb(color).every((v,i)=>at(165,160)[i]===v)),'walkway cap must preserve stone paving across the sidewalk');
 }
});

test('every current sidewalk, public path, 19 approach and paved square has a curb-free walking interior in both renders',()=>{
 const plan=createCityGroundPlan(map),points=[];
 const addPath=(path,width,street=false)=>{
  for(let k=1;k<path.length;k++){
   const a=path[k-1],b=path[k],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length)continue;
   const tx=(b[0]-a[0])/length,ty=(b[1]-a[1])/length;
   const across=street?[-width/2-17,-width/2-9,width/2+9,width/2+17]:[-width/2+8,0,width/2-8];
   for(let d=8;d<length-8;d+=8)for(const n of across)points.push([Math.round(a[0]+tx*d-ty*n),Math.round(a[1]+ty*d+tx*n)]);
  }
 };
 for(const road of plan.roads.filter(r=>r.kind==='road'||(!r.id.startsWith('door-')&&!r.id.startsWith('access-'))))addPath(road.points,road.width,road.kind==='road');
 for(const a of plan.approaches){addPath(a.path,a.width);const f=a.forecourt;for(let y=f.y+8;y<f.y+f.height-8;y+=8)for(let x=f.x+8;x<f.x+f.width-8;x+=8)points.push([x,y]);}
 for(const f of [plan.plaza,plan.smoking])for(let y=f.y+8;y<f.y+f.height-8;y+=8)for(let x=f.x+8;x<f.x+f.width-8;x+=8)points.push([x,y]);
 assert.equal(plan.approaches.length,19);assert.ok(points.length>20000,'cover the whole network rather than one junction');
 for(const mini of [false,true])for(const scale of [1,.5]){
  const tiles=new Map(),curb=rgb(plan.materials.curb);
  for(const [x,y] of points){
   const tx=Math.floor(x/1024)*1024,ty=Math.floor(y/1024)*1024,key=`${tx}:${ty}`;
   if(!tiles.has(key))tiles.set(key,nativeGround(map,{x:tx,y:ty,width:1024,height:1024},mini,scale));
   assert.notDeepEqual(tiles.get(key).at(x,y),curb,`${mini?'overview':'city'} has an interior curb at ${x},${y}`);
  }
 }
});
