"""Safety and archive regression tests; synthetic fixtures are explicitly labeled."""
import copy
import hashlib
import json
import unittest
from unittest.mock import patch
from .study import ROOT, REPO, load, adaptive, farthest, evaluate, frontier, union


class ReplayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profiles, cls.routes, cls.prices = load()
        cls.saved = json.loads((ROOT/'results/study.json').read_text())

    def test_real_archive_counts_and_no_network(self):
        with patch('urllib.request.urlopen', side_effect=AssertionError('Network forbidden')):
            profiles, _, _ = load()
        self.assertEqual(len(profiles), 105)
        self.assertEqual(sum(len(p['routes']) for p in profiles), 309)
        self.assertEqual(len(union(profiles)), 28)

    def test_input_hashes(self):
        for path, expected in json.loads((ROOT/'results/input-hashes.json').read_text()).items():
            self.assertEqual(hashlib.sha256((REPO/path).read_bytes()).hexdigest(), expected)

    def test_current_monetary_frontier_not_toll_km_proxy(self):
        self.assertEqual(frontier(list(self.prices.values())), ['R18','R23','R14','R27','R15','R12','R4','R1'])
        self.assertNotIn('R26', frontier(list(self.prices.values())))
        self.assertNotIn('R13', frontier(list(self.prices.values())))

    def test_fixed_selection_independent_of_route_labels_and_results(self):
        changed = copy.deepcopy(self.profiles)
        for p in changed: p['routes'] = ['arbitrary hidden result']
        for n in [8,12,16,20]:
            self.assertEqual([p['id'] for p in farthest(changed,n)], [p['id'] for p in farthest(self.profiles,n)])

    def test_adaptive_invariant_under_opaque_geometry_renaming(self):
        renamed = copy.deepcopy(self.profiles)
        for p in renamed: p['routes'] = ['opaque_'+str(100-int(r[1:])) for r in p['routes']]
        a, _ = adaptive(self.profiles,40,8); b, _ = adaptive(renamed,40,8)
        self.assertEqual([p['id'] for p in a],[p['id'] for p in b])

    def test_no_access_to_future_responses_in_decisions(self):
        selected, _ = adaptive(self.profiles,20)
        selected_ids = {p['id'] for p in selected}
        changed = copy.deepcopy(self.profiles)
        for p in changed:
            if p['id'] not in selected_ids: p['routes'] = ['hidden exceptionally good route']
        again, _ = adaptive(changed,20)
        self.assertEqual([p['id'] for p in selected],[p['id'] for p in again])

    def test_nested_budget_prefix_and_no_repeat_queries(self):
        full, _ = adaptive(self.profiles,105)
        self.assertEqual(len(full),105)
        for n in [8,12,16,20,30,40]:
            selected, _ = adaptive(self.profiles,n)
            self.assertEqual([p['id'] for p in selected],[p['id'] for p in full[:n]])
            self.assertEqual(len({p['id'] for p in selected}),n)

    def test_replay_metrics_match_committed_results(self):
        for name,n,patience in [('adaptive-20',20,None),('adaptive-40',40,None),('adaptive-stop-8',105,8),('adaptive-budget40-stop8',40,8)]:
            selected, _ = adaptive(self.profiles,n,patience)
            expected = next(s for s in self.saved['strategies'] if s['strategy']==name)
            self.assertEqual(evaluate(name,selected,self.routes,self.prices),expected)

    def test_all_good_compromises_recovered_only_at_larger_tested_budget(self):
        s,_=adaptive(self.profiles,20); small=evaluate('small',s,self.routes,self.prices)
        self.assertNotIn('R27',small['pareto_found'])
        s,_=adaptive(self.profiles,40,8); large=evaluate('large',s,self.routes,self.prices)
        self.assertEqual(large['pareto_lost'],[])
        self.assertEqual(large['total_calls'],68)

    def test_trace_counts_are_after_geometry_dedup_not_per_candidate(self):
        result=evaluate('all',self.profiles,self.routes,self.prices)
        self.assertEqual(result['naive_trace_calls'],309)
        self.assertEqual(result['exact_geometry_trace_calls'],28)
        self.assertEqual(result['trace_calls_deduplicated'],28)
        self.assertEqual(result['total_calls'],133)

    def test_short_stagnation_loses_real_important_routes(self):
        s,_=adaptive(self.profiles,105,4)
        self.assertEqual(len(s),13)
        self.assertNotIn('R14',union(s));self.assertNotIn('R27',union(s))

    def test_no_guarantee_for_hidden_island_synthetic_fixture(self):
        # Synthetic: all endpoints identical, one unseen interior island.
        profiles=[]
        for v in [0,300,900,1800]:
            for u in [0,.5,1]:
                profiles.append(dict(id=f'p{len(profiles)}',parameters=dict(use_tolls=u,toll_booth_penalty=v),routes=['island' if v==1800 and u==.5 else 'same']))
        profiles.append(dict(id='excluded',parameters=dict(use_tolls=.5,toll_booth_penalty=0,exclude_tolls=True),routes=['same']))
        short,_=adaptive(profiles,105,4); full,_=adaptive(profiles,105)
        self.assertNotIn('island',union(short));self.assertIn('island',union(full))


if __name__=='__main__':unittest.main()
