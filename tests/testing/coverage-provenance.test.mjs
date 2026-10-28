import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Session } from 'node:inspector';
import { sha256, ownedPath, validateRanges, decodeSourceMap, validateSourceMap, compareCoverageMaps, validateIstanbul, validateManifest, runOwnedCommand } from '../../scripts/testing/coverage-provenance.mjs';
async function runtimeFixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'coverage-provenance-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const repo=path.join(directory,'repo'),artifacts=path.join(directory,'artifacts');fs.mkdirSync(repo);fs.mkdirSync(artifacts);
  const source=path.join(repo,'fixture.js'),code='globalThis.__coverageProbe = x => x ? "😀" : "no"; globalThis.__coverageProbe(true); delete globalThis.__coverageProbe;';
  fs.writeFileSync(source,code);
  const session=new Session();session.connect();
  const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(e,value)=>e?reject(e):resolve(value)));
  try {
    await post('Debugger.enable');await post('Profiler.enable');await post('Profiler.startPreciseCoverage',{callCount:true,detailed:true});
    vm.runInThisContext(code,{filename:pathToFileURL(source).href});
    const raw=await post('Profiler.takePreciseCoverage');
    const coverage=raw.result.find(x=>x.url===pathToFileURL(source).href);assert.ok(coverage);
    const actual=await post('Debugger.getScriptSource',{scriptId:coverage.scriptId});assert.equal(actual.scriptSource,code);
    fs.writeFileSync(path.join(artifacts,'code.js'),actual.scriptSource);
    fs.writeFileSync(path.join(artifacts,'raw-v8.json'),JSON.stringify(raw));
    const manifest={schemaVersion:1,producerId:'owned-fixture',status:'complete',encoding:'utf-8',offsetEncoding:'utf-16-code-units',runtime:{node:process.versions.node,v8:process.versions.v8},rawSha256:sha256(JSON.stringify(raw)),scripts:[{scriptId:coverage.scriptId,coverage,codeFile:'code.js',codeSha256:sha256(code),utf16Length:code.length,originalScriptFile:source}]};
    return {directory,repo,artifacts,source,code,coverage,manifest};
  }finally{await post('Profiler.stopPreciseCoverage');session.disconnect();}
}
test('accepts retained actual runtime code, UTF-16 ranges and a genuinely unexecuted branch',async t=>{
 const f=await runtimeFixture(t);assert.equal(validateManifest(f.manifest,f.artifacts,f.repo),true);
 assert.ok(f.coverage.functions.some(fn=>fn.ranges.some(r=>r.count===0)),'False arm must retain its real zero counter');
 assert.ok(Buffer.byteLength(f.code)>f.code.length,'Fixture distinguishes byte offsets from UTF-16 offsets');
});
test('rejects stale original source and changed executed code',async t=>{
 const f=await runtimeFixture(t);fs.appendFileSync(f.source,'//changed');assert.throws(()=>validateManifest(f.manifest,f.artifacts,f.repo),/differs from original/);
 fs.writeFileSync(f.source,f.code);fs.appendFileSync(path.join(f.artifacts,'code.js'),' ');assert.throws(()=>validateManifest(f.manifest,f.artifacts,f.repo),/identity\/encoding/);
});
test('rejects changed raw counters and malformed offsets rather than salvaging hits',async t=>{
 const f=await runtimeFixture(t);const changed=structuredClone(f.manifest);changed.scripts[0].coverage.functions[0].ranges[0].count++;
 assert.throws(()=>validateManifest(changed,f.artifacts,f.repo),/differs from raw/);
 assert.throws(()=>validateRanges({functions:[{functionName:'f',isBlockCoverage:true,ranges:[{startOffset:0,endOffset:f.code.length+1,count:1}]}]},f.code),/UTF-16/);
 assert.throws(()=>validateRanges({functions:[{functionName:'f',isBlockCoverage:true,ranges:[{startOffset:0,endOffset:1,count:-1}]}]},f.code),/execution count/);
});
test('rejects incomplete producers and malformed UTF-8',async t=>{
 const f=await runtimeFixture(t);assert.throws(()=>validateManifest({...f.manifest,status:'incomplete'},f.artifacts,f.repo),/incomplete/);
 fs.writeFileSync(path.join(f.artifacts,'code.js'),Buffer.from([0xc3,0x28]));assert.throws(()=>validateManifest(f.manifest,f.artifacts,f.repo),/encoded data|encoding/i);
});
test('retains exact original contents in inline source maps and rejects missing/stale mappings',async t=>{
 const f=await runtimeFixture(t);const map={version:3,sources:[f.source],sourcesContent:[f.code],names:[],mappings:'AAAA'};
 const encoded='data:application/json;charset=utf-8;base64,'+Buffer.from(JSON.stringify(map)).toString('base64');
 const decoded=decodeSourceMap(encoded,f.source);assert.deepEqual(decoded,map);assert.equal(validateSourceMap(decoded,f.source,f.repo)[0].sha256,sha256(f.code));
 assert.throws(()=>validateSourceMap({...map,sourcesContent:[null]},f.source,f.repo),/original source/);
 assert.throws(()=>validateSourceMap({...map,sourcesContent:['replacement']},f.source,f.repo),/stale or substituted/);
 assert.throws(()=>decodeSourceMap('https://example.invalid/source.map',f.source),/remote source map/);
 assert.throws(()=>validateSourceMap({...map,mappings:'AACA'},f.source,f.repo),/original position/);
 assert.throws(()=>validateSourceMap({...map,ignoreList:[0]},f.source,f.repo),/hides original/);
});
test('rejects traversal, external sources and symlink escape',async t=>{
 const f=await runtimeFixture(t);assert.throws(()=>ownedPath(f.repo,'../external'),/escapes/);
 fs.symlinkSync(f.artifacts,path.join(f.repo,'escape'),'dir');assert.throws(()=>ownedPath(f.repo,'escape/anything'),/symlink/);
 assert.throws(()=>validateSourceMap({version:3,sources:['https://example.invalid/a.ts'],sourcesContent:['x'],mappings:''},f.source,f.repo),/nonlocal/);
});
const point=(line,column)=>({line,column});
function profile(){return{path:'/owned/source.js',statementMap:{0:{start:point(1,0),end:point(1,10)}},fnMap:{0:{name:'f',decl:{start:point(1,0),end:point(1,1)},loc:{start:point(1,0),end:point(1,10)},line:1}},branchMap:{0:{type:'cond-expr',loc:{start:point(1,0),end:point(1,10)},locations:[{start:point(1,0),end:point(1,4)},{start:point(1,5),end:point(1,10)}],line:1}},s:{0:1},f:{0:1},b:{0:[1,0]}};}
test('requires complete identical maps even when functions and branches match',()=>{
 const a=profile(),b=profile();b.s[0]=5;assert.equal(compareCoverageMaps(a,b).compatible,true);
 b.statementMap[1]={start:point(2,0),end:point(2,1)};assert.deepEqual(compareCoverageMaps(a,b),{compatible:false,mismatches:['statementMap']});
 const c=profile();c.branchMap[0].locations.reverse();assert.equal(compareCoverageMaps(a,c).compatible,false);
});
test('rejects branch arity and counter/map mismatches',()=>{
 const a=profile();assert.equal(validateIstanbul(a),true);a.b[0].push(1);assert.throws(()=>validateIstanbul(a),/arity/);
 const b=profile();b.s[99]=1;assert.throws(()=>validateIstanbul(b),/identity/);
});
function alive(pid) {
 try {
  if(process.platform==='linux')return !['Z','X'].includes(fs.readFileSync(`/proc/${pid}/stat`,'utf8').split(') ')[1].split(' ')[0]);
  process.kill(pid,0);return true;
 }catch(error){if(['ENOENT','ESRCH'].includes(error.code))return false;throw error;}
}
test('timeout terminates an owned descendant which ignores TERM and retains pipes',{skip:process.platform==='win32'},async()=>{
 const parent=`const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)"],{stdio:['ignore','pipe','inherit']});child.stdout.on('data',data=>{process.stdout.write(data);});setInterval(()=>{},1000);`;
 const result=await runOwnedCommand(process.execPath,['-e',parent],{env:{PATH:process.env.PATH},timeoutMs:1000,graceMs:100});
 const descendant=Number(result.stdout.trim());assert.ok(Number.isInteger(descendant)&&descendant>0,'actual child announced PID');
 assert.equal(result.timedOut,true);assert.equal(result.signal,'SIGTERM');assert.equal(result.status,null);
 assert.equal(result.cleanup.complete,true);assert.ok(result.cleanup.signals.includes('SIGKILL'));assert.equal(alive(descendant),false);
});
for(const exitCode of [0,7])test(`direct exit ${exitCode} is preserved while its owned lingering descendant is cleaned`,{skip:process.platform==='win32'},async()=>{
 const parent=`const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)"],{stdio:['ignore','pipe','inherit']});child.stdout.once('data',data=>{process.stdout.write(data);process.exit(${exitCode});});`;
 const result=await runOwnedCommand(process.execPath,['-e',parent],{env:{PATH:process.env.PATH},timeoutMs:3000,graceMs:100});
 const descendant=Number(result.stdout.trim());assert.ok(Number.isInteger(descendant)&&descendant>0);
 assert.equal(result.timedOut,false);assert.equal(result.status,exitCode);assert.equal(result.signal,null);
 assert.equal(result.cleanup.complete,true);assert.ok(result.cleanup.signals.includes('SIGKILL'));assert.equal(alive(descendant),false);
});
test('output bound forces a TERM-resistant direct runner to stop promptly',{skip:process.platform==='win32'},async()=>{
 const code="process.on('SIGTERM',()=>{});setInterval(()=>process.stdout.write('x'.repeat(4096)),1);";
 const result=await runOwnedCommand(process.execPath,['-e',code],{env:{PATH:process.env.PATH},timeoutMs:3000,graceMs:50,maxBuffer:1024});
 assert.equal(result.bufferExceeded,true);assert.equal(result.timedOut,false);assert.equal(result.signal,'SIGKILL');
 assert.equal(Buffer.byteLength(result.stdout),1024);assert.equal(result.cleanup.complete,true);
});
test('spawn failure is preserved with no invented child or cleanup success claim',{skip:process.platform==='win32'},async()=>{
 const result=await runOwnedCommand('/nonexistent/maxbooster-coverage-runtime',[],{env:{PATH:process.env.PATH},timeoutMs:1000,graceMs:50});
 assert.equal(result.error.code,'ENOENT');assert.equal(result.status,null);assert.equal(result.cleanup.processGroup,null);
 assert.equal(result.cleanup.complete,true);assert.deepEqual(result.cleanup.signals,[]);
});
test('P1 rejects a real PostgreSQL suite before execution or output creation',{skip:process.platform==='win32'},async()=>{
 const root=fileURLToPath(new URL('../..',import.meta.url));
 const target='tests/database-backup-restore-postgres.test.mjs';
 assert.match(fs.readFileSync(path.join(root,target),'utf8'),/startDisposablePostgres/,'Target is a real database fixture');
 const output=`reports/coverage-producer/rejected-sql-${process.pid}`;
 assert.equal(fs.existsSync(path.join(root,output)),false);
 const result=await runOwnedCommand(process.execPath,['scripts/testing/collect-node-coverage.mjs',target,output],{cwd:root,env:{PATH:'/nonexistent'},timeoutMs:3000});
 assert.equal(result.status,1);assert.match(result.stderr,/P1 coverage producer supports only tests\/fabric-replica-generation\.test\.mjs/);
 assert.equal(result.stdout,'');assert.equal(fs.existsSync(path.join(root,output)),false);
 assert.equal(result.cleanup.complete,true);assert.equal(result.timedOut,false);
});
