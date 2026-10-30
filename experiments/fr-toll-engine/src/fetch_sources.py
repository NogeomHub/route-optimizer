"""Restore pinned public sources privately; never replace expected hashes.

Usage: python src/fetch_sources.py aprr-2026.pdf [other-source-id ...]
No argument downloads the APRR PDF needed to re-import this experiment only.
No protected calculators, credentials, rate bypass or permissive TLS fallback.
"""
import hashlib,json,sys,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
for id in sys.argv[1:] or ['aprr-2026.pdf']:
    record=next(r for r in json.loads((ROOT/'sources/observations.json').read_text())if r['id']==id)
    if record.get('status')!=200 or not record.get('sha256'):raise ValueError('Source never successfully obtained; do not pretend to restore it')
    path=ROOT/'local'/id
    if not path.exists():
        path.parent.mkdir(exist_ok=True)
        with urllib.request.urlopen(urllib.request.Request(record['url'],headers={'User-Agent':'RouteOptimizer-TariffResearch/0.1; personal research'}),timeout=60)as response:
            raw=response.read(20*1024*1024+1)
            if len(raw)>20*1024*1024:raise ValueError('Unexpectedly large source; inspect manually')
        if hashlib.sha256(raw).hexdigest()!=record['sha256']:raise ValueError('Live document differs: STOP, create a new staged import and audit; do not overwrite the expected digest')
        path.write_bytes(raw)
    if hashlib.sha256(path.read_bytes()).hexdigest()!=record['sha256']:raise ValueError('Local source integrity mismatch')
    print('Verified',id)
