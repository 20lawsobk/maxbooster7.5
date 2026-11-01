/** Outside P2 prototype: strict current-source admission into a NEW candidate only. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { deserialize } from 'node:v8';
import { isDeepStrictEqual } from 'node:util';
import { createSharedProvider, originalCoverageData, subjectFiles, validateCapturedManifest, readSourceInputs } from './coverage-shared-provider.mjs';
import { sha256, typedSha256, encodeCoverage, decodeCoverage } from './coverage-coordinate-contract.mjs';
const requireTrue = (ok, message) => { if (!ok) throw Error('Coverage admission: '+message); };
const stamp = value => { const n=Date.parse(value); requireTrue(Number.isFinite(n),'invalid timestamp'); return n; };
const same = (a,b,message) => requireTrue(isDeepStrictEqual(a,b),message);
const hashPattern = /^[a-f0-9]{64}$/;
const canonicalCommand = root => ['node','node_modules/vitest/vitest.mjs','run','--config','vitest.platform.config.ts','--reporter=junit','--outputFile='+path.join(root,'reports/test-verification/root/coverage-unit.junit.xml')];
export function assertCanonicalEvidence({root,master,inputs,current,revision,job,log,junit,rawManifest,contract,globalBytes,format}) {
 requireTrue(master.finishedAt && ['failed','executed_groups_passed'].includes(master.status),'master is incomplete');
 requireTrue(master.sourceInputsUnchanged===true && Array.isArray(master.changedSourceInputs) && master.changedSourceInputs.length===0,'master source changed');
 requireTrue(master.sourceRevision===revision && hashPattern.test(inputs.sha256) && master.sourceInputsSha256===inputs.sha256,'master source revision/inventory');
 same(inputs,current,'canonical source inventory is stale');
 requireTrue(master.runs.filter(x=>x.group==='coverage' && x.id==='coverage').length===1,'unique actual canonical coverage job');
 same(job,master.runs.find(x=>x.group==='coverage'&&x.id==='coverage'),'job not owned by master');
 same(job.command,canonicalCommand(root),'actual canonical command changed');
 requireTrue(job.cwd==='.' && job.log==='reports/test-verification/orchestration/coverage.txt' && job.timedOut===false && [0,1].includes(job.exitCode) && Number.isFinite(job.durationSeconds) && job.durationSeconds>0,'canonical command outcome/bounds');
 same(job.coverageParseExclusions,[],'coverage source excluded');
 requireTrue(sha256(log)===job.logSha256,'canonical command log changed');
 requireTrue(!/^Failed to parse .+ Excluding it from coverage\.$/m.test(log),'canonical parse exclusion');
 requireTrue(Number.isSafeInteger(junit.tests) && junit.tests>0 && junit.leafTests===junit.tests && junit.failures===0 && junit.errors===0 && junit.skipped===0 && junit.rootFailures===0 && junit.rootErrors===0 && junit.rootSkipped===0 && junit.suitesConsistent===true,'canonical assertion failure/skip or count mismatch');
 const errors=log.split(/\r?\n/).filter(x=>x.startsWith('ERROR:'));
 if(job.exitCode===1){same(errors.map(x=>/^ERROR: Coverage for (lines|functions|statements|branches) \((?:\d+(?:\.\d+)?)%\) does not meet global threshold \(100%\)$/.exec(x)?.[1]).sort(),['branches','functions','lines','statements'],'non-threshold canonical failure');requireTrue(job.status==='failed','canonical failure status');}
 else{same(errors,[],'successful canonical command contains error');requireTrue(job.status==='passed','canonical pass status');}
 const started=stamp(job.startedAt),ended=started+job.durationSeconds*1000;
 requireTrue(started>=stamp(master.startedAt) && ended<=stamp(master.finishedAt)+1,'canonical command outside master window');
 for(const timestamp of junit.timestamps)requireTrue(stamp(timestamp)>=started && stamp(timestamp)<=ended+1,'canonical JUnit outside command window');
 requireTrue(rawManifest.schemaVersion===1 && rawManifest.kind==='actual-public-Istanbul-pre-JSON-sidecar' && rawManifest.counterMutation===false && rawManifest.mergedIntoGlobalCoverage===false,'canonical sidecar kind/state');
 same(rawManifest.contract,contract,'canonical provider contract changed');
 requireTrue(rawManifest.contractSha256===typedSha256(contract),'canonical contract digest');
 same(rawManifest.runtime,contract.runtime,'canonical runtime changed');
 requireTrue(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(rawManifest.producerId||'') && rawManifest.snapshot?.id===rawManifest.producerId+'-report','canonical snapshot identity');
 requireTrue(stamp(rawManifest.snapshot.capturedAt)>=started && stamp(rawManifest.snapshot.capturedAt)<=ended+1,'canonical raw capture outside command window');
 same(rawManifest.files.map(x=>x.file).sort(),[...subjectFiles].sort(),'canonical raw originals incomplete/duplicate');
 requireTrue(format.format==='Istanbul FileCoverageData' && format.removedOptionalField==='meta' && format.bytes===globalBytes.length && format.sha256===sha256(globalBytes),'global serialization receipt changed');
 same(format.preserved,['path','statementMap','fnMap','branchMap','s','f','b'],'global serialization policy changed');
 return {startedAt:new Date(started).toISOString(),finishedAt:new Date(ended).toISOString(),assertions:junit.tests,thresholdFailed:job.exitCode===1};
}
export function assertProducerEvidence({receipt,manifest,raw,root,contract,inputs,revision,testBytes,testLog,globalHash,master,usedSnapshots=[]}) {
 requireTrue(receipt.schemaVersion===2 && receipt.status==='typed_compatible_unmerged' && receipt.productionReady===false && receipt.mergedIntoGlobalCoverage===false,'producer incomplete/previously admitted');
 requireTrue(receipt.sourceRevision===revision && receipt.sourceInputsBeforeSha256===inputs.sha256 && receipt.sourceInputs?.beforeSha256===inputs.sha256 && receipt.sourceInputs?.afterSha256===inputs.sha256 && receipt.sourceInputs?.unchanged===true,'producer source stale');
 requireTrue(receipt.test==='tests/fabric-replica-generation.test.mjs' && receipt.testSha256===sha256(testBytes),'producer actual test changed');
 requireTrue(receipt.exitCode===0 && receipt.signal===null && receipt.timedOut===false && receipt.bufferExceeded===false && receipt.cleanup?.complete===true && Array.isArray(receipt.cleanup.remainingLivePids) && receipt.cleanup.remainingLivePids.length===0,'producer execution/cleanup failed');
 same(receipt.contract,contract,'producer provider contract changed');requireTrue(receipt.contractSha256===typedSha256(contract),'producer contract digest');
 requireTrue(receipt.testLogSha256===sha256(testLog),'producer actual TAP log changed/missing binding');
 const counts=Object.fromEntries([...testLog.matchAll(/^# (tests|pass|fail|cancelled|skipped) (\d+)\s*$/gm)].map(m=>[m[1],Number(m[2])]));
 same(counts,{tests:2,pass:2,fail:0,cancelled:0,skipped:0},'producer actual assertion counts');
 requireTrue(receipt.command.length===5 && path.isAbsolute(receipt.command[0]) && path.basename(receipt.command[0])==='node' && receipt.command.slice(1,4).join(' ')==='--test --test-concurrency=1 --test-reporter=tap' && path.basename(receipt.command[4])==='coverage-node-vite-entry.mjs','producer actual command');
 const started=stamp(receipt.commandWindow?.startedAt),ended=stamp(receipt.commandWindow?.finishedAt),snapshotStart=stamp(manifest.snapshot?.window?.startedAt),snapshotEnd=stamp(manifest.snapshot?.window?.finishedAt);
 requireTrue(ended>=started && ended-started<=120000 && started>=stamp(master.finishedAt),'producer parent command overlaps canonical invocation or exceeds bounds');
 requireTrue(snapshotStart>=started && snapshotEnd<=ended && snapshotEnd>=snapshotStart,'snapshot outside parent command window');
 validateCapturedManifest(manifest,{raw,root,target:receipt.test,contract,producerId:receipt.producerId});
 same(receipt.snapshot,manifest.snapshot,'producer snapshot receipt changed');
 requireTrue(!usedSnapshots.includes(receipt.producerId) && !usedSnapshots.includes(manifest.snapshot.id),'producer/snapshot already admitted');
 requireTrue(receipt.globalCoverage?.beforeSha256===globalHash && receipt.globalCoverage?.afterSha256===globalHash,'producer global baseline changed');
 same(receipt.profiles.map(x=>x.file).sort(),[...subjectFiles].sort(),'producer complete original profiles');
 return {producerId:receipt.producerId,snapshotId:manifest.snapshot.id,startedAt:new Date(started).toISOString(),finishedAt:new Date(ended).toISOString()};
}
export function mergeExactCounters(canonical,producer) {
 for(const key of ['path','statementMap','fnMap','branchMap'])same(canonical[key],producer[key],'complete original '+key+' differs');
 const output=structuredClone(canonical);
 for(const key of ['s','f','b']) {
  same(Object.keys(canonical[key]),Object.keys(producer[key]),key+' counter IDs differ');
  for(const id of Object.keys(canonical[key])) {
   const add=(a,b)=>{requireTrue(Number.isSafeInteger(a)&&a>=0&&Number.isSafeInteger(b)&&b>=0&&Number.isSafeInteger(a+b),'counter invalid/overflow');return a+b;};
   if(key==='b'){requireTrue(Array.isArray(canonical.b[id])&&Array.isArray(producer.b[id])&&canonical.b[id].length===producer.b[id].length,'branch arm dimensions differ');output.b[id]=canonical.b[id].map((n,i)=>add(n,producer.b[id][i]));}
   else output[key][id]=add(canonical[key][id],producer[key][id]);
  }
 }
 return output;
}
function file(base,name) {requireTrue(typeof name==='string'&&!path.isAbsolute(name)&&!name.split(/[\\/]/).some(x=>x==='..'),'artifact path traversal');const absolute=path.join(base,name);let cur=base;for(const part of name.split('/')){cur=path.join(cur,part);requireTrue(!fs.lstatSync(cur).isSymbolicLink(),'symlink artifact');}requireTrue(fs.statSync(absolute).isFile(),'artifact not regular');return fs.readFileSync(absolute);}
const json=(base,name)=>JSON.parse(file(base,name));
function readJUnit(bytes) {const script="import json,sys,xml.etree.ElementTree as E; r=E.fromstring(sys.stdin.buffer.read()); c=list(r.iter('testcase')); s=list(r.iter('testsuite')); print(json.dumps(dict(tests=int(r.attrib['tests']),leafTests=len(c),failures=sum(len(x.findall('failure')) for x in c),errors=sum(len(x.findall('error')) for x in c),skipped=sum(len(x.findall('skipped')) for x in c),rootFailures=int(r.attrib.get('failures',0)),rootErrors=int(r.attrib.get('errors',0)),rootSkipped=int(r.attrib.get('skipped',0)),suitesConsistent=all(int(x.attrib.get('tests',0))==len(list(x.iter('testcase'))) and int(x.attrib.get('failures',0))==0 and int(x.attrib.get('errors',0))==0 and int(x.attrib.get('skipped',0))==0 for x in s),timestamps=[x.attrib['timestamp'] for x in s])))";const r=spawnSync('python3',['-I','-B','-c',script],{input:bytes,encoding:'utf8',timeout:5000,maxBuffer:1024*1024,env:{PATH:process.env.PATH||'/usr/bin:/bin',LANG:'C'}});requireTrue(!r.error&&r.status===0,'canonical JUnit parse failed');return JSON.parse(r.stdout);}
export async function dryRunAdmission({root,canonicalDir,producerDir,out}) {
 root=fs.realpathSync(root);canonicalDir=fs.realpathSync(canonicalDir);producerDir=fs.realpathSync(producerDir);out=path.resolve(out);
 requireTrue(!fs.existsSync(out) && !out.startsWith(root+path.sep) && out!==root && out.startsWith(path.dirname(fileURLToPath(import.meta.url))+path.sep),'output must be new outside candidate-owned directory');
 const master=json(canonicalDir,'orchestration/results.json'),inputs=json(canonicalDir,'orchestration/source-inputs.json'),globalBytes=file(canonicalDir,'coverage/coverage-final.json'),globalHash=sha256(globalBytes),currentGlobal=path.join(root,'reports/test-verification/coverage/coverage-final.json'),currentGlobalHash=sha256(fs.readFileSync(currentGlobal)),global=JSON.parse(globalBytes),rawManifest=json(canonicalDir,'coverage/raw-p1/manifest.json'),producerReceipt=json(producerDir,'receipt.json'),manifest=json(producerDir,'manifest.json'),rawBytes=file(producerDir,'raw-v8.json'),raw=JSON.parse(rawBytes),current=readSourceInputs(root),revision=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),job=master.runs.find(x=>x.id==='coverage'&&x.group==='coverage'),{contract,convert}=await createSharedProvider(root);
 requireTrue(currentGlobalHash===globalHash,'current global bytes differ from canonical');
 const canonicalProof=assertCanonicalEvidence({root,master,inputs,current,revision,job,log:file(canonicalDir,'orchestration/coverage.txt').toString('utf8'),junit:readJUnit(file(canonicalDir,'root/coverage-unit.junit.xml')),rawManifest,contract,globalBytes,format:json(canonicalDir,'coverage/artifact-format.json')});
 const producerProof=assertProducerEvidence({receipt:producerReceipt,manifest,raw,root,contract,inputs,revision,testBytes:fs.readFileSync(path.join(root,producerReceipt.test)),testLog:file(producerDir,'test.txt').toString('utf8'),globalHash,master});
 requireTrue(manifest.rawSha256===sha256(rawBytes),'producer raw changed');requireTrue(producerProof.producerId!==rawManifest.producerId && producerProof.snapshotId!==rawManifest.snapshot.id,'canonical/producer snapshot overlap');
 const producerSource=json(producerDir,'source-inputs.json');same(producerSource.before,inputs,'producer initial complete source inventory stale');same(producerSource.after,inputs,'producer final complete source inventory stale');
 const producerCodeDir=path.dirname(producerReceipt.command[4]);for(const [name,hash]of Object.entries(producerReceipt.candidateFiles)){const selected=name==='tests/testing/coverage-coordinate-contract.test.mjs'?'coverage-coordinate-contract.test.mjs':name;requireTrue(sha256(file(producerCodeDir,selected))===hash,'producer implementation changed: '+name);}
 const output=structuredClone(global),profiles=[];
 for(const item of manifest.scripts) {
  const relative=path.relative(root,item.file).split(path.sep).join('/'),source=fs.readFileSync(item.file,'utf8'),entry=rawManifest.files.find(x=>x.file===relative),canonicalRawBytes=file(path.join(canonicalDir,'coverage/raw-p1'),entry.name);
  requireTrue(entry.bytes===canonicalRawBytes.length&&sha256(canonicalRawBytes)===entry.sha256&&sha256(source)===entry.sourceSha256,'canonical raw/source changed');
  const bytes={source,body:file(producerDir,item.bodyFile).toString('utf8'),executed:file(producerDir,item.codeFile).toString('utf8'),map:json(producerDir,item.mapFile)},replayed=await convert(item,bytes),rawCanonical=originalCoverageData(deserialize(canonicalRawBytes)),provenance={...replayed.provenance,kind:'actual-public-Istanbul-pre-JSON-sidecar',rawSidecarSha256:entry.sha256},context={source,sourceFile:item.file,contract,provenance,body:bytes.body,map:bytes.map},encoded=encodeCoverage(rawCanonical,context),decoded=decodeCoverage(encoded.wire,encoded.sidecar,context),profile=producerReceipt.profiles.find(x=>x.file===relative);
  same(global[item.file],encoded.wire,'official serialized global differs from exact typed canonical raw: '+relative);
  requireTrue(profile.rawTypedSha256===typedSha256(replayed.raw),'producer converted counters changed');
  same(JSON.parse(file(producerDir,relative.replaceAll('/','__')+'.wire.json')),replayed.encoded.wire,'producer stored wire changed');
  same(JSON.parse(file(producerDir,relative.replaceAll('/','__')+'.typed.json')),replayed.encoded.sidecar,'producer stored sidecar changed');
  const merged=mergeExactCounters(decoded,replayed.raw),mergedEncoded=encodeCoverage(merged,context);same(decodeCoverage(mergedEncoded.wire,mergedEncoded.sidecar,context),merged,'merged typed roundtrip');
  output[item.file]=mergedEncoded.wire;profiles.push({file:relative,canonicalTypedSha256:typedSha256(decoded),producerTypedSha256:typedSha256(replayed.raw),candidateTypedSha256:typedSha256(merged),originalMapIDsPreserved:true,zerosRetained:true});
 }
 same(Object.keys(output),Object.keys(global),'global file denominator changed');for(const name of Object.keys(global))if(!subjectFiles.includes(path.relative(root,name).split(path.sep).join('/')))same(output[name],global[name],'untouched global entry changed');
 same(readSourceInputs(root),inputs,'source changed during admission');requireTrue(sha256(fs.readFileSync(currentGlobal))===globalHash && sha256(file(canonicalDir,'coverage/coverage-final.json'))===globalHash,'global changed during admission');
 // Transactional new output; the authoritative global and raw inputs are never opened for write.
 fs.mkdirSync(out,{mode:0o700});const candidateBytes=JSON.stringify(output)+'\n';try{fs.writeFileSync(path.join(out,'candidate-coverage-final.json'),candidateBytes,{flag:'wx'});fs.writeFileSync(path.join(out,'admission.json'),JSON.stringify({schemaVersion:1,status:'prototype_dry_run_only',productionReady:false,mergedIntoGlobalCoverage:false,sourceRevision:revision,sourceInputsSha256:inputs.sha256,canonicalProof,producerProof,canonicalGlobalSha256:globalHash,candidateGlobalSha256:sha256(candidateBytes),canonicalFileCount:Object.keys(global).length,candidateFileCount:Object.keys(output).length,profiles,admittedSnapshotIds:[producerProof.producerId,producerProof.snapshotId],scope:'Exact counter addition into a NEW outside candidate. No published coverage credit or launch approval.'},null,2)+'\n',{flag:'wx'});}catch(e){fs.rmSync(out,{recursive:true,force:true});throw e;}
 return {status:'prototype_dry_run_only',profiles:profiles.length,files:Object.keys(output).length,canonicalUnchanged:true,output:out};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const [root,canonicalDir,producerDir,out,...extra]=process.argv.slice(2);requireTrue(root&&canonicalDir&&producerDir&&out&&!extra.length,'usage ROOT CANONICAL_DIR PRODUCER_DIR NEW_OUT');
 try{console.log(JSON.stringify(await dryRunAdmission({root,canonicalDir,producerDir,out})));}catch(error){console.error(error.stack);process.exitCode=1;}
}
