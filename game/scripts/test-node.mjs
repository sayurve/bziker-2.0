import {readdirSync} from 'node:fs';
import {delimiter,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const files=readdirSync(resolve(root,'tests')).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'tests/'+name);
// Older offline renderers resolve Canvas from process.execPath. NODE_PATH
// makes the same exact dependency in this project's node_modules available.
const env={...process.env,NODE_PATH:[resolve(root,'node_modules'),process.env.NODE_PATH].filter(Boolean).join(delimiter)};
const result=spawnSync(process.execPath,['--test',...files],{cwd:root,env,stdio:'inherit'});
if(result.error){console.error(result.error.message);process.exit(1);}
process.exit(result.status??1);
