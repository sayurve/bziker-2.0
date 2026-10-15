import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as source from '../web/source-ui.js';
import {phoneAppsHTML,phoneAppGroups} from '../web/gameplay-ui.js';
import {accountFormHTML} from '../web/account-ui.js';

test('approved phone has twelve distinct real routes and inventory stays separate',()=>{
 const ids=phoneAppGroups.flatMap(g=>g.apps.map(a=>a[0]));
 assert.equal(ids.length,12);assert.equal(new Set(ids).size,12);
 assert.ok(ids.includes('character'));assert.ok(!ids.includes('inventory'));
 const html=phoneAppsHTML({name:'<Игрок>'});
 assert.match(html,/Персонаж/);assert.doesNotMatch(html,/data-tab="inventory"/);
 assert.match(html,/&lt;Игрок&gt;/);
});
test('control side restores only valid choices and can persist without storage access',()=>{
 assert.equal(source.normalizeControlLayout('right'),'right');assert.equal(source.normalizeControlLayout('invalid'),'left');
 const store={value:'right',getItem(key){assert.equal(key,'bziker.controlLayout');return this.value;},setItem(key,value){assert.equal(key,'bziker.controlLayout');this.value=value;}};
 assert.equal(source.readControlLayout(store),'right');source.saveControlLayout('left',store);assert.equal(store.value,'left');
 assert.equal(source.readControlLayout({getItem(){throw Error('blocked')}}),'left');assert.doesNotThrow(()=>source.saveControlLayout('right',{setItem(){throw Error('blocked')}}));
});
test('phone presence leaves HUD intact, hides controls, and chooses the actual character hands',()=>{
 const body={dataset:{},classList:{toggle(){}}};
 source.setSourcePhoneState(body,true,{gender:1});assert.equal(body.dataset.phoneOpen,'true');assert.equal(body.dataset.phoneHands,'female');
 source.setSourcePhoneState(body,false,{gender:0});assert.equal(body.dataset.phoneOpen,'false');assert.equal(body.dataset.phoneHands,'male');
 const hud=source.sourceHudHTML();assert.match(hud,/world-minimap/);assert.match(hud,/world-online-count/);assert.match(hud,/world-balance/);assert.doesNotMatch(hud,/\/100|1 250|Городской парк/);
 const controls=source.sourceControlsHTML();for(const s of ['world-stick','world-knob','world-enter','world-inventory','world-phone'])assert.match(controls,new RegExp(s));
 assert.doesNotMatch(controls,/<button[^>]*class="world-enter"[^>]*\bhidden\b/,'The three-button group must reserve a visible hand from the first render');
});
test('password reveal changes input type and accessibility state without changing bytes',()=>{
 const input={type:'password',value:' Secret ',focus(){this.focused=true;}};const attrs={},button={setAttribute(k,v){attrs[k]=v;}};
 source.togglePasswordVisibility(input,button);assert.equal(input.type,'text');assert.equal(input.value,' Secret ');assert.equal(attrs['aria-pressed'],'true');
 source.togglePasswordVisibility(input,button);assert.equal(input.type,'password');assert.equal(input.value,' Secret ');
 const html=accountFormHTML({mode:'register'});assert.match(html,/data-action="account-password"/);assert.match(html,/id="account-form"/);assert.match(html,/name="confirm_password"/);assert.doesNotMatch(html,/<input[^>]*name="(?:password|confirm_password)"[^>]*value=/);
});
test('source CSS hides only lower controls while phone is open and supports mirrored placement',async()=>{
 const css=await readFile(new URL('../web/source-ui.css',import.meta.url),'utf8');
 assert.match(css,/data-phone-open="true"[^}]*world-controls[^{]*\{[^}]*visibility:hidden/);
 assert.match(css,/data-control-layout="right"/);assert.match(css,/prefers-reduced-motion/);
});

test('native hand images survive the world stylesheet appended after source UI',async()=>{
 const [sourceCSS,worldCSS,indexHTML,worldJS]=await Promise.all(['source-ui.css','world.css','index.html','world.js'].map(name=>readFile(new URL(`../web/${name}`,import.meta.url),'utf8')));
 assert.match(indexHTML,/href="\/web\/source-ui\.css"/);
 assert.match(worldJS,/link\.href='\/web\/world\.css';document\.head\.append\(link\)/);
 // Resolve the actual background declarations in browser load order. The
 // legacy `background` shorthand resets background-image to none, even when
 // another file authored only background-color and the image separately.
 const classes=new Set(['world-shell','source-controls','world-enter']);
 const imageFor=state=>{
  let winner={weight:-1,order:-1,value:'none'},order=0;
  for(const css of [sourceCSS,worldCSS])for(const rule of css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)){
   for(const selectorText of rule[1].split(',')){
    const selector=selectorText.trim();
    if(selector.startsWith('@')||/[#\[>+~]/.test(selector)||selector.includes(':is(')||selector.includes(':not('))continue;
    if([...selector.matchAll(/\.([\w-]+)/g)].some(match=>!classes.has(match[1])))continue;
    if([...selector.matchAll(/:([\w-]+)/g)].some(match=>match[1]!==state))continue;
    const tags=selector.replace(/\.[\w-]+|:[\w-]+/g,'').trim();
    if(tags&&tags!=='button'&&tags!=='*')continue;
    const weight=[...selector.matchAll(/\.[\w-]+|:[\w-]+/g)].length*10+(tags==='button'?1:0);
    for(const declaration of rule[2].split(';')){
     const match=declaration.trim().match(/^(background|background-image)\s*:\s*(.+)$/);if(!match)continue;
     const value=match[2].match(/url\(([^)]+)\)/)?.[1]||'none',priority=weight+(match[2].includes('!important')?10000:0);order++;
     if(priority>winner.weight||priority===winner.weight&&order>winner.order)winner={weight:priority,order,value};
    }
   }
  }
  return winner.value;
 };
 for(const [state,asset] of [['normal','normal'],['disabled','disabled'],['active','pressed'],['focus-visible','selected']]){
  assert.ok(imageFor(state).includes(`design-ui-hand-${asset}.png`),`${state}: the dynamically loaded legacy stylesheet must retain the native hand image; resolved ${imageFor(state)}`);
 }
});
