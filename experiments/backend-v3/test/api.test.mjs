import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/api.mjs';
import { HttpClient, IgnGeocoder, FossgisProvider } from '../src/providers.mjs';
import { Cache, MemoryStore } from '../src/store.mjs';
import { harness, input } from './helpers.mjs';
const token = 'synthetic-test-token-not-a-real-secret-12345', origin = 'https://nogeomhub.github.io';
const request = (path,body,headers = {}) => new Request('https://poc.example'+path,{ method: body === undefined ? 'GET' : 'POST',
  headers: { Authorization: 'Bearer '+token, Origin: origin, 'Content-Type': 'application/json', ...headers },...(body === undefined ? {} : { body: JSON.stringify(body) }) });
test('HTTP job lifecycle, async dispatch, status/result retrieval and geometry endpoint', async () => {
  const h = harness(), api = createApi({ jobs: h.jobs, token, origins: [origin] });
  const response = await api(request('/api/search',input)); assert.equal(response.status,202);
  const created = await response.json(); assert.equal(created.status,'queued'); assert.equal(h.dispatched[0],created.jobId);
  assert.equal(h.calls.filter(x => x.kind === 'route').length,0);
  assert.equal((await (await api(request('/api/search/'+created.jobId))).json()).status,'queued');
  await h.jobs.run(created.jobId);
  const result = await (await api(request('/api/search/'+created.jobId))).json(); assert.equal(result.status,'completed');
  assert.equal(result.result.routes[0].geometry,undefined); assert.ok(result.result.routes[0].geometryUrl);
  const geometry = await api(request(result.result.routes[0].geometryUrl)); assert.equal(geometry.status,200); assert.equal((await geometry.json()).type,'LineString');
  assert.equal((await api(request('/api/search',input))).status,200);
});
test('CORS allowlist, bearer auth for web/Android, preflight, malformed input and expiry', async () => {
  const h = harness(), api = createApi({ jobs:h.jobs, token, origins:[origin] });
  assert.equal((await api(request('/api/search',input,{ Origin:'https://evil.example' }))).status,403);
  assert.equal((await api(request('/api/search',input,{ Authorization:'' }))).status,401);
  const preflight = await api(new Request('https://poc.example/api/search',{ method:'OPTIONS',headers:{ Origin:origin } }));
  assert.equal(preflight.status,204); assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
  const android = request('/api/search',input); android.headers.delete('Origin'); assert.equal((await api(android)).status,202);
  assert.equal((await api(request('/api/search',{ origin:{ lat:'bad',lon:2 },destination:input.destination }))).status,400);
  assert.equal((await api(request('/api/search/not-an-id'))).status,404);
  assert.equal((await api(new Request('https://poc.example/api/about'))).status,200);
});
test('HTTP cancellation, manual resumption endpoint and geocoding ambiguity', async () => {
  const h = harness(), api = createApi({ jobs:h.jobs,token,origins:[origin] });
  const { jobId } = await h.jobs.create(input);
  assert.equal((await api(request(`/api/search/${jobId}/resume`,{}))).status,202);
  const cancel = await api(request(`/api/search/${jobId}/cancel`,{})); assert.equal((await cancel.json()).status,'cancelled');
  assert.equal((await api(request(`/api/search/${jobId}/resume`,{}))).status,409);
  const ambiguous = await api(request('/api/search',{ origin:'Le Pin',destination:input.destination }));
  assert.equal(ambiguous.status,409); assert.equal((await ambiguous.json()).error.details.origin.length,2);
});
test('HTTP transport records real errors without retry; malformed JSON and upstream quota', async () => {
  for (const response of [new Response('invalid',{ status:200 }),new Response('{}',{ status:429,headers:{ 'retry-after':'60' } })]) {
    const entries = []; let calls = 0;
    const client = new HttpClient({ fetchImpl:async () => { calls++; return response; },record:async e => entries.push(e) });
    await assert.rejects(client.json('https://example.test',{},'synthetic')); assert.equal(calls,1); assert.equal(entries.length,1); assert.ok(entries[0].error);
  }
  let observed;
  const client = new HttpClient({ fetchImpl:async (url,options) => { observed=options; return new Response('{}'); } });
  const provider = new FossgisProvider(client,{ policyReviewed:true }); await provider.route([input.origin,input.destination],{});
  const payload = JSON.parse(observed.body); assert.equal(payload.alternates,2); assert.equal(payload.shape_format,'polyline6');
  assert.match(observed.headers['User-Agent'],/RouteOptimizer/); assert.match(observed.headers.Referer,/NogeomHub/);
  assert.throws(() => new FossgisProvider(client));
});
test('transport connection failure is structured, archived once and never retried',async()=>{
  const entries=[];let attempts=0;
  const client=new HttpClient({fetchImpl:async()=>{attempts++;throw new Error('synthetic connection reset')},record:async e=>entries.push(e)});
  await assert.rejects(client.json('https://example.test',undefined,'synthetic'),e=>e.code==='NETWORK_ERROR');
  assert.equal(attempts,1);assert.equal(entries.length,1);assert.ok(entries[0].error);assert.equal(entries[0].status,null);
});
test('IGN candidates cached without losing ambiguity; no keys and no arbitrary selection', async () => {
  let calls=0;
  const http={ json:async () => { calls++; return { features:[1,2].map(n => ({ properties:{ label:'Synthetic '+n },geometry:{ coordinates:[2+n/100,48] } })) }; } };
  const geo=new IgnGeocoder(http,new Cache(new MemoryStore()));
  assert.equal((await geo.candidates(' Le Pin ')).length,2); await geo.candidates('Le Pin'); assert.equal(calls,1);
});
