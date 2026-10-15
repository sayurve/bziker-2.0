import{readFileSync}from'node:fs';import test from'node:test';import assert from'node:assert/strict';import{runtime}from'./helpers/minigame-runtime.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
function readyRuntime(responder=()=>({})){const rt=runtime(responder),attributes=new Map(),events=[];rt.nodes.get('#app').setAttribute=(name,value)=>{attributes.set(name,String(value));events.push([name,String(value)])};return{...rt,attributes,busy:()=>attributes.get('aria-busy'),attributeEvents:events};}
test('actual phone buttons remain aria-busy until awaited setPhone finishes and the next app can open',async()=>{
 const pose=deferred(),entered=deferred(),rt=readyRuntime(path=>path==='/api/bootstrap'?{profile:{id:'account1',name:'Viewer',avatar:{}},csrf_token:'test-csrf',lobbies:[]}:{scene:'city',restricted:false});
 rt.context.phonePose=pose.promise;rt.context.entered=entered.resolve;rt.run("worldView={setPhone:()=>{entered();return phonePose;}};pollPhone=async()=>{};");
 const task=rt.run("perform(()=>openPhone('apps'))");await entered.promise;
 assert.match(rt.nodes.get('#phone-content').innerHTML,/data-action="phone-tab"/,'actual rendered apps precede the delayed world pose');assert.equal(rt.busy(),'true');assert.equal(rt.run('mutationBusy'),true);
 pose.resolve();await task;assert.equal(rt.busy(),'false');assert.equal(rt.run('mutationBusy'),false);
 await rt.run("perform(()=>openPhone('map'))");assert.equal(rt.run('phoneTab'),'map');assert.equal(rt.busy(),'false');
});
test('a rejected action reports the existing error and always clears async readiness',async()=>{
 const work=deferred(),rt=readyRuntime();rt.context.work=work.promise;const task=rt.run('perform(()=>work)');assert.equal(rt.busy(),'true');work.reject(Error('failed request'));await task;assert.equal(rt.busy(),'false');assert.equal(rt.run('mutationBusy'),false);assert.equal(rt.nodes.get('#notice').textContent,'failed request');assert.ok(rt.sounds.includes('error'));
});
test('the existing mutation reentrancy guard rejects a second action without clearing the active busy cue',async()=>{
 const work=deferred(),rt=readyRuntime();rt.context.work=work.promise;rt.context.runs=0;const task=rt.run('perform(()=>work)');await rt.run('perform(()=>{runs++;})');assert.equal(rt.context.runs,0);assert.equal(rt.busy(),'true');assert.equal(rt.attributeEvents.filter(([,v])=>v==='false').length,0);work.resolve();await task;assert.equal(rt.busy(),'false');
});
test('world-control loss keeps the existing early return and still clears aria-busy',async()=>{
 const rt=readyRuntime();rt.context.routes=0;rt.run("routeToArena=async()=>{routes++;};pendingArena='room1';");await rt.run('perform(async()=>{worldControlLost=true;})');assert.equal(rt.busy(),'false');assert.equal(rt.run('mutationBusy'),false);assert.equal(rt.context.routes,0);
});
test('readiness covers awaited routing cleanup and overlapping accepted perform calls',async()=>{
 const route=deferred(),entered=deferred(),rt=readyRuntime();rt.context.route=route.promise;rt.context.entered=entered.resolve;rt.run("pendingArena='room1';routeToArena=async()=>{pendingArena=null;entered();await route;};");const first=rt.run('perform(async()=>{})');await entered.promise;assert.equal(rt.run('mutationBusy'),false,'existing routing-stage guard timing remains unchanged');assert.equal(rt.busy(),'true');await rt.run('perform(async()=>{})');assert.equal(rt.busy(),'true','the second completion cannot advertise readiness while the first cleanup is pending');route.resolve();await first;assert.equal(rt.busy(),'false');
});
test('a routing failure retains its rejection semantics but cannot strand the busy cue',async()=>{
 const rt=readyRuntime();rt.run("pendingCard='table1';routeToCards=async()=>{throw Error('routing failed');};");await assert.rejects(rt.run('perform(async()=>{})'),/routing failed/);assert.equal(rt.busy(),'false');assert.equal(rt.run('mutationBusy'),false);
});

test('the existing app container declares idle readiness before the first action',()=>{
 const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replace(/\ninit\(\);\s*$/,'\n');
 const observed=`document.querySelector('#app').setAttribute=function(k,v){this.attributes??={};this.attributes[k]=String(v);};\n`+source;
 const rt=runtime(()=>({}),{},observed);assert.equal(rt.nodes.get('#app').attributes?.['aria-busy'],'false');
});
