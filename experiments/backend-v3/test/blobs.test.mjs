import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { BlobsStore, FileStore, mutate } from '../src/store.mjs';

test('actual SDK/local emulator: conditional writes; missing read ETag fails closed (emulator limitation)', async () => {
  const directory=await mkdtemp(join(tmpdir(),'route-blobs-'));
  const server=new BlobsServer({ directory,logger:()=>{} }); const { port }=await server.start();
  try {
    const sdk=getStore({ name:'local-poc',siteID:'local-site',token:'synthetic-local-emulator-token',edgeURL:`http://127.0.0.1:${port}`,uncachedEdgeURL:`http://127.0.0.1:${port}`,consistency:'strong' });
    const store=new BlobsStore(sdk);
    assert.equal(await store.get('jobs/test'),null);
    const firstWrite=await sdk.setJSON('jobs/test',{ status:'queued' },{ onlyIfNew:true }); assert.equal(firstWrite.modified,true);
    assert.equal(await store.put('jobs/test',{ status:'duplicate' },{ new:true }),false);
    assert.ok(firstWrite.etag);
    // SDK 11.1.7's bundled local server omits ETag on GET. Do not paper over it.
    await assert.rejects(store.get('jobs/test'),e=>e.code==='BLOBS_ETAG_MISSING');
    assert.equal(await store.put('jobs/test',{ status:'running' },{ etag:firstWrite.etag }),true);
    assert.equal(await store.put('jobs/test',{ status:'bad-stale-write' },{ etag:firstWrite.etag }),false);
    const reopened=new BlobsStore(getStore({ name:'local-poc',siteID:'local-site',token:'synthetic-local-emulator-token',edgeURL:`http://127.0.0.1:${port}`,uncachedEdgeURL:`http://127.0.0.1:${port}`,consistency:'strong' }));
    assert.equal((await reopened.sdkStore.getWithMetadata('jobs/test',{ type:'json',consistency:'strong' })).data.status,'running');
  } finally { await server.stop(); await rm(directory,{ recursive:true,force:true }); }
});
test('actual SDK over SYNTHETIC HTTP contract: strong GET ETag and stale CAS protection', async () => {
  let value=null,etag='0';
  const transport=async (url,options={})=>{
    const headers=new Headers(options.headers);
    if ((options.method??'GET').toUpperCase()==='GET') return value===null ? new Response(null,{status:404}) : new Response(JSON.stringify(value),{headers:{etag}});
    if ((headers.get('if-none-match')==='*' && value!==null) || (headers.has('if-match') && headers.get('if-match')!==etag)) return new Response(null,{status:412});
    value=JSON.parse(options.body); etag=String(Number(etag)+1); return new Response(null,{status:200,headers:{etag}});
  };
  const store=new BlobsStore(getStore({name:'synthetic',siteID:'test',token:'synthetic',edgeURL:'https://blobs.example',uncachedEdgeURL:'https://blobs.example',consistency:'strong',fetch:transport}));
  assert.equal(await store.put('job',{n:1},{new:true}),true); assert.equal(await store.put('job',{n:2},{new:true}),false);
  const first=await store.get('job'); assert.equal(first.etag,'1');
  assert.equal(await store.put('job',{n:3},{etag:first.etag}),true); assert.equal(await store.put('job',{n:4},{etag:first.etag}),false);
  assert.equal((await store.get('job')).data.n,3);
});
test('local FileStore serializes concurrent CAS and persists across adapter recreation', async () => {
  const directory=await mkdtemp(join(tmpdir(),'route-file-'));
  try {
    const store=new FileStore(directory); await store.put('test',{ n:0 },{ new:true });
    await Promise.all(Array.from({ length:6 },()=>mutate(store,'test',j=>({ n:j.n+1 }))));
    assert.equal((await new FileStore(directory).get('test')).data.n,6);
  } finally { await rm(directory,{ recursive:true,force:true }); }
});
