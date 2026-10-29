"""Recompute experimental quotes from unchanged archived geometries, OFFLINE.

Run from the repository root: python -m experiments.tolls.completion.run
This does not export src/data/archive.json or change the published app.
"""
from collections import Counter
from dataclasses import asdict
from datetime import date
import hashlib
import json
from pathlib import Path
import re
import tarfile

from experiments.tolls.pricing import nearest, pareto, load_tariffs
from experiments.valhalla.poc import decode
from .engine import (Confidence, ACCEPTED, Traversal, Vehicle, DatedMatrixProvider,
                     UnverifiedFreeFlowProvider, aggregate)

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
BASE = ROOT.parent
EVIDENCE = REPO / 'experiments/valhalla/evidence/2026-10-29'
ON = date(2026, 10, 29)
TARGETS = {'R7', 'R8', 'R13', 'R19', 'R20', 'R24', 'R26'}


def read(path):
    return json.loads(path.read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_inputs():
    for relative, expected in read(ROOT / 'sources/input-hashes.json').items():
        if digest(REPO / relative) != expected:
            raise ValueError(f'Input changed; new audit required: {relative}')
    for item in read(ROOT / 'sources/manifest.json'):
        p = ROOT / 'sources' / item['path']
        if item['path'].startswith('open/') or p.exists():
            if digest(p) != item['sha256']:
                raise ValueError(f'Source snapshot changed: {item["id"]}')
    cells = read(ROOT / 'sources/aprr-cells.json')
    pdf = BASE / 'sources/local/APRR-2026.pdf'
    if pdf.exists():
        if digest(pdf) != cells['pdf_sha256']:
            raise ValueError('APRR original PDF changed')
        extracted = load_tariffs(pdf)
        for cell in cells['records']:
            if extracted[(cell['entry'], cell['exit'])] != cell:
                raise ValueError('Cited APRR cell differs from original PDF')


def load_osm():
    """Public full-way snapshots retain topology, orientation and node tags."""
    nodes, ways = {}, {}
    for p in sorted((ROOT / 'sources/open').glob('*-full.json')):
        for obj in read(p)['elements']:
            (nodes if obj['type'] == 'node' else ways)[obj['id']] = obj
    return nodes, ways


def directed_passage(points, node, way, nodes, tolerance=12):
    """Require local geometry AND progression in a one-way OSM way's direction.

    Opposite A79 gantries can be only 10m apart: a radius alone double-charges.
    Consecutive way vertices around the node must match in increasing route
    order. Loops/repeated visits need a real directed map matcher; this audit
    only supports single crossings in the archived corridor.
    """
    if way.get('tags', {}).get('oneway') != 'yes' or node['id'] not in way['nodes']:
        return None
    d, index = nearest([node['lon'], node['lat']], points)
    if d > tolerance:
        return None
    i = way['nodes'].index(node['id'])
    ids = way['nodes'][max(0, i-1):min(len(way['nodes']), i+2)]
    matches = [nearest([nodes[n]['lon'], nodes[n]['lat']], points) for n in ids]
    if len(matches) < 2 or any(m[0] > tolerance for m in matches):
        return None
    if not all(b[1] > a[1] for a, b in zip(matches, matches[1:])):
        return None
    return {'node_id': node['id'], 'name': node.get('tags', {}).get('name'),
            'coordinate': [node['lon'], node['lat']], 'way_id': way['id'],
            'distance_m': d, 'shape_index': index, 'direction': 'OSM one-way order verified'}


def resolve_event(event, points, nodes, ways, registry):
    resolution = next((r for r in registry if r['osm_node'] in event['osm_node_ids']), None)
    if resolution is None or Confidence(resolution['confidence']) not in ACCEPTED:
        return None
    node = nodes[resolution['osm_node']]
    passages = [directed_passage(points, node, ways[w], nodes) for w in resolution['required_ways']]
    if any(p is None for p in passages):
        return None
    return {**resolution, 'passages': passages, 'previous_station': event['station']}


def a79_passages(points, nodes, ways):
    found = []
    for node in nodes.values():
        if node.get('tags', {}).get('highway') != 'toll_gantry':
            continue
        matches = [p for way in ways.values()
                   if (p := directed_passage(points, node, way, nodes)) is not None]
        if matches:
            found.append(min(matches, key=lambda p: p['distance_m']))
    return sorted(found, key=lambda p: p['shape_index'])


def archived_traces():
    with tarfile.open(EVIDENCE / 'raw-responses.tar.gz', 'r:gz') as archive:
        members = sorted((m for m in archive.getmembers()
                          if m.name.startswith('sweep-live/')
                          and m.name.endswith('-trace_attributes.response.json')), key=lambda m: m.name)
        if len(members) != 28:
            raise ValueError('Unexpected trace archive')
        return {f'R{i+1}': (m.name, json.load(archive.extractfile(m))) for i, m in enumerate(members)}


def a79_section(route, points, trace, nodes, ways):
    indexes = [i for i, edge in enumerate(trace['edges'])
               if any(re.sub(r'\s', '', n).upper() == 'A79' for n in edge.get('names', []))]
    if not indexes:
        return None
    # All six routes use a single contiguous A79 passage. Never silently merge
    # arbitrary future exits/re-entries into this corridor-only extraction.
    if indexes != list(range(indexes[0], indexes[-1]+1)):
        raise ValueError('Non-contiguous A79 traversal needs a new matcher')
    begin = trace['edges'][indexes[0]]['begin_shape_index']
    end = trace['edges'][indexes[-1]]['end_shape_index']
    exit_maneuvers = [m for m in route['exit_maneuvers']
                     if m['at'] == points[end]]
    if len(exit_maneuvers) != 1:
        raise ValueError('No unique archived A79 exit maneuver')
    passages = a79_passages(points, nodes, ways)
    if any(not begin <= p['shape_index'] <= end for p in passages):
        raise ValueError('Gantry outside identified A79 traversal')
    names = [p['name'] for p in passages]
    # A grouping candidate justified by the official 2022/2024 diagram. It is
    # recorded for audit, NEVER used to infer a 2026 monetary amount.
    groups = [name + ' Transit' for name in ['Molinet', 'Montbeugny']
              if all(name + ' ' + side in names for side in ['Est', 'Ouest'])]
    return {'entry_coordinate': points[begin], 'entry': 'Digoin, N79 → A79 (secteur échangeur 23)',
            'exit_coordinate': points[end], 'exit_instruction': exit_maneuvers[0],
            'a79_km_from_edges': sum(trace['edges'][i]['length'] for i in indexes),
            'begin_shape_index': begin, 'end_shape_index': end,
            'gantries': passages, 'reference_2024_groups_not_priced': groups,
            'match_confidence': Confidence.RELIABLE,
            'tariff_confidence': Confidence.UNKNOWN}


def score(row):
    # Exact formula in src/domain/optimization.ts. Kept here for an isolated
    # audit; a regression checks results against V2. No frontend data export.
    return row['saving_cents']/100 - .2*row['extra_minutes'] + 2*min(2, row['euros_saved_per_extra_minute'] or 0)


def recommendation(rows, max_extra):
    candidates = [r for r in rows if r['total_cents'] is not None
                  and r['pareto_complete_subset'] and r['extra_minutes'] <= max_extra
                  and r['saving_cents'] >= 0]
    return min(candidates, key=lambda r: (-score(r), r['minutes'], r['id']))['id'] if candidates else None


def calculate():
    verify_inputs()
    baseline = read(BASE / 'results/pricing.json')
    geometry = {f['properties']['id']: f['geometry']['coordinates']
                for f in read(EVIDENCE / 'routes.geojson')['features']}
    routes = {r['id']: r for r in read(EVIDENCE / 'comparison.json')}
    cells = read(ROOT / 'sources/aprr-cells.json')
    records = {(s['entry'], s['exit']): s for r in baseline['routes'] for s in r['known_sections']}
    records.update({(c['entry'], c['exit']): c for c in cells['records']})
    aprr = DatedMatrixProvider('APRR', list(records.values()), cells['effective_from'], cells['verified_through'])
    aliae = UnverifiedFreeFlowProvider()
    nodes, ways = load_osm()
    registry = read(ROOT / 'sources/station-resolutions.json')
    traces = archived_traces()
    result = []
    for old in baseline['routes']:
        rid = old['id']; points = geometry[rid]
        trace_name, trace = traces[rid]
        if decode(trace['shape']) != points:
            raise ValueError(f'Trace geometry differs: {rid}')
        quotes, resolutions = [], []
        for cell in old['known_sections']:
            t = Traversal('APRR', 'open' if cell['exit'] == 'Système Ouvert' else 'closed',
                          cell['entry'], cell['exit'], Confidence.RELIABLE,
                          ('Previous audited 2026 APRR POC; unchanged geometry/station events',))
            quotes.append(aprr.quote(t, Vehicle(), ON))
        a79 = a79_section(routes[rid], points, trace, nodes, ways)
        if a79:
            t = Traversal('ALIAE', 'free_flow', a79['entry'], a79['exit_instruction']['instruction'],
                          Confidence.RELIABLE, ('reglement.pdf pages 5, 6, 21', 'aliae-linked.pdf pages 1–2 (2024 only)'),
                          tuple(p['name'] for p in a79['gantries']))
            quotes.append(aliae.quote(t, Vehicle(), ON))
        for unresolved in old['unknown_sections']:
            if unresolved['operator'].startswith('ALIAE'):
                if a79 is None:
                    raise ValueError('Unknown ALIAE section without archived A79 geometry')
                continue
            entry, exit = unresolved.get('entry'), unresolved.get('exit')
            evidence = []
            for event in old['gate_events']:
                if event['station'] in [entry, exit]:
                    resolved = resolve_event(event, points, nodes, ways, registry)
                    if resolved:
                        if event['station'] == entry: entry = resolved['station']
                        if event['station'] == exit: exit = resolved['station']
                        evidence.extend(resolved['evidence'])
                        resolutions.append(resolved)
            confidence = Confidence.RELIABLE if evidence and entry and exit else Confidence.AMBIGUOUS
            t = Traversal('APRR', 'closed', entry or 'unknown', exit or 'unknown', confidence, tuple(evidence))
            quotes.append(aprr.quote(t, Vehicle(), ON))
        positions = {e['station']: e['index'] for e in old['gate_events']}
        for resolution in resolutions:
            positions[resolution['station']] = positions[resolution['previous_station']]
        def quote_start(q):
            return (a79['begin_shape_index'] if q.traversal.operator == 'ALIAE'
                    else positions.get(q.traversal.entry, float('inf')))
        quotes.sort(key=quote_start)
        row = {'id': rid, 'minutes': old['minutes'], 'km': routes[rid]['km'],
               'previous_total_cents': old['total_cents'],
               'known_aprr_cents': sum(q.cents for q in quotes if q.accepted and q.traversal.operator == 'APRR'),
               # Every old section is accounted for above; the source census
               # only establishes coverage for these 28 archived routes.
               **aggregate(quotes, coverage_complete=True),
               'sections': [dict(asdict(q), accepted=q.accepted,
                                 start_shape_index=quote_start(q)) for q in quotes],
               'station_resolutions': resolutions, 'a79': a79, 'trace_member': trace_name}
        result.append(row)
    frontier_ids = set(pareto(result))
    frontier = [r['id'] for r in sorted(result, key=lambda r: r['minutes']) if r['id'] in frontier_ids]
    fastest = min(result, key=lambda r: r['minutes'])
    if fastest['total_cents'] is None:
        raise ValueError('No priced fastest reference')
    for row in result:
        extra = row['minutes'] - fastest['minutes']
        saving = None if row['total_cents'] is None else fastest['total_cents'] - row['total_cents']
        row.update(extra_minutes=extra, saving_cents=saving,
                   euros_saved_per_extra_minute=None if saving is None or extra <= 0 else saving/100/extra,
                   pareto_complete_subset=row['id'] in frontier)
    return {'audit_date': ON.isoformat(), 'vehicle': asdict(Vehicle()),
            'stats': dict(Counter(r['status'] for r in result)),
            'resolved_targets': [r['id'] for r in result if r['id'] in TARGETS and r['total_cents'] is not None],
            'frontier_complete_subset': frontier,
            'recommendation': {f'max_extra_{m}': recommendation(result, m) for m in [20, 30, 45, 90, 180]},
            'routes': result}


def main():
    output = calculate()
    (ROOT / 'results').mkdir(exist_ok=True)
    (ROOT / 'results/pricing.json').write_text(json.dumps(output, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({k: v for k, v in output.items() if k != 'routes'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
