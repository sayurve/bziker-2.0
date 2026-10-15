import test from 'node:test';
import assert from 'node:assert/strict';
import {constructionEligibility,constructionHTML,constructionPayload} from '../web/construction-ui.js';
const own={id:'c1',is_leader:true,members:[{},{},{},{}],base:{building_id:null}};
const plot={id:'base-1',name:'Участок 01',door:{x:100,y:100}};
const here={scene:'city',position:{x:100,y:124}};
test('building requires membership, leadership, four actual members and approach',()=>{
 assert.equal(constructionEligibility(own,plot,here).allowed,true);
 assert.equal(constructionEligibility({...own,members:[{},{},{}]},plot,here).code,'members');
 assert.equal(constructionEligibility({...own,is_leader:false},plot,here).code,'leader');
 assert.equal(constructionEligibility(null,plot,here).code,'clan');
 assert.equal(constructionEligibility(own,plot,{...here,position:{x:210,y:100}}).allowed,true);
 assert.equal(constructionEligibility(own,plot,{...here,position:{x:211,y:100}}).code,'distance');
 assert.equal(constructionEligibility(own,plot,{...here,scene:'base'}).code,'distance');
 assert.equal(constructionEligibility({...own,base:{building_id:'base-2'}},plot,here).code,'built');
 assert.equal(constructionEligibility(own,{...plot,clan:{id:'other'}},here).code,'occupied');
});
test('construction shows six model previews, color choices and explicit fixed exterior confirmation',()=>{
 const html=constructionHTML({own,plot,state:here,style:0,color:'#faf8f2'});
 assert.equal((html.match(/name="exterior_style"/g)||[]).length,6);
 assert.equal((html.match(/data-action="house-color"/g)||[]).length,32);
 assert.match(html,/type="color" name="exterior_color"/);
 assert.match(html,/data-action="house-eyedropper"/);
 assert.match(html,/>Построить<\/button>/);
 assert.doesNotMatch(html,/Подтвердить и построить/);
 assert.match(html,/id="construction-preview"/);assert.match(html,/после стройки/i);
 assert.doesNotMatch(html,/<button[^>]+type="submit"[^>]+disabled/);
 const locked=constructionHTML({own:{...own,members:[{}]},plot,state:here});
 assert.match(locked,/<button[^>]+type="submit"[^>]+disabled/);
});
test('construction payload accepts six models and arbitrary strict RGB colour',()=>{
 assert.equal(constructionPayload({building_id:'base-1',exterior_style:'0',exterior_color:'#3AC891'}).exterior_color,'#3ac891');
 assert.throws(()=>constructionPayload({building_id:'base-1',exterior_style:'6',exterior_color:'#faf8f2'}),/модель/i);
 assert.throws(()=>constructionPayload({building_id:'base-1',exterior_style:'0',exterior_color:'red'}),/цвет/i);
 assert.throws(()=>constructionPayload({building_id:'',exterior_style:'0',exterior_color:'#faf8f2'}),/участок/i);
 for(const value of ['#123','rgba(1,2,3,1)','#12345678','"><script>','#12345g'])assert.throws(()=>constructionPayload({building_id:'base-1',exterior_style:'0',exterior_color:value}),/цвет/i);
});

test('hidden jury members still count towards four real clan members',()=>{
 const clan={...own,member_count:4,members:[{},{},{}]};
 assert.equal(constructionEligibility(clan,plot,here).allowed,true);
 assert.match(constructionHTML({own:clan,plot,state:here}),/Участников: 4/);
});

test('house color swatches work under the strict server CSP without inline styles',()=>{
 const html=constructionHTML({own,plot,state:here});
 assert.doesNotMatch(html,/style="/);
 assert.match(html,/<svg[^>]+viewBox="0 0 38 38"[^>]*><rect[^>]+fill="#faf8f2"/);
});


test('exact city construction explains that native exteriors stay fixed while interior editing remains available',()=>{
 const html=constructionHTML({own,plot,state:here,exactScene:true});
 assert.match(html,/внешний фасад здесь не меняется/);
 assert.match(html,/Флаг и название клана будут видны у входа/);
 assert.match(html,/Обстановку внутри можно менять/);
 assert.doesNotMatch(html,/Ваш будущий дом/);
});
