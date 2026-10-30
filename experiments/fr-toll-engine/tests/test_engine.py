import copy,gzip,hashlib,json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'))
from engine import validate_catalog,quote,aggregate,monetary_analysis
from import_vinci import parse_static_matrix,cents
from matching import direction,match,decode
from run import run,load,prior

# Explicit synthetic pricing fixtures, not used in any real route result.
def fixture():
    t={'operator':'SYNTHETIC','system':'closed','entry':'A','exit':'B','mapping_confidence':'reviewed'}
    rule={'id':'synthetic','system':'closed','entry':'A','exit':'B','cents':123,'vehicle_class':1,'profile':'standard','confidence':'confirmed','source':{'url':'https://example.test','sha256':'a'*64,'locator':'synthetic test row'}}
    cat={'id':'synthetic-2026','operator':'SYNTHETIC','effective_from':'2026-02-01','verified_through':'2026-10-30','rules':[rule]}
    return t,cat
class Engine(unittest.TestCase):
    def test_integer_cents_no_float_or_negative(self):
        for v in [1.23,-1,True]:
            t,c=fixture();c['rules'][0]['cents']=v
            with self.assertRaises(ValueError):validate_catalog(c)
    def test_source_locator_hash_and_duplicates_required(self):
        for field,val in [('sha256','g'*64),('locator','')]:
            t,c=fixture();c['rules'][0]['source'][field]=val
            with self.assertRaises(ValueError):validate_catalog(c)
        t,c=fixture();c['rules']*=2
        with self.assertRaises(ValueError):validate_catalog(c)
    def test_directed_pair_never_reversed_or_interpolated(self):
        t,c=fixture();t['entry'],t['exit']=t['exit'],t['entry'];self.assertIsNone(quote(t,[c],'2026-10-30')['cents'])
    def test_class_profile_mapping_and_tariff_confidence_independent(self):
        t,c=fixture()
        self.assertEqual(quote(t,[c],'2026-10-30')['cents'],123)
        for kwargs in [{'vehicle_class':2},{'profile':'electric'}]:self.assertIsNone(quote(t,[c],'2026-10-30',**kwargs)['cents'])
        t['mapping_confidence']='ambiguous';self.assertIsNone(quote(t,[c],'2026-10-30')['cents'])
        t['mapping_confidence']='reviewed';c['rules'][0]['confidence']='candidate';self.assertIsNone(quote(t,[c],'2026-10-30')['cents'])
    def test_dates_stale_and_catalog_overlap_refused(self):
        t,c=fixture();self.assertEqual(quote(t,[c],'2027-01-01')['status'],'stale')
        self.assertIsNone(quote(t,[c,copy.deepcopy(c)],'2026-10-30')['cents'])
        next_year=copy.deepcopy(c);next_year.update(id='2027',effective_from='2027-02-01',verified_through='2027-12-31');next_year['rules'][0]['cents']=150
        self.assertEqual(quote(t,[c,next_year],'2027-10-30')['cents'],150)
        self.assertEqual(quote(t,[c,next_year],'2026-10-30')['cents'],123)
    def test_time_and_payment_conditions_cannot_be_ignored(self):
        t,c=fixture();c['rules'][0]['conditions']={'period':'peak','payment':'badge'}
        self.assertIsNone(quote(t,[c],'2026-10-30')['cents'])
        self.assertEqual(quote(t,[c],'2026-10-30',context={'period':'peak','payment':'badge'})['cents'],123)
    def test_free_flow_is_ordered_rule_not_sum_per_gantry(self):
        t,c=fixture();t.update(system='free_flow',passages=['g1','g2']);c['rules'][0].update(system='free_flow',passages=['g1','g2'])
        self.assertEqual(quote(t,[c],'2026-10-30')['cents'],123)
        t['passages'].reverse();self.assertIsNone(quote(t,[c],'2026-10-30')['cents'])
    def test_unknown_and_missing_coverage_never_total_zero(self):
        self.assertIsNone(aggregate([],coverage_complete=False)['total_cents'])
        t,c=fixture();q=quote(t,[c],'2026-10-30');unknown=quote(dict(t,operator='UNKNOWN'),[c],'2026-10-30')
        r=aggregate([q,unknown],coverage_complete=True);self.assertEqual(r['known_cents'],123);self.assertIsNone(r['total_cents']);self.assertEqual(r['status'],'partial')
        self.assertEqual(aggregate([quote(t,[c],'2027-01-01')],coverage_complete=True)['status'],'stale')
    def test_partial_quotes_excluded_from_frontier_and_savings(self):
        rows=[{'id':'a','status':'complete_verified','total_cents':123,'duration_seconds':100},{'id':'b','status':'partial','total_cents':None,'known_cents':0,'duration_seconds':110}]
        a=monetary_analysis(rows);self.assertEqual(a['frontier_complete_subset'],['a']);self.assertIsNone(rows[1]['saving_cents']);self.assertIsNone(rows[1]['euros_saved_per_extra_minute'])
    def test_unpriced_fastest_does_not_create_savings_reference(self):
        rows=[{'id':'a','status':'partial','total_cents':None,'duration_seconds':100},{'id':'b','status':'complete_verified','total_cents':123,'duration_seconds':110}]
        self.assertIsNone(monetary_analysis(rows)['reference_cents']);self.assertIsNone(rows[1]['saving_cents'])
    def test_csv_bom_decimal_comma_and_explicit_missing(self):
        raw='\ufeffautoroute_entree;nom_entree;autoroute_sortie;nom_sortie;classe1;classe2;classe3;classe4;classe5\nA1;A;A2;B;1,20;2.30;#N/A;4;0\n'.encode()
        r=next(iter(parse_static_matrix(raw).values()));self.assertEqual(r['cents_by_class'],[120,230,None,400,0])
        with self.assertRaises(ValueError):cents('1.234')
        with self.assertRaises(ValueError):parse_static_matrix(b'Trajet;plage horaire;Tarif\nA;peak;12\n')
    def test_directed_road_rejects_reverse_and_roof(self):
        nodes={1:{'lon':0,'lat':0},2:{'lon':.001,'lat':0},3:{'lon':.002,'lat':0}};node={'id':2,**nodes[2]};way={'nodes':[1,2,3],'tags':{'oneway':'yes'}};p=[[0,0],[.001,0],[.002,0]]
        self.assertTrue(direction(p,node,way,nodes,12));self.assertFalse(direction(p[::-1],node,way,nodes,12));self.assertFalse(direction(p,node,dict(way,tags={'building':'roof'}),nodes,12))
    def test_next_year_import_is_data_driven_and_wrong_year_rejected(self):
        from import_aprr import parse
        text='En vigueur au 1er février 2027 Classe 1 Classe 2\nA  B  1,00  1,20 €  2,30 €  3,40 €  4,50 €  0,60 €'
        self.assertEqual(parse(text,'2027-02-01')[('A','B')]['cents'],120)
        self.assertEqual(parse(text,'2027-02-01',2)[('A','B')]['cents'],230)
        with self.assertRaises(ValueError):parse(text,'2026-02-01')

    def test_invalid_polyline_rejected(self):
        with self.assertRaises(ValueError):decode('?')

class RealCampaign(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result=run();cls.rows={r['id']:r for r in cls.result['routes']}
    def test_all_28_current_routes_and_unknown_free_flow(self):
        self.assertEqual(len(self.rows),28);self.assertEqual(self.result['counts'],{'complete_verified':22,'partial':6})
        self.assertEqual({r['id']for r in self.rows.values()if r['status']=='partial'},{'G006','G012','G015','G017','G020','G027'})
        for r in self.rows.values():
            if r['status']=='partial':
                self.assertIsNone(r['total_cents']);self.assertIsNone(r['saving_cents']);self.assertTrue(any(q['transaction']['operator']=='ALIAE'and q['cents']is None for q in r['components']))
    def test_new_route_not_blindly_mapped_to_limas(self):
        self.assertEqual(self.rows['G011']['total_cents'],3790);self.assertEqual(self.rows['G011']['components'][0]['transaction']['entry'],'VILLEFRANCHE-NORD')
    def test_two_closed_tickets_and_actual_pareto(self):
        self.assertEqual(self.rows['G009']['total_cents'],3920);self.assertEqual([q['cents']for q in self.rows['G009']['components']],[1640,2280])
        self.assertEqual(self.result['frontier_complete_subset'],['G004','G007','G014','G021','G028','G025','G022','G001'])
    def test_free_only_in_audited_scope_with_strict_trace(self):
        for id in ['G001','G002','G003']:self.assertEqual(self.rows[id]['total_cents'],0);self.assertTrue(self.rows[id]['coverage_evidence'])
        nodes,ways=load();model=json.loads((ROOT/'catalogs/network-model.json').read_text());data=json.loads(gzip.decompress((ROOT/'inputs/crans-v3.json.gz').read_bytes()));route=data['routes'][0]
        outside=match(route,model,nodes,ways,{'lon':0,'lat':0},data['destination']);self.assertFalse(outside['coverage_complete'])
        bad=match(dict(route,trace=None),model,nodes,ways,data['origin'],data['destination']);self.assertFalse(bad['coverage_complete'])
    def test_precise_geometry_evidence_and_source_pins(self):
        for r in self.rows.values():
            for e in r['matching']['events']:self.assertLessEqual(e['distance_m'],12)
        for p,meta in json.loads((ROOT/'inputs/manifest.json').read_text()).items():self.assertEqual(hashlib.sha256((ROOT/'inputs'/p).read_bytes()).hexdigest(),meta['sha256'])
    @unittest.skipUnless((ROOT/'local/aprr-2026.pdf').exists(),'official PDF not restored')
    def test_every_applied_aprr_cell_against_fresh_official_pdf(self):
        source=next(s for s in json.loads((ROOT/'sources/observations.json').read_text())if s['id']=='aprr-2026.pdf');pdf=ROOT/'local/aprr-2026.pdf';self.assertEqual(hashlib.sha256(pdf.read_bytes()).hexdigest(),source['sha256'])
        matrix=prior.load_tariffs(pdf)
        for r in self.rows.values():
            for q in r['components']:
                if q['status']=='verified':
                    t=q['transaction'];self.assertEqual(q['cents'],matrix[(t['entry'],t['exit'])]['cents']);self.assertEqual(q['source']['pdf_page'],matrix[(t['entry'],t['exit'])]['pdf_page'])
    def test_additional_real_corridor_scope_and_cofiroute(self):
        from other_corridors import run as run_other
        r=run_other();self.assertEqual(len(r['routes']),6)
        complete=[s for s in r['routes']if s['status']=='complete_verified'];self.assertEqual(len(complete),1);self.assertEqual(complete[0]['id'],'G005');self.assertEqual(complete[0]['total_cents'],2520)
        for row in r['routes']:
            if row['corridor']=='lyon-bordeaux':self.assertIsNone(row['total_cents'])

if __name__=='__main__':unittest.main()
