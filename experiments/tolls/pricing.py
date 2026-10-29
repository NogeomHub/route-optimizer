"""Class 1 toll POC for the ARCHIVED Crans -> Le Pin corridor only.
No per-km estimator, no V1 imports, no web requests. Unknown is never zero.
"""
import argparse
from collections import Counter
from decimal import Decimal
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import unicodedata

ROOT=Path(__file__).resolve().parent


def normalize(name):
    text=unicodedata.normalize('NFKD',name).encode('ascii','ignore').decode().upper()
    return re.sub('[^A-Z0-9]','',text)


# Audited aliases for this corridor, not a nationwide fuzzy-name matcher.
STATIONS={
 'Ambérieu-en-Buguey':('AMBERIEU','closed'),
 "Pont-d'Ain":('PONT D AIN','closed'),
 'Replonges':('REPLONGES','closed'),
 'Tournus':('TOURNUS','closed'),
 'Bierre-lès-Semur':('BIERRE-LES-SEMUR','closed'),
 'Saint-Denis-lès-Sens':('ST-DENIS-LES-SENS','closed'),
 'Péage des Eprunes':('LES EPRUNES','closed'),
 'Péage de Fleury-en-Bière':('FLEURY-EN-BIERE','closed'),
 # MTE 2025 same-name coordinate is ~6.7km away: candidate rate not applied.
 'Péage Val de Saône':('VAL DE SAONE','closed_unverified'),
 'Péage de Dijon-Crimolois':('DIJON-CRIMOLOIS','closed'),
 # MTE 2025 same-name coordinate is ~9.7km away: candidate rate not applied.
 'Péage de Pouilly-en-Auxois':('POUILLY-EN-AUXOIS','closed_unverified'),
 'Crottet':('CROTTET','open'),
 'Myennes':('MYENNES','open'),
 # OSM calls a mainline node "Barrière", while the 2025 official inventory
 # locates Souppes interchange booths nearby. Prices differ: no automatic alias.
 'Val-de-Loing Barrière':('VAL-DE-LOING-AMBIGUOUS','unknown'),
}
ALIASES={normalize(k):v for k,v in STATIONS.items()}


def parse_aprr_text(text):
    records={}
    if '1er février 2026' not in text or 'Classe 1' not in text:
        raise ValueError('Unexpected tariff vintage or class header')
    for page,body in enumerate(text.split('\f'),1):
        for line in body.splitlines():
            cols=re.split(r'\s{2,}',line.strip())
            if len(cols)!=8 or not re.fullmatch(r'\d+,\d{2} €',cols[3]):continue
            key=(cols[0],cols[1])
            cents=int(Decimal(cols[3].removesuffix(' €').replace(',','.'))*100)
            record=dict(entry=key[0],exit=key[1],cents=cents,pdf_page=page,
                        source='APRR-2026.pdf',effective='2026-02-01',vehicle_class=1,
                        original_line=line.strip())
            if key in records and records[key]['cents']!=cents:
                raise ValueError(f'Ambiguous PDF price: {key}')
            records[key]=record
    if not records:raise ValueError('No tariff rows extracted')
    return records


def load_tariffs(pdf):
    raw=subprocess.check_output(['pdftotext','-layout',str(pdf),'-']).decode()
    return parse_aprr_text(raw)


def nearest(point,points):
    """Minimum point-to-segment distance (metres), local equirectangular projection.
    The 12m acceptance threshold follows an audit of the current OSM centre lines.
    It is intentionally unsuitable for an unreviewed national auto-match.
    """
    best=math.inf;index=0
    k=math.cos(math.radians(point[1]))*111195
    for i,(a,b) in enumerate(zip(points,points[1:])):
        if max(a[0],b[0])<point[0]-.002 or min(a[0],b[0])>point[0]+.002 or max(a[1],b[1])<point[1]-.002 or min(a[1],b[1])>point[1]+.002:continue
        ax=(a[0]-point[0])*k;ay=(a[1]-point[1])*111195
        bx=(b[0]-point[0])*k;by=(b[1]-point[1])*111195
        dx=bx-ax;dy=by-ay
        t=max(0,min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy))) if dx*dx+dy*dy else 0
        d=math.hypot(ax+t*dx,ay+t*dy)
        if d<best:best=d;index=i+t
    return best,index


def match_gates(points,nodes):
    events=[]
    for node in nodes:
        d,index=nearest([node['lon'],node['lat']],points)
        if d>12:continue
        name=node.get('tags',{}).get('name','UNKNOWN')
        canonical,mode=ALIASES.get(normalize(name),(name,'unknown'))
        event=dict(station=canonical,mode=mode,index=index,osm_name=name,
                   coordinate=[node['lon'],node['lat']],osm_node_ids=[node['id']],distance_m=d)
        events.append(event)
    events.sort(key=lambda e:e['index'])
    merged=[]
    for event in events:
        if merged and event['station']==merged[-1]['station']:
            # Same physical plaza, multiple lane nodes. Do NOT deduplicate a
            # later revisit separated by another gate; this is a corridor audit.
            prev=merged[-1]
            a,b=event['coordinate'],prev['coordinate']
            if math.hypot((a[0]-b[0])*75000,(a[1]-b[1])*111195)<100:
                prev['osm_node_ids']+=event['osm_node_ids']
                continue
        merged.append(event)
    return merged


def price_events(events,tariffs,other_sections=()):
    known=[];unknown=list(other_sections);pending=None
    for event in events:
        station,mode=event['station'],event['mode']
        if mode=='open':
            key=(station,'Système Ouvert');verified=True
        elif pending is None:
            pending=(station,mode=='closed');continue
        else:
            entry,entry_verified=pending
            key=(entry,station);verified=entry_verified and mode=='closed';pending=None
        record=tariffs.get(key)
        if record is None or not verified:
            unknown.append(dict(operator='APRR',reason='Unverified station correspondence or missing directed pair',
                entry=key[0],exit=key[1],candidate_tariff_not_applied=record))
        else:
            known.append(dict(record,operator='APRR',evidence_station=station))
    if pending is not None:
        unknown.append(dict(operator='APRR',reason='Unclosed ticket session',entry=pending[0]))
    cents=sum(x['cents'] for x in known)
    return dict(known_aprr_cents=cents,total_cents=None if unknown else cents,
                status='partial' if unknown else 'complete',known_sections=known,unknown_sections=unknown)


def pareto(rows):
    """Only complete totals participate; unknown prices are never optimistic zero."""
    complete=[r for r in rows if r['total_cents'] is not None]
    return [r['id'] for r in complete if not any(
        x['minutes']<=r['minutes'] and x['total_cents']<=r['total_cents'] and
        (x['minutes']<r['minutes'] or x['total_cents']<r['total_cents'])
        for x in complete)]


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--sources',type=Path,default=ROOT/'sources/local')
    ap.add_argument('--output',type=Path,default=ROOT/'results')
    args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((ROOT/'sources/manifest.json').read_text())
    for source in manifest:
        file=args.sources/source['filename']
        if hashlib.sha256(file.read_bytes()).hexdigest()!=source['sha256']:
            raise ValueError(f'Source has changed: {file}')
    tariffs=load_tariffs(args.sources/'APRR-2026.pdf')
    nodes=[]
    for name in ['osm-toll-nodes.json','osm-toll-nodes-extra.json']:
        nodes+=json.loads((args.sources/name).read_text())['elements']
    geometry=json.loads((ROOT.parent/'valhalla/evidence/2026-10-29/routes.geojson').read_text())['features']
    routes=json.loads((ROOT.parent/'valhalla/evidence/2026-10-29/comparison.json').read_text())
    rows=[]
    for route,feature in zip(routes,geometry):
        assert route['id']==feature['properties']['id']
        events=match_gates(feature['geometry']['coordinates'],nodes)
        other=[]
        if any(name=='A79' for name,km in route['axes']):
            other.append(dict(operator='ALIAE (concession A79; exploitation APRR)',reason='No verified 2026 gantry/entry-exit tariff matched in this POC'))
        if route['toll_km']>0 and not events:
            other.append(dict(operator='unresolved',reason='Tolled geometry without matched gate'))
        row=dict(id=route['id'],minutes=route['minutes'],toll_km=route['toll_km'],gate_events=events,
                 **price_events(events,tariffs,other))
        rows.append(row)
    frontier=pareto(rows)
    fastest=min(rows,key=lambda r:r['minutes'])
    assert fastest['id']=='R18' and fastest['total_cents'] is not None
    for row in rows:
        extra=row['minutes']-fastest['minutes']
        row.update(pareto_complete_subset=row['id'] in frontier,extra_minutes=extra,
                   saving_cents=None if row['total_cents'] is None else fastest['total_cents']-row['total_cents'])
        row['euros_saved_per_extra_minute']=None if row['saving_cents'] is None or extra<=0 else row['saving_cents']/100/extra
    input_hashes={name:hashlib.sha256((ROOT.parent/'valhalla/evidence/2026-10-29'/name).read_bytes()).hexdigest() for name in ['routes.geojson','comparison.json']}
    output=dict(input_geometry_sha256=input_hashes,vehicle_class=1,effective='2026-02-01',currency='EUR',
                assumption='Standard TTC class 1, no subscription/discount; audited corridor only',
                stats=dict(Counter(r['status'] for r in rows)),frontier_complete_subset=frontier,routes=rows)
    (args.output/'pricing.json').write_text(json.dumps(output,indent=2,ensure_ascii=False))
    print('Pricing status:',output['stats'],'Pareto subset:',frontier)
    for row in rows:print(row['id'],row['total_cents'],row['known_aprr_cents'],[(x['entry'],x['exit'],x['cents']) for x in row['known_sections']])


if __name__=='__main__':main()
