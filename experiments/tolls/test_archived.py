"""Integration regressions against real geometries and pinned official PDF cells."""
import json
import unittest
from pricing import ROOT,load_tariffs,match_gates,price_events
from audit_sources import lambert93


class ArchivedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.local=ROOT/'sources/local'
        if not (cls.local/'APRR-2026.pdf').exists():
            raise unittest.SkipTest('Run sources/fetch_sources.py to obtain pinned official PDF')
        cls.tariffs=load_tariffs(cls.local/'APRR-2026.pdf')
        cls.geometry={f['properties']['id']:f['geometry']['coordinates'] for f in json.loads((ROOT.parent/'valhalla/evidence/2026-10-29/routes.geojson').read_text())['features']}
        cls.nodes=[]
        for name in ['osm-toll-nodes.json','osm-toll-nodes-extra.json']:
            cls.nodes+=json.loads((cls.local/name).read_text())['elements']

    def gates(self,r):return match_gates(self.geometry[r],self.nodes)

    def test_r18_amberieu_not_distance_estimate(self):
        g=self.gates('R18')
        self.assertEqual([x['station'] for x in g],['AMBERIEU','LES EPRUNES'])
        self.assertEqual(price_events(g,self.tariffs)['total_cents'],4070)

    def test_r12_two_separate_tickets(self):
        g=self.gates('R12')
        self.assertEqual([x['station'] for x in g],['TOURNUS','BIERRE-LES-SEMUR','ST-DENIS-LES-SENS','LES EPRUNES'])
        self.assertEqual(price_events(g,self.tariffs)['total_cents'],1750)

    def test_r26_does_not_merge_across_free_a38(self):
        g=self.gates('R26')
        self.assertEqual([x['station'] for x in g],['PONT D AIN','DIJON-CRIMOLOIS','POUILLY-EN-AUXOIS','LES EPRUNES'])
        result=price_events(g,self.tariffs)
        self.assertIsNone(result['total_cents'])
        self.assertEqual(result['known_aprr_cents'],1640)
        self.assertEqual(result['unknown_sections'][0]['candidate_tariff_not_applied']['cents'],2280)

    def test_r5_two_osm_toll_runs_only_one_open_payment(self):
        g=self.gates('R5')
        self.assertEqual(len(g),1)
        self.assertEqual(price_events(g,self.tariffs)['total_cents'],80)

    def test_r13_ambiguous_loing_stays_partial(self):
        r=price_events(self.gates('R13'),self.tariffs,[dict(operator='ALIAE',reason='unknown')])
        self.assertIsNone(r['total_cents'])
        self.assertEqual(r['known_aprr_cents'],500)

    def test_r19_unconfirmed_val_de_saone_not_counted(self):
        r=price_events(self.gates('R19'),self.tariffs,[dict(operator='ALIAE',reason='unknown')])
        self.assertIsNone(r['total_cents'])
        self.assertEqual(r['known_aprr_cents'],420)

    def test_lambert93_control_point(self):
        lon,lat=lambert93(700000,6600000)
        self.assertAlmostEqual(lon,3,places=7)
        self.assertAlmostEqual(lat,46.5,places=7)


if __name__=='__main__':unittest.main()
