"""Replay REAL archived responses. Selection rules never receive prices/Pareto IDs.
Run: python -m experiments.valhalla.budget.study
"""
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
import tarfile
from experiments.valhalla.poc import decode, corridor, near_duplicate

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
EVIDENCE = ROOT.parent/'evidence/2026-10-29'
PENALTIES = [0, 300, 900, 1800]


def key(parameters):
    return json.dumps(parameters, sort_keys=True)


def load():
    comparison = json.loads((EVIDENCE/'comparison.json').read_text())
    geometry = {f['properties']['id']: f['geometry']['coordinates'] for f in json.loads((EVIDENCE/'routes.geojson').read_text())['features']}
    provenance = {}
    for r in comparison:
        for p in r['profiles']:
            k = (key(p['parameters']), p['alternate'])
            if k in provenance: raise ValueError('Ambiguous candidate provenance')
            provenance[k] = r['id']
    profiles = []; consumed = set(); checked_shapes = {}; representatives = {}
    with tarfile.open(EVIDENCE/'raw-responses.tar.gz') as archive:
        requests = sorted(m.name for m in archive.getmembers() if m.name.startswith('sweep-live/') and m.name.endswith('-route.request.json'))
        for index, name in enumerate(requests, 1):
            request = json.load(archive.extractfile(name)); payload = request['payload']
            response = json.load(archive.extractfile(name.replace('.request.', '.response.')))
            parameters = payload['costing_options']['auto']
            ids = []; exact = []
            for alt, trip in enumerate([response['trip']]+[r['trip'] for r in response.get('alternates', [])]):
                assert trip['status'] == 0 and trip['units'] == 'kilometers' and len(trip['legs']) == 1
                k = (key(parameters), alt); rid = provenance[k]; consumed.add(k)
                shape = trip['legs'][0]['shape']; exact.append(hashlib.sha256(shape.encode()).hexdigest())
                if (shape, rid) not in checked_shapes:
                    points = decode(shape)
                    if points != geometry[rid]:
                        ref = next(r for r in comparison if r['id'] == rid)
                        if rid not in representatives:
                            representatives[rid] = dict(seconds=ref['minutes']*60, km=ref['km'], _corridor=corridor(geometry[rid]))
                        candidate = dict(seconds=trip['summary']['time'], km=trip['summary']['length'], _corridor=corridor(points))
                        if not near_duplicate(representatives[rid], candidate): raise ValueError('Archive grouping not reproducible')
                    checked_shapes[shape, rid] = True
                ids.append(rid)
            profiles.append(dict(id=f'P{index:03d}', parameters=parameters, routes=ids,
                                 exact_shape_hashes=exact, archive_request=name,
                                 alternates_requested=payload['alternates']))
    assert len(profiles) == 105 and len(consumed) == 309 and consumed == set(provenance)
    prices = {r['id']: r for r in json.loads((REPO/'src/data/archive.json').read_text())}
    return profiles, comparison, prices


def union(profiles):
    return set(r for p in profiles for r in p['routes'])


def farthest(profiles, n):
    """Nested parameter-only maximin design, Euclidean normalized u and penalty.
    Reserve one explicit exclude_tolls probe; start in the low-toll corner.
    No observation or route identity is inspected by this fixed design.
    """
    exclude = next(p for p in profiles if p['parameters'].get('exclude_tolls'))
    pool = [p for p in profiles if p != exclude]
    selected = [min(pool, key=lambda p: (p['parameters']['use_tolls'], p['parameters']['toll_booth_penalty']))]
    def distance(a, b):
        a, b = a['parameters'], b['parameters']
        return (a['use_tolls']-b['use_tolls'])**2 + ((a['toll_booth_penalty']-b['toll_booth_penalty'])/1800)**2
    while len(selected) < n-1:
        selected.append(max((p for p in pool if p not in selected),
                            key=lambda p: (min(distance(p, q) for q in selected), -int(p['id'][1:]))))
    return [exclude]+selected


def grid(profiles, levels, penalties):
    return [p for p in profiles if p['parameters'].get('exclude_tolls') or
            (p['parameters']['use_tolls'] in levels and p['parameters']['toll_booth_penalty'] in penalties)]


def adaptive(profiles, budget=40, patience=None):
    """Replay-only midpoint refinement on ALL four penalty lines.
    Seeds: exclude + endpoints u=0/1 for each penalty (9 calls).
    Favor widest intervals with differing observed geometry sets; split flat
    intervals too when needed. Midpoint is the middle ARCHIVED grid index,
    not an invented continuous query. Stop at budget or patience duplicates,
    after at least 12 calls. Never sees unseen responses or tariff information.
    """
    pool = {p['id']: p for p in profiles}
    domain = {v: sorted((p['parameters']['use_tolls'], p['id']) for p in profiles
                       if not p['parameters'].get('exclude_tolls') and p['parameters']['toll_booth_penalty'] == v) for v in PENALTIES}
    exclude = next(p['id'] for p in profiles if p['parameters'].get('exclude_tolls'))
    order = [exclude]+[pid for v in PENALTIES for u, pid in [domain[v][0], domain[v][-1]]]
    observed = {}; seen = set(); log = []; stale = 0
    def query(pid, reason):
        nonlocal seen, stale
        result = set(pool[pid]['routes'])  # Only observation boundary.
        novel = result-seen; seen |= result; observed[pid] = result
        stale = 0 if novel else stale+1
        log.append(dict(profile=pid, reason=reason, new_routes=sorted(novel), consecutive_duplicates=stale))
    for pid in order[:budget]: query(pid, 'seed')
    while len(log) < budget:
        if patience is not None and len(log) >= 12 and stale >= patience: break
        intervals = []
        for v, line in domain.items():
            sampled = [i for i, (u, pid) in enumerate(line) if pid in observed]
            for lo, hi in zip(sampled, sampled[1:]):
                if hi-lo <= 1: continue
                left, right = observed[line[lo][1]], observed[line[hi][1]]
                differs = left != right
                width = line[hi][0]-line[lo][0]
                mid = (lo+hi)//2
                intervals.append(((differs, width, -v, -lo), line[mid][1], f'midpoint penalty={v}, u=[{line[lo][0]},{line[hi][0]}], endpoints_differ={differs}'))
        if not intervals: break
        _, pid, reason = max(intervals)
        query(pid, reason)
    return [pool[r['profile']] for r in log], log


def frontier(rows):
    complete = [r for r in rows if r['tollCents'] is not None and r['pricing']['status'] == 'complete']
    return sorted((r['id'] for r in complete if not any(
        b['durationMinutes'] <= r['durationMinutes'] and b['tollCents'] <= r['tollCents'] and
        (b['durationMinutes'] < r['durationMinutes'] or b['tollCents'] < r['tollCents']) for b in complete)),
        key=lambda rid: next(r['durationMinutes'] for r in complete if r['id'] == rid))


def evaluate(name, selected, comparison, prices):
    ids = union(selected); baseline = frontier(list(prices.values())); found = [r for r in baseline if r in ids]
    routes = [r for r in comparison if r['id'] in ids]
    complete = [prices[r] for r in ids if prices[r]['tollCents'] is not None]
    # Dominance is evaluated AFTER discovery against full known baseline, never
    # used to pick profiles. Unknown totals are excluded, never optimistic zero.
    return dict(strategy=name, profiles=len(selected), profile_ids=[p['id'] for p in selected],
                candidates=sum(len(p['routes']) for p in selected), unique_routes=len(ids), route_ids=sorted(ids),
                variants_percent=100*len(ids)/len(comparison), pareto_found=found,
                pareto_lost=[r for r in baseline if r not in ids], pareto_percent=100*len(found)/len(baseline),
                duration_range_minutes=[min(r['minutes'] for r in routes), max(r['minutes'] for r in routes)],
                toll_km_range=[min(r['toll_km'] for r in routes), max(r['toll_km'] for r in routes)],
                known_euro_range=[min(r['tollCents'] for r in complete)/100, max(r['tollCents'] for r in complete)/100],
                partial_routes=sorted(r for r in ids if prices[r]['tollCents'] is None),
                route_calls=len(selected), trace_calls_deduplicated=len(ids), total_calls=len(selected)+len(ids),
                naive_trace_calls=sum(len(p['routes']) for p in selected),
                exact_geometry_trace_calls=len(set(h for p in selected for h in p['exact_shape_hashes'])))


def main():
    profiles, comparison, prices = load()
    baseline = frontier(list(prices.values()))
    seen = set(); occurrences = Counter(r for p in profiles for r in set(p['routes']))
    for p in profiles:
        ids = set(p['routes']); p['first_discoveries'] = sorted(ids-seen); seen |= ids
        p['exclusive_routes'] = sorted(r for r in ids if occurrences[r] == 1)
        p['pareto_routes'] = [r for r in baseline if r in ids]
    strategies = [evaluate('exhaustive', profiles, comparison, prices)]
    for n in [8, 12, 16, 20, 32, 48]:
        strategies.append(evaluate(f'maximin-{n}', farthest(profiles, n), comparison, prices))
    for levels, penalties in [([0,.25,.5,1],[0,900]), ([0,.25,.5,1],[0,900,1800]),
                              ([0,.25,.5,1],PENALTIES), ([0,.125,.25,.5,1],PENALTIES),
                              ([0,.125,.25,.375,.5,.6,.8,1],PENALTIES)]:
        s = grid(profiles, levels, penalties)
        strategies.append(evaluate(f'grid-{len(s)}', s, comparison, prices))
    # Parameter-only nested dyadic grids on [0,.5], plus upper anchor 1.
    # The half-range is a pre-existing costing/sweep design choice, not a list
    # of successful profiles. Exact integer distances make ties deterministic.
    available = sorted({p['parameters']['use_tolls'] for p in profiles if not p['parameters'].get('exclude_tolls')})
    for depth in [1,2,3,4,5]:
        ticks = 2**depth
        levels = {min(available, key=lambda u: (abs(round(u*1000)*2*ticks-i*1000), u)) for i in range(ticks+1)} | {1.0}
        selected = grid(profiles, levels, PENALTIES)
        strategies.append(evaluate(f'dyadic-{depth}', selected, comparison, prices))
    logs = {}
    for n in [8,12,16,20,30,32,40,60,105]:
        s, log = adaptive(profiles, n); name = f'adaptive-{n}'
        strategies.append(evaluate(name, s, comparison, prices)); logs[name] = log
    for patience in [4,8]:
        s, log = adaptive(profiles, 105, patience); name = f'adaptive-stop-{patience}'
        strategies.append(evaluate(name, s, comparison, prices)); logs[name] = log
    s, log = adaptive(profiles, 40, 8)
    name = 'adaptive-budget40-stop8'
    strategies.append(evaluate(name, s, comparison, prices)); logs[name] = log
    changes = []
    for v in PENALTIES:
        line = sorted((p for p in profiles if not p['parameters'].get('exclude_tolls') and p['parameters']['toll_booth_penalty']==v), key=lambda p:p['parameters']['use_tolls'])
        for a,b in zip(line,line[1:]):
            if set(a['routes']) != set(b['routes']):
                changes.append(dict(penalty=v, u_from=a['parameters']['use_tolls'],u_to=b['parameters']['use_tolls'],profiles=[a['id'],b['id']], from_routes=a['routes'],to_routes=b['routes']))
    penalty_effect = []
    for u in sorted(set(p['parameters']['use_tolls'] for p in profiles)):
        line = [p for p in profiles if not p['parameters'].get('exclude_tolls') and p['parameters']['use_tolls']==u]
        penalty_effect.append(dict(use_tolls=u, signatures=len({tuple(sorted(p['routes'])) for p in line}),routes_by_penalty={p['parameters']['toll_booth_penalty']:p['routes'] for p in line}))
    result = dict(baseline_pareto=baseline, new_valhalla_calls=0,
                  parameters={k:sorted({p['parameters'][k] for p in profiles}) for k in ['use_tolls','toll_booth_penalty','use_highways','toll_booth_cost']},
                  chronological_novel_profiles=sum(bool(p['first_discoveries']) for p in profiles),
                  duplicate_only_profiles=sum(not p['first_discoveries'] for p in profiles),
                  distinct_response_sets=len({tuple(sorted(set(p['routes']))) for p in profiles}),
                  exclusive_profiles=[p['id'] for p in profiles if p['exclusive_routes']],
                  primary_only_routes=sorted({p['routes'][0] for p in profiles}),
                  primary_only_pareto_lost=[r for r in baseline if r not in {p['routes'][0] for p in profiles}],
                  by_penalty={v: dict(routes=sorted(union([p for p in profiles if not p['parameters'].get('exclude_tolls') and p['parameters']['toll_booth_penalty']==v])), pareto=[r for r in baseline if r in union([p for p in profiles if not p['parameters'].get('exclude_tolls') and p['parameters']['toll_booth_penalty']==v])]) for v in PENALTIES},
                  transitions=changes, penalty_effect=penalty_effect, profiles=profiles, strategies=strategies, adaptive_logs=logs)
    out = ROOT/'results';out.mkdir(exist_ok=True)
    (out/'study.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    with (out/'profiles.csv').open('w') as f:
        w=csv.writer(f,lineterminator='\n');w.writerow(['profile','use_tolls','penalty','exclude_tolls','routes','first_discoveries','exclusive','pareto'])
        for p in profiles:w.writerow([p['id'],p['parameters']['use_tolls'],p['parameters']['toll_booth_penalty'],p['parameters'].get('exclude_tolls',False),','.join(p['routes']),','.join(p['first_discoveries']),','.join(p['exclusive_routes']),','.join(p['pareto_routes'])])
    lines=['# Résultats du rejeu des archives','', '|Stratégie|/route|Candidats|Variantes /28|Pareto /8|Perdus|/trace après dédup|Total|','|---|---:|---:|---:|---:|---|---:|---:|']
    for s in strategies:
        lines.append(f"|{s['strategy']}|{s['profiles']}|{s['candidates']}|{s['unique_routes']} ({s['variants_percent']:.1f} %)|{len(s['pareto_found'])} ({s['pareto_percent']:.1f} %)|{', '.join(s['pareto_lost']) or 'aucun'}|{s['trace_calls_deduplicated']}|{s['total_calls']}|")
    lines += ['', '## Plages réellement couvertes', '', '|Stratégie|Durée min|km marqués à péage|Prix complets connus €|','|---|---|---|---|']
    for s in strategies:lines.append(f"|{s['strategy']}|{s['duration_range_minutes']}|{s['toll_km_range']}|{s['known_euro_range']}|")
    (ROOT/'RESULTS.md').write_text('\n'.join(lines)+'\n')
    files=[EVIDENCE/x for x in ['raw-responses.tar.gz','comparison.json','routes.geojson']]+[REPO/'src/data/archive.json']
    (out/'input-hashes.json').write_text(json.dumps({str(p.relative_to(REPO)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files},indent=2)+'\n')
    print('Novel profiles:',result['chronological_novel_profiles'],'Duplicate-only:',result['duplicate_only_profiles'],'Response sets:',result['distinct_response_sets'])
    for s in strategies:print(s['strategy'],s['profiles'],s['unique_routes'],s['pareto_found'], 'lost',s['pareto_lost'], 'total',s['total_calls'])


if __name__=='__main__': main()
