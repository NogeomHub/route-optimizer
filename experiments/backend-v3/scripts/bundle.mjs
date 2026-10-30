import { zipFunctions } from '@netlify/zip-it-and-ship-it';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('.local/bundled',{recursive:true});
const result=await zipFunctions('netlify/functions','.local/bundled',{
  config:{ '*':{ nodeBundler:'esbuild',nodeVersion:'22.x' } },
  basePath:process.cwd()
});
assert.equal(result.length,2);
assert.ok(result.some(f=>f.name==='search-background'));
await mkdir('evidence',{recursive:true});
await writeFile('evidence/function-bundle.json',JSON.stringify(result.map(({name,runtime,nodeBundler,runtimeVersion,config})=>({name,runtime,nodeBundler,runtimeVersion,config})),null,2));
console.log('Two functions bundled with the official Netlify bundler, no account/deploy.',result.map(f=>f.name));
