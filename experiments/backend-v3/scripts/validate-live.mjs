/** Offline checks of saved REAL results, no new network. */
import { readFile, writeFile } from 'node:fs/promises';
import { FileStore } from '../src/store.mjs';
import { Jobs } from '../src/jobs.mjs';
import { nearDuplicate } from '../src/geometry.mjs';
import { hash } from '../src/util.mjs';
import assert from 'node:assert/strict';
const archived=JSON.parse(await readFile('../valhalla/evidence/2026-10-29/routes.geojson','utf8')).features;
const metrics=JSON.parse(await readFile('../valhalla/evidence/2026-10-29/comparison.json','utf8'));
const baseline=archived.map(f=>{const m=metrics.find(r=>r.id===f.properties.id);return {id:m.id,durationSeconds:m.minutes*60,distanceKm:m.km,geometry:f.geometry};});
const output=[];
for(const corridor of ['crans-le-pin','rennes-saint-brieuc']){
  const directory='evidence/live/'+corridor;
  const summary=JSON.parse(await readFile(directory+'/summary.json','utf8'));
  const store=new FileStore(directory+'/blobs');
  const record=await store.get('jobs/'+summary.jobId);
  // Freeze the offline audit clock at collection. Do not weaken production TTL
  // merely because an archived experiment is replayed more than 24h later.
  const jobs=new Jobs({store,provider:{id:'read-only-offline'},geocoder:null,now:()=>record.data.completedAt??record.data.updatedAt});
  const view=await jobs.view(summary.jobId);
  assert.equal(view.status,'completed');assert.equal(view.result.routes.length,summary.uniqueGeometries);
  assert.ok(view.result.routes.every(r=>r.pricingStatus==='not_computed'&&r.tollExposure!==null));
  const comparisons=[];
  if(corridor==='crans-le-pin')for(const r of view.result.routes){
    const geometry=r.geometry??await jobs.geometry(summary.jobId,r.id);
    let match=baseline.find(b=>hash(b.geometry)===hash(geometry)),type='exact_geometry';
    if(!match){match=baseline.find(b=>nearDuplicate({...r,geometry},b));type='historical_near_dedup_threshold';}
    comparisons.push({id:r.id,archiveId:match?.id??null,match:type,durationSeconds:r.durationSeconds,distanceKm:r.distanceKm,tollKm:r.tollExposure.tollKm,
      durationDifferenceSeconds:match?r.durationSeconds-match.durationSeconds:null});
  }
  let compact=null;
  if(corridor==='crans-le-pin'){
    const warm=JSON.parse(await readFile(directory+'/warm-summary.json','utf8'));
    const warmRecord=await store.get('jobs/'+warm.jobId);
    const warmJobs=new Jobs({store,provider:{id:'read-only-offline'},geocoder:null,now:()=>warmRecord.data.completedAt});
    const warmView=await warmJobs.view(warm.jobId);
    assert.equal(warmView.status,'completed');assert.equal(warmView.result.routes.length,28);
    for(const route of warmView.result.routes)assert.equal((await warmJobs.geometry(warm.jobId,route.id)).type,'LineString');
    compact={offlineJobReloaded:true,all28GeometryReferencesResolved:true,jobId:warm.jobId};
  }
  output.push({corridor,offlineJobReloaded:true,pricing:'not_computed',allAnalyzed:true,comparison:comparisons,compact,
    archiveComparisonApplicable:corridor==='crans-le-pin',
    uniqueArchivedIdsMatched:corridor==='crans-le-pin'?new Set(comparisons.map(r=>r.archiveId).filter(Boolean)).size:null});
}
await writeFile('evidence/live-validation.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
