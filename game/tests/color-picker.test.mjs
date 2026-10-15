import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHouseColor,pickScreenColor,previewElementColor} from '../web/color-picker.js';

test('RGB colours normalize safely without accepting CSS or markup',()=>{
 assert.equal(normalizeHouseColor('#3AC891'),'#3ac891');
 for(const color of ['#123','#12345678','red',' url(x)','#12345g',null])assert.equal(normalizeHouseColor(color),null);
});
test('screen picker returns selected colour, handles cancellation, and falls back when unavailable',async()=>{
 assert.equal(await pickScreenColor(undefined),null);
 assert.equal(await pickScreenColor(class {async open(){return {sRGBHex:'#C84591'};}}),'#c84591');
 assert.equal(await pickScreenColor(class {async open(){throw {name:'AbortError'};}}),null);
 await assert.rejects(pickScreenColor(class {async open(){throw new Error('permission');}}),/permission/);
});
test('local pipette only samples safe solid fills within the house preview',()=>{
 const preview={contains:element=>element.inside};
 const el=(fill,inside=true)=>({inside,getAttribute:key=>key==='fill'?fill:null});
 assert.equal(previewElementColor(el('#809AC1'),preview),'#809ac1');
 assert.equal(previewElementColor(el('url(#mask)'),preview),null);
 assert.equal(previewElementColor(el('#809ac1',false),preview),null);
});
