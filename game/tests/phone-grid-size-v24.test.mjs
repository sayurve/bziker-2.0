import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../web/source-ui.css',import.meta.url),'utf8');
const allCSS=(readFileSync(new URL('../web/styles.css',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../web/construction.css',import.meta.url),'utf8')+'\n'+css).replace(/\/\*[\s\S]*?\*\//g,'');
function property(selectors,name){
 let result;
 for(const match of allCSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
  if(!match[1].split(',').some(selector=>selectors.includes(selector.trim())))continue;
  for(const declaration of match[2].split(';')){
   const [key,...value]=declaration.split(':');if(key.trim()===name)result=value.join(':').trim();
  }
 }
 return result;
}
function contentColumns(width){
 let columns=3;
 for(const match of css.matchAll(/@container\s+telebzi\s*\(max-width:\s*(\d+)px\)\s*\{/g)){
  let depth=1,end=match.index+match[0].length;
  for(;depth&&end<css.length;end++){if(css[end]==='{')depth++;else if(css[end]==='}')depth--;}
  const rule=css.slice(match.index+match[0].length,end-1).match(/#phone-content\s+\.phone-app-grid\s*\{([^}]+)\}/)?.[1];
  const count=rule?.match(/grid-template-columns:\s*repeat\((\d+),/);
  if(width<=Number(match[1])&&count)columns=Number(count[1]);
 }
 return columns;
}

test('casino reels fit three cells in the measured narrow phone screen',()=>{
 const cellWidth=(132.226-8)/3,declared=property(['.slot-reel','#phone-content .slot-reel'],'width');
 const renderedWidth=declared==='auto'?cellWidth:parseFloat(declared);
 assert.ok(renderedWidth<=cellWidth,`${renderedWidth}px reels overlap their ${cellWidth.toFixed(3)}px cells`);
});

test('phone text can wrap maximum-length names in paragraphs and destination controls',()=>{
 assert.equal(property(['#phone-content'],'overflow-wrap'),'anywhere','32-character names and 80-character room titles must wrap in paragraphs too');
 assert.equal(property(['#phone-content .travel-list'],'grid-template-columns'),'minmax(0,1fr)','a long destination must not widen its grid track');
 assert.equal(property(['#phone-content .travel-list button'],'min-width'),'0','destination controls must shrink within the native phone screen');
});

test('construction, account switch and card actions retain 44px touch targets',()=>{
 assert.ok(parseFloat(property(['button.house-swatch'],'width'))>=44,'color targets were only 32px wide');
 assert.ok(parseFloat(property(['#construction-dialog .dialog-heading .quiet'],'min-width'))>=44,'the close control must not shrink under a wrapped heading');
 assert.ok(parseFloat(property(['.source-form-switch .quiet'],'min-width'))>=44,'the short Войти label must still have a 44px target');
 assert.ok(parseFloat(property(['.card-actions button'],'min-height'))>=44,'card actions were only 42px tall');
});
// The portrait/landscape widths reproduce measurements from the live native
// phone. The 80px case covers a shorter landscape viewport. Their gap is 5px.
for(const [label,width] of [['320px portrait',132.226],['844×390 landscape',108.891],['small landscape',80],['expanded portrait',181]]){
 test(`${label} phone grid fits 44px controls without overlap`,()=>{
  const columns=contentColumns(width),available=(width-(columns-1)*5)/columns;
  assert.ok(available>=44,`${columns} columns leave only ${available.toFixed(3)}px per button in ${width}px`);
 });
}
