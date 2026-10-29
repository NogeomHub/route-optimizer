"""Corroborate OSM gate points against the MTE 2025 inventory (not an auto-aliaser)."""
import csv
import json
import math
from pathlib import Path
from pricing import ROOT, normalize


def lambert93(x,y):
    n=.725607765053267;c=11754255.426096;e=.0818191910428158
    radius=math.hypot(x-700000,12655612.049876-y)
    gamma=math.atan2(x-700000,12655612.049876-y)
    iso=-math.log(radius/c)/n
    phi=2*math.atan(math.exp(iso))-math.pi/2
    for _ in range(12):
        phi=2*math.atan(((1+e*math.sin(phi))/(1-e*math.sin(phi)))**(e/2)*math.exp(iso))-math.pi/2
    return [3+math.degrees(gamma/n),math.degrees(phi)]


def main():
    source=ROOT/'sources/local'
    official=[]
    text=(source/'gares-2025.csv').read_text(encoding='utf-8-sig')
    for row in csv.DictReader(text.splitlines(),delimiter=';'):
        try:xy=[float(row[k].replace(',','.')) for k in ['x','y']]
        except ValueError:continue
        row['coordinate']=lambert93(*xy)
        official.append(row)
    nodes=[]
    for f in ['osm-toll-nodes.json','osm-toll-nodes-extra.json']:
        nodes+=json.loads((source/f).read_text())['elements']
    indexed={n['id']:n for n in nodes}
    pricing=json.loads((ROOT/'results/pricing.json').read_text())
    audit=[]
    for route in pricing['routes']:
        for event in route['gate_events']:
            for nodeid in event['osm_node_ids']:
                node=indexed[nodeid]
                def dist(g):
                    a,b=node['lon'],node['lat'];c,d=g['coordinate']
                    return math.hypot((c-a)*111195*math.cos(math.radians(b)),(d-b)*111195)
                near=sorted(official,key=dist)[:2]
                same=[g for g in official if normalize(g['nomGare'])==normalize(event['station'])]
                audit.append(dict(same_name_candidates=[dict(name=g['nomGare'],distance_m=round(dist(g),2),coordinate=g['coordinate'],road_id=g['route']) for g in sorted(same,key=dist)[:2]],route=route['id'],canonical=event['station'],osm_node=nodeid,
                    osm_name=node['tags']['name'],coordinate=[node['lon'],node['lat']],
                    min_route_distance_m=event['distance_m'],
                    official_candidates=[dict(name=g['nomGare'],distance_m=round(dist(g),2),
                      road_id=g['route'],type=g['typeGare_lib'],coordinate=g['coordinate'],
                      reference_date=g['dateReferentiel'],x=g['x'],y=g['y']) for g in near]))
    (ROOT/'results/official-station-audit.json').write_text(json.dumps(audit,indent=2,ensure_ascii=False))
    print(f'{len(audit)} route/node correspondences audited against MTE 2025')


if __name__=='__main__':main()
