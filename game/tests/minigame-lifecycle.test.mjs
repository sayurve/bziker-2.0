import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from './helpers/minigame-runtime.mjs';

test('changing stake after an unknown spin response recovers its original request first',async()=>{
 const pending={stake:7,request_id:'unknown-response'};
 const rt=runtime(path=>{
  if(path==='/api/casino/slots')return {stake:7,reels:['cherry','lemon','bell'],payout:0,net:-7,balance:20};
  if(path==='/api/economy')return {balance:20,catalog:[],inventory:[]};
  throw Error(`Unexpected ${path}`);
 },{'bziker:slot-request:account1':JSON.stringify(pending)});
 await rt.run("handleCityForm({id:'slots-form'},{stake:'10'})");
 const spins=rt.calls.filter(call=>call.path==='/api/casino/slots');
 assert.deepEqual(spins[0].body,pending,'A changed input must not discard an unresolved spin nonce');
 assert.equal(spins.length,1,'Recovery must display the previous outcome before starting a separate spin');
});

function sendingRuntime(){
 let resolve;
 const rt=runtime(path=>path.startsWith('/api/messages/')?new Promise(done=>{resolve=done;}):{restricted:false,scene:'city'});
 rt.context.FormData=class {constructor(form){this.entries=[['text',form.text]];}[Symbol.iterator](){return this.entries[Symbol.iterator]();}};
 rt.run("screen='cards';phone.open=true;phoneTab='conversation';phoneRevision=1;activePeer='peer1';messageUpdates=0;updateMessages=()=>{messageUpdates++;};");
 rt.nodes.set('#message-form textarea',{value:'Sent message'});
 const submit=rt.documentListeners.get('submit').at(-1);
 submit({target:{id:'message-form',text:'Sent message'},preventDefault(){}});
 return {rt,resolve:reply=>resolve(reply),async finish(){await new Promise(done=>setImmediate(done));}};
}

test('a successful send preserves text typed while its response was pending',async()=>{
 const send=sendingRuntime(),field=send.rt.nodes.get('#message-form textarea');
 field.value='Next message draft';
 send.rt.storage.set('bziker:message:account1:peer1',field.value);
 send.resolve({peer:{id:'peer1',name:'Peer'},messages:[]});await send.finish();
 assert.equal(field.value,'Next message draft','The response may clear only the text that was submitted');
 assert.equal(send.rt.storage.get('bziker:message:account1:peer1'),'Next message draft');
});

test('a late send response does not update a reopened conversation',async()=>{
 const send=sendingRuntime();
 send.rt.run('closePhone(true);phone.open=true;phoneRevision++;phoneTab="conversation";');
 send.rt.nodes.set('#message-form textarea',{value:'Reopened draft'});
 send.resolve({peer:{id:'peer1',name:'Peer'},messages:[]});await send.finish();
 assert.equal(send.rt.run('messageUpdates'),0,'Only the conversation revision that submitted may accept this response');
 assert.equal(send.rt.nodes.get('#message-form textarea').value,'Reopened draft');
});

test('an older economy read cannot overwrite a completed purchase',async()=>{
 let resolveOld,reads=0;
 const rt=runtime(path=>{
  if(path==='/api/economy')return ++reads===1?new Promise(resolve=>{resolveOld=resolve;}):{balance:5,catalog:[],inventory:[]};
  if(path==='/api/shop/buy')return {balance:5,catalog:[],inventory:[]};
  throw Error(`Unexpected ${path}`);
 });
 rt.run("phone.open=true;phoneRevision=1;phoneTab='shop-food';screen='home';");
 const old=rt.run("renderFeaturePhone('shop-food',1,true)");
 await rt.run("perform(()=>handleCityAction({dataset:{action:'shop-buy',item:'coffee'}}))");
 assert.equal(rt.run('economySnapshot.balance'),5);
 resolveOld({balance:20,catalog:[],inventory:[]});await old;
 assert.equal(rt.run('economySnapshot.balance'),5,'A pre-purchase read must not restore the old wallet balance');
});

test('a stale home notification denial cannot replace a newer screen',async()=>{
 let resolveOld;
 const rt=runtime(()=>new Promise(resolve=>{resolveOld=resolve;}));
 rt.run("screen='home';");const old=rt.run('poll()');
 await rt.run("perform(async()=>{screen='profile';app.innerHTML='New screen';})");
 resolveOld({status:403,data:{error:{code:'jury_restricted',message:'Old denial'}}});await old;
 assert.equal(rt.context.homeCalls,0,'Mutation epoch must guard failed polls as well as successful polls');
 assert.equal(rt.run('screen'),'profile');
});

test('hidden and busy polling does not start phone or card requests',async()=>{
 const rt=runtime(()=>{throw Error('No request should start');});
 rt.run("phone.open=true;phoneTab='fishing';screen='cards';cardSnapshot={id:'room'};document.hidden=true;");
 await rt.run('poll()');await rt.run('pollPhone()');
 rt.run('document.hidden=false;pollBusy=true;phonePollBusy=true;');
 await rt.run('poll()');await rt.run('pollPhone()');
 assert.equal(rt.calls.length,0);
});

test('hiding during a phone poll prevents follow-up fishing and economy queries',async()=>{
 let resolvePhone;
 const rt=runtime(path=>path==='/api/phone'?new Promise(resolve=>{resolvePhone=resolve;}):path==='/api/fishing'?{active:null}:{balance:20,catalog:[],inventory:[]});
 rt.run("phone.open=true;phoneTab='fishing';phoneRevision=1;worldSnapshot={restricted:false};");
 const poll=rt.run('pollPhone()');rt.context.document.hidden=true;
 resolvePhone({restricted:false,notifications:[],conversations:[],unread:0});await poll;
 assert.deepEqual(rt.calls.map(call=>call.path),['/api/phone'],'A hidden phone must not continue its polling request chain');
});

test('hiding during the fishing read prevents a following economy request',async()=>{
 let resolveFishing;
 const rt=runtime(path=>path==='/api/phone'?{restricted:false,notifications:[],conversations:[],unread:0}:path==='/api/fishing'?new Promise(resolve=>{resolveFishing=resolve;}):{balance:20,catalog:[],inventory:[]});
 rt.run("phone.open=true;phoneTab='fishing';phoneRevision=1;worldSnapshot={restricted:false};");
 const poll=rt.run('pollPhone()');
 await new Promise(done=>setImmediate(done));rt.context.document.hidden=true;
 resolveFishing({active:null});await poll;
 assert.deepEqual(rt.calls.map(call=>call.path),['/api/phone','/api/fishing']);
});
