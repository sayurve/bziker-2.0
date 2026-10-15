import test from 'node:test';
import assert from 'node:assert/strict';
import {drawRoomProps, supportedInteriorPropTypes} from '../web/interior-props.js';

const catalog = ['cashier','shelf','gondola','fridge','produce','rack','fitting','mirror','sofa','chair','table','desk','bookcase','board','slot','poker-table','plant','lamp','bin','poster','kiosk','bar','queue','display-bed','display-desk','trophy','bench','luggage','lockers','workbench','kitchen','display-case','stock-cart'];
function trace() {
  const calls = [];
  const c = new Proxy({measureText: value => ({width:String(value).length * 5})}, {
    get(target,key) { return key in target ? target[key] : (...args) => calls.push([key,...args]); },
    set(target,key,value) { calls.push(['set',key,value]); target[key]=value; return true; }
  });
  return {c,calls};
}
const room = props => ({id:'fixture-room',props});
const prop = (type, index=0) => ({id:`${type}-${index}`,type,x:100+index*3,y:240,width:112,height:type==='gondola'?128:48,color:'#afaeb9'});

test('modern interior catalog has separate recognizable art for all 33 furniture types',()=>{
  assert.deepEqual([...supportedInteriorPropTypes].sort(), [...catalog].sort());
  const renderings = catalog.map(type => {const {c,calls}=trace();drawRoomProps(room([prop(type)]))[0].draw(c);assert.ok(calls.filter(call=>call[0]==='fillRect').length>=8, `${type} needs visible construction detail`);return JSON.stringify(calls);});
  assert.equal(new Set(renderings).size,catalog.length);
});

test('every prop is an independent depth object with its physical front edge',()=>{
  const props=catalog.map(prop), nodes=drawRoomProps(room(props));
  assert.equal(nodes.length,props.length);
  assert.equal(new Set(nodes.map(node=>node.id)).size,props.length);
  for(let index=0;index<props.length;index++) {
    const p=props[index],n=nodes[index];
    assert.equal(n.id,`fixture-room:${p.id}`);
    assert.equal(n.depth,p.y+p.height);
    assert.ok(n.bounds.x<=p.x && n.bounds.y<=p.y);
    assert.ok(n.bounds.x+n.bounds.width>=p.x+p.width && n.bounds.y+n.bounds.height>=p.y+p.height);
  }
});

test('all prop paint coordinates are finite integer pixels and dimensions never turn negative',()=>{
  for(const type of catalog) for(const width of [24,80,180]) {
    const {c,calls}=trace();drawRoomProps(room([{...prop(type),x:660.4,y:400.7,width,height:32}]))[0].draw(c);
    for(const call of calls) {
      if(call[0]==='fillRect') {assert.ok(call.slice(1).every(Number.isInteger), `${type} fractional or invalid rectangle`);assert.ok(call[3]>0 && call[4]>0, `${type} negative or empty rectangle`);}
      if(['moveTo','lineTo'].includes(call[0]))assert.ok(call.slice(1).every(Number.isInteger),`${type} invalid volume plane`);
    }
  }
});

test('furniture appearance is deterministic and custom colors remain visible',()=>{
  for(const color of ['#141414','#faf8f2','#735bbc'])for(const type of catalog){const p={...prop(type),color},a=trace(),b=trace();drawRoomProps(room([p]))[0].draw(a.c);drawRoomProps(room([p]))[0].draw(b.c);assert.deepEqual(a.calls,b.calls);assert.ok(a.calls.some(call=>call[0]==='set'&&call[1]==='fillStyle'&&call[2]===color),`${type} drops its chosen palette`);}
});

test('the visual envelope includes all painted pixels even for small furniture',()=>{
  for(const type of catalog)for(const width of [24,80,180]){
    const node=drawRoomProps(room([{...prop(type),width,height:32}]))[0],{c,calls}=trace(),b=node.bounds;node.draw(c);
    for(const call of calls){
      if(call[0]==='fillRect'){const [,x,y,w,h]=call;assert.ok(x>=b.x&&y>=b.y&&x+w<=b.x+b.width&&y+h<=b.y+b.height,`${type} rectangle escapes cached drawing bounds`);}
      if(['moveTo','lineTo'].includes(call[0])){const [,x,y]=call;assert.ok(x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height,`${type} plane escapes cached drawing bounds`);}
    }
  }
});

test('an unsupported or corrupt decorative prop does not interrupt the room rendering',()=>{
  const props=[prop('chair'),{...prop('chair',1),x:NaN},{...prop('chair',2),width:-3},{...prop('chair',3),type:'missing-catalog-item'}];
  const nodes=drawRoomProps(room(props));
  assert.deepEqual(nodes.map(n=>n.id),['fixture-room:chair-0']);
  assert.deepEqual(drawRoomProps({id:'empty'}),[]);
});

test('a suspended board leaves its passable floor clear while a standing board has legs and a shadow',()=>{
  const base={...prop('board'),label:'РАСПИСАНИЕ'},bottom=base.y+base.height;
  const suspended=trace(),standing=trace();
  drawRoomProps(room([{...base,solid:false}]))[0].draw(suspended.c);
  drawRoomProps(room([{...base,solid:true}]))[0].draw(standing.c);
  const floorPaint=call=>call[0]==='fillRect'&&call[2]+call[4]>bottom-16;
  assert.equal(suspended.calls.filter(floorPaint).length,0,'a wall panel must not depict an obstacle on the walkable floor');
  assert.ok(standing.calls.filter(floorPaint).length>=3,'a floor stand needs its two supports and contact shadow');
  for(const rendered of [suspended,standing])assert.ok(rendered.calls.some(call=>call[0]==='fillText'&&call[1]===base.label));
  assert.ok(suspended.calls.some(call=>call[0]==='fillRect'&&call[3]===base.width&&call[4]===72),'the suspended version retains its full information panel');
});
