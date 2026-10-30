"""Offline execution on pinned actual V3 geometries and strict traces."""
import argparse
from collections import Counter
from datetime import date
import gzip
import hashlib
import json
from pathlib import Path
from engine import validate_catalog, quote, aggregate, monetary_analysis
from matching import match, prior
from import_aprr import load as load_aprr
ROOT=Path(__file__).resolve().parents[1]


def load():
    topology=json.loads((ROOT/'sources/topology-manifest.json').read_text())
    for rec in topology['records']:
        p=ROOT/'sources'/rec['path']
        if hashlib.sha256(p.read_bytes()).hexdigest()!=rec['sha256']:raise ValueError('Topology snapshot hash mismatch: '+str(p))
    nodes={};ways={}
    for p in (ROOT/'sources/open').glob('*.json'):
        for obj in json.loads(p.read_text())['elements']:
            (nodes if obj['type']=='node'else ways)[obj['id']]=obj
    return nodes,ways


def run(prepare=False,on='2026-10-30'):
    source=ROOT/'inputs/crans-v3.json.gz'
    manifest=json.loads((ROOT/'inputs/manifest.json').read_text())
    if hashlib.sha256(source.read_bytes()).hexdigest()!=manifest['crans-v3.json.gz']['sha256']:raise ValueError('Current campaign input hash mismatch')
    data=json.loads(gzip.decompress(source.read_bytes()))
    model=json.loads((ROOT/'catalogs/network-model.json').read_text());nodes,ways=load()
    matches=[match(r,model,nodes,ways,data['origin'],data['destination']) for r in data['routes']]
    if prepare:
        plan=json.loads((ROOT/'catalogs/import-plan.json').read_text())
        rec=next(x for x in json.loads((ROOT/'sources/observations.json').read_text())if x['id']==plan['source_id'])
        pdf=ROOT/'local'/plan['source_id']
        if hashlib.sha256(pdf.read_bytes()).hexdigest()!=rec['sha256']:raise ValueError('Official source hash mismatch; re-audit instead of overwriting')
        matrix=load_aprr(pdf,plan['effective_from'],plan['vehicle_class'])
        rules=[]
        keys=sorted({(t['entry'],t['exit'])for m in matches for t in m['transactions']if t['operator']=='APRR'})
        for i,key in enumerate(keys):
            cell=matrix.get(key)
            if not cell:continue
            rules.append({'id':f'aprr-2026-c1-{i+1:03}','system':'open'if key[1]=='Système Ouvert'else'closed','entry':key[0],'exit':key[1],'vehicle_class':plan['vehicle_class'],'profile':plan['profile'],'cents':cell['cents'],'confidence':'official_cell_verified','source':{'url':rec['url'],'sha256':rec['sha256'],'locator':f"physical PDF page {cell['pdf_page']}, Classe 1, {key[0]} → {key[1]}",'pdf_page':cell['pdf_page'],'original_row_sha256':hashlib.sha256(cell['original_line'].encode()).hexdigest(),'quoted_class_cell':f"Classe {plan['vehicle_class']}: {cell['cents']/100:.2f} EUR"}})
        catalog={'schema_version':1,'id':plan['catalog_id'],'operator':plan['operator'],'network':'APRR directed matrix and named open plazas','effective_from':plan['effective_from'],'verified_through':plan['verified_through'],'currency':'EUR','standard':'TTC, standard, no subscriptions or discounts','source_rights':'No open redistribution licence verified; only factual cells needed for this experiment, not a republication of the full matrix','rules':rules}
        validate_catalog(catalog);(ROOT/'catalogs'/plan['output_file']).write_text(json.dumps(catalog,indent=2,ensure_ascii=False)+'\n')
    activation=json.loads((ROOT/'catalogs/activation.json').read_text())
    active_paths=[ROOT/'catalogs'/name for name in activation['active_catalogs']]
    catalogs=[validate_catalog(json.loads(p.read_text())) for p in active_paths]
    rows=[]
    for route,m in zip(data['routes'],matches):
        quotes=[quote(t,catalogs,on)for t in m['transactions']]
        priced=aggregate(quotes,coverage_complete=m['coverage_complete'],evidence=m['evidence'])
        if date.fromisoformat(on)>date.fromisoformat(model['verified_through']):
            priced.update(status='stale',total_cents=None,coverage_complete=False);priced['coverage_evidence'].append('Matching/free-route evidence needs a new audit')
        rows.append({'id':route['id'],'duration_seconds':route['durationSeconds'],'distance_km':route['distanceKm'],'toll_exposure_km':route['tollExposure']['tollKm'],'shape_sha256':route['shapeHash'],'trace_sha256':route['traceSha256'],'matching':m,**priced})
    analysis=monetary_analysis(rows)
    result={'on':on,'vehicle_class':1,'profile':'standard','graph':data['graph'],'origin':data['origin'],'destination':data['destination'],'input_sha256':manifest['crans-v3.json.gz']['sha256'],'matching_model':model['id'],'matching_model_sha256':hashlib.sha256((ROOT/'catalogs/network-model.json').read_bytes()).hexdigest(),'catalog_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in active_paths},'verification_scope':model['scope']['warning'],'free_route_note':'0 EUR relies on audited road data (strict trace and no crossing); not an operator bill or independent national free-road certification','counts':dict(Counter(r['status']for r in rows)),**analysis,'routes':rows}
    (ROOT/'results/pricing.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    print('Counts:',result['counts'],'Pareto:',analysis['frontier_complete_subset'])
    for r in rows: print(r['id'],r['status'],r['total_cents'],r['known_cents'],[(q['transaction']['entry'],q['transaction']['exit'],q['cents'])for q in r['components']],r['matching']['unknown'])
    return result

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--prepare-catalog',action='store_true');ap.add_argument('--on',default='2026-10-30');args=ap.parse_args();run(args.prepare_catalog,args.on)
