"""Restore cited official originals locally, never redistribute them.

Usage: python experiments/tolls/completion/sources/fetch_sources.py
Open snapshots are already versioned; computations need no network. A changed
source fails closed. Rendered HTML hashes document a consultation, not a promise
that a future browser render (cookies/scripts) will reproduce identical bytes.
"""
import hashlib
import json
from pathlib import Path
import urllib.request


def main():
    root = Path(__file__).resolve().parent
    for item in json.loads((root/'manifest.json').read_text()):
        path = root/item['path']
        if path.exists():
            raw = path.read_bytes()
        elif item['format'] == 'Browser-rendered public HTML':
            print('Consult public article in a browser; rendered capture not automatically restored:', item['url'])
            continue
        else:
            with urllib.request.urlopen(item['url'], timeout=45) as response:
                raw = response.read()
            if item['format'] == 'PDF' and not raw.startswith(b'%PDF-'):
                raise ValueError('Expected a PDF, got HTML / fallback response: '+item['url'])
        if hashlib.sha256(raw).hexdigest() != item['sha256']:
            raise ValueError('Source changed; do not silently replace the audited snapshot: '+item['id'])
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        print('Verified:', item['id'])


if __name__ == '__main__':
    main()
