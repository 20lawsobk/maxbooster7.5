#!/usr/bin/env python3
"""Read-only validation of this map-only trace; not test execution or merge approval."""
from pathlib import Path
import argparse,hashlib,json,collections,sys
P=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--repo',type=Path,default=P.parents[2]);args=parser.parse_args();R=args.repo.resolve()
def load(name):return json.loads((P/name).read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
checks={}
def check(name,value):checks[name]=bool(value)
base=load('baseline-a160-selected.json');preserved=load('baseline-preservation.json');controls=load('typed-review/supported-vite-ssr-controls.json');rows=controls.get('controls',[])
check('all-nine-controls-retained',len(rows)==9 and len({r['file']for r in rows})==9 and controls['notRun']==[])
check('saved-baseline-identity',sha(P/'baseline-a160-selected.json')==preserved['savedFiles']['baseline-a160-selected.json'])
check('saved-node-profile-identity',sha(P/'node-bca-selected.json')==preserved['savedFiles']['node-bca-selected.json'])
for item in rows:
 rel=item['file'];stem=rel.replace('/','__');matches=[k for k in base if k.endswith('/'+rel)];assert len(matches)==1
 control=load('controls/'+stem+'.vite-tsconfig-ssr.profile.json');source=R/rel
 check('source:'+rel,sha(source)==item['sourceSha256'])
 check('code:'+rel,sha(P/'controls'/f'{stem}.vite-tsconfig-ssr.js')==item['codeSha256'])
 check('map:'+rel,sha(P/'controls'/f'{stem}.vite-tsconfig-ssr.js.map')==item['mapSha256'])
 for key in ['statementMap','fnMap','branchMap']:
  check(key+':'+rel,control[key]==base[matches[0]][key] and item['comparison'][key]['serializedArtifactEqual'] is True)
 check('all-zero:'+rel,all(type(v)is int and v==0 for k in ['s','f','b']for value in control[k].values()for v in (value if isinstance(value,list) else [value])))
 check('no-runtime-claim:'+rel,item['executed']is False and item['allCountersZero']is True)
check('scope-no-merge',controls['productionReady']is False and controls['mergedIntoGlobalCoverage']is False)
typed=load('typed-review/typed-differences.json');counts=collections.Counter();locations=collections.defaultdict(set)
for item in typed['files']:
 for rows2 in item['maps'].values():
  for d in rows2:
   if d['kind']=='primitive-or-kind-difference':
    assert d['raw']=={'kind':'number','value':'+Infinity'} and d['wire']=={'kind':'object','value':None} and d['path'].endswith('.end.column');counts['infinity']+=1
   else:
    assert d['kind']=='own-property-presence'and d['raw']=={'kind':'undefined'}and d['wire']=={'kind':'absent'}
    parts=d['path'].split('.');assert parts[0]=='branchMap' and parts[2]=='locations';locations[(item['file'],'.'.join(parts[:-2]))].add('.'.join(parts[-2:]));counts['undefined']+=1
check('typed-infinity-count',counts['infinity']==7434)
check('typed-undefined-count',counts['undefined']==3080)
check('complete-synthetic-locations',len(locations)==770 and all(x=={'start.line','start.column','end.line','end.column'}for x in locations.values()))
execution=load('typed-review/execution-receipt.json');check('pure-replay-exit-zero',type(execution['exitCode'])is int and execution['exitCode']==0)
check('pure-replay-inputs-unchanged',execution['commonUnchanged']is True and execution['canonicalUnchanged']is True and execution['appCredentialsForwarded']is False)
api=load('runtime-wrapper-and-public-api-evidence.json')
for item in api['files']:check('installed-observed-api:'+item['path'],sha(R/item['path'])==item['sha256'])
current_observation=load('current-10d-map-comparison.json');canonical=R/'reports/test-verification/coverage/coverage-final.json'
if canonical.is_file() and sha(canonical)==current_observation['canonicalSha256']:
 current=json.loads(canonical.read_text())
 for item in controls['controls']:
  matches=[key for key in current if key.endswith('/'+item['file'])];assert len(matches)==1
  oldmatches=[key for key in base if key.endswith('/'+item['file'])];assert len(oldmatches)==1
  for key in ['statementMap','fnMap','branchMap']:check('current-complete-map:'+key+':'+item['file'],current[matches[0]][key]==base[oldmatches[0]][key])
else:check('current-canonical-still-recorded-snapshot',False)
manifest=P/'manifest.json'
if manifest.is_file():
 for item in load('manifest.json')['files']:
  file=P/item['path'];check('artifact:'+item['path'],file.is_file() and file.stat().st_size==item['bytes'] and sha(file)==item['sha256'])
check('no-symlink-artifacts',all(not p.is_symlink()for p in P.rglob('*')))
result={'scope':'Read-only artifact/source/API/map compatibility validation; not execution coverage, policy adoption or launch acceptance','passed':sum(checks.values()),'failed':sum(not v for v in checks.values()),'failedChecks':[k for k,v in checks.items()if not v],'checked':len(checks),'productionReady':False,'mergedIntoGlobalCoverage':False}
print(json.dumps(result,indent=2));sys.exit(bool(result['failed']))
