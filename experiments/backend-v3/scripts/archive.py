"""Archive the REAL local evidence for offline replay; no network or invented data.
Run from experiments/backend-v3 after live/validation checks.
"""
import hashlib
import json
from pathlib import Path
import tarfile

root = Path('evidence')
files = sorted(p for p in (root/'live').rglob('*') if p.is_file())
if not files:
    raise SystemExit('No actual live evidence to archive')
manifest = {}
with tarfile.open(root/'live-data.tar.xz', 'w:xz', preset=6) as archive:
    for path in files:
        name = str(path.relative_to(root))
        manifest[name] = dict(bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest())
        info = archive.gettarinfo(path, arcname=name)
        info.uid = info.gid = info.mtime = 0
        info.uname = info.gname = ''
        info.mode = 0o600
        with path.open('rb') as body:
            archive.addfile(info, body)
(root/'archive-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print('Archived',len(files),'real evidence files;', (root/'live-data.tar.xz').stat().st_size,'compressed bytes')
