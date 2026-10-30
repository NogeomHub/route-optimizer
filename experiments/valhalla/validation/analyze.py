"""Offline evaluation of completed real campaigns. Never sends requests.
Exposure is OSM-marked toll kilometres, NOT euros or legal tariff coverage.
"""
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
import re
from .campaign import ROOT, REPO, CORRIDORS, read, save


def pareto(rows):
    return [r['id'] for r in sorted(rows,key=lambda r:(r['seconds'],r['analysis']['toll_km'],r['id']))
            if not any(b['seconds']<=r['seconds'] and b['analysis']['toll_km']<=r['analysis']['toll_km']
                       and (b['seconds']<r['seconds'] or b['analysis']['toll_km']<r['analysis']['toll_km']) for b in rows)]


def early_zero_exposure(seed_profiles, rows):
    """PROPOSAL evaluated only after frozen candidate/reference have completed.
    Require all nine seed response sets identical, non-empty, and every distinct
    seed geometry actually analyzed with exactly zero marked toll kilometres.
    Missing/partial trace is unknown, never zero. No city/id-specific condition.
    """
    if len(seed_profiles)!=9:return False
    sets=[set(p['routes']) for p in seed_profiles]
    if not sets[0] or any(s!=sets[0] for s in sets[1:]):return False
    by_id={r['id']:r for r in rows}
    return all(rid in by_id and by_id[rid].get('analysis',{}).get('toll_km')==0 for rid in sets[0])


def coverage(ids,rows,baseline):
    subset=[r for r in rows if r['id'] in ids]
    return dict(geometry_ids=sorted(ids),unique=len(ids),
                pareto_found=[r for r in baseline if r in ids],pareto_missed=[r for r in baseline if r not in ids],
                duration_minutes=[min(r['seconds'] for r in subset)/60,max(r['seconds'] for r in subset)/60],
                toll_km=[min(r['analysis']['toll_km'] for r in subset),max(r['analysis']['toll_km'] for r in subset)],
                distance_km=[min(r['km'] for r in subset),max(r['km'] for r in subset)])


def evaluate(name):
    out=ROOT/'evidence'/name
    if not (out/'complete.json').exists():raise ValueError('Incomplete campaign: '+name)
    adaptive=read(out/'adaptive.json');reference=read(out/'reference.json');rows=read(out/'analyzed.json')['groups']
    assert all('analysis' in r for r in rows)
    profiles=reference['profiles'];selected=adaptive['profile_ids'];baseline=pareto(rows)
    ids=set(r for p in selected for r in profiles[p]['routes']);all_ids={r['id'] for r in rows}
    primary_ids={p['routes'][0] for p in profiles.values()}
    seeds=[profiles[p] for p in selected[:9]]
    proposal=early_zero_exposure(seeds,rows)
    initial_ids=set(r for p in seeds for r in p['routes'])
    proposed_ids=initial_ids if proposal else ids
    proposed_calls=9 if proposal else len(selected)
    by_penalty={};transitions=[]
    for penalty in [0,300,900,1800]:
        line=sorted((p for p in profiles.values() if not p['parameters'].get('exclude_tolls') and p['parameters']['toll_booth_penalty']==penalty),key=lambda p:p['parameters']['use_tolls'])
        unique=set(r for p in line for r in p['routes'])
        by_penalty[penalty]=dict(unique=len(unique),pareto_found=[r for r in baseline if r in unique])
        for a,b in zip(line,line[1:]):
            if set(a['routes'])!=set(b['routes']):
                transitions.append(dict(penalty=penalty,u_from=a['parameters']['use_tolls'],u_to=b['parameters']['use_tolls'],profiles=[a['id'],b['id']],from_routes=a['routes'],to_routes=b['routes']))
    group_table=[]
    for row in rows:
        axes=sorted({n for n in row['analysis']['axes'] if re.fullmatch(r'[AND]\s*\d+[a-zA-Z]?',n)})
        group_table.append(dict(id=row['id'],minutes=row['seconds']/60,km=row['km'],toll_km=row['analysis']['toll_km'],toll_percent=row['analysis']['toll_percent'],
                                pareto=row['id'] in baseline,found_adaptive=row['id'] in ids,axes=axes,
                                hybrid_free_gaps=len(row['analysis']['hybrid_free_gaps']),marked_toll_runs=sum(r['toll'] for r in row['analysis']['runs']),produced_by=row['produced_by']))
    exact={p['shape_sha256'] for r in rows for p in r['produced_by']}
    result=dict(corridor=name,graph=read(out/'status.json'),locations=read(out/'locations.json'),
                adaptive=dict(route_calls=len(selected),candidates=sum(profiles[p]['candidates'] for p in selected),trace_calls=len(ids),total_calls=len(selected)+len(ids),profile_ids=selected,**coverage(ids,rows,baseline)),
                reference=dict(route_calls=len(profiles),candidates=sum(p['candidates'] for p in profiles.values()),trace_calls=len(rows),total_calls=len(profiles)+len(rows),**coverage(all_ids,rows,baseline)),
                missed_geometry_ids=sorted(all_ids-ids),exact_geometry_count=len(exact),near_duplicate_merges=len(exact)-len(rows),
                reference_pareto=baseline,primary_only_pareto_missed=[r for r in baseline if r not in primary_ids],primary_only_unique=len(primary_ids),
                by_penalty=by_penalty,transitions=transitions,proposed_early_stop=dict(triggered=proposal,route_calls=proposed_calls,trace_calls=len(proposed_ids),total_calls=proposed_calls+len(proposed_ids),**coverage(proposed_ids,rows,baseline)),
                groups=group_table,physical_route_calls=len(profiles),physical_trace_calls=len(rows))
    save(out/'evaluation.json',result)
    lines=[f'# {name} — données réelles', '', '**Exposition = km marqués à péage dans OSM, aucun montant en euros.**','',
           '|Recherche|/route|Candidats|Géométries|Pareto temps/exposition|Analyses uniques|Total hors statut/géocodage|',
           '|---|---:|---:|---:|---:|---:|---:|']
    for label,key in [('Candidate gelée','adaptive'),('Référence finie','reference'),('Proposition arrêt précoce, rejeu postérieur','proposed_early_stop')]:
        s=result[key];lines.append(f"|{label}|{s['route_calls']}|{s.get('candidates','—')}|{s['unique']}|{len(s['pareto_found'])}/{len(baseline)}|{s['trace_calls']}|{s['total_calls']}|")
    lines+=['','## Coordonnées officielles', '','Centres communaux, longitude puis latitude. Le snapping routier est conservé dans les réponses.','']
    for p in result['locations']['places']:lines.append(f"- {p['city']} ({p['code']}) : {p['response']['centre']['coordinates']} ; {p['source']}")
    lines+=['','## Variantes de référence', '', '|ID|Durée min|km|km marqués péage|%|Candidate|Pareto|Axes|', '|---|---:|---:|---:|---:|---|---|---|']
    for g in sorted(group_table,key=lambda r:r['minutes']):
        lines.append(f"|{g['id']}|{g['minutes']:.2f}|{g['km']:.3f}|{g['toll_km']:.3f}|{g['toll_percent']:.2f}|{'oui' if g['found_adaptive'] else 'non'}|{'oui' if g['pareto'] else 'non'}|{', '.join(g['axes'])}|")
    lines+=['','## Changements entre profils voisins','','|Pénalité|use_tolls de → vers|Profils|Routes avant → après|','|---:|---|---|---|']
    for t in transitions:lines.append(f"|{t['penalty']}|{t['u_from']} → {t['u_to']}|{' / '.join(t['profiles'])}|{', '.join(t['from_routes'])} → {', '.join(t['to_routes'])}|")
    lines+=['','Géométries, profils, alternatives, ordre et attributs : fichiers JSON voisins et archive réseau.','Données © OpenStreetMap contributors (ODbL), Valhalla/FOSSGIS. https://www.openstreetmap.org/fixthemap','']
    (out/'RESULTS.md').write_text('\n'.join(lines))
    return result


def main():
    results=[evaluate(n) for n,_,_ in CORRIDORS]
    save(ROOT/'evidence/evaluations.json',results)
    old=read(REPO/'experiments/valhalla/evidence/2026-10-29/comparison.json')
    budget=read(ROOT.parent/'budget/results/study.json')
    selected=next(s for s in budget['strategies'] if s['strategy']=='adaptive-budget40-stop8')
    oldrows=[dict(id=r['id'],seconds=r['minutes']*60,km=r['km'],analysis=dict(toll_km=r['toll_km'])) for r in old]
    oldfront=pareto(oldrows);oldids=set(selected['route_ids'])
    combined=[dict(corridor='crans-le-pin',source='Archived replay 2026-10-29, not new network',
                   adaptive_route_calls=selected['profiles'],adaptive_candidates=selected['candidates'],
                   adaptive_unique=len(oldids),reference_route_calls=105,reference_candidates=309,reference_unique=28,
                   proxy_pareto_found=len(set(oldfront)&oldids),proxy_pareto_reference=len(oldfront),
                   trace_calls=len(oldids),total_calls=selected['profiles']+len(oldids),missed=sorted(set(oldfront)-oldids),
                   monetary_pareto_found=selected['pareto_found'])]
    combined += [dict(corridor=r['corridor'],source='Real campaign 2026-10-30',adaptive_route_calls=r['adaptive']['route_calls'],
                      adaptive_candidates=r['adaptive']['candidates'],adaptive_unique=r['adaptive']['unique'],
                      reference_route_calls=r['reference']['route_calls'],reference_candidates=r['reference']['candidates'],reference_unique=r['reference']['unique'],
                      proxy_pareto_found=len(r['adaptive']['pareto_found']),proxy_pareto_reference=len(r['reference_pareto']),
                      trace_calls=r['adaptive']['trace_calls'],total_calls=r['adaptive']['total_calls'],missed=r['adaptive']['pareto_missed']) for r in results]
    save(ROOT/'evidence/comparison.json',combined)
    with (ROOT/'evidence/comparison.csv').open('w',newline='') as f:
        keys=['corridor','adaptive_route_calls','adaptive_candidates','adaptive_unique','reference_route_calls','reference_candidates','reference_unique','proxy_pareto_found','proxy_pareto_reference','trace_calls','total_calls','missed']
        writer=csv.DictWriter(f,fieldnames=keys,extrasaction='ignore',lineterminator='\n');writer.writeheader();writer.writerows(combined)
    counts=read(ROOT/'evidence/counts.json')
    print(json.dumps(counts,indent=2))
    for r in results:
        print(r['corridor'],'adaptive',r['adaptive']['route_calls'],r['adaptive']['unique'],'reference',r['reference']['unique'],'Pareto',r['adaptive']['pareto_found'],'missed',r['adaptive']['pareto_missed'],'early',r['proposed_early_stop']['triggered'])


if __name__=='__main__':main()
