"""Isolated Valhalla experiment. Python 3.10+, standard library only; no V1 imports."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import time
import urllib.parse
import urllib.request


def distance(a, b):
    """Great-circle distance, km. Coordinates are [longitude, latitude]."""
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371 * 2 * math.asin(min(1, math.sqrt(h)))


def decode(shape):
    values, i, position = [], 0, [0, 0]
    while i < len(shape):
        for axis in range(2):
            result = shift = 0
            while True:
                if i >= len(shape) or shift > 35:
                    raise ValueError('Invalid polyline6')
                byte = ord(shape[i])-63
                i += 1
                result |= (byte & 31) << shift
                shift += 5
                if byte < 32:
                    break
            position[axis] += ~(result >> 1) if result & 1 else result >> 1
        values.append([position[1]/1e6, position[0]/1e6])
    if len(values) < 2:
        raise ValueError('Empty geometry')
    return values


def corridor(points):
    """Approximate length-weighted corridor: sample segments <=100 m on a 0.002° grid.
    Not a proof of identical roads: raw geometries and group mappings remain saved.
    """
    cells = Counter()
    for a, b in zip(points, points[1:]):
        length = distance(a, b)
        n = max(1, math.ceil(length/.1))
        for i in range(n):
            t = (i+.5)/n
            cell = tuple(round((x+(y-x)*t)/.002) for x, y in zip(a,b))
            cells[cell] += length/n
    return cells


def near_duplicate(a, b):
    if abs(a['km']-b['km']) > .0025 * min(a['km'], b['km']):
        return False
    if abs(a['seconds']-b['seconds']) > .0025 * min(a['seconds'], b['seconds']):
        return False
    ca, cb = a['_corridor'], b['_corridor']
    common = sum(min(v, cb[k]) for k, v in ca.items())
    return common / max(sum(ca.values()),sum(cb.values()),1e-9) >= .999


def plan():
    # Dense sweep where the source changes weighting strongly (use_tolls <= 0.5),
    # plus positive preferences, and a separate penalty axis. No highway bias change.
    levels = [round(i/40,3) for i in range(21)] + [.6,.7,.8,.9,1.0]
    profiles = [dict(use_tolls=u, toll_booth_penalty=p, use_highways=.5,
                     toll_booth_cost=15) for p in [0,300,900,1800] for u in levels]
    profiles.append(dict(use_tolls=.5, toll_booth_penalty=0, use_highways=.5,
                         toll_booth_cost=15, exclude_tolls=True))
    return profiles


class Client:
    def __init__(self, output, delay):
        self.output, self.delay, self.last = output, delay, 0
        self.counts = Counter()

    def request(self, url, payload=None, kind='route'):
        time.sleep(max(0, self.delay-(time.monotonic()-self.last)))
        number = sum(self.counts.values())+1
        self.counts[kind] += 1
        stem = self.output / f'{number:04d}-{kind}'
        record = dict(url=url, payload=payload, kind=kind,
                      started=datetime.now(timezone.utc).isoformat())
        stem.with_suffix('.request.json').write_text(json.dumps(record, indent=2))
        data = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(url, data=data, headers={
            'Content-Type':'application/json', 'User-Agent':'RouteOptimizer-Research/0.1'})
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                raw = response.read()
            stem.with_suffix('.response.json').write_bytes(raw)
            result = json.loads(raw)
            if isinstance(result, dict) and 'error' in result:
                raise ValueError(str(result))
            return result
        except Exception as error:
            stem.with_suffix('.error.json').write_text(json.dumps({'error':str(error)}))
            raise
        finally:
            self.last = time.monotonic()


def commune(client, name, postcode):
    query = urllib.parse.urlencode(dict(nom=name, codePostal=postcode, fields='nom,centre,codesPostaux,code'))
    data = client.request('https://geo.api.gouv.fr/communes?'+query, kind='geocode')
    matches = [x for x in data if x['nom'].casefold()==name.casefold() and postcode in x['codesPostaux']]
    if len(matches) != 1:
        raise ValueError(f'Ambiguous geocoding: {name}: {data}')
    return matches[0]['centre']['coordinates']


def analyse_edges(data, route):
    if data.get('units') != 'kilometers':
        raise ValueError('Trace units not confirmed as kilometers')
    edges = data.get('edges', [])
    points = decode(data['shape'])
    if not edges:
        raise ValueError('No edges in trace_attributes')
    runs, axes = [], []
    for edge in edges:
        if type(edge.get('toll')) is not bool or not isinstance(edge.get('length'), (int,float)) or edge['length'] < 0:
            raise ValueError('Missing/invalid edge toll or length; never infer no toll')
        start, end = edge['begin_shape_index'], edge['end_shape_index']
        if not 0 <= start <= end < len(points):
            raise ValueError('Invalid edge shape indices')
        names = edge.get('names', [])
        for name in names:
            if name not in axes:
                axes.append(name)
        if not runs or runs[-1]['toll'] != edge['toll']:
            runs.append(dict(toll=edge['toll'], km=0, start=points[start], end=points[end], axes=[]))
        run = runs[-1]
        run['km'] += edge['length']
        run['end'] = points[end]
        run['axes'] = list(dict.fromkeys(run['axes']+names))
    total = sum(r['km'] for r in runs)
    if abs(total-route['km']) > max(.5, .03*route['km']):
        raise ValueError('Trace length differs >3% (or 500m) from requested route')
    if distance(points[0],route['points'][0]) > .2 or distance(points[-1],route['points'][-1]) > .2:
        raise ValueError('Trace endpoints differ >200m')
    toll = sum(r['km'] for r in runs if r['toll'])
    hybrids = [r for i,r in enumerate(runs) if not r['toll'] and r['km']>=2
               and i>0 and i<len(runs)-1]
    # Marked-toll transitions, NOT validated toll plazas or motorway interchanges.
    return dict(toll_km=toll, toll_percent=100*toll/total if total else None,
                runs=runs, hybrid_free_gaps=hybrids, axes=axes,
                avallon_nearest_km=min(distance(p,[3.908,47.49]) for p in route['points']))


def summarize(output, groups, counts, errors):
    fastest = min((g['seconds'] for g in groups),default=None)
    clean = [{k:v for k,v in g.items() if not k.startswith('_')} for g in groups]
    for g in clean:
        g['extra_minutes_vs_fastest_observed']=(g['seconds']-fastest)/60
    (output/'results.json').write_text(json.dumps(dict(counts=counts, routes=clean, errors=errors),indent=2,ensure_ascii=False))
    features = [dict(type='Feature',geometry=dict(type='LineString',coordinates=g['points']),
                     properties=dict(id=g['id'],seconds=g['seconds'],km=g['km'])) for g in groups]
    (output/'routes.geojson').write_text(json.dumps(dict(type='FeatureCollection',features=features)))
    lines = ['# Résultats réels de la campagne', '', f'Requêtes tentées : {dict(counts)}.', '',
             'Écart au plus rapide **observé**, pas garantie de minimum global. Péage = marquage OSM, pas prix.', '',
             '| ID | min | km | km péage | % péage | +min | gaps gratuits ≥2km | distance Avallon km |',
             '|---|---:|---:|---:|---:|---:|---:|---:|']
    for g in clean:
        a = g.get('analysis',{})
        lines.append(f"| {g['id']} | {g['seconds']/60:.1f} | {g['km']:.1f} | {a.get('toll_km','inconnu')} | {a.get('toll_percent','inconnu')} | {g['extra_minutes_vs_fastest_observed']:.1f} | {len(a['hybrid_free_gaps']) if a else 'inconnu'} | {a.get('avallon_nearest_km','inconnu')} |")
    lines += ['', 'Paramètres, axes, points et transitions : voir results.json. Géométries : routes.geojson.',
              'Une proximité à Avallon (<20 km, centre approximatif) ne prouve pas une sortie A6.',
              '', 'Erreurs :', *[f'- {e}' for e in errors]]
    (output/'REPORT.md').write_text('\n'.join(lines)+'\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--endpoint', help='Explicit Valhalla base URL, no default public service')
    parser.add_argument('--policy-reviewed', action='store_true', help='Confirm instance policy permits the campaign')
    parser.add_argument('--delay', type=float, default=5)
    parser.add_argument('--max-routes', type=int, default=1, help='Start with a single probe; full sweep = 105')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if not args.endpoint or not args.policy_reviewed or not args.output:
        parser.error('--endpoint, --policy-reviewed and a new --output directory are required')
    if args.delay<1 or not 1<=args.max_routes<=len(plan()):
        parser.error('delay >=1 second, max-routes between 1 and 105')
    args.output.mkdir(parents=True, exist_ok=False)
    client = Client(args.output,args.delay)
    groups, errors = [], []
    (args.output/'plan.json').write_text(json.dumps(plan(),indent=2))
    endpoint = args.endpoint.rstrip('/')
    try:
        client.request(endpoint+'/status',kind='status')
        origin = commune(client,'Crans','01320')
        destination = commune(client,'Le Pin','77181')
        (args.output/'locations.json').write_text(json.dumps(dict(origin=origin,destination=destination)))
        locations=[dict(lon=p[0],lat=p[1]) for p in [origin,destination]]
        for parameters in plan()[:args.max_routes]:
            payload=dict(locations=locations,costing='auto',costing_options={'auto':parameters},
                         units='kilometers',language='fr-FR',alternates=2,shape_format='polyline6')
            response=client.request(endpoint+'/route',payload)
            trips=[response['trip']]+[r['trip'] for r in response.get('alternates',[])]
            for alternate, trip in enumerate(trips):
                if trip.get('units') != 'kilometers':
                    raise ValueError('Route units not confirmed as kilometers')
                if trip.get('status') != 0 or len(trip['legs']) != 1:
                    raise ValueError('Unsuccessful route or unexpected multi-leg trip')
                leg=trip['legs'][0]
                points=decode(leg['shape'])
                candidate=dict(seconds=trip['summary']['time'],km=trip['summary']['length'],points=points)
                candidate['_corridor']=corridor(points)
                provenance=dict(parameters=parameters,alternate=alternate)
                existing=next((g for g in groups if near_duplicate(g,candidate)),None)
                if existing:
                    existing['produced_by'].append(provenance)
                    continue
                candidate.update(id=f'R{len(groups)+1}',produced_by=[provenance])
                groups.append(candidate)
                attrs=['shape','edge.toll','edge.length','edge.names','edge.begin_shape_index','edge.end_shape_index']
                trace=dict(encoded_polyline=leg['shape'],shape_match='edge_walk',costing='auto',
                           units='kilometers',filters=dict(action='include',attributes=attrs))
                try:
                    data=client.request(endpoint+'/trace_attributes',trace,kind='trace_attributes')
                    candidate['analysis']=analyse_edges(data,candidate)
                except Exception as error:
                    errors.append(f"{candidate['id']} toll analysis unavailable: {error}")
                    # Stop on service failure instead of flooding a denied or throttled endpoint.
                    raise
    except Exception as error:
        errors.append(str(error))
    finally:
        summarize(args.output,groups,client.counts,errors)
    return 1 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
