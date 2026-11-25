"""Resync exact current inputs into the prior owned copy; bounded CPU1 configured build, never publishes."""
import datetime,hashlib,json,os,shutil,signal,subprocess,sys,tempfile,time
from pathlib import Path
ROOT=Path.cwd().resolve(); OUT=ROOT/'reports/native-linux-rehearsal/2026-10-28-final'
OWNED=Path('/tmp/maxbooster-linux-u3f69z18'); PROJECT=OWNED/'project'
sys.path.insert(0,str(ROOT/'scripts/testing'))
from common import clean_environment,sanitize,source_inputs,write_json
assert PROJECT.is_dir() and OWNED.parent==Path('/tmp')
assert shutil.disk_usage(OWNED).free>=8*1024**3
ARCHIVE=OWNED/'downloads/electron-v43.8.3-linux-x64.zip'
assert ARCHIVE.stat().st_size==127277783
assert hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()=='73d7d6fe120c998db75834c23c8ce7ce8390607c198b2e167a28acd7937bef22'
BASELINE=source_inputs(); write_json(OUT/'source-inputs-before.json',BASELINE)
OWNED_FILES=['electron/main.js','electron/runtime-policy.cjs','package.json','tools/legacy-security-update.json','scripts/testing/electron-asar-module-acceptance.mjs','tests/electron-asar-launch-policy.test.mjs']
GUARDED=OWNED_FILES+['package-lock.json','external/maxcore/pnpm-lock.yaml','external/pdim/pnpm-lock.yaml','node_modules/bcrypt/build/Release/bcrypt_lib.node','node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node']
def hash_file(p):return hashlib.sha256(p.read_bytes()).hexdigest()
guard_before={n:hash_file(ROOT/n) for n in GUARDED if (ROOT/n).is_file()}
# Do not copy reports/private state or change the original graph. All source and existing contract inputs use regular bytes.
for name,expected in BASELINE['files'].items():
 source,target=ROOT/name,PROJECT/name
 target.parent.mkdir(parents=True,exist_ok=True)
 if target.is_symlink():target.unlink()
 shutil.copy2(source,target)
 assert hash_file(target)==expected
 assert (source.stat().st_dev,source.stat().st_ino)!=(target.stat().st_dev,target.stat().st_ino)
# Source digest intentionally omits some build-contract assets; admit exact existing contract separately.
contract=json.loads((ROOT/'dist/build-complete.json').read_text())
stale_contract_inputs=[]
for name,expected in contract['inputs'].items():
 source,target=ROOT/name,PROJECT/name
 actual=hash_file(source)
 if actual!=expected:stale_contract_inputs.append(name)
 if not target.exists() or hash_file(target)!=actual:
  target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
 assert hash_file(target)==actual
write_json(OUT/'existing-dist-validation-preflight.json',{'staleBuildContractInputs':stale_contract_inputs,'action':'Copy actual current bytes and require owned ordinary build if validateBuild rejects old dist; no edits to manifests'})
write_json(OUT/'copied-inputs.json',{'commonSourceSha256':BASELINE['sha256'],'commonFiles':len(BASELINE['files']),'selectedOriginalGuards':guard_before,'scope':'Current source snapshot at copy time; unrelated concurrent plan edits are reported separately, never admitted retroactively'})
AFFINITY=str(min(os.sched_getaffinity(0)))
def execute(name,args,timeout,network=False):
 log=OUT/(name+'.txt');started=datetime.datetime.now(datetime.timezone.utc).isoformat();before=time.monotonic();timed=False
 with tempfile.TemporaryDirectory(prefix='final-native-command-',dir=OWNED) as private:
  env=clean_environment(private)
  env['PATH']='/workspace/.cloud-tools/node_modules/.bin:/usr/bin:/bin'
  env.update({'ELECTRON_BUILDER_CACHE':str(OWNED/'cache'),'npm_config_cache':str(OWNED/'npm-cache'),'NODE_ENV':'production','SKIP_BOOSTERSTATE':'1'})
  if network:env.update({k:os.environ[k] for k in ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','NODE_EXTRA_CA_CERTS'] if k in os.environ})
  cmd=['taskset','-c',AFFINITY,*args]
  with tempfile.TemporaryFile() as out:
   child=subprocess.Popen(cmd,cwd=PROJECT,env=env,stdout=out,stderr=subprocess.STDOUT,start_new_session=True)
   try:code=child.wait(timeout=timeout)
   except subprocess.TimeoutExpired:
    timed=True;os.killpg(child.pid,signal.SIGTERM)
    try:child.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
    code=124
   out.seek(0);text=sanitize(out.read().decode(errors='replace'))
 log.write_text(text)
 result={'command':cmd,'cwd':str(PROJECT),'startedAt':started,'durationSeconds':round(time.monotonic()-before,3),'ownedProcessGroup':child.pid,'exitCode':code,'timedOut':timed,'log':str(log.relative_to(ROOT)),'logSha256':hash_file(log)}
 write_json(OUT/(name+'.json'),result);print(name,code,flush=True);return result
try:
 validation=execute('copied-build-validation',['node','--input-type=module','-e','import("./scripts/start-production.mjs").then(m=>m.validateBuild(process.cwd()))'],30)
 if validation['exitCode']:
  built=execute('owned-production-build',['npm','run','build'],300)
  assert built['exitCode']==0,'Owned build failed; no native packaging attempted'
 result=execute('configured-linux-dir-build',['node','node_modules/electron-builder/cli.js','--linux','dir','--x64','--publish','never',f'--config.electronDist={ARCHIVE}',f'--config.directories.output={OWNED/"out-final"}'],450,True)
 assert result['exitCode']==0,'Configured packaging failed'
finally:
 after=source_inputs();guard_after={n:hash_file(ROOT/n) for n in guard_before}
 write_json(OUT/'original-integrity-after.json',{'selectedSourceAndInstalledNativeFilesUnchanged':guard_before==guard_after,'guardedInputs':guard_after,'commonBeforeSha256':BASELINE['sha256'],'commonAfterSha256':after['sha256'],'commonUnchanged':BASELINE==after,'otherInputChanges':sorted(n for n in set(BASELINE['files'])|set(after['files']) if BASELINE['files'].get(n)!=after['files'].get(n))})
 assert guard_before==guard_after,'Original owned source or installed native graph mutated during copied build'
