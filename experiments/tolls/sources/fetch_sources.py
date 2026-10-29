"""Restore source files; pinned digests forbid silently using updated tariffs.
APRR originals stay LOCAL (no open republication licence identified).
Open-licensed OSM/MTE snapshots are restored from the repository, not re-queried.
"""
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request

root=Path(__file__).resolve().parent
local=root/'local'
local.mkdir(exist_ok=True)
for record in json.loads((root/'manifest.json').read_text()):
    target=local/record['filename']
    if not target.exists():
        if record['published_snapshot']:
            shutil.copyfile(root/record['published_snapshot'],target)
        else:
            request=urllib.request.Request(record['url'],headers={'User-Agent':'RouteOptimizer-Research/0.2'})
            with urllib.request.urlopen(request,timeout=60) as response:
                target.write_bytes(response.read())
    if hashlib.sha256(target.read_bytes()).hexdigest()!=record['sha256']:
        raise SystemExit(f'Source differs from snapshot: {target}. STOP: do not overwrite expected digest or reuse as 2026 rates.')
    print('Verified',record['filename'])
