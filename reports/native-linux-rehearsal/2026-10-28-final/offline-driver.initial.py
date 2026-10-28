"""Actual bounded final artifact runtime observations; no egress, no original checkout mount."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys,time,datetime
ROOT=Path.cwd().resolve();OUT=ROOT/'reports/native-linux-rehearsal/2026-10-28-final';OWNED=Path('/tmp/maxbooster-linux-u3f69z18');runtime=OWNED/'runtime-evidence-final'
assert not runtime.exists();runtime.mkdir(mode=0o700)
sys.path.insert(0,str(ROOT/'scripts/testing'))
from common import sanitize,write_json
ENV=dict(os.environ)
for k in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:ENV.pop(k,None)
DOCKER=['docker','--host=unix:///var/run/docker.sock'];NAME='maxbooster-linux-u3f69z18-final-runtime'
def command(name,args,timeout=30):
 started=datetime.datetime.now(datetime.timezone.utc).isoformat();before=time.monotonic()
 p=subprocess.run(args,env=ENV,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout)
 log=OUT/(name+'.txt');log.write_text(sanitize(p.stdout.decode(errors='replace')))
 receipt={'command':args,'startedAt':started,'durationSeconds':round(time.monotonic()-before,3),'exitCode':p.returncode,'log':str(log.relative_to(ROOT)),'logSha256':hashlib.sha256(log.read_bytes()).hexdigest()}
 write_json(OUT/(name+'.json'),receipt);return p
try:
 args=[*DOCKER,'create','--name',NAME,'--network','none','--cpus','1','--memory','2g','--pids-limit','256','--shm-size','256m','--read-only','--user','1000:1000','--tmpfs','/tmp:rw,nosuid,nodev,mode=1777,size=256m','--tmpfs','/profile:rw,nosuid,nodev,mode=700,uid=1000,gid=1000,size=128m']
 for source,target,readonly in [(OWNED/'out-final/linux-unpacked','/artifact',True),(OWNED/'controller','/controller',True),(OWNED/'project','/project',True),(runtime,'/evidence',False)]:
  args+=['--mount',f'type=bind,src={source},dst={target}'+(',readonly' if readonly else '')]
 args+=['--entrypoint','/controller/node22','maxbooster-linux-u3f69z18-gui:local','/controller/offline-probe-final.cjs']
 assert command('runtime-create',args).returncode==0
 inspect=subprocess.check_output([*DOCKER,'inspect',NAME],env=ENV);item=json.loads(inspect)[0];host=item['HostConfig']
 safe={'containerId':item['Id'],'imageId':item['Image'],'networkMode':host['NetworkMode'],'privileged':host['Privileged'],'readOnlyRootfs':host['ReadonlyRootfs'],'user':item['Config']['User'],'nanoCPUs':host['NanoCpus'],'memory':host['Memory'],'mounts':[{'source':m['Source'],'destination':m['Destination'],'rw':m['RW']} for m in item['Mounts']]}
 write_json(OUT/'actual-runtime-isolation.json',safe)
 assert safe['networkMode']=='none' and not safe['privileged'] and safe['readOnlyRootfs'] and safe['user']=='1000:1000'
 assert not any(m['source'].startswith(str(ROOT)) for m in safe['mounts'])
 assert command('offline-runtime',[*DOCKER,'start','--attach',NAME],100).returncode==0,'Observation fixture failed; inspect actual logs'
finally:
 command('runtime-cleanup',[*DOCKER,'rm','--force',NAME])
 inspect=subprocess.run([*DOCKER,'inspect',NAME],env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 write_json(OUT/'runtime-final-state.json',{'namedContainerAbsent':inspect.returncode!=0,'noProductionReadyClaim':True})
 if runtime.exists():shutil.copytree(runtime,OUT/'runtime')
