import json,pathlib,sys,types
scenario=sys.argv[1];driver=pathlib.Path(sys.argv[2]);out=pathlib.Path(sys.argv[3]);calls={'source':0,'inventory':0,'prepare':0}
module=types.ModuleType('common')
def write_json(path,value):
 path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,indent=2)+'\n')
def source_inputs():
 calls['source']+=1
 if scenario=='before_code_error' and calls['source']==1: raise OSError('owned-code-observation-failure')
 return {'scope':'synthetic driver-control-flow probe only','sha256':'mock-code-digest','files':{}}
def run_command(command,logfile,timeout,cwd=None,extra_env=None):
 logfile=pathlib.Path(logfile)
 if command[0]=='node':
  calls['inventory']+=1
  if scenario=='before_inventory_error' and calls['inventory']==1:
   logfile.write_text('owned-inventory-observation-failure');return {'exitCode':2,'status':'failed','durationSeconds':0,'command':command}
  logfile.write_text(json.dumps([{'path':'owned-fixture.txt','sha256':'fixture-sha','mode':420,'bytes':7}]))
  return {'exitCode':0,'status':'passed','durationSeconds':0,'command':command}
 calls['prepare']+=1
 if scenario=='prepare_exception': raise OSError('owned-prepare-exception')
 logfile.write_text('Synthetic preparation failure; no preparation executed.\n')
 return {'exitCode':17,'status':'failed','durationSeconds':0,'command':command}
module.write_json=write_json;module.source_inputs=source_inputs;module.run_command=run_command;module.sanitize=lambda s:s
sys.modules['common']=module
sys.argv=[str(driver),str(out)]
try:
 exec(compile(driver.read_text(),str(driver),'exec'),{'__file__':str(driver),'__name__':'__main__'})
except SystemExit as error:
 code=error.code
else:
 raise AssertionError('Driver did not report a real exit')
s=json.loads((out/'summary.json').read_text());d=json.loads((out/'admitted-diff.json').read_text())
assert (out/'admitted-after.json').is_file(),s
assert (out/'source-code-inputs-after.json').is_file(),s
if scenario in ('prepare_status','prepare_exception'):
 assert (out/'admitted-before.json').is_file(),s
 assert s['sourceInputsUnchanged'] is True and s['admittedInputsUnchanged'] is True,s
 assert code==(17 if scenario=='prepare_status' else 1),s
 assert s['status']==('failed' if scenario=='prepare_status' else 'failed_driver_exception'),s
 assert d['comparison']=='complete' and d['added']==[] and d['removed']==[] and d['changed']==[],d
else:
 assert code==1 and s['admittedInputsUnchanged'] is False,s
 assert d['comparison']=='unavailable_before' and all(d[k] is None for k in ('added','removed','changed')),d
 assert calls['prepare']==0,calls
 if scenario=='before_inventory_error': assert s['status']=='failed_admitted_observation',s
 else: assert s['status']=='failed_source_observation' and s['sourceInputsUnchanged'] is False,s
print(json.dumps({'scenario':scenario,'assertions':'passed','observedDriverExit':code,'status':s['status'],'calls':calls,'actualPreparationOrColdExecuted':False}))
