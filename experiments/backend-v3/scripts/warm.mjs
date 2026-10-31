/** Re-open the REAL local persisted job, then reuse its raw network cache in a new
 * job with a different display-time filter. No second cold Valhalla campaign.
 */
import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { startLocal } from '../src/local-server.mjs';
import { sleep } from '../src/util.mjs';
const directory=resolve('evidence/live/crans-le-pin');
if(!process.argv.includes('--live')||!process.argv.includes('--policy-reviewed'))throw new Error('Requires --live --policy-reviewed; status checks only expected.');
const summary=JSON.parse(await readFile(join(directory,'summary.json'),'utf8'));
const initial=await readdir(join(directory,'network'));
const token=randomBytes(32).toString('hex');
const local=await startLocal({directory,port:0,token,policyReviewed:true,quiet:true});
const request=async(path,body)=>{
  const r=await fetch(local.baseUrl+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;
};
const startedAt=Date.now();
try{
  assert.equal((await request('/api/search/'+summary.jobId)).status,'completed');
  const created=await request('/api/search',{origin:summary.origin,destination:summary.destination,parameters:{maxExtraMinutes:30}});
  let view;
  do{view=await request('/api/search/'+created.jobId+'?result=0');if(['completed','failed','cancelled'].includes(view.status))break;await sleep(1000);}while(Date.now()-startedAt<120000);
  assert.equal(view.status,'completed',JSON.stringify(view.error));
  const final=await request('/api/search/'+created.jobId);
  const result=await local.jobs.view(created.jobId),job=await local.jobs.read(created.jobId);
  assert.ok(job.checkpoint.routes.every(r=>!r.geometry&&!r.shape&&r.geometryKey));
  for(const route of final.result.routes)assert.equal((await request(route.geometryUrl)).type,'LineString');
  const files=await readdir(join(directory,'network'));
  const extra=await Promise.all(files.filter(f=>!initial.includes(f)).map(async f=>JSON.parse(await readFile(join(directory,'network',f),'utf8'))));
  assert.equal(extra.filter(e=>['route','trace_attributes'].includes(e.kind)).length,0);
  const warm={mode:'real cached responses + live status validation, local HTTP/FileStore only',jobId:created.jobId,
    originalJobReloaded:true,profiles:final.progress.profilesExecuted,geometries:final.progress.uniqueGeometries,analyses:final.progress.analyzed,
    allGeometriesRetrieved:true,newRouteCalls:0,newTraceCalls:0,newStatusCalls:extra.filter(e=>e.kind==='status').length,
    durationSeconds:(Date.now()-startedAt)/1000,jobBytes:Buffer.byteLength(JSON.stringify(job)),resultMetadataBytes:Buffer.byteLength(JSON.stringify(result.result)),
    geometryStorage:'separate blobs, referenced in checkpoints and result',storageRevision:'compact-geometry-references'};
  await writeFile(join(directory,'compact-result.json'),JSON.stringify(result.result));
  await writeFile(join(directory,'warm-summary.json'),JSON.stringify(warm,null,2));console.log(JSON.stringify(warm,null,2));
}finally{await local.close();}
