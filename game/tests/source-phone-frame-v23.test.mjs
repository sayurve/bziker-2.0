import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(process.execPath);
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const css=readFileSync(new URL('../web/source-ui.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const screenRule=css.match(/#phone-dialog \.phone-screen\{([^}]+)\}/)[1];
const outlineRule=css.match(/#phone-dialog::after\{([^}]+)\}/)?.[1];
const property=(rule,name)=>rule.match(new RegExp(`(?:^|;)${name}:([^;]+)`))[1].trim();
function roundedPath(c,width,height,rule){
 const fraction=name=>parseFloat(property(rule,name))/100;
 const x=width*fraction('left'),y=height*fraction('top');
 const w=width*(1-fraction('left')-fraction('right')),h=height*(1-fraction('top')-fraction('bottom'));
 const [horizontal,vertical=horizontal]=property(rule,'border-radius').split('/').map(v=>v.trim());
 const radius=(value,size)=>Math.min(size/2,parseFloat(value)*(value.endsWith('%')?size/100:1));
 const rx=radius(horizontal,w),ry=radius(vertical,h);
 c.beginPath();c.moveTo(x+rx,y);c.lineTo(x+w-rx,y);c.quadraticCurveTo(x+w,y,x+w,y+ry);
 c.lineTo(x+w,y+h-ry);c.quadraticCurveTo(x+w,y+h,x+w-rx,y+h);c.lineTo(x+rx,y+h);
 c.quadraticCurveTo(x,y+h,x,y+h-ry);c.lineTo(x,y+ry);c.quadraticCurveTo(x,y,x+rx,y);
 c.closePath();
}
function liveScreen(c,width,height){
 roundedPath(c,width,height,screenRule);c.fillStyle='#fff';c.fill();
 if(outlineRule){roundedPath(c,width,height,outlineRule);c.lineWidth=parseFloat(property(outlineRule,'border'));c.strokeStyle='#111';c.stroke();}
}
const edges={top:[300,37,680,41],bottom:[300,906,680,910],left:[246,150,250,550],right:[724,150,728,550]};
function darkPixels(c,width,height,rect){
 const sx=width/971,sy=height/1200,[l,t,r,b]=rect;
 const x=Math.floor(l*sx),y=Math.floor(t*sy),w=Math.ceil(r*sx)-x,h=Math.ceil(b*sy)-y;
 const data=c.getImageData(x,y,w,h).data;let count=0;
 for(let n=0;n<data.length;n+=4)if(data[n+3]>127&&Math.max(data[n],data[n+1],data[n+2])<100)count++;
 return count;
}
for(const gender of ['male','female'])for(const viewport of [320,390])for(const expanded of [false,true]){
 test(`live phone content preserves all four supplied frame lines at ${viewport}px, ${gender} hands, ${expanded?'expanded':'compact'}`,async()=>{
  const image=await loadImage(fileURLToPath(new URL(`../assets/design-ui-hands-${gender}.png`,import.meta.url)));
  const width=Math.round(expanded?Math.min(500,viewport*1.24):Math.min(360,viewport)),height=Math.round(width*1200/971),canvas=createCanvas(width,height),c=canvas.getContext('2d');
  c.imageSmoothingEnabled=false;c.drawImage(image,0,0,width,height);
  const before=Object.fromEntries(Object.entries(edges).map(([name,rect])=>[name,darkPixels(c,width,height,rect)]));
  liveScreen(c,width,height);
  for(const [name,rect]of Object.entries(edges)){
   const count=darkPixels(c,width,height,rect);
   assert.ok(count>0,`${name} frame disappeared when the source image was reduced`);
   assert.ok(count>=before[name]*.98,`${name} frame was painted over by live HTML content`);
  }
 });
}
test('the phone Home control is an accessible square glyph with no visible menu label',()=>{
 const button=html.match(/<button[^>]*id="phone-back"[^>]*>(.*?)<\/button>/s);
 assert.ok(button);assert.match(button[0],/aria-label="[^"]+"/);
 assert.match(button[1],/<svg/);assert.match(button[1],/<rect/);
 assert.doesNotMatch(button[1],/Меню|Назад|Home/);
});
