"""Build an auditable comparison from archived REAL Valhalla responses; no network."""
import argparse
from collections import Counter
import html
import json
from pathlib import Path
import re
from poc import decode, distance


def axes_for(edges):
    totals = Counter()
    for edge in edges:
        refs = {re.sub(r'\s+', '', name).upper() for name in edge.get('names', [])
                if re.fullmatch(r'[AND]\s*\d+[a-zA-Z]?',name)}
        for name in refs:
            totals[name] += edge['length']
    return [(name,round(km,1)) for name,km in totals.most_common() if km>=2]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run',type=Path)
    args=parser.parse_args()
    run=args.run
    results=json.loads((run/'results.json').read_text())
    traces=sorted(run.glob('*-trace_attributes.response.json'))
    route_files=sorted(run.glob('*-route.response.json'))
    shapes={}
    for file in route_files:
        data=json.loads(file.read_text())
        for trip in [data['trip']]+[a['trip'] for a in data.get('alternates',[])]:
            leg=trip['legs'][0]
            shapes[leg['shape']]=dict(maneuvers=leg.get('maneuvers',[]),summary=trip['summary'])
    shapes={json.dumps(decode(shape)):info for shape,info in shapes.items()}
    rows=[]
    fastest=min(g['seconds'] for g in results['routes'])
    for index,g in enumerate(results['routes']):
        a=g.get('analysis')
        if a is None:
            continue
        trace=json.loads(traces[index].read_text())
        axes=axes_for(trace['edges'])
        points=g['points']
        nearest=min(points,key=lambda p:distance(p,[3.908,47.49]))
        patterns=[]
        for i,r in enumerate(a['runs']):
            if not r['toll'] and r['km']>=2 and 0<i<len(a['runs'])-1:
                patterns.append(dict(free_km=r['km'],exit=r['start'],reentry=r['end'],
                     exit_avallon_km=distance(r['start'],[3.908,47.49]),
                     before_axes=a['runs'][i-1]['axes'],free_axes=r['axes'],after_axes=a['runs'][i+1]['axes']))
        # Include final exit as well: a hybrid need not re-enter a toll motorway.
        exits=[]
        for i,r in enumerate(a['runs']):
            if i and not r['toll'] and r['km']>=2:
                exits.append(dict(at=r['start'],free_km=r['km'],avallon_km=distance(r['start'],[3.908,47.49]),
                                  before_axes=a['runs'][i-1]['axes'],after_axes=r['axes']))
        row=dict(id=g['id'],minutes=g['seconds']/60,km=g['km'],extra_minutes=(g['seconds']-fastest)/60,
                 toll_km=a['toll_km'],toll_percent=a['toll_percent'],axes=axes,patterns=patterns,exits=exits,
                 nearest_avallon=nearest,avallon_km=a['avallon_nearest_km'],profiles=g['produced_by'],points=points)
        details=shapes.get(json.dumps(points),{})
        row['waypoints']=[dict(km=0,coordinate=points[0])]
        cumulative=0
        next_mark=50
        for p1,p2 in zip(points,points[1:]):
            cumulative+=distance(p1,p2)
            if cumulative>=next_mark:
                row['waypoints'].append(dict(km=round(cumulative,1),coordinate=p2))
                next_mark+=50
        row['waypoints'].append(dict(km=round(cumulative,1),coordinate=points[-1]))
        row['exit_maneuvers']=[dict(instruction=m.get('instruction'),at=points[m['begin_shape_index']],sign=m.get('sign'),avallon_km=distance(points[m['begin_shape_index']],[3.908,47.49])) for m in details.get('maneuvers',[]) if m.get('type') in [19,20,21]]
        for pattern in row['patterns']:
            pattern['has_national_or_departmental_ref']=any(re.fullmatch(r'[ND]\s*\d+[a-zA-Z]?',n) for n in pattern['free_axes'])
            pattern['nearby_exit_instructions']=[m for m in row['exit_maneuvers'] if distance(m['at'],pattern['exit'])<2]
        row['pareto']=not any(h['seconds']<=g['seconds'] and h['analysis']['toll_km']<=a['toll_km']
                             and (h['seconds']<g['seconds'] or h['analysis']['toll_km']<a['toll_km'])
                             for h in results['routes'] if 'analysis' in h)
        rows.append(row)
    (run/'comparison.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
    lines=['# Comparaison réelle : Crans → Le Pin','',
           'Données © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL](https://opendatacommons.org/licenses/odbl/index.html). Calculs Valhalla / FOSSGIS. [Signaler une erreur cartographique](https://www.openstreetmap.org/fixthemap).','',
           'Durées sans trafic temps réel garanti ; km péage selon le marquage OSM, pas selon une grille tarifaire. Écart au plus rapide observé.', '',
           '|ID|Durée min|km|km péage|% péage|+min|Pareto temps/km péage|Axes principaux|',
           '|---|---:|---:|---:|---:|---:|---|---|']
    for r in sorted(rows,key=lambda r:r['minutes']):
        lines.append(f"|{r['id']}|{r['minutes']:.1f}|{r['km']:.1f}|{r['toll_km']:.1f}|{r['toll_percent']:.1f}|{r['extra_minutes']:.1f}|{'oui' if r['pareto'] else 'non'}|"+', '.join(f'{n} ({km} km)' for n,km in r['axes'][:9])+'|')
    lines += ['', '## Paramètres et passages par itinéraire', '',
              'u = use_tolls ; p = toll_booth_penalty (s). use_highways=0,5 ; toll_booth_cost=15 s. alt=0 principal, 1/2 alternatives. Tous les couples réellement producteurs sont conservés ci-dessous et dans comparison.json.']
    for r in rows:
        lines += ['',f"### {r['id']}",'',
                  'Profils : '+ '; '.join(f"u={p['parameters']['use_tolls']}, p={p['parameters']['toll_booth_penalty']}, alt={p['alternate']}"+(' exclusion péage' if p['parameters'].get('exclude_tolls') else '') for p in r['profiles']),
                  'Points de passage géométriques réels (km cumulés approximatifs ; lon, lat) : '+ '; '.join(f"{p['km']} km : {p['coordinate']}" for p in r['waypoints']),
                  f"Point le plus proche du centre indicatif d'Avallon : {r['nearest_avallon']} (lon, lat), à {r['avallon_km']:.1f} km.",
                  'Axes : '+', '.join(f'{n} ({km} km)' for n,km in r['axes']),
                  f"Portions gratuites ≥2km entre deux portions payantes : {len(r['patterns'])}."]
        for m in r['exit_maneuvers']:
            if m['avallon_km']<60:
                lines += [f"- Instruction Valhalla : **{m['instruction']}**, à {m['at']} (lon, lat), {m['avallon_km']:.1f} km d'Avallon ; signalisation {m['sign']}."]
        for e in r['exits']:
            lines += [f"- Sortie du marquage péage à {e['at']} (lon, lat), à {e['avallon_km']:.1f} km d'Avallon ; portion gratuite {e['free_km']:.1f} km ; avant : {', '.join(e['before_axes'])} ; après : {', '.join(e['after_axes'])}."]
        for p in r['patterns']:
            lines += [f"- Reprise du marquage péage à {p['reentry']} après {p['free_km']:.1f} km gratuits. Référence N/D dans la portion : {p['has_national_or_departmental_ref']}. Instructions de sortie proches : {[m['instruction'] for m in p['nearby_exit_instructions']]}."]
    (run/'COMPARISON.md').write_text('\n'.join(lines)+'\n')
    # A standalone interactive geometry/metrics view, without external tiles or APIs.
    data=json.dumps(rows,ensure_ascii=False).replace('</','<\\/')
    document=r'''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Expérience réelle Valhalla</title><style>body{font:15px system-ui;background:#f7f8f3;color:#234536;max-width:1200px;margin:auto;padding:24px}select{padding:10px;max-width:100%}svg{background:white;border:1px solid #ddd;max-width:100%;height:auto}main{display:flex;gap:20px;flex-wrap:wrap}pre{white-space:pre-wrap}a{color:#286b54}</style><h1>Crans → Le Pin : itinéraires réels Valhalla</h1><p>Géométries réelles, sans fond cartographique. Coût en kilomètres marqués à péage, aucun prix calculé.</p><select id="routes"></select><p id="metrics"></p><main><svg id="map" viewBox="0 0 520 650" width="520" height="650" role="img" aria-label="Tracés réels des itinéraires"></svg><div><h2>Axes principaux</h2><pre id="axes"></pre><h2>Transitions péage</h2><pre id="transitions"></pre></div></main><p>Données © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> (<a href="https://opendatacommons.org/licenses/odbl/index.html">ODbL</a>), calcul Valhalla/FOSSGIS. <a href="https://www.openstreetmap.org/fixthemap">Signaler une erreur</a>.</p><script>const rows=DATA;const ns='http://www.w3.org/2000/svg';const select=document.querySelector('#routes');for(const r of rows){const o=document.createElement('option');o.value=r.id;o.textContent=r.id+' · '+r.minutes.toFixed(0)+' min · '+r.toll_km.toFixed(1)+' km péage'+(r.pareto?' · Pareto':'');select.append(o)}function path(r){return r.points.map((p,i)=>(i?'L':'M')+((p[0]-2.3)*165+15).toFixed(1)+','+(620-(p[1]-45.85)*190).toFixed(1)).join(' ')}function show(){const r=rows.find(x=>x.id===select.value);const map=document.querySelector('#map');map.replaceChildren();for(const g of rows){const p=document.createElementNS(ns,'path');p.setAttribute('d',path(g));p.setAttribute('fill','none');p.setAttribute('stroke',g.id===r.id?'#207250':'#c7d0ca');p.setAttribute('stroke-width',g.id===r.id?'3':'1');map.append(p)}const av=document.createElementNS(ns,'circle');av.setAttribute('cx',(3.908-2.3)*165+15);av.setAttribute('cy',620-(47.49-45.85)*190);av.setAttribute('r',5);av.setAttribute('fill','#c77129');map.append(av);document.querySelector('#metrics').textContent=r.minutes.toFixed(1)+' min · '+r.km.toFixed(1)+' km · '+r.toll_km.toFixed(1)+' km marqués péage ('+r.toll_percent.toFixed(1)+' %) · +'+r.extra_minutes.toFixed(1)+' min ; point orange = Avallon';document.querySelector('#axes').textContent=r.axes.map(a=>a[0]+': '+a[1]+' km').join('\n');document.querySelector('#transitions').textContent=r.exits.map(e=>'Sortie '+JSON.stringify(e.at)+' · '+e.free_km.toFixed(1)+' km gratuits · '+e.avallon_km.toFixed(1)+' km d’Avallon').join('\n')}select.onchange=show;show();</script></html>'''.replace('DATA',data)
    (run/'comparison.html').write_text(document)
    print(f'Wrote comparison for {len(rows)} routes ({sum(r["pareto"] for r in rows)} Pareto)')


if __name__=='__main__':main()
