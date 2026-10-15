import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const models=await import('../web/house-models.js').catch(()=>({}));

test('construction catalog has six real architectural previews and the shared allowed palette',async()=>{
 assert.equal(typeof models.housePreviewSVG,'function');
 const catalog=JSON.parse(await readFile(new URL('../web/house-catalog.json',import.meta.url),'utf8'));
 assert.deepEqual(catalog.styles.map(s=>s.id),[0,1,2,3,4,5]);assert.ok(catalog.styles.every(s=>s.label));assert.ok(catalog.palette.every(c=>/^#[0-9a-f]{6}$/i.test(c)));assert.equal(new Set(catalog.palette.map(c=>c.toLowerCase())).size,catalog.palette.length);
 const previews=catalog.styles.map(s=>models.housePreviewSVG(s.id,'#e88d78'));assert.equal(new Set(previews).size,6);
 for(const svg of previews){assert.match(svg,/viewBox=/);assert.match(svg,/#e88d78/);assert.match(svg,/shape-rendering="crispEdges"/);assert.match(svg,/<image href="(?:\/assets\/design-[^"]+\.png|data:image\/png;base64,[A-Za-z0-9+/=]+)"/);assert.match(svg,/data-source-house-color="#e88d78"/);assert.match(svg,/preserveAspectRatio="xMidYMax meet"/);assert.doesNotMatch(svg.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g,''),/script|foreignObject|NaN/);}
});

test('house palette never inserts arbitrary markup and the clan flag remains an independent colour',()=>{
 assert.equal(typeof models.drawHouseCanvas,'function');
 const calls=[],ctx=new Proxy({fillRect(...a){calls.push([this.fillStyle,...a]);}},{get:(t,k)=>t[k]??(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
 models.drawHouseCanvas(ctx,{x:0,y:0,width:220,height:180,door:{x:110,y:195}},{exterior_style:5,exterior_color:'#e88d78',color:'#7d9de6',flag:'И',name:'Идея'});
 assert.ok(calls.some(c=>c[0]==='#e88d78'));assert.ok(calls.some(c=>c[0]==='#7d9de6'));
 const svg=models.housePreviewSVG(5,'<script>');assert.doesNotMatch(svg,/<script>/);assert.match(svg,/#faf8f2/);
});
test('vacant construction plots retain an approach gate without drawing a roof or windows',()=>{
 assert.equal(typeof models.drawConstructionPlot,'function');const text=[],rects=[],ctx=new Proxy({fillText:t=>text.push(t),fillRect(...args){rects.push(args);}},{get:(t,k)=>t[k]??(()=>{})});
 models.drawConstructionPlot(ctx,{id:'base-8',x:0,y:0,width:220,height:180,door:{x:110,y:195}});
 assert.ok(text.includes('08'));assert.ok(text.includes('УЧАСТОК'));assert.ok(rects.every(r=>r[1]>=-28));assert.ok(!rects.some(([x,y,w])=>y===166&&x<110&&x+w>110));
});
test('previously saved strict hex facade colours remain visible even outside the new construction palette',()=>{
 for(const legacy of ['#FF8562','#CDF17C']){
  const svg=models.housePreviewSVG(0,legacy);assert.match(svg,new RegExp(legacy));
  const fills=[],ctx=new Proxy({fillRect(){fills.push(this.fillStyle);}},{get:(t,k)=>t[k]??(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
  models.drawHouseCanvas(ctx,{x:0,y:0,width:220,height:180,door:{x:110,y:195}},{exterior_style:0,exterior_color:legacy});assert.ok(fills.includes(legacy));
 }
});
