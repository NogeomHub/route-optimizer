"""Offline unit tests. Synthetic fixtures are separate from actual archived results."""
import unittest
from pricing import match_gates, nearest, pareto, parse_aprr_text, price_events


def event(station,mode='closed'):
    return dict(station=station,mode=mode)


class PricingTests(unittest.TestCase):
    def setUp(self):
        self.tariffs={('A','B'):dict(entry='A',exit='B',cents=1050),
                      ('C','D'):dict(entry='C',exit='D',cents=700),
                      ('OPEN','Système Ouvert'):dict(entry='OPEN',exit='Système Ouvert',cents=80)}

    def test_class_one_first_price_column_and_page(self):
        text='Classe 1 - 1er février 2026\fA  B  100,00  10,50 €  20,00 €  30,00 €  40,00 €  50,00 €\n'
        r=parse_aprr_text(text)[('A','B')]
        self.assertEqual((r['cents'],r['pdf_page']),(1050,2))

    def test_vintage_and_conflicting_rows_fail(self):
        with self.assertRaises(ValueError):parse_aprr_text('old version')
        row='A  B  100,00  10,50 €  20,00 €  30,00 €  40,00 €  50,00 €\n'
        with self.assertRaises(ValueError):parse_aprr_text('Classe 1 1er février 2026\n'+row+row.replace('10,50','11,50'))

    def test_multiple_closed_sessions_added_in_integer_cents(self):
        r=price_events([event(x) for x in ['A','B','C','D']],self.tariffs)
        self.assertEqual(r['total_cents'],1750)
        self.assertEqual(len(r['known_sections']),2)

    def test_open_fee_once_per_event(self):
        r=price_events([event('OPEN','open')],self.tariffs)
        self.assertEqual(r['total_cents'],80)

    def test_no_reverse_price_assumption(self):
        self.assertIsNone(price_events([event('B'),event('A')],self.tariffs)['total_cents'])

    def test_other_operator_never_zero(self):
        r=price_events([event('A'),event('B')],self.tariffs,[dict(operator='ALIAE',reason='unknown')])
        self.assertEqual(r['known_aprr_cents'],1050)
        self.assertIsNone(r['total_cents'])

    def test_unmatched_ticket_and_ambiguous_station_remain_unknown(self):
        self.assertIsNone(price_events([event('A')],self.tariffs)['total_cents'])
        r=price_events([event('Val-de-Loing','unknown'),event('B')],self.tariffs)
        self.assertIsNone(r['total_cents'])

    def test_no_toll_events_is_zero_only_without_other_unknown(self):
        self.assertEqual(price_events([],self.tariffs)['total_cents'],0)
        self.assertIsNone(price_events([],self.tariffs,[dict(reason='unmatched toll')])['total_cents'])

    def test_unknown_is_excluded_from_pareto(self):
        rows=[dict(id='fast',minutes=10,total_cents=500),dict(id='free',minutes=20,total_cents=0),
              dict(id='dominated',minutes=25,total_cents=100),dict(id='unknown',minutes=1,total_cents=None)]
        self.assertEqual(pareto(rows),['fast','free'])

    def test_parallel_lanes_grouped_not_double_charged(self):
        points=[[4,46],[4.001,46]]
        nodes=[dict(id=i,lon=4.0005,lat=46+offset,tags={'name':'Crottet'}) for i,offset in [(1,0),(2,.00001)]]
        matches=match_gates(points,nodes)
        self.assertEqual(len(matches),1)
        self.assertEqual(matches[0]['osm_node_ids'],[1,2])
        self.assertEqual(matches[0]['station'],'CROTTET')

    def test_nearby_untraversed_gate_not_charged(self):
        nodes=[dict(id=1,lon=4.0005,lat=46.0005,tags={'name':'Crottet'})]
        self.assertEqual(match_gates([[4,46],[4.001,46]],nodes),[])
        self.assertAlmostEqual(nearest([4.0005,46],[[4,46],[4.001,46]])[0],0)


if __name__=='__main__':unittest.main()
