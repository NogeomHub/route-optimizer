"""Six archived REAL sample routes; one additional audited Cofiroute pair."""
import gzip,hashlib,json
from run import ROOT,load
from matching import match
from engine import quote,aggregate,validate_catalog

def run():
    p=ROOT/'inputs/other-corridors.json.gz';manifest=json.loads((ROOT/'inputs/manifest.json').read_text())
    if hashlib.sha256(p.read_bytes()).hexdigest()!=manifest[p.name]['sha256']:raise ValueError('Sample archive changed')
    data=json.loads(gzip.decompress(p.read_bytes()));nodes,ways=load();model=json.loads((ROOT/'catalogs/paris-sample-network.json').read_text());catalog=validate_catalog(json.loads((ROOT/'catalogs/cofiroute-2026.json').read_text()))
    output=[]
    for sample in data['samples']:
        route={'geometry':{'coordinates':sample['points']},'trace':sample['trace'],'traceSha256':sample['traceSha256'],'distanceKm':sample['km']}
        origin,destination=({'lon':p[0],'lat':p[1]}for p in [sample['points'][0],sample['points'][-1]])
        m=match(route,model,nodes,ways,origin,destination)
        q=[quote(t,[catalog],'2026-10-30')for t in m['transactions']]
        output.append({'corridor':sample['corridor'],'id':sample['id'],'minutes':sample['seconds']/60,'distance_km':sample['km'],'observed_motorways':sorted({n for span in sample['analysis']['runs']for n in span['axes']if n.startswith('A ')or n[:2]in ['A8','A7']}),'toll_km':sample['analysis']['toll_km'],'matching':m,**aggregate(q,coverage_complete=m['coverage_complete'],evidence=m['evidence'])})
    result={'source_commit':data['source_commit'],'mode':'offline archived real campaign, no new Valhalla requests','date_priced':'2026-10-30','routes':output}
    (ROOT/'results/other-corridors.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    for s in output:print(s['corridor'],s['id'],s['status'],s['total_cents'],s['matching']['unknown'])
    return result
if __name__=='__main__':run()
