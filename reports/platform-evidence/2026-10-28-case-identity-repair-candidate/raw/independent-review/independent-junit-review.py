from pathlib import Path
import datetime, hashlib, importlib.util, json, tempfile
B=Path(__file__).resolve().parent
P=Path('/workspace/onboarding-results/case-identity-repairs/python/subject/scripts/testing/junit_evidence.py')
spec=importlib.util.spec_from_file_location('independent_junit_review',P)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
xml='<testsuites><testsuite name="outer"><testsuite name="inner"><testcase classname="A" name="same"/><testcase classname="B" name="same"><failure message="bad"/></testcase><testcase classname="A" name="same"><skipped/></testcase><testcase classname="A" name="unique"/></testsuite><testcase file="x.py" classname="C" name="rootcase"/></testsuite></testsuites>'
with tempfile.TemporaryDirectory(prefix='independent-junit-scope-') as d:
 f=Path(d)/'cases.xml';f.write_text(xml)
 rows=m.read_cases(f,'python','subject.py');plain=m.read_cases(f,'http')
 checks={
 'distinctClassesQualifiedAndSameClassDuplicatePreserved':[r['name'] for r in rows]==['A::same','B::same','A::same','unique','rootcase'],
 'allPassFailureSkipOccurrencesRetained':[r['status']for r in rows]==['passed','failed','skipped','passed','passed'],
 'producerOwnedDefaultFileRetained':all(r['file']=='subject.py'for r in rows),
 'nestedAndRootSuiteMetadataRetained':rows[0]['suiteNames']==['outer','inner'] and rows[-1]['suiteNames']==['outer'],
 'nonPythonRawIdentityUnchanged':[r['name']for r in plain]==['same','same','same','unique','rootcase'],
 }
receipt={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'subject':str(P),'subjectSha256':hashlib.sha256(P.read_bytes()).hexdigest(),'scope':'Independent helper review; no current-source feature acceptance or full master claim','checks':checks,'passed':all(checks.values())}
(B/'independent-junit-review.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
raise SystemExit(0 if all(checks.values()) else 1)
