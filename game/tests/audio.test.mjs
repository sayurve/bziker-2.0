import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameAudio,soundTracks,notificationDelta} from '../web/audio.js';

test('animals and boats have distinct original audible chip cues',()=>{
 for(const name of ['dog-bark','cat-meow','boat-board','boat-exit','boat-row']){
  assert.ok(soundTracks[name]?.length>0,name);
  assert.ok(soundTracks[name].every(note=>note.duration>0&&note.volume>0&&note.duration<1));
 }
 assert.notDeepEqual(soundTracks['dog-bark'],soundTracks['cat-meow']);
});

function fakeAudio(){
 const calls=[],nodes=[];
 const param=()=>({setValueAtTime(...args){calls.push(['value',...args]);},linearRampToValueAtTime(...args){calls.push(['linear',...args]);},exponentialRampToValueAtTime(...args){calls.push(['exp',...args]);}});
 const node=()=>{const n={connect(){},disconnect(){n.disconnected=true;},start(at){calls.push(['start',at]);},stop(at){calls.push(['stop',at]);},frequency:param(),gain:param(),onended:null};nodes.push(n);return n;};
 const context={state:'running',currentTime:1,sampleRate:44100,destination:{},createOscillator:node,createGain:node,createBufferSource:node,createBuffer(_channels,size){return {getChannelData:()=>new Float32Array(size)};},resume:async()=>{},suspend:async()=>{calls.push(['suspend']);},close:async()=>{calls.push(['close']);}};
 let created=0;return {context,calls,nodes,create:()=>{created++;return context;},created:()=>created};
}
test('sound tracks are bounded distinct original retro event effects',()=>{
 for(const name of ['click','select','notify','pay','door-open','door-close','phone-open','phone-close','step','sit','stand','action','success','error','takeoff']){
  assert.ok(soundTracks[name]?.length,name);
  for(const note of soundTracks[name]){assert.ok(note.at>=0&&note.duration>0&&note.at+note.duration<1.6);assert.ok(note.volume>0&&note.volume<=.08);assert.ok(['square','triangle','noise'].includes(note.wave));}
 }
 assert.notDeepEqual(soundTracks.pay,soundTracks.notify);
 assert.notDeepEqual(soundTracks['door-open'],soundTracks['door-close']);
});
test('mute and hidden state never initialize or queue audio',()=>{
 const fake=fakeAudio();let enabled=false,hidden=false;
 const game=createGameAudio({contextFactory:fake.create,isEnabled:()=>enabled,isHidden:()=>hidden});
 assert.equal(game.play('pay'),false);assert.equal(fake.created(),0);
 enabled=true;hidden=true;assert.equal(game.play('notify'),false);assert.equal(fake.created(),0);
 hidden=false;assert.equal(game.play('pay'),true);assert.equal(fake.created(),1);
 enabled=false;game.stop();assert.ok(fake.calls.filter(c=>c[0]==='stop').length>=soundTracks.pay.length);
});
test('effects use saved volume and release ended nodes; steps are throttled',()=>{
 const fake=fakeAudio();let clock=1000;
 const game=createGameAudio({contextFactory:fake.create,isEnabled:()=>true,isHidden:()=>false,volume:()=>.4,now:()=>clock});
 assert.equal(game.play('step'),true);assert.equal(game.play('step'),false);
 clock+=250;assert.equal(game.play('step'),true);
 assert.ok(fake.calls.some(c=>c[0]==='value'&&c[1]<=.032&&c[1]>0));
 fake.nodes.filter(n=>n.onended).forEach(n=>n.onended());
 assert.ok(fake.nodes.every(n=>n.disconnected));
 assert.equal(game.activeCount(),0);
});
test('walking schedules only a soft low foot contact, without noise percussion',()=>{
 const fake=fakeAudio();let buffers=0;
 fake.context.createBufferSource=()=>{buffers++;throw Error('Walking must not schedule noise');};
 const game=createGameAudio({contextFactory:fake.create,volume:()=>1});
 assert.equal(game.play('step'),true);
 assert.equal(buffers,0);
 const sources=fake.nodes.filter(n=>n.onended);
 assert.equal(sources.length,1);
 assert.equal(sources[0].type,'triangle');
 assert.ok(fake.calls.some(c=>c[0]==='value'&&c[1]===95));
 assert.ok(fake.calls.some(c=>c[0]==='exp'&&c[1]===65));
 sources[0].onended();assert.equal(game.activeCount(),0);
});
test('missing AudioContext is a silent non-blocking fallback',()=>{
 const game=createGameAudio({contextFactory:()=>null,isEnabled:()=>true,isHidden:()=>false});
 assert.equal(game.play('click'),false);assert.doesNotThrow(()=>game.stop());
});
test('zero volume is fully silent and repeated actions keep at most four live effects',()=>{
 const fake=fakeAudio();let level=0;
 const game=createGameAudio({contextFactory:fake.create,isEnabled:()=>true,isHidden:()=>false,volume:()=>level});
 assert.equal(game.play('pay'),false);assert.equal(fake.created(),0);
 level=.5;for(let i=0;i<10;i++)game.play('success');
 assert.equal(game.activeCount(),4);game.stop();assert.equal(game.activeCount(),0);
});
test('notification polling only sounds for new unread data and resets baseline per account',()=>{
 const a={unread:2,notifications:[{id:'a',state:'pending'}]};
 assert.equal(notificationDelta(null,a),false);
 assert.equal(notificationDelta(a,structuredClone(a)),false);
 assert.equal(notificationDelta(a,{unread:3,notifications:a.notifications}),true);
 assert.equal(notificationDelta(a,{unread:2,notifications:[{id:'b',state:'pending'}]}),true);
 assert.equal(notificationDelta(a,{unread:0,notifications:[]}),false);
});

test('failed node allocation after a suspended context resumes releases partial effects',async()=>{
 const fake=fakeAudio();fake.context.state='suspended';
 fake.context.resume=async()=>{fake.context.state='running';};
 const create=fake.context.createOscillator;let count=0;
 fake.context.createOscillator=()=>{if(++count===2)throw Error('Audio allocation failed');return create();};
 const game=createGameAudio({contextFactory:fake.create,isEnabled:()=>true,isHidden:()=>false});
 assert.equal(game.play('success'),false);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(game.activeCount(),0,'Optional audio failure must not leave a partially scheduled live effect');
 assert.ok(fake.nodes.every(node=>node.disconnected),'Every allocated node must disconnect after allocation failure');
});

test('stopping before context resume cancels every queued cue',async()=>{
 const fake=fakeAudio();let resume;
 fake.context.state='suspended';
 fake.context.resume=()=>new Promise(resolve=>{resume=()=>{fake.context.state='running';resolve();};});
 const game=createGameAudio({contextFactory:fake.create,isEnabled:()=>true,isHidden:()=>false});
 game.play('pay');game.stop();resume();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(game.activeCount(),0);assert.equal(fake.nodes.length,0);
});

test('hiding during context resume does not schedule an old cue',async()=>{
 const fake=fakeAudio();let resume,hidden=false;
 fake.context.state='suspended';
 fake.context.resume=()=>new Promise(resolve=>{resume=()=>{fake.context.state='running';resolve();};});
 const game=createGameAudio({contextFactory:fake.create,isEnabled:()=>true,isHidden:()=>hidden});
 game.play('notify');hidden=true;resume();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(fake.nodes.length,0);
});

test('a synchronous allocation failure disconnects the gain created before it',()=>{
 const fake=fakeAudio();fake.context.createOscillator=()=>{throw Error('Allocation failed');};
 const game=createGameAudio({contextFactory:fake.create,isEnabled:()=>true,isHidden:()=>false});
 assert.equal(game.play('click'),false);assert.equal(game.activeCount(),0);
 assert.equal(fake.nodes.length,1);assert.equal(fake.nodes[0].disconnected,true);
});
