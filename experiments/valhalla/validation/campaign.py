"""Real, cached, sequential network campaign. No invented responses.
Run from repo root: python -m experiments.valhalla.validation.campaign --live
Replays/analysis are separate and never need this --live flag.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
import urllib.request
import urllib.error

from experiments.valhalla.poc import plan, decode, corridor, near_duplicate, analyse_edges
from experiments.valhalla.budget.study import adaptive

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[2]
ENDPOINT='https://valhalla1.openstreetmap.de'
CORRIDORS=[('lyon-bordeaux',('Lyon','69123'),('Bordeaux','33063')),
           ('paris-rennes',('Paris','75056'),('Rennes','35238')),
           ('rennes-saint-brieuc',('Rennes','35238'),('Saint-Brieuc','22278'))]


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):return json.loads(path.read_text())
def save(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'))


class Journal:
    def __init__(self, root, delay=2, retry_failed=False):
        self.root=root;root.mkdir(parents=True,exist_ok=True)
        self.delay=delay;self.last=0;self.retry_failed=retry_failed
        self.cache={};self.failed=set();self.number=0
        for p in sorted(root.glob('*.request.json')):
            self.number=max(self.number,int(p.name.split('-')[0]));record=read(p)
            k=record['cache_key'];response=Path(str(p).replace('.request.','.response.'))
            if response.exists():self.cache[k]=read(response)
            else:self.failed.add(k)
    def request(self,url,payload=None,kind='route',role=''):
        k=canonical([url,payload,role])
        if k in self.cache:return self.cache[k]
        if k in self.failed and not self.retry_failed:raise RuntimeError('Previous failed request requires explicit --retry-failed; archive retained')
        time.sleep(max(0,self.delay-(time.monotonic()-self.last)))
        self.number+=1;stem=self.root/f'{self.number:04d}-{kind}'
        record=dict(url=url,payload=payload,kind=kind,role=role,cache_key=k,
                    started=datetime.now(timezone.utc).isoformat())
        save(stem.with_suffix('.request.json'),record)
        body=None if payload is None else json.dumps(payload).encode()
        request=urllib.request.Request(url,body,headers={'Content-Type':'application/json','User-Agent':'RouteOptimizer-Research/0.2 (github.com/NogeomHub/route-optimizer; corridor-validation)','Referer':'https://github.com/NogeomHub/route-optimizer'})
        try:
            with urllib.request.urlopen(request,timeout=120) as response:raw=response.read()
            stem.with_suffix('.response.json').write_bytes(raw)
            result=json.loads(raw)
            if isinstance(result,dict) and 'error' in result:raise ValueError(str(result))
            self.cache[k]=result;return result
        except Exception as e:
            if isinstance(e,urllib.error.HTTPError):
                stem.with_suffix('.http-error-body').write_bytes(e.read())
            save(stem.with_suffix('.error.json'),dict(type=type(e).__name__,error=str(e)))
            # No automatic retry, no fallback endpoint or relaxed map matching.
            raise
        finally:self.last=time.monotonic()


class Groups:
    def __init__(self):self.rows=[];self.exact={}
    def add(self,trip,profile_id,alternate):
        if trip.get('status')!=0 or trip.get('units')!='kilometers' or len(trip['legs'])!=1:
            raise ValueError('Unexpected route status/units/legs')
        shape=trip['legs'][0]['shape'];summary=trip['summary']
        signature=hashlib.sha256(shape.encode()).hexdigest()
        provenance=dict(profile=profile_id,alternate=alternate,shape_sha256=signature,
                        seconds=summary['time'],km=summary['length'])
        existing=self.exact.get(shape)
        if existing is None:
            points=decode(shape)
            candidate=dict(seconds=summary['time'],km=summary['length'],points=points,_corridor=corridor(points))
            existing=next((r for r in self.rows if near_duplicate(r,candidate)),None)
            if existing is None:
                candidate.update(id=f'G{len(self.rows)+1:03d}',shape=shape,produced_by=[],maneuvers=trip['legs'][0].get('maneuvers',[]))
                self.rows.append(candidate);existing=candidate
            self.exact[shape]=existing
        existing['produced_by'].append(provenance)
        return existing['id']
    def public(self):return [{k:v for k,v in r.items() if not k.startswith('_')} for r in self.rows]


class LazyProfile(dict):
    def __init__(self,pid,parameters,fetch):
        super().__init__(id=pid,parameters=parameters);self.fetch=fetch
    def __getitem__(self,k):
        if k=='routes' and k not in self:self[k]=self.fetch(self['id'],self['parameters'])
        return super().__getitem__(k)


def graph_id(status):return (status.get('version'),status.get('tileset_last_modified'))


def run(journal,corridor_spec):
    name,start,end=corridor_spec;out=ROOT/'evidence'/name;out.mkdir(parents=True,exist_ok=True)
    status=journal.request(ENDPOINT+'/status',kind='status',role=name+'-before')
    if not status.get('version') or status.get('tileset_last_modified') is None:raise ValueError('No graph/version observation')
    locations=[];places=[]
    for city,code in [start,end]:
        url=f'https://geo.api.gouv.fr/communes/{code}?fields=nom,code,codesPostaux,centre'
        data=journal.request(url,kind='geocode')
        if data.get('nom')!=city or data.get('code')!=code:raise ValueError('Unexpected geocoding identity')
        lon,lat=data['centre']['coordinates'];locations.append(dict(lon=lon,lat=lat));places.append(dict(city=city,code=code,source=url,response=data))
    save(out/'locations.json',dict(places=places,locations=locations,interpretation='Official commune centre, not an address; Valhalla may snap to a road'))
    groups=Groups();responses={};discovery=[]
    def fetch(pid,parameters):
        payload=dict(locations=locations,costing='auto',costing_options={'auto':parameters},units='kilometers',language='fr-FR',alternates=2,shape_format='polyline6')
        response=journal.request(ENDPOINT+'/route',payload)
        trips=[response['trip']]+[a['trip'] for a in response.get('alternates',[])]
        ids=[groups.add(t,pid,i) for i,t in enumerate(trips)]
        row=dict(id=pid,parameters=parameters,routes=ids,candidates=len(trips),warnings=response.get('warnings',[]))
        responses[pid]=row;discovery.append(pid)
        save(out/'progress.json',dict(profiles=responses,discovery_order=discovery,groups=groups.public()))
        print(name,pid,'requests observed',len(responses),'groups',len(groups.rows),flush=True)
        return ids
    profiles=[LazyProfile(f'P{i:03d}',p,fetch) for i,p in enumerate(plan(),1)]
    selected,log=adaptive(profiles,40,8)  # EXACT frozen candidate, no tariff/trace input.
    selected_ids=[p['id'] for p in selected]
    save(out/'adaptive.json',dict(profile_ids=selected_ids,log=log,groups_at_stop=groups.public(),status=status))
    # Frozen evaluation reference: ALL 105 historical parameter profiles, spanning
    # u=0..1, four penalties and explicit exclusion; selected responses reused.
    # No change to the reference based on observed success/failure.
    for p in profiles:p['routes']
    save(out/'reference.json',dict(profiles=responses,discovery_order=discovery,groups=groups.public()))
    # Only unique geometry representatives are analyzed, after BOTH searches.
    attrs=['shape','edge.toll','edge.length','edge.names','edge.begin_shape_index','edge.end_shape_index']
    for row in groups.rows:
        payload=dict(encoded_polyline=row['shape'],shape_match='edge_walk',costing='auto',units='kilometers',filters=dict(action='include',attributes=attrs))
        trace=journal.request(ENDPOINT+'/trace_attributes',payload,kind='trace_attributes')
        row['analysis']=analyse_edges(trace,row)
        save(out/'analyzed.json',dict(groups=groups.public()))
        print(name,'analyzed',row['id'],round(row['analysis']['toll_km'],3),'km marked toll',flush=True)
    after=journal.request(ENDPOINT+'/status',kind='status',role=name+'-after')
    save(out/'status.json',dict(before=status,after=after,stable=graph_id(status)==graph_id(after)))
    if graph_id(status)!=graph_id(after):raise ValueError('Graph changed during corridor; comparison not stable')
    save(out/'routes.geojson',dict(type='FeatureCollection',features=[dict(type='Feature',properties=dict(id=r['id'],seconds=r['seconds'],km=r['km'],toll_km=r['analysis']['toll_km']),geometry=dict(type='LineString',coordinates=r['points'])) for r in groups.rows]))
    save(out/'complete.json',dict(profiles=len(responses),groups=len(groups.rows),adaptive_profiles=len(selected),graph=graph_id(after)))


def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--live',action='store_true');ap.add_argument('--retry-failed',action='store_true');ap.add_argument('--corridor',choices=[x[0] for x in CORRIDORS]);args=ap.parse_args()
    if not args.live:ap.error('Explicit --live required')
    freeze=read(ROOT/'freeze.json')
    for path,expected in freeze['source_sha256'].items():
        if sha(REPO/path)!=expected:raise ValueError('Frozen source changed: '+path)
    journal=Journal(ROOT/'evidence/network',delay=freeze['delay_seconds'],retry_failed=args.retry_failed)
    try:
        for spec in CORRIDORS:
            if args.corridor is None or args.corridor==spec[0]:run(journal,spec)
    finally:
        counts=Counter(read(p)['kind'] for p in journal.root.glob('*.request.json'))
        save(ROOT/'evidence/counts.json',dict(attempts=dict(counts),errors=len(list(journal.root.glob('*.error.json')))))


if __name__=='__main__':main()
