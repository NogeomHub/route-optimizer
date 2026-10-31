import test from 'node:test';
import assert from 'node:assert/strict';
import { Jobs, transition } from '../src/jobs.mjs';
import { Cache, MemoryStore, Lease, mutate } from '../src/store.mjs';
import { PocError } from '../src/util.mjs';
import { harness, input, response } from './helpers.mjs';

test('state machine rejects terminal resurrection and unsupported transition', () => {
  assert.equal(transition({ status: 'queued' },'running').status,'running');
  assert.throws(() => transition({ status: 'completed' },'running'));
  assert.throws(() => transition({ status: 'queued' },'completed'));
});
test('queued -> running -> completed, checkpoints survive reads and result serialization', async () => {
  const h = harness(); const { jobId } = await h.jobs.create(input);
  assert.equal((await h.jobs.view(jobId)).status,'queued');
  assert.equal((await h.jobs.run(jobId)).completed,true);
  const data = await h.jobs.view(jobId);
  assert.equal(data.status,'completed'); assert.equal(data.progress.profilesExecuted,12); assert.equal(data.progress.uniqueGeometries,1);
  assert.equal(data.progress.analyzed,1); assert.equal(data.result.pricingStatus,'not_computed');
  assert.deepEqual(data.result.exposurePareto,['G001']); assert.equal(data.result.routes[0].producedBy.length,12);
  assert.deepEqual(JSON.parse(JSON.stringify(data)).result,data.result);
  const stored=await h.jobs.read(jobId); assert.equal(stored.checkpoint.routes[0].geometry,undefined); assert.equal(stored.checkpoint.routes[0].shape,undefined);
  assert.deepEqual((await h.jobs.geometry(jobId,'G001')).coordinates,[[2,48],[2.01,48.01]]);
  const reloaded = new Jobs({ ...h.jobs }); assert.deepEqual(await reloaded.view(jobId),data);
  const count = h.calls.length; await h.jobs.run(jobId); assert.equal(h.calls.length,count);
});
test('near-simultaneous identical jobs get one campaign, active/result reuse', async () => {
  const h = harness(); await h.jobs.currentGraph();
  const attempts = await Promise.allSettled(Array.from({ length: 8 },() => h.jobs.create(input)));
  const ids = attempts.filter(x => x.status === 'fulfilled').map(x => x.value.jobId);
  assert.equal(new Set(ids).size,1);
  for (const x of attempts.filter(x => x.status === 'rejected')) assert.equal(x.reason.code,'CREATING');
  const id = ids[0];
  await Promise.all([h.jobs.run(id),h.jobs.run(id)]);
  assert.equal(h.calls.filter(x => x.kind === 'route').length,12);
  const count = h.calls.length; const cached = await h.jobs.create(input);
  assert.equal(cached.jobId,id); assert.equal(cached.status,'completed'); assert.equal(cached.reused,true);
  assert.equal(h.calls.length,count);
});
test('two distinct jobs cannot run two upstream campaigns simultaneously', async () => {
  const h=harness();const a=await h.jobs.create(input),b=await h.jobs.create({...input,parameters:{maxExtraMinutes:30}});
  let release,entered;const started=new Promise(resolve=>{entered=resolve});
  h.provider.route=async()=>{entered();await new Promise(resolve=>{release=resolve});return structuredClone(response)};
  const first=h.jobs.run(a.jobId);await started;
  await h.jobs.run(b.jobId);assert.equal((await h.jobs.view(b.jobId)).error.code,'PROVIDER_BUSY');
  await h.jobs.cancel(a.jobId);release();await first;assert.equal((await h.jobs.view(a.jobId)).status,'cancelled');
});
test('cache keys distinguish coordinates, user parameters, provider graph, strategy and early-stop', async () => {
  const h = harness(); const a = await h.jobs.create(input);
  const b = await h.jobs.create({ ...input, destination: { lat: 48.010001, lon: 2.01 } });
  const c = await h.jobs.create({ ...input, parameters: { maxExtraMinutes: 30 } });
  assert.equal(new Set([a.jobId,b.jobId,c.jobId]).size,3);
  const job = await h.jobs.read(a.jobId); assert.equal(job.graph.version,'test'); assert.ok(job.strategy); assert.equal(job.provider,h.provider.id);
  const other = harness({ store: h.store, provider: { id: 'other-provider' } });
  assert.notEqual((await other.jobs.create(input)).jobId,a.jobId);
  const early = harness({ store: h.store, earlyNoTolls: true }); assert.notEqual((await early.jobs.create(input)).jobId,a.jobId);
  h.advance(300001); h.provider.status = async () => ({ version: 'test', tileset_last_modified: 2 });
  assert.notEqual((await h.jobs.create(input)).jobId,a.jobId);
});
test('all ambiguity candidates returned, no arbitrary first hit, no Valhalla request', async () => {
  const h = harness(); await assert.rejects(h.jobs.create({ origin: 'Le Pin', destination: input.destination }),e => e.code === 'NEEDS_SELECTION' && e.details.origin.length === 2);
  assert.equal(h.calls.length,0);
});
test('queued cancellation and running cancellation stop cooperatively between upstream calls', async () => {
  const h = harness(); const q = await h.jobs.create(input); await h.jobs.cancel(q.jobId); await h.jobs.run(q.jobId);
  assert.equal((await h.jobs.view(q.jobId)).status,'cancelled'); assert.equal(h.calls.filter(x => x.kind === 'route').length,0);
  const { jobId } = await h.jobs.create(input);
  h.provider.route = async () => { await h.jobs.cancel(jobId); return structuredClone(response); };
  await h.jobs.run(jobId); assert.equal((await h.jobs.view(jobId)).status,'cancelled');
  assert.equal(h.calls.filter(x => x.kind === 'trace').length,0);
});
test('network failure, invalid response and quota fail without automatic flooding', async () => {
  for (const route of [async () => { throw new PocError('NETWORK_ERROR','offline'); },async () => ({ trip: {} }),async () => { throw new PocError('PROVIDER_RATE_LIMIT','429'); }]) {
    const h = harness({ provider: { route } }); const { jobId } = await h.jobs.create(input);
    await h.jobs.run(jobId); const view = await h.jobs.view(jobId);
    assert.equal(view.status,'failed'); assert.ok(['NETWORK_ERROR','INVALID_PROVIDER','PROVIDER_RATE_LIMIT'].includes(view.error.code));
    assert.equal(h.calls.filter(x => x.kind === 'trace').length,0);
    const another = await h.jobs.create(input); assert.notEqual(another.jobId,jobId);
  }
});
test('expired job is 410 and exact-result cache cannot silently outlive it', async () => {
  const h = harness({ ttlMs: 10000 }); const { jobId } = await h.jobs.create(input);
  h.advance(10001); await assert.rejects(h.jobs.view(jobId),e => e.status === 410);
  assert.notEqual((await h.jobs.create(input)).jobId,jobId);
});
test('cache TTL is enforced and different namespaces are independent', async () => {
  const store = new MemoryStore(); let now = 1; const cache = new Cache(store,() => now);
  await cache.set('route',{ a: 1 },{ answer: 42 },5); assert.deepEqual(await cache.get('route',{ a: 1 }),{ answer: 42 });
  assert.equal(await cache.get('analysis',{ a: 1 }),null); now = 6; assert.equal(await cache.get('route',{ a: 1 }),null);
});
test('lease is exclusive, expired owner fenced, new owner may resume', async () => {
  const store = new MemoryStore(); let now = 1;
  const a = new Lease(store,'lock','a',() => now,100), b = new Lease(store,'lock','b',() => now,100);
  assert.equal(await a.acquire(),true); assert.equal(await b.acquire(),false);
  now = 102; assert.equal(await b.acquire(),true); await assert.rejects(a.renew(),e => e.code === 'LEASE_LOST');
  assert.ok(b.fence>a.fence);
  await a.release(); assert.equal((await store.get('lock')).data.owner,'b');
});
test('interrupted job cancelled before a successor claims it still reaches cancelled', async () => {
  const h=harness();const {jobId}=await h.jobs.create(input);
  await h.jobs.update(jobId,j=>({...j,status:'running',owner:'dead-worker',fence:1}));
  await h.store.put('locks/job/'+jobId,{owner:'dead-worker',fence:1,until:0});
  await h.jobs.cancel(jobId);await h.jobs.run(jobId);assert.equal((await h.jobs.view(jobId)).status,'cancelled');
});
test('interrupted runner resumes persisted profile prefix without restarting it', async () => {
  const h = harness(); const { jobId } = await h.jobs.create(input);
  const initial = await h.jobs.read(jobId);
  // Synthetic process death: three responses already checkpointed, no terminal write.
  const group = (await import('../src/geometry.mjs')).addTrips;
  const routes = []; const ids = group(routes,structuredClone(response),104);
  await h.jobs.update(jobId,j => ({ ...j, status: 'running', owner: 'dead-worker', attempts: 1,
    checkpoint: { history: [104,0,25].map(profile => ({ profile,routes: ids })), routes, earlyChecked: false } }));
  await h.store.put('locks/job/' + jobId,{ owner: 'dead-worker', until: h.now()+100 });
  assert.equal((await h.jobs.run(jobId)).reason,'already_running');
  h.advance(101); await h.jobs.run(jobId);
  const view = await h.jobs.view(jobId); assert.equal(view.status,'completed'); assert.equal(view.attempts,2);
  assert.equal(h.calls.filter(x => x.kind === 'route').length,9); assert.equal(view.progress.profilesExecuted,12);
  assert.equal(initial.status,'queued');
});
test('early no-toll option is off by default, explicit option stops at 9 after strict unique analyses', async () => {
  const h = harness({ earlyNoTolls: true }); const { jobId } = await h.jobs.create(input); await h.jobs.run(jobId);
  const data = await h.jobs.view(jobId); assert.equal(data.progress.profilesExecuted,9); assert.equal(data.result.stopReason,'experimental_no_toll_after_9');
  assert.equal(h.calls.filter(x => x.kind === 'trace').length,1);
});
test('early no-toll never treats missing edge.toll as zero', async () => {
  const h = harness({ earlyNoTolls: true, provider: { trace: async () => ({ units: 'kilometers', edges: [] }) } });
  const { jobId } = await h.jobs.create(input); await h.jobs.run(jobId); assert.equal((await h.jobs.view(jobId)).error.code,'INVALID_PROVIDER');
});
test('global schedule spaces all calls after prior response, even across jobs', async () => {
  const h = harness(); const { jobId } = await h.jobs.create(input); await h.jobs.run(jobId);
  for (let i = 1; i < h.calls.length; i++) assert.ok(h.calls[i].at - h.calls[i-1].at >= 2000);
});
test('time budget and graph change preserve explicit failure instead of fake complete results', async () => {
  const h = harness({ budgetMs: 3000 }); const { jobId } = await h.jobs.create(input); await h.jobs.run(jobId);
  assert.equal((await h.jobs.view(jobId)).error.code,'TIME_BUDGET');
  const g = harness(); const j = await g.jobs.create(input); g.provider.status = async () => ({ version: 'other', tileset_last_modified: 9 });
  await g.jobs.run(j.jobId); assert.equal((await g.jobs.view(j.jobId)).error.code,'GRAPH_CHANGED');
});
test('failed dispatcher leaves no active dedup trap', async () => {
  const h = harness({ dispatch: async () => { throw new Error('acceptance failed'); } });
  await assert.rejects(h.jobs.create(input),e => e.code === 'DISPATCH_FAILED');
  h.jobs.dispatch = async () => {}; assert.equal((await h.jobs.create(input)).status,'queued');
});
