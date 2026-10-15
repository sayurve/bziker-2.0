import{readFile}from'node:fs/promises';
const web=new URL('../../game/web/',import.meta.url),test=new URL('../../game/tests/action-customization-v29.test.mjs',import.meta.url),data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const absolute=(s,base)=>s.replace(/from\s*(['"])(\.\.?\/[^'"]+)\1/g,(_,q,p)=>`from '${new URL(p,base).href}'`);
const old=data(absolute(await readFile(new URL('actor-sprite-before.js',import.meta.url),'utf8'),web));
const actor=data(absolute(await readFile(new URL('source-actors.js',web),'utf8'),web).replace(new URL('actor-sprite.js',web).href,old));
await import(data(absolute((await readFile(test,'utf8')).replaceAll('import.meta.url',JSON.stringify(test.href)),test).replace(new URL('source-actors.js',web).href,actor).replace(new URL('actor-sprite.js',web).href,old)));
