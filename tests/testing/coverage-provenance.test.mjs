import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Session } from 'node:inspector';
import { transformSync } from 'esbuild';
import { parseAstAsync } from 'vite';
import { convert } from 'ast-v8-to-istanbul';
import { sha256, ownedPath, validateRanges, decodeSourceMap, validateSourceMap, compareCoverageMaps, validateIstanbul, validateManifest, runOwnedCommand, createKeepNamesPolicy } from '../../scripts/testing/coverage-provenance.mjs';
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

function nodes(ast, predicate) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) found.push(node);
    for (const [key, value] of Object.entries(node)) if (key !== 'loc') {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast); return found;
}
async function fixture(source) {
  const file = '/owned/original-fixture.js';
  const result = transformSync(source, { sourcefile: file, sourcemap: 'external', sourcesContent: true,
    format: 'esm', keepNames: true, minifyWhitespace: true, minifyIdentifiers: false, target: 'es2022' });
  const code = result.code, sourceMap = JSON.parse(result.map), ast = await parseAstAsync(code);
  return { code, sourceMap, ast, policy: createKeepNamesPolicy({ code, sourceMap, ast }), file };
}
test('actual isolated VM retains the complete original denominator and unexecuted original function and branch', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'c5-synthetic-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'original.js'), runtime = path.join(directory, 'executed.js');
  const source = 'const first = 1; function used(flag) { if (flag) return "😀"; return "unexecuted arm"; } function untouched() { return "uncalled original"; } globalThis.result = used(true);';
  fs.writeFileSync(file, source);
  const options = { sourcefile: file, sourcemap: 'external', sourcesContent: true, format: 'esm', minifyWhitespace: true, minifyIdentifiers: false, target: 'es2022' };
  const generated = transformSync(source, { ...options, keepNames: true }), plain = transformSync(source, { ...options, keepNames: false });
  const session = new Session(); session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
  let raw, observed;
  try {
    await post('Debugger.enable'); await post('Profiler.enable');
    await post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
    const context = vm.createContext({});
    vm.runInContext(generated.code, context, { filename: pathToFileURL(runtime).href, timeout: 1000 });
    assert.equal(context.result, '😀');
    raw = (await post('Profiler.takePreciseCoverage')).result.find(script => script.url === pathToFileURL(runtime).href);
    assert.ok(raw);
    observed = (await post('Debugger.getScriptSource', { scriptId: raw.scriptId })).scriptSource;
    assert.equal(observed, generated.code);
  } finally {
    await post('Profiler.stopPreciseCoverage'); session.disconnect();
  }
  const sourceMap = JSON.parse(generated.map), ast = await parseAstAsync(observed), policy = createKeepNamesPolicy({ code: observed, sourceMap, ast });
  const candidate = Object.values(await convert({ code: observed, sourceMap, ast, ignoreNode: policy.ignoreNode, coverage: raw }))[0];
  // A real compiler without keepNames supplies a map-only original-node control.
  // Empty counters are intentional for this denominator control, never a run claim.
  const control = Object.values(await convert({ code: plain.code, sourceMap: JSON.parse(plain.map), ast: await parseAstAsync(plain.code), coverage: { url: pathToFileURL(runtime).href, functions: [] } }))[0];
  for (const key of ['statementMap', 'fnMap', 'branchMap']) assert.deepEqual(candidate[key], control[key]);
  assert.equal(Object.keys(candidate.fnMap).length, 2);
  const used = Object.keys(candidate.fnMap).find(id => candidate.fnMap[id].name === 'used');
  const untouched = Object.keys(candidate.fnMap).find(id => candidate.fnMap[id].name === 'untouched');
  assert.equal(candidate.f[used], 1); assert.equal(candidate.f[untouched], 0);
  assert.ok(Object.values(candidate.b).flat().some(count => count === 0));
  assert.ok(Object.values(candidate.s).some(count => count === 0));
  fs.writeFileSync(path.join(directory, 'synthetic-runtime-proof.json'), JSON.stringify({ runtime: { node: process.versions.node, v8: process.versions.v8 }, source, executedCode: observed, sourceMap, rawSelectedRuntimeCoverage: raw, generatedPolicy: policy.audit, candidate, denominatorControl: { statementMap: control.statementMap, fnMap: control.fnMap, branchMap: control.branchMap }, productionReady: false, mergedIntoGlobalCoverage: false }, null, 2));
});
test('actual esbuild helpers never hide an author-defined __name function or its call', async () => {
  const f = await fixture('function __name(value) { return value; } function target(x) { return x ? 1 : 2; } __name(target);');
  // Actual esbuild renames the author's binding to avoid its own helper name.
  // Locate the emitted author function by its known original return behavior.
  const authored = nodes(f.ast, node => node.type === 'FunctionDeclaration' && node.params[0]?.name === 'value' && node.body.body[0]?.argument?.name === 'value');
  assert.equal(authored.length, 1); assert.equal(f.policy.ignoreNode(authored[0], 'function'), undefined);
  const authoredCalls = nodes(f.ast, node => node.type === 'ExpressionStatement' && node.expression?.callee?.name === authored[0].id.name);
  assert.equal(authoredCalls.length, 1); assert.equal(f.policy.ignoreNode(authoredCalls[0], 'statement'), undefined);
  assert.equal(f.policy.audit.ignoredGeneratedNodes.length, 0, 'Original identifier collision is conservatively unfiltered');
});
test('an author-written exact lookalike helper pair remains original source', async () => {
  const f = await fixture('var __defProp = Object.defineProperty; var __name = (target, value) => __defProp(target, "name", { value, configurable: true }); function target(x) { return x ? 1 : 2; } __name(target, "target");');
  const originalWrapper = nodes(f.ast, node => node.type === 'VariableDeclarator' && node.init?.type === 'CallExpression' && node.init.arguments[0]?.type === 'ArrowFunctionExpression');
  assert.equal(originalWrapper.length, 1); assert.equal(f.policy.ignoreNode(originalWrapper[0], 'statement'), undefined);
  const authoredCalls = nodes(f.ast, node => node.type === 'ExpressionStatement' && node.expression?.callee?.name === originalWrapper[0].id.name);
  assert.equal(authoredCalls.length, 1); assert.equal(f.policy.ignoreNode(authoredCalls[0], 'statement'), undefined);
  assert.equal(f.policy.audit.ignoredGeneratedNodes.length, 0, 'Original lookalike helper identifiers prevent any filtering');
});
test('function-valued helper arguments are not removed with a compiler wrapper', async () => {
  const f = await fixture('const real = x => x ? "😀" : "unexecuted"; export { real };');
  const original = nodes(f.ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'real');
  assert.equal(original.length, 1); assert.equal(f.policy.ignoreNode(original[0], 'statement'), undefined);
  const arrow = nodes(original[0].init, node => node.type === 'ArrowFunctionExpression');
  assert.equal(arrow.length, 1); assert.equal(f.policy.ignoreNode(arrow[0], 'function'), undefined);
  const output = await convert({ code: f.code, sourceMap: f.sourceMap, ast: f.ast, ignoreNode: f.policy.ignoreNode, coverage: { url: `file://${f.file}`, functions: [] } });
  const originalProfile = Object.values(output)[0];
  assert.equal(Object.keys(originalProfile.fnMap).length, 1); assert.deepEqual(Object.values(originalProfile.f), [0]);
  assert.ok(Object.values(originalProfile.b).flat().length >= 2); assert.ok(Object.values(originalProfile.b).flat().every(count => count === 0));
});
test('a mapped prelude is not accepted as a generated prefix', async () => {
  const f = await fixture('function real(x) { return x ? 1 : 2; }');
  const sourceMap = { ...f.sourceMap, mappings: 'AAAA,' + f.sourceMap.mappings };
  const policy = createKeepNamesPolicy({ code: f.code, sourceMap, ast: f.ast });
  assert.equal(policy.audit.ignoredGeneratedNodes.length, 0);
});
test('reassigned generated bindings fail closed instead of hiding their code', async () => {
  const f = await fixture('function real(x) { return x ? 1 : 2; }');
  const generated = nodes(f.ast, node => node.type === 'VariableDeclarator' && /^__name\d*$/.test(node.id?.name))[0];
  const code = f.code + `;${generated.id.name} = value => value;`;
  const policy = createKeepNamesPolicy({ code, sourceMap: f.sourceMap, ast: await parseAstAsync(code) });
  assert.equal(policy.audit.ignoredGeneratedNodes.length, 0);
});
test('Unicode original declaration identifiers are matched by parsed identity and exact original coordinate', async () => {
  const f = await fixture('function 東京(value) { return value ? "🎹" : "未実行"; } export { 東京 };');
  assert.equal(f.policy.audit.ignoredGeneratedNodes.filter(node => node.originalDeclaration?.name === '東京').length, 1);
  const original = nodes(f.ast, node => node.type === 'FunctionDeclaration' && node.id?.name === '東京')[0];
  assert.equal(f.policy.ignoreNode(original, 'function'), undefined);
});
test('unmapped original JavaScript is never classified as compiler output', async () => {
  const code = 'var __defProp=Object.defineProperty;var __name=(target,value)=>__defProp(target,"name",{value,configurable:true});';
  const policy = createKeepNamesPolicy({ code, ast: await parseAstAsync(code) });
  assert.equal(policy.audit.ignoredGeneratedNodes.length, 0);
});
