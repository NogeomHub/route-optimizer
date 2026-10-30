"""Campaign adapter tests, real archived fixtures; synthetic stop fixtures labeled."""
import copy
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from experiments.valhalla.poc import plan
from experiments.valhalla.budget.study import adaptive
from .campaign import ROOT, REPO, Groups, LazyProfile, Journal, sha, read
from .analyze import early_zero_exposure, pareto


class ValidationTests(unittest.TestCase):
    def test_frozen_sources_are_unchanged(self):
        freeze=read(ROOT/'freeze.json')
        for p,h in freeze['source_sha256'].items():self.assertEqual(sha(REPO/p),h)
        self.assertEqual((freeze['budget'],freeze['patience'],freeze['seed_count']),(40,8,9))

    def test_lazy_adapter_never_queries_unselected_future_profiles(self):
        queried=[]
        def oracle(pid,parameters):queried.append(pid);return ['opaque_geometry']
        profiles=[LazyProfile(f'P{i:03d}',p,oracle) for i,p in enumerate(plan(),1)]
        self.assertEqual(queried,[])
        selected,log=adaptive(profiles,40,8)
        self.assertEqual(queried,[p['id'] for p in selected])
        self.assertEqual(len(selected),12)  # frozen minimum, not early-stop proposal
        self.assertLessEqual(len(selected),40)
        self.assertEqual(len(set(queried)),len(queried))

    def test_adapter_replays_original_candidate_exactly(self):
        from experiments.valhalla.budget.study import load
        archived,_,_=load();answers={p['id']:p['routes'] for p in archived}
        profiles=[LazyProfile(p['id'],p['parameters'],lambda pid,parameters:answers[pid]) for p in archived]
        expected,logs=adaptive(archived,40,8);actual,replayed=adaptive(profiles,40,8)
        self.assertEqual([p['id'] for p in actual],[p['id'] for p in expected])
        self.assertEqual(replayed,logs)

    def test_dedup_retains_actual_alternatives_and_all_provenance(self):
        with tarfile.open(REPO/'experiments/valhalla/evidence/2026-10-29/raw-responses.tar.gz') as archive:
            name=next(n for n in sorted(archive.getnames()) if n.startswith('sweep-live/') and n.endswith('-route.response.json'))
            response=json.load(archive.extractfile(name))
        trips=[response['trip']]+[a['trip'] for a in response.get('alternates',[])]
        self.assertEqual(len(trips),3)
        groups=Groups()
        first=[groups.add(t,'P001',i) for i,t in enumerate(trips)]
        again=[groups.add(t,'P002',i) for i,t in enumerate(trips)]
        self.assertEqual(first,again);self.assertEqual(len(groups.rows),3)
        self.assertEqual([len(r['produced_by']) for r in groups.rows],[2,2,2])
        self.assertEqual({p['alternate'] for r in groups.rows for p in r['produced_by']},{0,1,2})

    def test_cache_avoids_duplicate_network_queries(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            record=dict(cache_key=json.dumps(['https://example.invalid',None,''],sort_keys=True,separators=(',',':')))
            (root/'0001-route.request.json').write_text(json.dumps(record))
            (root/'0001-route.response.json').write_text('{"real_cache_fixture":true}')
            client=Journal(root)
            with patch('urllib.request.urlopen',side_effect=AssertionError('No network')):
                self.assertEqual(client.request('https://example.invalid'),dict(real_cache_fixture=True))
            self.assertEqual(client.number,1)

    def test_missing_failed_request_requires_explicit_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            record=dict(cache_key=json.dumps(['https://example.invalid',None,''],sort_keys=True,separators=(',',':')))
            (root/'0001-route.request.json').write_text(json.dumps(record))
            with self.assertRaisesRegex(RuntimeError,'retry-failed'):Journal(root).request('https://example.invalid')

    def test_proposed_stop_requires_all_nine_equal_and_analyzed_zero(self):
        # Synthetic nongeographic fixture, not a campaign observation.
        profiles=[dict(routes=['a','b']) for _ in range(9)]
        rows=[dict(id=x,analysis=dict(toll_km=0)) for x in ['a','b']]
        self.assertTrue(early_zero_exposure(profiles,rows))
        self.assertFalse(early_zero_exposure(profiles[:8],rows))
        self.assertFalse(early_zero_exposure(profiles,[dict(id='a',analysis=dict(toll_km=0)),dict(id='b')]))
        rows[1]['analysis']['toll_km']=.001
        self.assertFalse(early_zero_exposure(profiles,rows))
        rows[1]['analysis']['toll_km']=0;profiles[8]['routes']=['a']
        self.assertFalse(early_zero_exposure(profiles,rows))

    def test_time_exposure_frontier_is_not_distance_or_euros(self):
        # Synthetic numerical fixture only.
        rows=[dict(id='a',seconds=10,km=100,analysis=dict(toll_km=2)),
              dict(id='b',seconds=11,km=50,analysis=dict(toll_km=3)),
              dict(id='c',seconds=12,km=200,analysis=dict(toll_km=0))]
        self.assertEqual(pareto(rows),['a','c'])


class CompletedEvidenceTests(unittest.TestCase):
    def test_live_adapter_decisions_replay_without_network_or_future_access(self):
        from .campaign import CORRIDORS
        for name,_,_ in CORRIDORS:
            out=ROOT/'evidence'/name
            if not (out/'complete.json').exists():self.skipTest('Real campaign still running')
            reference=read(out/'reference.json')['profiles'];stored=read(out/'adaptive.json')
            requested=[]
            def oracle(pid,parameters):requested.append(pid);return reference[pid]['routes']
            profiles=[LazyProfile(f'P{i:03d}',p,oracle) for i,p in enumerate(plan(),1)]
            with patch('urllib.request.urlopen',side_effect=AssertionError('Offline replay only')):
                selected,log=adaptive(profiles,40,8)
            self.assertEqual([p['id'] for p in selected],stored['profile_ids'])
            self.assertEqual(log,stored['log'])
            self.assertEqual(requested,stored['profile_ids'])
            self.assertLessEqual(len(requested),40)
            # Poison all future answers: the selected prefix must be identical.
            future=set(reference)-set(requested)
            changed={pid:(['unseen_attractive_geometry'] if pid in future else reference[pid]['routes']) for pid in reference}
            profiles=[LazyProfile(f'P{i:03d}',p,lambda pid,parameters:changed[pid]) for i,p in enumerate(plan(),1)]
            again,_=adaptive(profiles,40,8)
            self.assertEqual([p['id'] for p in again],requested)

    def test_all_reference_profiles_and_geometry_analyses_are_preserved(self):
        from .campaign import CORRIDORS
        for name,_,_ in CORRIDORS:
            out=ROOT/'evidence'/name
            if not (out/'complete.json').exists():self.skipTest('Real campaign still running')
            reference=read(out/'reference.json');rows=read(out/'analyzed.json')['groups']
            self.assertEqual(len(reference['profiles']),105)
            self.assertEqual(len({p['id'] for p in reference['profiles'].values()}),105)
            self.assertTrue(all('analysis' in r and type(r['analysis']['toll_km']) in [int,float] for r in rows))
            self.assertEqual(sum(p['candidates'] for p in reference['profiles'].values()),sum(len(r['produced_by']) for r in rows))
            self.assertTrue(all(p['candidates']==len(p['routes']) and 1<=p['candidates']<=3 for p in reference['profiles'].values()))
            self.assertTrue(read(out/'status.json')['stable'])

    def test_completed_evaluation_reproduces_without_network(self):
        from .campaign import CORRIDORS
        from .analyze import evaluate
        for name,_,_ in CORRIDORS:
            out=ROOT/'evidence'/name
            if not (out/'evaluation.json').exists():self.skipTest('Evaluation not yet produced')
            expected=read(out/'evaluation.json')
            with patch('urllib.request.urlopen',side_effect=AssertionError('Offline only')):
                result=evaluate(name)
            self.assertEqual(json.loads(json.dumps(result)),expected)

    def test_fresh_archive_restore_and_evaluation_without_network(self):
        import shutil
        from . import archive as bundle
        from . import analyze as analysis
        from .campaign import CORRIDORS
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);evidence=root/'evidence';evidence.mkdir()
            for name in ['campaign-data.tar.xz','archive-manifest.json']:
                shutil.copyfile(ROOT/'evidence'/name,evidence/name)
            with patch.object(bundle,'ROOT',root),patch('sys.argv',['archive','restore']),patch('urllib.request.urlopen',side_effect=AssertionError('Offline restore')):
                bundle.main()
            for name,_,_ in CORRIDORS:
                for file in ['complete.json','locations.json','status.json']:
                    shutil.copyfile(ROOT/'evidence'/name/file,evidence/name/file)
                with patch.object(analysis,'ROOT',root),patch('urllib.request.urlopen',side_effect=AssertionError('Offline evaluation')):
                    result=analysis.evaluate(name)
                self.assertEqual(json.loads(json.dumps(result)),read(ROOT/'evidence'/name/'evaluation.json'))


if __name__=='__main__':unittest.main()
