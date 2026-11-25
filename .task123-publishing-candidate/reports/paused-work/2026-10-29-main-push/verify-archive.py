from pathlib import Path
import hashlib,json,tarfile
base=Path(__file__).resolve().parent
m=json.loads((base/'manifest.json').read_text());archive=base/m['archive']['path']
assert hashlib.sha256(archive.read_bytes()).hexdigest()==m['archive']['sha256']
with tarfile.open(archive) as t:
 rows=t.getmembers();assert len(rows)==len(m['members'])
 for a,e in zip(rows,m['members']):
  assert a.isfile() and a.name==e['path'] and a.size==e['bytes']
  assert hashlib.sha256(t.extractfile(a).read()).hexdigest()==e['sha256']
print(json.dumps({'status':'PASS','verifiedMembers':len(m['members']),'scope':'Artifact preservation only; no tests or services run'}))
