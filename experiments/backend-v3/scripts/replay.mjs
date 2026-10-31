/** OFFLINE replay of actual archived responses, no mocked geographic data or network. */
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { nextProfile } from '../src/strategy.mjs';
import { PROFILES } from '../src/strategy.mjs';
import { addTrips, publicRoutes } from '../src/geometry.mjs';
import { hash } from '../src/util.mjs';
import { canonical } from '../src/util.mjs';
const source = '../valhalla/evidence/2026-10-29/';
const python = `import tarfile,json
rows=[]
with tarfile.open('${source}raw-responses.tar.gz') as archive:
 for name in sorted(m.name for m in archive.getmembers() if m.name.startswith('sweep-live/') and m.name.endswith('-route.request.json')):
  rows.append(json.load(archive.extractfile(name.replace('.request.','.response.'))))
print(json.dumps(rows))`;
const extracted=spawnSync('python',['-c',python],{ encoding:'utf8',maxBuffer:100*1024*1024 });
if(extracted.status)throw new Error(extracted.stderr);
const responses=JSON.parse(extracted.stdout),groups=[],history=[]; let next;
assert.equal(responses.length,105);
while((next=nextProfile(history))){const ids=addTrips(groups,responses[next.index],next.index);history.push({profile:next.index,routes:ids});}
const comparison=JSON.parse(await readFile(source+'comparison.json','utf8'));
const idMap={};
for(const group of groups){
  const match=comparison.filter(r=>r.profiles.some(p=>group.producedBy.some(g=>canonical(p.parameters)===canonical(PROFILES[g.profile])&&p.alternate===g.alternate)));
  assert.equal(match.length,1);idMap[group.id]=match[0].id;
}
assert.equal(history.length,40);assert.equal(groups.length,28);
const fixture=JSON.parse(await readFile('test/fixtures/frozen-strategy.json','utf8'));
assert.deepEqual(history.map(h=>'P'+String(h.profile+1).padStart(3,'0')),fixture.expectedOrder);
const result={mode:'offline actual archived response replay, NOT new live calls',source:source+'raw-responses.tar.gz',
  archiveHash:hash(await readFile(source+'raw-responses.tar.gz')),profiles:history.length,uniqueGeometries:groups.length,
  order:history.map(h=>'P'+String(h.profile+1).padStart(3,'0')),discoveredArchivedIds:Object.values(idMap),
  candidates:publicRoutes(groups).reduce((n,g)=>n+g.producedBy.length,0)};
await mkdir('evidence',{recursive:true});await writeFile('evidence/replay.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
