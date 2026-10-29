"""New engine safety tests + regressions on unchanged REAL archived routes.

Tiny generic engine inputs below are synthetic unit fixtures, never experimental
results. Integration cases use only pinned OSM / Valhalla / official APRR cells.
"""
from dataclasses import replace
from datetime import date
import json
import unittest

from experiments.tolls.completion.engine import (
    Confidence as C, Quote, Traversal, Vehicle, DatedMatrixProvider,
    UnverifiedFreeFlowProvider, aggregate,
)
from experiments.tolls.completion.run import (
    ROOT, BASE, EVIDENCE, ON, calculate, read, load_osm, directed_passage,
    resolve_event, TARGETS,
)
from experiments.tolls.pricing import pareto


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.t = Traversal('fixture', 'closed', 'A', 'B', C.RELIABLE)
        self.cell = dict(entry='A', exit='B', cents=123, vehicle_class=1, effective='2026-02-01')
        self.p = DatedMatrixProvider('fixture', [self.cell], '2026-02-01', '2026-10-29')

    def test_exact_directed_dated_class_cell(self):
        q = self.p.quote(self.t, Vehicle(), ON)
        self.assertTrue(q.accepted)
        self.assertEqual(q.cents, 123)
        self.assertFalse(self.p.quote(replace(self.t, entry='B', exit='A'), Vehicle(), ON).accepted)

    def test_wrong_operator_never_inherits_aprr_like_maintenance(self):
        self.assertFalse(self.p.quote(replace(self.t, operator='other concession'), Vehicle(), ON).accepted)

    def test_class_and_discount_not_assumed(self):
        for v in [Vehicle(2), Vehicle(1, 'CritAir0')]:
            self.assertFalse(self.p.quote(self.t, v, ON).accepted)

    def test_stale_catalogue_and_future_audit_cutoff_rejected(self):
        for on in [date(2024, 10, 29), date(2027, 2, 1)]:
            self.assertFalse(self.p.quote(self.t, Vehicle(), on).accepted)
        p = DatedMatrixProvider('fixture', [dict(self.cell, effective='2024-02-01')], '2026-02-01', '2026-10-29')
        self.assertFalse(p.quote(self.t, Vehicle(), ON).accepted)

    def test_ambiguous_mapping_blocks_an_official_amount(self):
        q = self.p.quote(replace(self.t, confidence=C.AMBIGUOUS), Vehicle(), ON)
        self.assertEqual(q.cents, 123)
        self.assertFalse(q.accepted)
        self.assertIsNone(aggregate([q], coverage_complete=True)['total_cents'])

    def test_unknown_and_partial_not_zero(self):
        known = self.p.quote(self.t, Vehicle(), ON)
        missing = Quote(self.t, None, C.UNKNOWN)
        result = aggregate([known, missing], coverage_complete=True)
        self.assertEqual(result['known_cents'], 123)
        self.assertIsNone(result['total_cents'])

    def test_coverage_gap_even_without_a_detected_gate_is_unknown(self):
        self.assertIsNone(aggregate([], coverage_complete=False)['total_cents'])
        self.assertEqual(aggregate([], coverage_complete=True)['total_cents'], 0)

    def test_conflicting_catalogue_cells_rejected(self):
        with self.assertRaises(ValueError):
            DatedMatrixProvider('fixture', [self.cell, dict(self.cell, cents=124)], '2026-02-01', '2026-10-29')

    def test_bad_monetary_value_never_accepted(self):
        for value in [-1, 1.23, True]:
            self.assertFalse(Quote(self.t, value, C.CONFIRMED).accepted)

    def test_2024_aliae_public_document_not_promoted_to_2026(self):
        t = Traversal('ALIAE', 'free_flow', 'Digoin', 'Dompierre', C.RELIABLE,
                      passages=('Molinet Est', 'Molinet Ouest'))
        q = UnverifiedFreeFlowProvider().quote(t, Vehicle(), ON)
        self.assertIsNone(q.cents)
        self.assertFalse(q.accepted)
        self.assertEqual(q.source['reference_effective'], '2024-02-01')


class CompletionArchiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = calculate()
        cls.rows = {r['id']: r for r in cls.output['routes']}
        cls.nodes, cls.ways = load_osm()
        cls.points = {f['properties']['id']: f['geometry']['coordinates']
                      for f in read(EVIDENCE/'routes.geojson')['features']}

    def test_all_21_previous_complete_totals_preserved(self):
        old = read(BASE/'results/pricing.json')['routes']
        for row in old:
            if row['total_cents'] is not None:
                self.assertEqual(self.rows[row['id']]['total_cents'], row['total_cents'])

    def test_r26_two_sessions_and_actual_pdf_citations(self):
        r = self.rows['R26']
        self.assertEqual(r['total_cents'], 3920)
        self.assertEqual([s['cents'] for s in r['sections']], [1640, 2280])
        self.assertEqual([s['source']['pdf_page'] for s in r['sections']], [202, 205])
        self.assertEqual(r['station_resolutions'][0]['confidence'], C.RELIABLE)

    def test_loing_uses_mainline_not_nearby_souppes(self):
        for rid in ['R8', 'R13', 'R19', 'R20', 'R24']:
            sections = [s for s in self.rows[rid]['sections'] if s['traversal']['entry'] == 'VAL DE LOING-BARRIERE']
            self.assertEqual(len(sections), 1)
            self.assertEqual(sections[0]['cents'], 1000)
            self.assertTrue(sections[0]['accepted'])
        self.assertFalse(any(s['traversal']['entry'] == 'VAL DE LOING-SOUPPES'
                             for r in self.rows.values() for s in r['sections']))

    def test_saone_closed_session_not_crottet_open_fee(self):
        r = self.rows['R19']
        self.assertEqual(r['known_aprr_cents'], 2190)
        section = next(s for s in r['sections'] if s['traversal']['exit'] == 'VAL DE SAONE')
        self.assertEqual(section['cents'], 770)
        self.assertEqual(section['traversal']['system'], 'closed')

    def test_transactions_keep_real_geographical_order_across_operators(self):
        r = self.rows['R19']
        self.assertEqual([s['traversal']['operator'] for s in r['sections']], ['APRR', 'ALIAE', 'APRR', 'APRR'])
        self.assertEqual(r['sections'][0]['traversal']['entry'], 'AMBERIEU')
        indexes = [s['start_shape_index'] for s in r['sections']]
        self.assertEqual(indexes, sorted(indexes))

    def test_correct_a79_gantries_for_both_real_exits(self):
        for rid in ['R7', 'R8', 'R20']:
            self.assertEqual([p['name'] for p in self.rows[rid]['a79']['gantries']], ['Molinet Est', 'Molinet Ouest'])
        for rid in ['R13', 'R19', 'R24']:
            self.assertEqual([p['name'] for p in self.rows[rid]['a79']['gantries']],
                             ['Molinet Est', 'Molinet Ouest', 'Montbeugny Est', 'Montbeugny Ouest'])

    def test_parallel_gantry_under_12m_does_not_double_charge(self):
        points = self.points['R13']
        # Eastbound portique is only ~10m from the westbound archived shape.
        self.assertIsNone(directed_passage(points, self.nodes[11578487424], self.ways[1183617639], self.nodes))
        match = directed_passage(points, self.nodes[11578487425], self.ways[50442305], self.nodes)
        self.assertIsNotNone(match)
        self.assertLess(match['distance_m'], .1)

    def test_unverified_way_direction_refuses_station_resolution(self):
        event = next(e for r in read(BASE/'results/pricing.json')['routes'] if r['id'] == 'R26'
                     for e in r['gate_events'] if 28868663 in e['osm_node_ids'])
        ways = dict(self.ways)
        ways[404806183] = dict(ways[404806183], tags={})
        self.assertIsNone(resolve_event(event, self.points['R26'], self.nodes, ways,
                                       read(ROOT/'sources/station-resolutions.json')))

    def test_registry_ambiguous_confidence_is_not_promoted_by_geometry(self):
        event = next(e for r in read(BASE/'results/pricing.json')['routes'] if r['id'] == 'R26'
                     for e in r['gate_events'] if 28868663 in e['osm_node_ids'])
        registry = [dict(r, confidence=C.AMBIGUOUS) for r in read(ROOT/'sources/station-resolutions.json')]
        self.assertIsNone(resolve_event(event, self.points['R26'], self.nodes, self.ways, registry))

    def test_six_a79_totals_stay_unknown_despite_higher_known_subtotals(self):
        expected = dict(R7=500, R8=1500, R13=1500, R19=2190, R20=1000, R24=1420)
        for rid, cents in expected.items():
            self.assertEqual(self.rows[rid]['known_cents'], cents)
            self.assertIsNone(self.rows[rid]['total_cents'])
            self.assertNotIn(rid, self.output['frontier_complete_subset'])
        self.assertEqual(self.output['resolved_targets'], ['R26'])
        self.assertEqual(self.output['stats'], dict(complete=22, partial=6))

    def test_r26_dominated_and_recommendation_unchanged(self):
        self.assertNotIn('R26', self.output['frontier_complete_subset'])
        self.assertEqual(self.output['frontier_complete_subset'], ['R18', 'R23', 'R14', 'R27', 'R15', 'R12', 'R4', 'R1'])
        self.assertEqual(self.output['recommendation']['max_extra_45'], 'R27')
        self.assertLess(self.rows['R14']['minutes'], self.rows['R26']['minutes'])
        self.assertLess(self.rows['R14']['total_cents'], self.rows['R26']['total_cents'])

    def test_savings_uses_unrounded_duration_and_integer_cents(self):
        r = self.rows['R26']
        self.assertEqual(r['saving_cents'], 150)
        self.assertAlmostEqual(r['euros_saved_per_extra_minute'], 1.5 / r['extra_minutes'])

    def test_unknown_price_not_a_pareto_zero(self):
        rows = [dict(id='known', minutes=1, total_cents=200), dict(id='missing', minutes=.5, total_cents=None)]
        self.assertEqual(pareto(rows), ['known'])

    def test_committed_experimental_results_reproduce_exactly(self):
        # Dataclass tuples become JSON arrays; compare the actual wire format.
        self.assertEqual(json.loads(json.dumps(self.output)), read(ROOT/'results/pricing.json'))


if __name__ == '__main__':
    unittest.main()
