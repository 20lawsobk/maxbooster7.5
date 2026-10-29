from pathlib import Path
import ast,datetime,hashlib,json,subprocess
B=Path(__file__).resolve().parent;R=Path('/workspace/maxbooster7.5')
source=R/'scripts/testing/platform-register.py';candidate=B/'platform-register.next.py';patch=B/'candidate-source.patch'
base=json.loads((B/'base.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
a={n.name:n for n in ast.parse(source.read_text()).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
b={n.name:n for n in ast.parse(candidate.read_text()).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
checks={'sourceBaseUnchanged':sha(source)==base['sourceSha256'],'pairedFactoryImportPresent':'_FACTORY_SPEC.loader.exec_module(_FACTORY)'in candidate.read_text(),'pairedJunitImportRetained':'_JUNIT_SPEC.loader.exec_module(_JUNIT)'in candidate.read_text(),'noFunctionLocalHelperImport':'from python_factory_mounts import'not in candidate.read_text(),'allOtherSourceFunctionsUnchanged':set(a)==set(b)and all(ast.dump(a[k],include_attributes=False)==ast.dump(b[k],include_attributes=False)for k in a if k not in {'main','python_routes'}),'threeFilePatchOnly':[line[6:]for line in patch.read_text().splitlines()if line.startswith('+++ b/')]==['scripts/testing/platform-register.py','scripts/testing/python_factory_mounts.py','tests/testing/test_python_factory_mounts.py']}
command=['git','apply','--check',str(patch)];p=subprocess.run(command,cwd=R,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=30)
checks['gitApplyCheckPassed']=p.returncode==0
report={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSha256':sha(source),'candidateSha256':sha(candidate),'patchSha256':sha(patch),'command':command,'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'checks':checks,'canonicalChanges':False}
(B/'final-review.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
raise SystemExit(int(not all(checks.values())))
