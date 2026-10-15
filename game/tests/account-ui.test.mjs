import test from 'node:test';
import assert from 'node:assert/strict';
import {accountGate,accountCredentials,accountFormHTML,accountSettingsHTML} from '../web/account-ui.js';

test('first profile requires credentials while an existing demo keeps its progress',()=>{
 assert.equal(accountGate({account:{registration_required:true},profile:null}),true);
 assert.equal(accountGate({account:{registration_required:true},profile:{name:'Михаил'}}),false);
 assert.equal(accountGate({account:{registration_required:false},profile:null}),false);
 assert.equal(accountGate({profile:null}),false);
});
test('credentials match confirmation, keep password bytes, and normalize only login',()=>{
 assert.deepEqual(accountCredentials({login:'  Vlad.Test ',password:' Abc!123 ',confirm_password:' Abc!123 '},'claim'),{login:'vlad.test',password:' Abc!123 '});
 assert.throws(()=>accountCredentials({login:'vlad',password:'abcdefgh',confirm_password:'abcdefghi'},'register'),/не совпадают/);
 assert.throws(()=>accountCredentials({login:'Влад',password:'abcdefgh'},'login'),/Проверьте логин/);
 assert.throws(()=>accountCredentials({login:'.vlad',password:'abcdefgh'},'login'),/Проверьте логин/);
 assert.throws(()=>accountCredentials({login:'vlad',password:'123'},'login'),/от 8 до 128/);
 assert.deepEqual(accountCredentials({login:'vlad',password:'abcdefgh'},'login'),{login:'vlad',password:'abcdefgh'});
});
test('forms use appropriate password managers and never echo credentials',()=>{
 const login=accountFormHTML({mode:'login',login:'<script>'});
 assert.match(login,/autocomplete="current-password"/);assert.doesNotMatch(login,/name="confirm_password"/);assert.doesNotMatch(login,/<script>/);
 const claim=accountFormHTML({mode:'claim',profile:{name:'<Михаил>'}});
 assert.match(claim,/&lt;Михаил&gt;/);assert.match(claim,/autocomplete="new-password"/);assert.match(claim,/data-action="home"/);
 assert.match(accountSettingsHTML({has_credentials:true,login:'vlad'}, {name:'Михаил'}),/Выйти из аккаунта/);
});
