"""Export the reviewed POC facts and exact geometries, never fabricated values.
Run from repository root. Offline, stdlib only. Outputs are checked into Git.
"""
import hashlib
import json
import sys
import tarfile
from pathlib import Path

root=Path(__file__).resolve().parent.parent
paths={
 'pricing':root/'data/audited-pricing.json',
 'routes':root/'experiments/valhalla/evidence/2026-10-29/comparison.json',
 'geometries':root/'experiments/valhalla/evidence/2026-10-29/routes.geojson',
}
prices=json.loads(paths['pricing'].read_text())
routes={r['id']:r for r in json.loads(paths['routes'].read_text())}
features={r['properties']['id']:r for r in json.loads(paths['geometries'].read_text())['features']}
sys.path.insert(0, str(root/'experiments/valhalla'))
from poc import decode, analyse_edges
# Match each retained strict trace to the EXACT archived geometry. Maneuvers
# and prices are not temporal evidence, including when a tariff is zero.
ids_by_geometry={tuple(map(tuple, f['geometry']['coordinates'])):id for id,f in features.items()}
metrics={}
with tarfile.open(root/'experiments/valhalla/evidence/2026-10-29/raw-responses.tar.gz') as archive:
 for member in archive.getmembers():
  if not member.name.endswith('-trace_attributes.response.json'):continue
  trace=json.load(archive.extractfile(member))
  points=decode(trace['shape']);id=ids_by_geometry.get(tuple(map(tuple,points)))
  if id is None:continue
  analysis=analyse_edges(trace,dict(km=routes[id]['km'],points=points))
  edges=trace['edges'];end=0;continuous=True
  for edge in edges:
   continuous=continuous and edge['begin_shape_index']==end
   end=edge['end_shape_index']
  free=continuous and end==len(points)-1 and all(e['toll'] is False for e in edges)
  metrics[id]=dict(tollDistanceKm=analysis['toll_km'],tollDurationSeconds=0 if free else None,
    tollDurationRatio=0 if free else None,tollDurationTotalSeconds=features[id]['properties']['seconds'] if free else None,
    tollDurationSource='verified_no_toll' if free else None,tollDurationReason=None if free else 'TIMING_UNAVAILABLE')
assert len(metrics)==28
assert {r['id'] for r in prices}==set(routes)==set(features) and len(prices)==28
summary=[]
for price in prices:
 id=price['id'];r=routes[id];feature=features[id]
 assert (price['tollCents'] is None)==(price['pricing']['status']=='partial')
 if price['tollCents'] is not None:
  assert not price['pricing']['uncertainties']
  assert price['tollCents']==sum(s['cents'] for s in price['pricing']['sections'])
 summary.append(dict(id=id,durationMinutes=r['minutes'],distanceKm=r['km'],tollCents=price['tollCents'],
    description='Itinéraire réel Valhalla archivé le 29 octobre 2026.',
    roadSummary=' · '.join(name for name,km in r['axes'][:6]),
    pricing=price['pricing'],**metrics[id]))
 (root/f'public/data/routes/{id}.geojson').write_text(json.dumps(feature,separators=(',',':'))+'\n')
(root/'src/data/archive.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
complete=sum(p['pricing']['status']=='complete' for p in prices)
partial=len(prices)-complete
manifest=dict(snapshot='2026-10-29',tariffsEffective='2026-02-01',vehicleClass=1,complete=complete,partial=partial,
    inputSha256={k:hashlib.sha256(p.read_bytes()).hexdigest() for k,p in paths.items()},
    geometrySha256={id:hashlib.sha256((root/f'public/data/routes/{id}.geojson').read_bytes()).hexdigest() for id in features})
(root/'public/data/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Exported {len(prices)} source-preserving routes: {complete} complete, {partial} partial; no routing API.')
