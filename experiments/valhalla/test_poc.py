"""Offline tests with synthetic fixtures, never presented as real routing results."""
import tempfile
import unittest
from pathlib import Path
from analyse_campaign import axes_for
from poc import analyse_edges, corridor, decode, near_duplicate, plan, summarize


def encode(points):
    result, previous = '', [0,0]
    for lon,lat in points:
        for axis, value in enumerate([lat,lon]):
            integer=round(value*1e6)
            delta=integer-previous[axis]
            previous[axis]=integer
            delta=~(delta<<1) if delta<0 else delta<<1
            while delta>=32:
                result+=chr((32|(delta&31))+63)
                delta>>=5
            result+=chr(delta+63)
    return result


class ExperimentTests(unittest.TestCase):
    def setUp(self):
        self.points=[[5,46],[5.01,46.01],[5.02,46.02],[5.03,46.03]]
        self.route={'km':5,'points':self.points}
        self.trace={'units':'kilometers','shape':encode(self.points),'edges':[
            dict(toll=t,length=km,begin_shape_index=i,end_shape_index=i+1,names=[name])
            for i,(t,km,name) in enumerate([(True,1,'A6'),(False,3,'D1'),(True,1,'A6')])]}

    def test_axes_do_not_double_count_aliases(self):
        self.assertEqual(axes_for([{'names':['A 6','A6','Autoroute du Soleil'],'length':10}]), [('A6',10)])

    def test_polyline6_roundtrip(self):
        self.assertEqual(decode(encode(self.points)),self.points)
        with self.assertRaises(ValueError): decode('_')

    def test_plan(self):
        profiles=plan()
        self.assertEqual(len(profiles),105)
        self.assertEqual(len({tuple(sorted(p.items())) for p in profiles}),105)
        self.assertTrue(profiles[-1]['exclude_tolls'])
        self.assertIn(dict(use_tolls=.5,toll_booth_penalty=0,use_highways=.5,toll_booth_cost=15),profiles)

    def test_hybrid_and_toll_distance(self):
        result=analyse_edges(self.trace,self.route)
        self.assertEqual(result['toll_km'],2)
        self.assertEqual(result['toll_percent'],40)
        self.assertEqual(len(result['hybrid_free_gaps']),1)
        self.assertEqual(result['hybrid_free_gaps'][0]['start'],self.points[1])
        self.assertEqual(result['axes'],['A6','D1'])

    def test_unknown_units_rejected(self):
        self.trace['units']='miles'
        with self.assertRaises(ValueError): analyse_edges(self.trace,self.route)

    def test_missing_toll_not_assumed_free(self):
        del self.trace['edges'][0]['toll']
        with self.assertRaises(ValueError): analyse_edges(self.trace,self.route)

    def test_mismatched_trace_rejected(self):
        self.trace['edges'][0]['length']=10
        with self.assertRaises(ValueError): analyse_edges(self.trace,self.route)

    def test_no_reentry_not_hybrid(self):
        self.trace['edges'][-1]['toll']=False
        self.assertEqual(analyse_edges(self.trace,self.route)['hybrid_free_gaps'],[])

    def test_duplicates_and_distinct_corridors(self):
        a=dict(km=5,seconds=600,_corridor=corridor(self.points))
        self.assertTrue(near_duplicate(a,a))
        b=dict(a,_corridor=corridor([[6,47],[6.03,47.03]]))
        self.assertFalse(near_duplicate(a,b))
        self.assertFalse(near_duplicate(a,dict(a,seconds=610)))

    def test_empty_report_never_fabricates_routes(self):
        with tempfile.TemporaryDirectory() as directory:
            summarize(Path(directory),[],{'status':1},['blocked'])
            text=(Path(directory)/'results.json').read_text()
            self.assertIn('"routes": []',text)
            self.assertIn('blocked',text)


if __name__=='__main__': unittest.main()
