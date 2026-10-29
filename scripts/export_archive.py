"""Export the reviewed POC facts and exact geometries, never fabricated values.
Run from repository root. Offline, stdlib only. Outputs are checked into Git.
"""
import hashlib
import json
from pathlib import Path

root=Path(__file__).resolve().parent.parent
paths={
 'pricing':root/'experiments/tolls/results/pricing.json',
 'routes':root/'experiments/valhalla/evidence/2026-10-29/comparison.json',
 'geometries':root/'experiments/valhalla/evidence/2026-10-29/routes.geojson',
}
prices=json.loads(paths['pricing'].read_text())['routes']
routes={r['id']:r for r in json.loads(paths['routes'].read_text())}
features={r['properties']['id']:r for r in json.loads(paths['geometries'].read_text())['features']}
assert {r['id'] for r in prices}==set(routes)==set(features) and len(prices)==28
summary=[]
for price in prices:
 id=price['id'];r=routes[id];feature=features[id]
 assert (price['total_cents'] is None)==(price['status']=='partial')
 summary.append(dict(id=id,durationMinutes=r['minutes'],distanceKm=r['km'],tollCents=price['total_cents'],
    description='Itinéraire réel Valhalla archivé le 29 octobre 2026.',
    roadSummary=' · '.join(name for name,km in r['axes'][:6]),
    pricing=dict(status=price['status'],knownSubtotalCents=price['known_aprr_cents'],
        sections=[dict(entry=s['entry'],exit=s['exit'],cents=s['cents'],pdfPage=s['pdf_page']) for s in price['known_sections']],
        uncertainties=[dict(operator=s['operator'],entry=s.get('entry'),exit=s.get('exit')) for s in price['unknown_sections']])))
 (root/f'public/data/routes/{id}.geojson').write_text(json.dumps(feature,separators=(',',':'))+'\n')
(root/'src/data/archive.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
manifest=dict(snapshot='2026-10-29',tariffsEffective='2026-02-01',vehicleClass=1,complete=21,partial=7,
    inputSha256={k:hashlib.sha256(p.read_bytes()).hexdigest() for k,p in paths.items()},
    geometrySha256={id:hashlib.sha256((root/f'public/data/routes/{id}.geojson').read_bytes()).hexdigest() for id in features})
(root/'public/data/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Exported 28 source-preserving routes: 21 complete, 7 partial; no routing API.')
