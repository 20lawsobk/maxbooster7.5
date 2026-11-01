import test from 'node:test';
import fs from'node:fs';import os from'node:os';import path from'node:path';import{spawnSync}from'node:child_process';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { Session } from 'node:inspector';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { encodeCoverage, decodeCoverage, sha256, typedSha256 } from '../../scripts/testing/coverage-coordinate-contract.mjs';
import { assertOriginalPolicy, validateExecuted, transformOptions,validateCapturedManifest,subjectFiles,readSourceInputs,createContract } from '../../scripts/testing/coverage-shared-provider.mjs';
import { transformWithEsbuild, moduleRunnerTransform } from 'vite';
import coverageV8 from '@vitest/coverage-v8';
const source = 'if (true) { void 0; }\n', sourceFile = '/fixture.ts', contract = { version: 'finite-fixture', provider: { implementationSha256: 'a'.repeat(64) } };
const loc = () => ({ start: { line: 1, column: 0 }, end: { line: 1, column: source.trimEnd().length } });
const fixture = () => ({ path: sourceFile, statementMap: { 0: loc() }, fnMap: {}, branchMap: {}, s: { 0: 0 }, f: {}, b: {} });
const context = { source, sourceFile, contract };
test('finite coordinates roundtrip with original zero denominator and UTF16 source', () => { const raw = fixture(), encoded = encodeCoverage(raw, context); assert.deepEqual(decodeCoverage(encoded.wire, encoded.sidecar, context), raw); assert.equal(encoded.wire.s[0], 0); assert.equal(Object.keys(encoded.wire.statementMap).length, 1); });
for (const [value, label] of [[NaN, 'NaN'], [-Infinity, 'negative Infinity'], [null, 'raw null'], [-1, 'negative'], [0.5, 'fraction'], [true, 'boolean'], [9999, 'out of source'], [undefined, 'partial undefined']])
    test('rejects ' + label + ' column', () => { const raw = fixture(); raw.statementMap[0].end.column = value; assert.throws(() => encodeCoverage(raw, context)); });
for (const mutate of [r => r.extra = true, r => r.statementMap[0].extra = 1, r => Object.setPrototypeOf(r.statementMap[0], { hidden: true }), r => Object.defineProperty(r.statementMap[0], 'evil', { get() { throw Error('getter should never execute'); }, enumerable: true }), r => r.s[1] = 0, r => r.s[0] = -1, r => r.s[0] = 0.5])
    test('rejects unsupported shape ' + mutate.toString(), () => { const raw = fixture(); mutate(raw); assert.throws(() => encodeCoverage(raw, context)); });
function sentinelFixture() { const raw = fixture(); raw.statementMap[0].end.column = Infinity; raw.branchMap[0] = { type: 'if', loc: loc(), line: 1, locations: [loc(), { start: { line: undefined, column: undefined }, end: { line: undefined, column: undefined } }] }; raw.b[0] = [0, 0]; const body = 'actual-body', map = { version: 3, sources: [sourceFile], sourcesContent: [source], names: [], mappings: '' }; const ctx = { ...context, body, map, provenance: { kind: 'actual-shared-provider-replay', sourceSha256: sha256(source), contractSha256: typedSha256(contract), providerSha256: contract.provider.implementationSha256, bodySha256: sha256(body), mapSha256: sha256(JSON.stringify(map)), replay: structuredClone(raw) } }; return { raw, ctx }; }
test('only attested end Infinity and full AST-proven synthetic else roundtrip', () => { const { raw, ctx } = sentinelFixture(), e = encodeCoverage(raw, ctx); assert.equal(e.wire.statementMap[0].end.column, null); assert.deepEqual(e.wire.branchMap[0].locations[1], { start: {}, end: {} }); assert.equal(e.sidecar.sentinels.length, 5); assert.deepEqual(decodeCoverage(e.wire, e.sidecar, ctx), raw); assert.deepEqual(e.wire.b[0], [0, 0]); });
for (const mutate of [(raw, ctx) => delete ctx.provenance, (raw, ctx) => ctx.body += 'stale', (raw, ctx) => ctx.map.sourcesContent = ['wrong'], (raw, ctx) => ctx.provenance.providerSha256 = 'b'.repeat(64), (raw, ctx) => raw.branchMap[0].locations[1].start.column = 0, (raw, ctx) => raw.statementMap[0].start.column = Infinity, (raw, ctx) => ctx.provenance.replay.branchMap[0].type = 'switch'])
    test('sentinel proof rejects ' + mutate.toString(), () => { const { raw, ctx } = sentinelFixture(); mutate(raw, ctx); assert.throws(() => encodeCoverage(raw, ctx)); });
test('wire refuses absent, changed, duplicate or partial sentinel sidecar', () => { const { raw, ctx } = sentinelFixture(), e = encodeCoverage(raw, ctx); for (const edit of [x => delete x.sidecar, x => x.wire.s[0]++, x => x.sidecar.sentinels.push(x.sidecar.sentinels[0]), x => x.sidecar.sentinels.pop(), x => x.sidecar.sentinels[0].type = 'nan']) {
    const copy = structuredClone(e);
    edit(copy);
    assert.throws(() => decodeCoverage(copy.wire, copy.sidecar, ctx));
} assert.throws(() => decodeCoverage(e.wire, e.sidecar, { ...ctx, source: source + '\n' })); });
test('authored helper remains original; authored policy lookalikes reject', () => { const audit = assertOriginalPolicy('export const __name = (fn) => fn;', 'helper.ts'); assert.equal(audit.authoredNameHelpersRetained, 1); for (const s of ['export const __vite_ssr_import_0__=()=>0;', 'export function _ts_decorate(){}', 'export const x=import.meta.env;', 'module.exports=()=>1;'])
    assert.throws(() => assertOriginalPolicy(s, 'bad.ts')); });
test('public Vite transform/provider retains authored helper arrows and all zero original functions', async () => { const text = 'export const __name = (fn) => fn;\nexport const untouched = (n) => n ? 1 : 2;\n'; assertOriginalPolicy(text, '/helper.ts'); const transformed = await transformWithEsbuild(text, '/helper.ts', { ...transformOptions, sourcemap: true, tsconfigRaw: { compilerOptions: {} } }); const ssr = await moduleRunnerTransform(transformed.code, transformed.map, '/helper.ts', text); const p = await coverageV8.getProvider(); p.options = { ignoreClassMethods: [] }; p.ctx = { logger: { error: m => { throw Error(m); } } }; const raw = Object.values(await p.remapCoverage('file:///helper.ts', 0, ssr, []))[0]; assert.equal(Object.keys(raw.fnMap).length, 2); assert.ok(Object.values(raw.f).every(n => n === 0)); assert.ok(Object.values(raw.b).flat().every(n => n === 0)); assert.deepEqual(Object.values(raw.fnMap).map(f => f.decl.start.line).sort(), [1, 2]); });
test('actual Debugger UTF16 wrapper binding rejects stale maps and wrong prefix', async () => { const session = new Session(); session.connect(); const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (e, r) => e ? reject(e) : resolve(r))); const observed = []; session.on('Debugger.scriptParsed', ({ params }) => { if (params.url === 'unicode-coverage-fixture.js')
    observed.push(post('Debugger.getScriptSource', { scriptId: params.scriptId })); }); try {
    await post('Debugger.enable');
    const prefix = "/*😀\r\n*/(async()=>{", body = "const text='🌍'; return text;", suffix = '})', executed = prefix + body + suffix;
    const run = vm.runInThisContext(executed, { filename: 'unicode-coverage-fixture.js' });
    assert.equal(await run(), '🌍');
    const captures = await Promise.all(observed);
    assert.ok(captures.some(c => c.scriptSource === executed));
    assert.ok(Buffer.byteLength(prefix) > prefix.length);
    const map = { version: 3, sources: ['/unicode.ts'], sourcesContent: ['const text="🌍";'], names: [], mappings: '' };
    const item = { file: '/unicode.ts', prefix, suffix, wrapperLength: prefix.length, codeSha256: sha256(executed), bodySha256: sha256(body), mapSha256: sha256(JSON.stringify(map)), originalSourceSha256: sha256('const text="🌍";'), coverage: { functions: [{ functionName:'fixture',isBlockCoverage:true,ranges: [{ startOffset: 0, endOffset: executed.length, count: 1 }] }] } };
    const c = { wrapper: { prefix, suffix } }, bytes = { executed, body, map, source: 'const text="🌍";', contract: c };
    validateExecuted(item, bytes);
    for (const changed of [{ ...item, prefix: prefix + 'x' }, { ...item, wrapperLength: Buffer.byteLength(prefix) }, { ...item, mapSha256: 'a'.repeat(64) }, { ...item, coverage: { functions: [{ functionName:'fixture',isBlockCoverage:true,ranges: [{ startOffset: 0, endOffset: executed.length + 1, count: 1 }] }] } }])
        assert.throws(() => validateExecuted(changed, bytes));
}
finally {
    session.disconnect();
} });

test('wire rejects unsupported prototypes and accessors before serialization or cloning', () => { for (const mutate of [e => Object.setPrototypeOf(e.wire.s, { injected: true }), e => Object.defineProperty(e.wire.statementMap, '0', {get() {throw Error('must never run');}, enumerable: true}), e => e.wire.s[Symbol('extra')] = 1]) {const e = encodeCoverage(fixture(), context); mutate(e); assert.throws(() => decodeCoverage(e.wire, e.sidecar, context));} });
function captureFixture(){const root='/fixture-root',producerId='12345678-1234-1234-1234-123456789abc',target='tests/fabric-replica-generation.test.mjs';const contract={runtime:{node:'22.fixture',v8:'fixture'},wrapper:{prefix:'P',suffix:'S',length:1}};const scripts=subjectFiles.map((file,i)=>{const full=root+'/'+file,coverage={scriptId:String(i+1),url:full,functions:[{functionName:'f',isBlockCoverage:true,ranges:[{startOffset:0,endOffset:3,count:0}]}]};return{file:full,id:full,url:'/'+file,scriptId:coverage.scriptId,runtimeUrl:full,observedDebuggerUrl:full,prefix:'P',suffix:'S',wrapperLength:1,coverage};});const raw={result:scripts.map(x=>structuredClone(x.coverage))};const manifest={schemaVersion:3,kind:'actual-P1-shared-Vite-Debugger-runtime',root,target,contract,contractSha256:typedSha256(contract),runtime:contract.runtime,offsetEncoding:'UTF-16 code units',producerId,snapshot:{id:producerId+'-1',window:{startedAt:'2026-10-29T01:00:00.000Z',finishedAt:'2026-10-29T01:00:01.000Z'},reset:'Profiler.startPreciseCoverage before imports; one take after actual node:test lifecycle',overlap:'single fresh process, single snapshot; no merge'},scripts};return{manifest,context:{raw,root,target,contract,producerId}};}
test('manifest requires exact unique actual inspector records for all nine originals',()=>{const{manifest,context}=captureFixture();assert.equal(validateCapturedManifest(manifest,context),true);});
for(const[label,mutate]of[
 ['counter tamper',(m,c)=>m.scripts[0].coverage.functions[0].ranges[0].count=999],
 ['function tamper',(m,c)=>m.scripts[0].coverage.functions[0].functionName='forged'],
 ['raw duplicate ID',(m,c)=>c.raw.result.push(structuredClone(c.raw.result[0]))],
 ['manifest duplicate ID',(m,c)=>m.scripts[1].scriptId=m.scripts[0].scriptId],
 ['manifest duplicate original',(m,c)=>m.scripts[1].file=m.scripts[0].file],
 ['missing original',(m,c)=>m.scripts.pop()],
 ['runtime mismatch',(m,c)=>m.runtime={node:'wrong',v8:'wrong'}],
 ['root mismatch',(m,c)=>m.root='/another-root'],
 ['target mismatch',(m,c)=>m.target='tests/another.test.mjs'],
 ['producer mismatch',(m,c)=>m.producerId='a'.repeat(36)],
 ['snapshot mismatch',(m,c)=>m.snapshot.id+='wrong'],
 ['snapshot overlap',(m,c)=>m.snapshot.overlap='unknown'],
 ['runtime URL mismatch',(m,c)=>m.scripts[0].runtimeUrl='file:///other.ts'],
 ['observed URL mismatch',(m,c)=>m.scripts[0].observedDebuggerUrl='file:///other.ts'],
 ['module URL mismatch',(m,c)=>m.scripts[0].url='/other.ts'],
 ['script/raw URL substitution',(m,c)=>{m.scripts[0].coverage.url='/other';c.raw.result[0].url='/other';m.scripts[0].runtimeUrl='/other';}],
 ['wrapper mismatch',(m,c)=>m.scripts[0].wrapperLength=2],
 ['contract mismatch',(m,c)=>m.contractSha256='0'.repeat(64)]
])test('manifest rejects '+label,()=>{const{manifest,context}=captureFixture();mutate(manifest,context);assert.throws(()=>validateCapturedManifest(manifest,context));});

test('authoritative common inventory keeps C++ SQL locks and untracked code while excluding generated snapshots/coverage',()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'c5-inventory-'));try{
  const origin=fileURLToPath(new URL('../../scripts/testing/coverage-provenance.mjs',import.meta.url));const helper=fs.realpathSync(origin).replace(/coverage-provenance\.mjs$/,'common.py');
  fs.mkdirSync(path.join(temporary,'scripts/testing'),{recursive:true});fs.copyFileSync(helper,path.join(temporary,'scripts/testing/common.py'));
  assert.equal(spawnSync('git',['init','-q'],{cwd:temporary}).status,0);
  const included=['plugin/source.cpp','schema/table.sql','Cargo.lock','go.sum','.dockerignore','server/new.ts','tests/coverage/real.test.ts','server/公開.ts'];const excluded=['reports/x.ts','dist/x.ts','.snapshots/x.ts','coverage/x.ts','server/coverage/x.ts','.pdim-owned/x.ts'];
  for(const f of[...included,...excluded]){fs.mkdirSync(path.dirname(path.join(temporary,f)),{recursive:true});fs.writeFileSync(path.join(temporary,f),'fixture');}
  const first=readSourceInputs(temporary);for(const f of included)assert.ok(first.files[f],f);for(const f of excluded)assert.ok(!first.files[f],f);fs.writeFileSync(path.join(temporary,'plugin/source.cpp'),'changed');assert.notEqual(readSourceInputs(temporary).sha256,first.sha256);
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});

test('public Istanbul inline and file contract reporters preserve raw typed maps/counters identically',()=>{
 const helper=fs.realpathSync(fileURLToPath(new URL('../../scripts/testing/coverage-provenance.mjs',import.meta.url))),root=path.resolve(path.dirname(helper),'../..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'c5-report-'));const require=createRequire(import.meta.url),{deserialize}=require('node:v8'),RawReporter=require('../../scripts/testing/coverage-raw-sidecar-reporter.cjs'),{createCoverageMap}=require('istanbul-lib-coverage'),{createContext}=require('istanbul-lib-report');
 try{
  const contract=createContract(root),contractFile=path.join(temporary,'contract.json');fs.writeFileSync(contractFile,JSON.stringify(contract));
  // Synthetic reporting controls: no application module is imported or executed.
  const controls=Object.fromEntries(subjectFiles.map(f=>{const full=path.join(root,f);return[full,{path:full,statementMap:{0:{start:{line:1,column:0},end:{line:1,column:Infinity}}},fnMap:{},branchMap:{},s:{0:0},f:{},b:{}}];}));
  const outputs=[];for(const[mode,opts]of[['inline',{contract}],['file',{contractFile}]]){const output=path.join(temporary,mode),reporter=new RawReporter({projectRoot:root,output,...opts});reporter.execute(createContext({dir:path.join(temporary,'reports-'+mode),coverageMap:createCoverageMap(controls)}));const m=JSON.parse(fs.readFileSync(path.join(output,'manifest.json')));assert.equal(m.files.length,9);assert.equal(m.contractSha256,typedSha256(contract));assert.ok(m.producerId);for(const f of m.files){const raw=deserialize(fs.readFileSync(path.join(output,f.name)));assert.equal(raw.statementMap[0].end.column,Infinity);assert.equal(raw.s[0],0);}outputs.push(m.files.map(f=>[f.file,f.sha256]));}
  assert.deepEqual(outputs[0],outputs[1]);assert.throws(()=>new RawReporter({projectRoot:root,output:path.join(temporary,'ambiguous'),contract,contractFile}));
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
