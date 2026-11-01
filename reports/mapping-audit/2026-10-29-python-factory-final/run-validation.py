from pathlib import Path
import ast, datetime, hashlib, importlib.util, json, os, subprocess, sys, time
B=Path(__file__).resolve().parent;R=Path('/workspace/maxbooster7.5')
sys.path[:0]=[str(B),str(R/'scripts/testing')]

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def load(name,p):
 spec=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.ROOT=R;return m

baseline=load('baseline_factory_register',R/'scripts/testing/platform-register.py')
candidate=load('candidate_factory_register',B/'platform-register.next.py')
testmod=load('candidate_factory_tests',B/'test_python_factory_mounts.py')
# test-module environment selects source candidates before import.
def pairs(module):
 paths=module.source_paths();rows,unknown=module.python_routes(paths)
 return rows,unknown
rows0,unknown0=pairs(baseline);rows1,unknown1=pairs(candidate)
# Execute consumer AST for all actual declarations; the test helper targets the
# candidate. Baseline actual AST is used with the same exact procedure.
prior=testmod.REGISTER
try:
 testmod.REGISTER=R/'scripts/testing/platform-register.py';olditems,oldwarnings=testmod.consumer_items(rows0)
 testmod.REGISTER=B/'platform-register.next.py';newitems,newwarnings=testmod.consumer_items(rows1)
finally:testmod.REGISTER=prior
oldids={r['id'] for r in olditems};newids={r['id'] for r in newitems}
oldchecks={c['id'] for r in olditems for c in r['requiredChecks']};newchecks={c['id'] for r in newitems for c in r['requiredChecks']}
changed=[{'file':n['file'],'line':n['line'],'method':n['method'],'beforePath':o['path'],'resolvedPath':n['path'],'conditional':n.get('mountConditional'),'runtimeAvailability':n.get('runtimeAvailability'),'subjectId':n.get('declarationSubjectId'),'factory':n.get('factory'),'mountSource':n.get('mountSource')}for o,n in zip(rows0,rows1)if o!=n]
checks={
 'all221DeclarationsRetained':len(rows0)==len(rows1)==221,
 'declarationSourceOrderUnchanged':[(r['file'],r['line'],r['method'],r['handler'])for r in rows0]==[(r['file'],r['line'],r['method'],r['handler'])for r in rows1],
 'allSubjectIdsPreserved':oldids==newids,
 'noSubjectIdCollisions':len(oldids)==len(olditems) and len(newids)==len(newitems),
 'allRequiredChecksPreserved':oldchecks==newchecks,
 'allOriginalMountWarningsByteEqual':oldwarnings==newwarnings,
 'allOriginalPythonDiagnosticsRetained':unknown0==unknown1,
 'exact19FactoryDeclarations':len(changed)==19,
 'exact13UnconditionalSourcePaths':sum(not r['conditional']for r in changed)==13,
 'exact6ConditionalSourcePaths':sum(r['conditional']for r in changed)==6,
 'allRuntimeAvailabilityUnverified':all(r['runtimeAvailability']=='UNVERIFIED'for r in changed),
 'currentPlatformBackendCountPreserved':len(json.loads((R/'reports/test-verification/platform-register.json').read_text())['backendRoutes'])==2909,
}
(B/'actual-source-comparison.json').write_text(json.dumps({'scope':'Source parsing/actual consumer AST only, not current master or runtime proof','checks':checks,'before':{'declarations':len(rows0),'subjectIds':len(oldids),'checks':len(oldchecks),'mountWarnings':len(oldwarnings)},'after':{'declarations':len(rows1),'subjectIds':len(newids),'checks':len(newchecks),'mountWarnings':len(newwarnings)},'changed':changed},indent=2)+'\n')
for name,rows,unknown in [('baseline',rows0,unknown0),('candidate',rows1,unknown1)]:
 (B/(name+'-python.json')).write_text(json.dumps({'rows':rows,'unknown':unknown},indent=2)+'\n')
env={**os.environ,'MAXBOOSTER_FACTORY_REPO_ROOT':str(R),'PYTHON_FACTORY_MOUNTS_CANDIDATE':str(B/'python_factory_mounts.py'),'PLATFORM_REGISTER_CANDIDATE':str(B/'platform-register.next.py')}
command=[sys.executable,'-m','unittest','discover','-s',str(B),'-p','test_python_factory_mounts.py','-v']
started=datetime.datetime.now(datetime.timezone.utc).isoformat();clock=time.monotonic()
p=subprocess.run(command,cwd=R,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=30)
(B/'focused-tests.txt').write_text(p.stdout)
receipt={'scope':'Outside-checkout candidate only','startedAt':started,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':command,'exitCode':p.returncode,'durationSeconds':round(time.monotonic()-clock,6),'sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),'rootConsumerSha256':sha(R/'scripts/testing/platform-register.py'),'candidateConsumerSha256':sha(B/'platform-register.next.py'),'helperSha256':sha(B/'python_factory_mounts.py'),'testsSha256':sha(B/'test_python_factory_mounts.py'),'testCases':21,'staticComparisonChecks':checks,'productionReady':False,'canonicalChanges':False}
(B/'validation-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'testsExit':p.returncode,'tests':21,'staticChecks':checks,'changedFactoryRows':len(changed)}))
raise SystemExit(p.returncode or int(not all(checks.values())))
