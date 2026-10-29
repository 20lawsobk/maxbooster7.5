#!/usr/bin/env python3
"""Use actual frozen-master proof reader and exact link resolver; never issue acceptance."""
from pathlib import Path
import copy,datetime,hashlib,importlib.util,json,subprocess,sys,difflib
ROOT=Path('/workspace/maxbooster7.5');OUT=Path(__file__).resolve().parent
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'scripts/testing'))
import common
spec=importlib.util.spec_from_file_location('linker',ROOT/'scripts/testing/platform-register.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
register=json.loads((ROOT/'reports/test-verification/platform-register.json').read_text())
original=json.loads((ROOT/'tests/platform-acceptance-map.json').read_text())
inventory=json.loads((ROOT/'reports/test-verification/test-inventory.json').read_text())
entries={r['path']:r for r in inventory['entries'] if r['category']=='test'}
inputs_before=common.source_inputs()
passed,state=m.collect_current_passing_cases(ROOT/'reports/test-verification',inputs_before,root=ROOT)
assert state['status']=='CURRENT' and state['sourceInputsMatchCurrent'] is True
checks={c['id'] for kind in ['pages','interactions','backendRoutes'] for r in register[kind] for c in r['requiredChecks']}
ctx={'check_ids':checks,'platform_digest':register['platformSourceDigest'],'test_entries':entries,'passed_cases':passed,'root':ROOT}
old_results=[m.resolve_evidence_cases(r,**ctx) for r in original['checks']]
assert all(r is None for r in old_results)
candidate=copy.deepcopy(original)
for r in candidate['checks']:r['platformSourceDigest']=register['platformSourceDigest']
results=[m.resolve_evidence_cases(r,**ctx) for r in candidate['checks']]
assert all(results) and len(results)==9 and sum(map(len,results))==23
assert all(x['group']=='http' for row in results for x in row)
controls=[]
def reject(label,mapping,context=ctx):
 assert m.resolve_evidence_cases(mapping,**context) is None,label
 controls.append({'name':label,'status':'PASS'})
row=copy.deepcopy(candidate['checks'][6]);row['platformSourceDigest']='stale-platform';reject('stale-platform-digest',row)
for key,val in [('testSha256','0'*64),('caseName','approximate passing test'),('group','root-unit'),('testFile','tests/unknown.test.ts')]:
 row=copy.deepcopy(candidate['checks'][6]);row['cases'][-1][key]=val;reject('wrong-'+key,row)
for label in ['missing','failed','skipped']:
 row=copy.deepcopy(candidate['checks'][6]);context=copy.copy(ctx);context['passed_cases']=set(passed)
 c=row['cases'][-1];context['passed_cases'].remove((c['group'],c['testFile'],c['caseName']));c['status']=label
 reject(label+'-required-member',row,context)
row=copy.deepcopy(candidate['checks'][6]);row['cases'].append(copy.deepcopy(row['cases'][0]));reject('duplicate-member',row)
row=copy.deepcopy(candidate['checks'][6]);row['checkId']='api-unknown/access-policy';reject('unknown-check',row)
changed=copy.deepcopy(inputs_before);changed['files']['tests/billing-lifecycle.test.ts']='0'*64
changed['sha256']=hashlib.sha256(json.dumps(changed['files'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
stale_passed,stale=m.collect_current_passing_cases(ROOT/'reports/test-verification',changed,root=ROOT)
assert stale_passed==set() and stale['status']=='STALE_OR_MISSING'
context=copy.copy(ctx);context['passed_cases']=stale_passed
reject('digest-refresh-cannot-rescue-stale-execution',copy.deepcopy(candidate['checks'][6]),context)
inputs_after=common.source_inputs();assert inputs_before==inputs_after
old=json.loads(subprocess.check_output(['git','show','HEAD:reports/test-verification/platform-register.json'],cwd=ROOT))
changes=[p for p in old['sourceInputsSha256'] if old['sourceInputsSha256'].get(p)!=register['sourceInputsSha256'].get(p)]
map_file=ROOT/'tests/platform-acceptance-map.json'
raw=map_file.read_text();new=json.dumps(candidate,indent=2)+'\n'
assert json.loads(raw)==original
(OUT/'candidate-map.json').write_text(new)
(OUT/'source.patch').write_text(''.join(difflib.unified_diff(raw.splitlines(keepends=True),new.splitlines(keepends=True),fromfile='a/tests/platform-acceptance-map.json',tofile='b/tests/platform-acceptance-map.json')))
report={'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'sourceInputsSha256':inputs_before['sha256'],'sourceInputsUnchanged':True,'actualCurrentMasterInputsSha256':state['recordedSourceInputsSha256'],'masterStatus':json.loads((ROOT/'reports/test-verification/orchestration/results.json').read_text())['status'],'oldPlatformDigest':original['checks'][0]['platformSourceDigest'],'currentPlatformDigest':register['platformSourceDigest'],'changedPlatformDigestInputs':changes,'originalInvalidLinks':len(old_results),'candidateResolvedLinks':len(results),'candidateResolvedCaseReferences':sum(map(len,results)),'negativeControls':controls,'bindings':[{'checkId':mapping['checkId'],'resolvedCases':rows} for mapping,rows in zip(candidate['checks'],results)],'scope':'Actual full master current leaf proof + prospective map-only refresh. Does not mutate root map, canonical register, readiness or any page designation. Candidate source would require fresh full master after landing.','productionReady':False}
(OUT/'recheck.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='bindings'},indent=2))
