from pathlib import Path
import hashlib,json
p=Path(__file__).resolve().parent
m=json.loads((p/'manifest.json').read_text())
for r in m['artifacts']:
 f=p/r['path']
 assert f.is_file() and not f.is_symlink() and f.resolve().is_relative_to(p)
 assert f.stat().st_size==r['bytes'] and hashlib.sha256(f.read_bytes()).hexdigest()==r['sha256'], r['path']
assert set(r['path'] for r in m['artifacts'])==set(str(f.relative_to(p)) for f in p.rglob('*') if f.is_file() and f.name!='manifest.json' or f.is_file() and f.name=='manifest.json' and f.parent!=p)
for original in json.loads((p/'copied-files.json').read_text())['originalManifests']:
 f=p/original['path'];d=json.loads(f.read_text());rows=list(d['files'].items()) if isinstance(d.get('files'),dict) else [(r['path'],r['sha256']) for r in d.get('artifacts',[])]
 for name,sha in rows: assert hashlib.sha256((f.parent/name).read_bytes()).hexdigest()==sha
assert not any(f.is_symlink() for f in p.rglob('*'))
print(json.dumps({'verifiedFiles':len(m['artifacts']),'originalManifestMembers':sum(x['originalMembersVerified'] for x in json.loads((p/'copied-files.json').read_text())['originalManifests']),'status':'PASS','scope':'Offline immutable artifact verification only'}))
