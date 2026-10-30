"""Corridor-reviewed geometric evidence adapter. Not a national map matcher."""
import importlib.util
import math
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('audited_aprr_geometry', REPO / 'experiments/tolls/pricing.py')
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
nearest = prior.nearest


def direction(points, node, way, nodes, tolerance):
    if way.get('tags', {}).get('oneway') != 'yes' or node['id'] not in way['nodes']:
        return False
    i = way['nodes'].index(node['id'])
    ids = way['nodes'][max(0, i-1):i+2]
    matches = [nearest([nodes[n]['lon'], nodes[n]['lat']], points) for n in ids]
    return len(matches) >= 2 and all(x[0] <= tolerance for x in matches) and all(b[1] > a[1] for a, b in zip(matches, matches[1:]))


def decode(shape):
    result = []; position = [0, 0]; i = 0
    while i < len(shape):
        for axis in [0, 1]:
            value = shift = 0
            while True:
                if i >= len(shape) or shift > 30: raise ValueError('Invalid polyline6')
                b = ord(shape[i]) - 63; i += 1
                if not 0 <= b <= 63: raise ValueError('Invalid polyline6 byte')
                value += (b & 31) << shift; shift += 5
                if b < 32: break
            position[axis] += -(value//2+1) if value % 2 else value//2
        result.append([position[1]/1e6, position[0]/1e6])
    if len(result) < 2: raise ValueError('Empty polyline6')
    return result


def match(route, model, nodes, ways, origin, destination):
    points = route['geometry']['coordinates']; tolerance = model['matching']['max_distance_m']
    def inside(p, box): return box[0] <= p['lon'] <= box[2] and box[1] <= p['lat'] <= box[3]
    scope = inside(origin, model['scope']['origin_region']) and inside(destination, model['scope']['destination_region'])
    if not scope:
        return {'events': [], 'transactions': [], 'coverage_complete': False, 'unknown': ['Outside audited directional corridor'], 'evidence': []}
    events = []
    for point in model['points']:
        node = point['node']; d, index = nearest([node['lon'], node['lat']], points)
        if d > tolerance: continue
        required = point.get('required_ways', [])
        if required and not all(direction(points, node, ways[w], nodes, tolerance) for w in required): continue
        # This scoped matcher supports single visits only. Fail closed on loops.
        hit_indices=[]
        lon,lat=node['lon'],node['lat']
        for i,(a,b) in enumerate(zip(points,points[1:])):
            if min(a[0],b[0])-.0003<=lon<=max(a[0],b[0])+.0003 and min(a[1],b[1])-.0003<=lat<=max(a[1],b[1])+.0003:
                if nearest([lon,lat],[a,b])[0]<=tolerance:hit_indices.append(i)
        visits=sum(i==0 or x>hit_indices[i-1]+1 for i,x in enumerate(hit_indices))
        event = {k: v for k, v in point.items() if k != 'node'}
        event.update(node_id=node['id'], distance_m=d, index=index, coordinate=[node['lon'], node['lat']], mapping_confidence='reviewed' if point['system'] in {'closed', 'open'} else 'ambiguous')
        event['visits']=visits
        if visits>1:event['mapping_confidence']='ambiguous';event['note']='Repeated gate visit requires a directed graph matcher'
        events.append(event)
    events.sort(key=lambda e: e['index'])
    merged = []
    for event in events:
        if merged and event['station'] == merged[-1]['station'] and abs(event['index'] - merged[-1]['index']) < 20: continue
        merged.append(event)
    transactions = []; pending = None; unknown = []
    for event in merged:
        if event['system'] == 'open':
            transactions.append({'operator': event['operator'], 'system': 'open', 'entry': event['station'], 'exit': 'Système Ouvert', 'mapping_confidence': event['mapping_confidence'], 'evidence': [event], 'interval': [event['index'], event['index']]})
        elif pending is None:
            pending = event
        else:
            transactions.append({'operator': event['operator'], 'system': 'closed', 'entry': pending['station'], 'exit': event['station'], 'mapping_confidence': 'reviewed' if event['mapping_confidence'] == pending['mapping_confidence'] == 'reviewed' else 'ambiguous', 'evidence': [pending, event], 'interval': [pending['index'], event['index']]})
            pending = None
    if pending: unknown.append('Unclosed ticket at ' + pending['station'])
    trace = route.get('trace')
    if not trace or trace.get('units') != 'kilometers' or not trace.get('edges') or any(type(e.get('toll')) is not bool for e in trace['edges']):
        return {'events': merged, 'transactions': transactions, 'coverage_complete': False, 'unknown': unknown + ['Missing/invalid strict trace'], 'evidence': []}
    trace_points = decode(trace['shape'])
    if abs(sum(e['length'] for e in trace['edges']) - route['distanceKm']) > max(.5, route['distanceKm']*.03): unknown.append('Trace length mismatch')
    a79 = [e for e in trace['edges'] if any(''.join(n.split()).upper() in model['free_flow']['road_refs'] for n in e.get('names', []))]
    gantries = []
    for node in nodes.values():
        if node.get('tags', {}).get('highway') != 'toll_gantry': continue
        for way in ways.values():
            if direction(points, node, way, nodes, tolerance):
                d, index = nearest([node['lon'], node['lat']], points)
                gantries.append({'node': node['id'], 'way': way['id'], 'index': index, 'name': node.get('tags', {}).get('name'), 'distance_m': d}); break
    gantries.sort(key=lambda x:x['index'])
    if gantries and not a79:unknown.append('Crossed gantry outside a declared free-flow traversal; cannot infer free')
    if a79:
        transactions.append({'operator': model['free_flow']['operator'], 'system': 'free_flow', 'entry': 'A79 traversal', 'exit': 'A79 traversal', 'passages': [str(g['node']) for g in gantries], 'mapping_confidence': 'reviewed' if gantries else 'ambiguous', 'evidence': gantries, 'note': 'Ordered passage only; tariff groups/2026 prices not inferred from gantry count'})
    # Every tolled trace edge must fall within a closed session or a reviewed open zone.
    # An open zone is a contiguous marked toll span containing its exact crossed booth.
    positions = [0.0]
    for a,b in zip(points, points[1:]):
        positions.append(positions[-1] + math.hypot((b[0]-a[0])*111195*math.cos(math.radians(a[1])), (b[1]-a[1])*111195))
    def at(index):
        i=min(int(index),len(positions)-2); return positions[i]+(positions[i+1]-positions[i])*(index-i)
    lookup = {tuple(p): i for i,p in enumerate(points)}
    def locate(p):
        i = lookup.get(tuple(p))
        return (0.0, i) if i is not None else nearest(p, points)
    spans=[]
    for e in trace['edges']:
        if not e['toll']: continue
        a, b = trace_points[e['begin_shape_index']], trace_points[e['end_shape_index']]
        da, ia = locate(a); db, ib = locate(b)
        refs={''.join(n.split()).upper()for n in e.get('names',[])}
        spans.append({'range':[at(ia),at(ib)],'indices':[ia,ib],'refs':refs,'km':e['length'],'matched':da<=tolerance and db<=tolerance,'start':a,'end':b})
    # A plaza charges a documented open zone, not each edge name or each toll flag.
    # Form contiguous marked spans and collect ALL refs (some edges have no names).
    groups=[]
    for span in spans:
        if groups and span['range'][0] <= groups[-1]['range'][1]+1:
            groups[-1]['range'][1]=span['range'][1];groups[-1]['refs'].update(span['refs'])
        else:groups.append({'range':list(span['range']),'refs':set(span['refs'])})
    uncovered=0; uncovered_sections=[]
    for span in spans:
        if span['refs'].intersection(model['free_flow']['road_refs']): continue
        covered=False
        for t in transactions:
            if t['system']=='closed' and t['mapping_confidence']=='reviewed':
                lo,hi=map(at,t['interval']); margin=model['matching']['coverage_boundary_tolerance_m']
                if span['matched'] and lo-margin<=span['range'][0] and span['range'][1]<=hi+margin: covered=True
            if t['system']=='open':
                zone=next((z for z in model['open_zones'] if z['station']==t['entry']),None)
                if zone and span['refs'].intersection(zone['road_refs']):
                    # The allowed zone is checked against the booth-connected marked span below.
                    gate=at(t['interval'][0])
                    for group in groups:
                        if (group['refs'].intersection(zone['road_refs']) and group['range'][0]-200<=gate<=group['range'][1]+200
                            and group['range'][0]<=span['range'][0] and span['range'][1]<=group['range'][1]):covered=True
        def within(box):
            return all(box[0]<=p[0]<=box[2] and box[1]<=p[1]<=box[3] for p in [span['start'],span['end']])
        for t in transactions:
            if t['system']=='open' and t['mapping_confidence']=='reviewed':
                zone=next((z for z in model['open_zones']if z['station']==t['entry']),None)
                if zone and zone.get('bounds') and within(zone['bounds']) and span['matched']:covered=True
            if t['system']=='closed' and t['mapping_confidence']=='reviewed':
                zone=next((z for z in model.get('closed_exit_zones',[])if z['station']==t['exit']),None)
                if zone and within(zone['bounds']) and span['refs'].intersection(zone['road_refs']) and span['range'][0]>=at(t['interval'][1])-200 and span['matched']:covered=True
        if not covered:
            uncovered+=span['km'];uncovered_sections.append({'range_m':span['range'],'refs':sorted(span['refs']),'km':span['km']})
    merged_unknown=[]
    for section in uncovered_sections:
        if merged_unknown and section['range_m'][0]<=merged_unknown[-1]['range_m'][1]+1:
            last=merged_unknown[-1];last['range_m'][1]=section['range_m'][1];last['refs']=sorted(set(last['refs'])|set(section['refs']));last['km']+=section['km'];last['edge_count']+=1
        else:merged_unknown.append({**section,'range_m':list(section['range_m']),'edge_count':1})
    if uncovered>.05:unknown.append(f'{uncovered:.3f} marked toll km outside reviewed transactions')
    if not transactions and not spans and not unknown:
        evidence=['Valid strict trace: every edge.toll=false','No crossed reviewed toll booth or directed free-flow gantry','Within manually audited directional corridor; free only to road-data confidence, not a payment receipt']
    else:evidence=['Every marked tolled edge checked against reviewed transaction coverage', 'trace response SHA256 '+route.get('traceSha256','unrecorded')]
    return {'events':merged,'transactions':transactions,'coverage_complete':not unknown,'unknown':unknown,'gantries':gantries,'evidence':evidence,'uncovered_toll_km':uncovered,'uncovered_sections':merged_unknown}
