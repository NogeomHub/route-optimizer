"""Pack/restore real campaign inputs, byte-for-byte; no network.
python -m experiments.valhalla.validation.archive pack
python -m experiments.valhalla.validation.archive restore
"""
import argparse
import lzma
import hashlib
import io
import re
import tarfile
from .campaign import ROOT, CORRIDORS, read, save

FILES={'reference.json','analyzed.json','adaptive.json','routes.geojson','progress.json'}


def allowed(name):
    parts=name.split('/')
    if len(parts)!=2:return False
    if parts[0]=='network':
        return bool(re.fullmatch(r'\d+-[a-z_]+\.(request\.json|response\.json|error\.json|http-error-body)',parts[1]))
    return parts[0] in {n for n,_,_ in CORRIDORS} and parts[1] in FILES


def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('action',choices=['pack','restore']);args=ap.parse_args()
    evidence=ROOT/'evidence';dest=evidence/'campaign-data.tar.xz';manifest=evidence/'archive-manifest.json'
    if args.action=='pack':
        for name,_,_ in CORRIDORS:
            if not (evidence/name/'complete.json').exists():raise ValueError('Cannot package an incomplete corridor: '+name)
        paths=sorted(p for p in evidence.rglob('*') if p.is_file() and allowed(str(p.relative_to(evidence))))
        hashes={str(p.relative_to(evidence)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
        with lzma.open(dest,'wb',preset=6) as compressed,tarfile.open(fileobj=compressed,mode='w') as archive:
            for p in paths:
                data=p.read_bytes();info=tarfile.TarInfo(str(p.relative_to(evidence)));info.size=len(data);info.mode=0o644;info.mtime=0
                archive.addfile(info,io.BytesIO(data))
        save(manifest,dict(archive_sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),files=hashes))
        print('Packaged',len(paths),'inputs;',dest.stat().st_size,'bytes')
    else:
        hashes=read(manifest)
        if hashlib.sha256(dest.read_bytes()).hexdigest()!=hashes['archive_sha256']:raise ValueError('Archive changed')
        restored=set()
        with tarfile.open(dest) as archive:
            for member in archive.getmembers():
                if not member.isfile() or not allowed(member.name) or member.name not in hashes['files']:raise ValueError('Unexpected archive member')
                data=archive.extractfile(member).read()
                if hashlib.sha256(data).hexdigest()!=hashes['files'][member.name]:raise ValueError('Member changed')
                p=evidence/member.name;p.parent.mkdir(parents=True,exist_ok=True)
                if p.exists() and p.read_bytes()!=data:raise ValueError('Refusing to overwrite divergent local evidence')
                p.write_bytes(data);restored.add(member.name)
        if restored!=set(hashes['files']):raise ValueError('Missing archive members')
        print('Verified/restored',len(restored),'inputs')


if __name__=='__main__':main()
