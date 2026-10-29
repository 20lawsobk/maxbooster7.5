#!/usr/bin/env python3
"""Read-only byte/wrapper/receipt verification; no app execution or JSON typing inference."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
s=json.loads((ROOT/'summary.json').read_text())
for artifact in s['artifacts']:
    p=ROOT/artifact['file']
    assert p.is_file() and p.stat().st_size==artifact['bytes'] and sha(p.read_bytes())==artifact['sha256'],str(p)
p1=ROOT/'p1-shared-3';receipt=json.loads((p1/'receipt.json').read_text());manifest=json.loads((p1/'manifest.json').read_text());rawbytes=(p1/'raw-v8.json').read_bytes();assert sha(rawbytes)==manifest['rawSha256'];raw=json.loads(rawbytes);ids={r['scriptId']:r for r in raw['result']};assert len(ids)==len(raw['result'])
assert receipt['status']=='typed_compatible_unmerged' and receipt['exitCode']==0 and len(receipt['profiles'])==9
assert receipt['sourceInputs']['unchanged'] and receipt['sourceInputs']['beforeSha256']==receipt['sourceInputs']['afterSha256']==s['sourceInputs']['beforeSha256']
assert receipt['cleanup']['complete'] and not receipt['cleanup']['remainingLivePids']
assert receipt['globalCoverage']['beforeSha256']==receipt['globalCoverage']['afterSha256']
assert all(all(p['mapComparison'].values()) for p in receipt['profiles'])
counts={}
for item in manifest['scripts']:
    assert ids[item['scriptId']]==item['coverage']
    code=(p1/item['codeFile']).read_text();body=(p1/item['bodyFile']).read_text();mapbytes=(p1/item['mapFile']).read_bytes()
    assert code==item['prefix']+body+item['suffix'] and len(item['prefix'].encode('utf-16-le'))//2==item['wrapperLength']==209
    assert sha(code.encode())==item['codeSha256'] and sha(body.encode())==item['bodySha256'] and sha(mapbytes)==item['mapSha256']
    length=len(code.encode('utf-16-le'))//2
    for f in item['coverage']['functions']:
        assert isinstance(f['functionName'],str) and isinstance(f['isBlockCoverage'],bool)
        enclosing=f['ranges'][0]
        for r in f['ranges']:assert 0<=enclosing['startOffset']<=r['startOffset']<=r['endOffset']<=enclosing['endOffset']<=length and type(r['count']) is int and r['count']>=0
    stem=item['file'].removeprefix(manifest['root']+'/').replace('/','__');typed=json.loads((p1/(stem+'.typed.json')).read_text());wirebytes=(p1/(stem+'.wire.json')).read_bytes();assert sha(wirebytes)==typed['wireSha256']
    for tag in typed['sentinels']:counts[tag['type']]=counts.get(tag['type'],0)+1
    if stem=='server__config__ports.ts':
        wire=json.loads(wirebytes);key=next(k for k,v in wire['fnMap'].items() if v['name']=='loopbackUrl');assert wire['f'][key]==0 and any(n==0 for b in wire['b'].values() for n in b)
assert counts=={'positive-infinity':7434,'undefined':3080}
canonical=json.loads((ROOT/'canonical-raw-2/run.json').read_text());assert canonical['cleanup']['complete'] and not canonical['ownedPostgresAfterRun'] and canonical['sourceInputsUnchanged'] and canonical['globalCoverageUnchanged']
assert len(json.loads((ROOT/'canonical-raw-2/raw/manifest.json').read_text())['files'])==9
assert len(json.loads((ROOT/'canonical-raw-2/full-denominator-inventory.json').read_text())['files'])==2652
assert not s['mergedIntoGlobalCoverage'] and not s['productionReady']
print('PASS: retained artifact hashes,9 exact raw scripts/wrappers,27 recorded map matches, typed sentinel inventory, zero witnesses and owned cleanup; no global merge')
