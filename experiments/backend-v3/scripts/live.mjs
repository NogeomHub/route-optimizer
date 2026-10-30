/** Real HTTP job test, explicit network opt-in; never reports local disk as hosted Blobs. */
import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { startLocal } from '../src/local-server.mjs';
import { sleep, hash } from '../src/util.mjs';
const args = process.argv.slice(2);
if (!args.includes('--live') || !args.includes('--policy-reviewed')) throw new Error('Requires --live --policy-reviewed; personal experiment only.');
const corridor = args.includes('--rennes') ? 'rennes-saint-brieuc' : 'crans-le-pin';
// Exact archived commune-centre coordinates, never silently chosen from IGN suggestions.
const locations = corridor === 'crans-le-pin' ? [{ lon:5.1917,lat:45.9667 },{ lon:2.6286,lat:48.9138 }] :
  [{ lon:-1.6884,lat:48.1159 },{ lon:-2.7657,lat:48.5108 }];
const directory = resolve(process.env.POC_LIVE_DIRECTORY ?? 'evidence/live/' + corridor);
await mkdir(directory,{ recursive:false });
const token = randomBytes(32).toString('hex'); // Ephemeral; never persisted or printed.
const early = args.includes('--early-no-tolls');
const local = await startLocal({ directory,port:0,token,policyReviewed:true,earlyNoTolls:early,quiet:true });
const observations = [], startedAt = Date.now();
const api = async (path,body) => {
  const response = await fetch(local.baseUrl + path,{ method:body===undefined?'GET':'POST',headers:{ Authorization:'Bearer '+token,'Content-Type':'application/json' },
    ...(body===undefined?{}:{body:JSON.stringify(body)}) });
  const value = await response.json(); if (!response.ok) throw new Error(JSON.stringify(value)); return value;
};
try {
  const geocoding = await api('/api/geocode?q='+encodeURIComponent('8 rue de Verdun Le Pin'));
  await writeFile(join(directory,'geocoding.json'),JSON.stringify(geocoding,null,2));
  const input = { origin:locations[0],destination:locations[1] };
  const launched = await api('/api/search',input), duplicate = await api('/api/search',input);
  assert.equal(duplicate.jobId,launched.jobId); assert.equal(duplicate.reused,true);
  let view;
  do {
    view = await api('/api/search/'+launched.jobId+'?result=0');
    observations.push({ observedAt:Date.now(),...view });
    console.log(corridor,view.status,view.progress.stage,view.progress.profilesExecuted,view.progress.uniqueGeometries,view.progress.analyzed);
    if (['completed','failed','cancelled'].includes(view.status)) break;
    if (Date.now()-startedAt>660000) throw new Error('Local live test deadline; inspect persisted state, no fake success.');
    await sleep(2000);
  } while (true);
  await writeFile(join(directory,'progress-observations.json'),JSON.stringify(observations));
  const final = await api('/api/search/'+launched.jobId);
  await writeFile(join(directory,'http-final.json'),JSON.stringify(final));
  assert.equal(final.status,'completed',JSON.stringify(final.error));
  const reloaded = await local.jobs.view(launched.jobId);
  await writeFile(join(directory,'result.json'),JSON.stringify(reloaded.result));
  const routes = final.result.routes;
  const geometry = await api(routes[0].geometryUrl); assert.equal(geometry.type,'LineString');
  const before = await readdir(join(directory,'network'));
  const warm = await api('/api/search',input); assert.equal(warm.jobId,launched.jobId); assert.equal(warm.status,'completed');
  const after = await readdir(join(directory,'network'));
  const added = await Promise.all(after.filter(n=>!before.includes(n)).map(async n=>JSON.parse(await readFile(join(directory,'network',n),'utf8'))));
  assert.equal(added.filter(n=>['route','trace_attributes'].includes(n.kind)).length,0);
  const entries = await Promise.all(after.map(async n=>JSON.parse(await readFile(join(directory,'network',n),'utf8'))));
  const valhalla = entries.filter(e=>e.kind!=='geocoding').sort((a,b)=>a.startedAt-b.startedAt);
  const gaps = valhalla.slice(1).map((e,i)=>e.startedAt-valhalla[i].endedAt);
  assert.ok(gaps.every(ms=>ms>=1990));
  const durationSeconds=(Date.now()-startedAt)/1000;
  const resultBytes=(await stat(join(directory,'result.json'))).size;
  const summary = { environment:'local HTTP runner + FileStore; NOT hosted Netlify',corridor,origin:input.origin,destination:input.destination,
    coordinateSource:corridor==='crans-le-pin'?'Initial archived Valhalla campaign commune centres':'Official commune centres from corridor validation archive',
    jobId:launched.jobId,earlyNoTolls:early,durationSeconds,profiles:final.progress.profilesExecuted,uniqueGeometries:final.progress.uniqueGeometries,
    analyses:final.progress.analyzed,graph:final.graph,stopReason:reloaded.result.stopReason,pricingStatus:reloaded.result.pricingStatus,
    attempts:final.attempts,networkCounts:Object.fromEntries([...new Set(entries.map(e=>e.kind))].map(k=>[k,entries.filter(e=>e.kind===k).length])),
    failedNetworkRequests:entries.filter(e=>e.error!==null).length,minGapAfterPreviousResponseMs:Math.min(...gaps),
    resultBytes,geometryRetrieved:true,activeDedup:true,warmResultReused:true,additionalRouteOrTraceOnWarm:0,
    observedProfileCounts:[...new Set(observations.map(o=>o.progress.profilesExecuted))],
    illustrativeNetlifyComputeCreditsAt1GB:durationSeconds/3600*10,notABillingMeasurement:true,
    resultHash:hash(await readFile(join(directory,'result.json'),'utf8')) };
  await writeFile(join(directory,'summary.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2));
} finally { await local.close(); }
