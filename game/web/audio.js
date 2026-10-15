// Original short chip-style cues; no game recordings or payment-brand samples.
const tone=(wave,hz,at,duration,volume=.035,end=hz)=>Object.freeze({wave,hz,end,at,duration,volume});
export const soundTracks=Object.freeze(Object.fromEntries(Object.entries({
 click:[tone('square',720,0,.025,.015,620)],
 select:[tone('square',660,0,.04,.025),tone('square',880,.045,.045,.02)],
 'phone-open':[tone('square',440,0,.04),tone('triangle',660,.05,.065)],
 'phone-close':[tone('triangle',660,0,.035),tone('square',440,.045,.045,.025)],
 'door-open':[tone('noise',180,0,.065,.02,360),tone('triangle',220,.045,.1,.035,440)],
 'door-close':[tone('triangle',330,0,.065,.035,165),tone('noise',140,.06,.035,.02)],
 // Preserve the low foot contact; the raw noise layer produced a sharp crack.
 step:[tone('triangle',95,0,.03,.02,65)],
 sit:[tone('triangle',330,0,.07,.025,220)],
 stand:[tone('triangle',220,0,.07,.025,330)],
 action:[tone('square',392,0,.045,.025),tone('triangle',523,.045,.08,.025)],
 smoke:[tone('triangle',120,0,.08,.009,80)],
 eat:[tone('triangle',260,0,.09,.018,170)],
 drink:[tone('triangle',340,0,.07,.018,260),tone('triangle',220,.08,.08,.016,150)],
 'pick-litter':[tone('triangle',180,0,.08,.016,270)],
 'throw-litter':[tone('triangle',210,0,.1,.018,90)],
 success:[tone('square',523,0,.06),tone('square',659,.07,.06),tone('triangle',784,.14,.16)],
 pay:[tone('triangle',1046.5,0,.075,.045),tone('square',1568,.075,.09,.025),tone('triangle',1568,.075,.23,.035)],
 notify:[tone('square',880,0,.07,.025),tone('square',1174.7,.12,.09,.025)],
 error:[tone('square',220,0,.065,.025),tone('square',165,.08,.09,.025)],
 takeoff:[tone('triangle',220,0,.32,.045,880),tone('square',440,.12,.38,.02,1760),tone('noise',300,.25,.2,.013,1200)],
 'dog-bark':[tone('square',190,0,.075,.032,100),tone('noise',160,0,.05,.016),tone('square',220,.13,.095,.03,110)],
 'cat-meow':[tone('triangle',530,0,.1,.04,840),tone('square',840,.08,.065,.012,610),tone('triangle',740,.12,.28,.035,360)],
 'boat-board':[tone('triangle',196,0,.06,.026,392),tone('noise',130,.05,.07,.014)],
 'boat-exit':[tone('triangle',392,0,.07,.026,196),tone('noise',110,.06,.055,.012)],
 'boat-row':[tone('noise',90,0,.07,.012),tone('triangle',110,.02,.075,.013,75)],
}).map(([name,notes])=>[name,Object.freeze(notes)])));

export function notificationDelta(previous,next){
 if(!previous||!next)return false;
 if(Number(next.unread||0)>Number(previous.unread||0))return true;
 const old=new Set((previous.notifications||[]).filter(n=>n.state==='pending').map(n=>n.id));
 return (next.notifications||[]).some(n=>n.state==='pending'&&!old.has(n.id));
}

export function createGameAudio({contextFactory=()=>{const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;return Audio?new Audio():null;},isEnabled=()=>true,isHidden=()=>globalThis.document?.hidden===true,volume=()=>.65,now=()=>Date.now()}={}){
 let context=null,generation=0;const active=new Set(),last=new Map();
 const allowed=()=>isEnabled()&&!isHidden()&&Number(volume())>0;
 function getContext(){if(!allowed())return null;try{return context??=contextFactory();}catch{return null;}}
 function unlock(){const c=getContext();if(!c)return;try{if(c.state==='suspended')c.resume().catch(()=>{});}catch{/* Audio is optional. */}}
 function release(effect){if(!active.delete(effect))return;for(const node of effect.nodes)try{node.disconnect();}catch{}}
 function halt(effect){for(const source of effect.sources)try{source.stop();}catch{}release(effect);}
 function stop(){generation++;for(const effect of [...active])halt(effect);last.clear();}
 function schedule(name,c){
  if(!allowed()||c.state==='closed')return false;
  const limit=name==='step'?220:name==='boat-row'?650:name==='click'?55:name==='notify'?500:0,time=now();
  if(limit&&last.has(name)&&time-last.get(name)<limit)return false;
  last.set(name,time);if(active.size>=4)halt(active.values().next().value);
  const effect={nodes:[],sources:[],remaining:soundTracks[name].length};active.add(effect);
  const level=Math.max(0,Math.min(1,Number(volume())||0));
  try{for(const note of soundTracks[name]){
   const gain=c.createGain();effect.nodes.push(gain);
   const source=note.wave==='noise'?c.createBufferSource():c.createOscillator();
   effect.nodes.push(source);effect.sources.push(source);
   const start=c.currentTime+.004+note.at,end=start+note.duration;
   if(note.wave==='noise'){
    const size=Math.ceil(c.sampleRate*note.duration),buffer=c.createBuffer(1,size,c.sampleRate),data=buffer.getChannelData(0);let seed=9271,held=0;
    // Hold each deterministic noise sample for a few ticks: restrained digital percussion.
    for(let i=0;i<size;i++){if(i%6===0){seed=(seed*16807)%2147483647;held=(seed/2147483647)*2-1;}data[i]=held*.55;}
    source.buffer=buffer;
   }else{source.type=note.wave;source.frequency.setValueAtTime(note.hz,start);if(note.end!==note.hz)source.frequency.exponentialRampToValueAtTime(note.end,end);}
   gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(Math.max(.0001,note.volume*level),start+.003);gain.gain.exponentialRampToValueAtTime(.0001,end);
   source.connect(gain);gain.connect(c.destination);
   source.onended=()=>{effect.remaining--;if(effect.remaining===0)release(effect);};
   source.start(start);source.stop(end+.01);
  }}catch{halt(effect);return false;}
  return true;
 }
 function play(name='action'){
  if(!soundTracks[name]||!allowed())return false;const c=getContext();if(!c)return false;
  if(c.state==='suspended'){const current=generation;try{c.resume().then(()=>{if(current===generation&&c.state==='running'&&allowed())schedule(name,c);}).catch(()=>{});}catch{}return false;}
  try{return schedule(name,c);}catch{stop();return false;}
 }
 return Object.freeze({play,unlock,stop,activeCount:()=>active.size});
}
