import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as avatar from '../../web/avatar.js';
import * as city from '../../web/city-features.js';
import * as cards from '../../web/card-games.js';
import * as account from '../../web/account-ui.js';
import * as construction from '../../web/construction-ui.js';
import * as color from '../../web/color-picker.js';
import * as gameplayUI from '../../web/gameplay-ui.js';
import * as inventoryUI from '../../web/inventory-ui.js';
import * as sourceUI from '../../web/source-ui.js';
import {houseCatalog,housePreviewSVG} from '../../web/house-models.js';
import {profileBuilderHTML,avatarPreviewHTML,catalogPartSVG,catalogHTML as builderCatalogHTML} from '../../web/profile-builder.js';

const appSource=readFileSync(new URL('../../web/app.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replace(/\ninit\(\);\s*$/,'\n');

export function runtime(responder, saved={}, source=appSource) {
  const nodes=new Map(),storage=new Map(Object.entries(saved)),calls=[],events=[],sounds=[],documentListeners=new Map();
  const node=selector=>{
    if(!nodes.has(selector)){
      const classes=new Set(),listeners=new Map();
      nodes.set(selector,{innerHTML:'',textContent:'',hidden:false,open:false,dataset:{},scrollTop:0,
        classList:{add(...values){values.forEach(value=>classes.add(value));},remove(...values){values.forEach(value=>classes.delete(value));},
          contains:value=>classes.has(value),toggle(value){if(classes.has(value)){classes.delete(value);return false;}classes.add(value);return true;}},
        addEventListener(name,callback){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(callback);},
        setAttribute(){},querySelectorAll(){return[];},contains(){return false;},
        close(){this.open=false;(listeners.get('close')||[]).forEach(callback=>callback());},show(){this.open=true;},showModal(){this.open=true;},
        getBoundingClientRect(){return{left:0,right:10,top:0,bottom:10};}});
    }
    return nodes.get(selector);
  };
  const context={...avatar,...city,...cards,...account,...construction,...color,...gameplayUI,...inventoryUI,...sourceUI,houseCatalog,housePreviewSVG,createGameAudio:()=>({play:name=>sounds.push(name),unlock(){},stop(){}}),notificationDelta:(old,next)=>!!old&&Number(next.unread)>Number(old.unread),profileBuilderHTML,avatarPreviewHTML,catalogPartSVG,builderCatalogHTML,URL,JSON,console,
    document:{querySelector:node,querySelectorAll:()=>[],addEventListener(name,callback){if(!documentListeners.has(name))documentListeners.set(name,[]);documentListeners.get(name).push(callback);},body:{dataset:{}},hidden:false,activeElement:null},
    window:{scrollTo(){},Telegram:null},location:{href:'http://localhost/'},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    readControlLayout:()=>sourceUI.readControlLayout(context.localStorage),
    saveControlLayout:value=>sourceUI.saveControlLayout(value,context.localStorage),
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,matchMedia:()=>({matches:true}),
    mountWorld:()=>null,travelDestinations:[],districtHouses:[],crypto:{randomUUID:()=> 'new-nonce'},
    fetch:async(path,options)=>{
      const body=options.body===undefined?undefined:JSON.parse(options.body);
      calls.push({path,body});events.push(path);
      const reply=await responder(path,body);
      return {ok:reply.status===undefined||reply.status<400,status:reply.status??200,json:async()=>reply.data??reply};
    },
    cardGamesPanelHTML:(...args)=>{events.push('render-card-panel');return cards.cardGamesPanelHTML(...args);},
    homeCalls:0,
  };
  vm.createContext(context);vm.runInContext(source,context);
  vm.runInContext(`bootstrap={profile:{id:'account1',name:'Viewer',avatar:{}},lobbies:[]};csrf='test-csrf';
    home=async()=>{homeCalls++;cardSnapshot=null;setScreen('home','<p>City without cached roster</p>');};`,context);
  return {context,nodes,calls,events,storage,sounds,documentListeners,run:code=>vm.runInContext(code,context)};
}
