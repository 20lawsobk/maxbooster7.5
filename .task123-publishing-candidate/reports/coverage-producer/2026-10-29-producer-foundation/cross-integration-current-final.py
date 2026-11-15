"""Exercise parent byte binding around the actual public Vitest reporter."""
import datetime,hashlib,importlib.util,json,os,pathlib,shutil,sys,tempfile,xml.etree.ElementTree as ET
sys.dont_write_bytecode=True
BASE=pathlib.Path('/workspace/onboarding-results/c5-producer-foundation')
REPO=pathlib.Path('/workspace/maxbooster7.5')
PARENT=BASE/'parent/candidate/scripts/testing/run-all.py'
REPORTER=BASE/'reporter/scripts/testing/coverage-outcome-reporter.mjs'
sys.path.insert(0,str(PARENT.parent))
spec=importlib.util.spec_from_file_location('actual_coverage_parent',PARENT);runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
node=shutil.which('node');assert node
output=BASE/'cross-actual-current-final';output.mkdir(exist_ok=True)
results=[]
for mode in ['clean','threshold','unhandled','repeat']:
 with tempfile.TemporaryDirectory(prefix='c5-bound-') as folder:
  fixture=pathlib.Path(folder);target=fixture/'evidence';(target/'root').mkdir(parents=True);(fixture/'node_modules').symlink_to(REPO/'node_modules',target_is_directory=True)
  threshold=100 if mode in ['threshold','unhandled'] else 0
  config={'root':str(fixture),'cacheDir':str(fixture/'cache'),'test':{'include':['actual.test.ts'],'pool':'forks','maxWorkers':1,'retry':0,'watch':False,'coverage':{'enabled':True,'clean':mode!='repeat','provider':'v8','include':['subject.ts'],'reporter':['json','text'],'reportsDirectory':str(target/'coverage'),'thresholds':dict.fromkeys(['lines','functions','statements','branches'],threshold)}}}
  (fixture/'vitest.config.mjs').write_text('export default '+json.dumps(config)+';\n')
  (fixture/'subject.ts').write_text('export function untouched(flag: boolean) {\n if (flag) return 1;\n return 2;\n}\n')
  rejection="void Promise.reject(new Error('owned-public-parent-binding-control')); await new Promise(resolve => setTimeout(resolve,25));" if mode=='unhandled' else ''
  (fixture/'actual.test.ts').write_text("import {test,expect} from 'vitest';\nimport './subject';\ntest('first actual passing case',()=>expect(1).toBe(1));\ntest('second actual passing case',async()=>{expect(2).toBe(2);"+rejection+'});\n')
  junit=target/'root/coverage-unit.junit.xml';junit.write_text('<testsuites tests="1" failures="0" errors="0"><testsuite tests="1" failures="0" errors="0" skipped="0"><testcase classname="old" name="stale case"/></testsuite></testsuites>')
  runner.ROOT=fixture
  command=[node,str(REPO/'node_modules/vitest/vitest.mjs'),'run','--config',str(fixture/'vitest.config.mjs'),'--reporter=junit','--reporter='+str(REPORTER),'--outputFile='+str(junit)]
  started=datetime.datetime.now(datetime.timezone.utc).isoformat();before={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [PARENT,REPORTER]}
  result=runner.run_coverage_command(command,target/'command.txt',45,target,reporter_path=REPORTER)
  after={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [PARENT,REPORTER]};assert before==after
  proof=result['coverageEvidence'];assert proof['status']=='bound',result
  assert result['exitCode']==(1 if mode in ['threshold','unhandled'] else 0)
  assert proof['junit']['counts']=={'total':2,'passed':2,'failed':0,'errors':0,'skipped':0}
  assert proof['outcome']['data']['testCaseCounts']=={'total':2,'passed':2,'failed':0,'skipped':0,'pending':0}
  assert proof['outcome']['data']['unhandledErrorCount']==(1 if mode=='unhandled' else 0)
  assert proof['validForAdmission']==(mode!='unhandled')
  for key in ['junit','outcome']:
   member=pathlib.Path(proof[key]['path']);assert hashlib.sha256(member.read_bytes()).hexdigest()==proof[key]['sha256']
  repeat_result=None;first_xml=None;first_outcome=None
  if mode=='repeat':
   first_xml=junit.read_bytes();first_outcome=pathlib.Path(proof['outcome']['path']).read_bytes();first_path=proof['outcome']['path']
   repeat_result=runner.run_coverage_command(command,target/'repeat-command.txt',45,target,reporter_path=REPORTER)
   assert repeat_result['exitCode']==0 and repeat_result['coverageEvidence']['status']=='bound' and repeat_result['coverageEvidence']['validForAdmission']
   assert repeat_result['coverageEvidence']['runId']!=proof['runId']
   assert repeat_result['coverageEvidence']['outcome']['path']!=first_path
   assert pathlib.Path(first_path).read_bytes()==first_outcome
   assert repeat_result['coverageEvidence']['junit']['counts']['total']==2
  case=output/mode;case.mkdir(exist_ok=False)
  shutil.copytree(target,case/'evidence')
  if repeat_result is not None:
   (case/'first-actual.junit.xml').write_bytes(first_xml);(case/'first-actual-outcome.json').write_bytes(first_outcome)
   (case/'repeat-parent-command-receipt.json').write_text(json.dumps(repeat_result,indent=2)+'\n')
  for name in ['subject.ts','actual.test.ts','vitest.config.mjs']:shutil.copyfile(fixture/name,case/name)
  result['scope']='Actual installed Vitest plus candidate parent byte binding, owned fixture only; no application execution/coverage admission.'
  (case/'parent-command-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
  bound=first_xml if first_xml is not None else junit.read_bytes();tree=ET.fromstring(bound);suite=tree.find('testsuite');cases=suite.findall('testcase');assert len(cases)==2;suite.remove(cases[-1]);suite.set('tests','1');tree.set('tests','1');replacement=ET.tostring(tree)
  assert hashlib.sha256(replacement).hexdigest()!=proof['junit']['sha256']
  (case/'forged-one-case.xml').write_bytes(replacement)
  control={'boundActualCaseCount':2,'forgedLeafCaseCount':len(tree.findall('.//testcase')),'boundSha256':proof['junit']['sha256'],'forgedSha256':hashlib.sha256(replacement).hexdigest(),'replacementRejectedByBoundHash':True,'originalOneVs2771ControlReference':'/workspace/onboarding-results/c5-admission-prototype/review/canonical-junit-binding-control.json'}
  (case/'replacement-control.json').write_text(json.dumps(control,indent=2)+'\n')
  results.append({'mode':mode,'status':'passed','actualCommandExit':result['exitCode'],'proofStatus':proof['status'],'testOutcomeEligibleForCounterAdmission':proof['validForAdmission'],'actualCases':2,'unhandledErrorCount':proof['outcome']['data']['unhandledErrorCount'],'retainedActualChildExit':True,'staleXmlReplacedByActualChild':True,'laterXmlSubstitutionRejectedByHash':True,'sourceImplementationUnchanged':True,'consecutiveOutcomeBytesPreserved':repeat_result is not None})
(BASE/'cross-results-current-final.json').write_text(json.dumps({'status':'passed','cases':results,'productionReady':False,'globalCoverageModified':False,'scope':'Parent/current-machine test-outcome proof foundation only; not merged coverage or application launch acceptance.'},indent=2)+'\n')
print(json.dumps({'status':'passed','actualPublicParentCases':len(results),'rows':results}))
