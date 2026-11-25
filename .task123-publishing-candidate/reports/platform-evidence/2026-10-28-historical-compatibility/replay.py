from pathlib import Path
import sys, json, hashlib, importlib.util, datetime
ROOT=Path('/workspace/maxbooster7.5')
OUT=ROOT/'reports/platform-evidence/2026-10-28-historical-compatibility'
sys.path.insert(0,str(ROOT/'scripts/testing'))
import common

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load_module(p):
 spec=importlib.util.spec_from_file_location('historical_provenance_review',p)
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
module_path=ROOT/'scripts/testing/platform-register.py'
before=common.source_inputs()
coverage=ROOT/'reports/test-verification/coverage/coverage-final.json'
protected={str(p.relative_to(ROOT)):sha(p) for p in [module_path,ROOT/'tests/testing/test_platform_evidence.py',coverage]}
incoming=ROOT/'reports/test-verification'
historical=json.loads((incoming/'orchestration/source-inputs.json').read_text())
master=json.loads((incoming/'orchestration/results.json').read_text())
assert historical['sha256']=='e63075778a6d1617379217a3bf111bd51338fd12f3a75bbd628131f88aa0bd69'
assert master['sourceRevision']=='a1603b13b6352a978e3877a2f43f1ccd98a98a18'
module=load_module(module_path)
passed,state=module.collect_current_passing_cases(incoming,historical,root=ROOT)
actual_passed,actual_state=module.collect_current_passing_cases(incoming,before,root=ROOT)
expected=set()
acceptance=json.loads((ROOT/'tests/platform-acceptance-map.json').read_text())
for row in acceptance['checks']:
 for case in row.get('cases',[row]):expected.add((case['group'],case['testFile'],case['caseName']))
assert len(expected)==8 and all(case[0]=='http' for case in expected)
checks={'historicalSourceExact':historical['sha256']==master['sourceInputsSha256'],
        'historicalCurrentInputsInjectedOnlyForCompatibility':historical['sha256']!=before['sha256'],
        'eightUniqueReviewedHTTPIdentities':len(expected)==8,
        'allEightHistoricalRawHTTPIdentitiesAccepted':expected<=passed,
        'realCurrentSourceRejectsHistoricalLedger':not actual_passed and actual_state['sourceInputsMatchCurrent'] is False}
after=common.source_inputs()
checks['currentSourceInputsUnchanged']=before['sha256']==after['sha256']
checks['protectedSourceAndCoverageUnchanged']=all(sha(ROOT/name)==wanted for name,wanted in protected.items())
receipt={'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'scope':'Read-only historical real-master schema compatibility replay; recorded historical inputs injected only as a diagnostic fixture, never current execution proof',
 'productionReady':False,'currentSourceInputsSha256':before['sha256'],'historicalSourceInputsSha256':historical['sha256'],
 'historicalSourceRevision':master['sourceRevision'],'protectedSha256':protected,
 'checks':checks,'historicalCompatibility':{'passingIdentities':len(passed),'expectedReviewedIdentities':[list(x) for x in sorted(expected)],'missing':[list(x) for x in sorted(expected-passed)],'provenance':state},
 'actualCurrentSourceDecision':actual_state,'limits':['No product case reran. This checks the new gate against previously retained actual command/XML/TAP schemas only.','No current readiness, feature completion, coverage merge or full-master pass follows from injected historical input compatibility.']}
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
(OUT/'replay.py').write_text(Path(__file__).read_text())
print(json.dumps({'checks':checks,'historicalPassingIdentities':len(passed),'currentPassingIdentities':len(actual_passed),'expectedHTTP':len(expected),'missingHTTP':len(expected-passed)}))
raise SystemExit(not all(checks.values()))
