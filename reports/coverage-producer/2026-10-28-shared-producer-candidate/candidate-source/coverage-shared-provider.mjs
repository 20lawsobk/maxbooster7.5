/** Version-pinned shared public-Vite / actual coverage-v8 provider contract. */
import fs from 'node:fs';
import path from 'node:path';
import os from'node:os';
import{spawnSync}from'node:child_process';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
import coverageV8 from '@vitest/coverage-v8';
import { moduleRunnerTransform } from 'vite';
import {validateRanges,validateSourceMap}from'./coverage-provenance.mjs';
import { sha256, typedSha256, encodeCoverage, decodeCoverage } from './coverage-coordinate-contract.mjs';
export const subjectFiles = Object.freeze(['server/pocket-dimension/fabric/storage/PocketDimensionChunkStore.ts', 'server/lib/pdimClient.ts', 'server/logger.ts', 'server/logSanitizer.ts', 'server/config/ports.ts', 'server/lib/luaExecutor.ts', 'server/lib/pdimCircuitBreaker.ts', 'external/pdim/artifacts/api-server/src/redis/store.ts', 'external/pdim/artifacts/api-server/src/workers/lua-pool.ts']);
export const transformOptions = Object.freeze({ target: 'esnext', minify: false, minifyIdentifiers: false, minifySyntax: false, minifyWhitespace: false, treeShaking: false, keepNames: false, supported: { 'dynamic-import': true, 'import-meta': true } });
export const wrapperArgs = Object.freeze(['__vite_ssr_exports__', '__vite_ssr_import_meta__', '__vite_ssr_import__', '__vite_ssr_dynamic_import__', '__vite_ssr_exportAll__', '__vite_ssr_exportName__', '__filename', '__dirname', 'module', 'exports', 'require']);
export const prefix = `'use strict';async (${wrapperArgs.join(',')})=>{{`, suffix = '\n}}';
export function originalCoverageData(raw) { const keys = ['path', 'statementMap', 'fnMap', 'branchMap', 's', 'f', 'b']; if (!raw || Object.getPrototypeOf(raw) !== Object.prototype || Reflect.ownKeys(raw).some(k => !keys.includes(k) && k !== 'meta'))
    throw Error('Unsupported provider coverage fields'); if (raw.meta) {
    if (Object.getPrototypeOf(raw.meta) !== Object.prototype || !isDeepStrictEqual(Object.keys(raw.meta), ['lastBranch', 'lastFunction', 'lastStatement', 'seen', 'fnNames']) || !(raw.meta.fnNames instanceof Map) || Object.getPrototypeOf(raw.meta.fnNames) !== Map.prototype || Reflect.ownKeys(raw.meta.fnNames).length)
        throw Error('Unsupported provider transient metadata');
} for (const k of Reflect.ownKeys(raw)) {
    const d = Object.getOwnPropertyDescriptor(raw, k);
    if (!('value' in d) || !d.enumerable)
        throw Error('Unsupported provider descriptor');
} return Object.fromEntries(keys.map(k => [k, raw[k]])); }
const pins = { 'vite': '7.3.7', 'vitest': '4.1.12', '@vitest/coverage-v8': '4.1.12', 'esbuild': '0.28.2', 'ast-v8-to-istanbul': '1.0.7', 'typescript': '5.9.3' };
const providerSha256 = '9f7848b27aabc311e867d9a034b4f569892e68533b837116ab932e05fa20558f', evaluatorSha256 = 'a0b36fb2211d2587d8df68d5855d48141be27e99bdb973378a83f927e03b004e';
export function assertOriginalPolicy(source, file) { const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true); if (ast.parseDiagnostics.length)
    throw Error('Original TS parse failed'); let identifiers = 0, authoredHelpers = 0; function visit(n) { if (ts.isIdentifier(n)) {
    identifiers++;
    if (n.text === '__name')
        authoredHelpers++;
    if (n.text.startsWith('__vite_ssr_') || n.text.startsWith('__vite__cjsImport') || n.text === '_ts_decorate')
        throw Error('Authored identifier could be hidden by provider generated-node policy');
} if (ts.isPropertyAccessExpression(n) && ts.isMetaProperty(n.expression) && ['env', 'vitest'].includes(n.name.text))
    throw Error('Authored import.meta policy requires independent support'); if (ts.isPropertyAccessExpression(n) && ['exports', 'module'].includes(n.expression.getText(ast)))
    throw Error('Inline CommonJS requires independent evaluator contract'); ts.forEachChild(n, visit); } visit(ast); return { originalAstIdentifiers: identifiers, authoredNameHelpersRetained: authoredHelpers, generatedName: 'provider SSR-only policy; original name helpers retained', sourceSha256: sha256(source) }; }
export function createContract(root) { root = fs.realpathSync(root); if (typeof moduleRunnerTransform !== 'function')
    throw Error('Public Vite moduleRunnerTransform unavailable'); const versions = {}; for (const [name, expected] of Object.entries(pins)) {
    const json = path.join(root, 'node_modules', name, 'package.json');
    versions[name] = JSON.parse(fs.readFileSync(json)).version;
    if (versions[name] !== expected)
        throw Error('Unsupported ' + name + ' version');
} if (sha256(fs.readFileSync(path.join(root, 'node_modules/@vitest/coverage-v8/dist/provider.js'))) !== providerSha256 || sha256(fs.readFileSync(path.join(root, 'node_modules/vitest/dist/module-evaluator.js'))) !== evaluatorSha256)
    throw Error('Unsupported provider/evaluator implementation'); const tsconfigs = {}; for (const f of ['tsconfig.json', 'external/pdim/tsconfig.base.json', 'external/pdim/artifacts/api-server/tsconfig.json'])
    tsconfigs[f] = sha256(fs.readFileSync(path.join(root, f))); const implementations={};for(const file of ['vite/dist/node/index.js','vite/dist/node/chunks/config.js','esbuild/lib/main.js','ast-v8-to-istanbul/dist/index.mjs','typescript/lib/typescript.js'])implementations[file]=sha256(fs.readFileSync(path.join(root,'node_modules',file)));return { version: 'maxbooster-shared-vite-provider-v1', repositoryRoot:root, implementations, runtime: { node: process.versions.node, v8: process.versions.v8 }, versions, tsconfigs, transform: { publicApi: 'Vite createServer / createServerModuleRunner + moduleRunnerTransform', configFile: false, envFile: false, server: { middlewareMode: true, hmr: false, watch: null }, esbuild: transformOptions, tsconfig: 'actual Vite tsconfig resolution' }, provider: { package: '@vitest/coverage-v8', hook: 'remapCoverage', implementationSha256: providerSha256, ignoreClassMethods: [], policy: 'unchanged installed provider SSR/original-node policy guarded against authored matches' }, wrapper: { implementationSha256: evaluatorSha256, encoding: 'UTF-16 code units', prefix, suffix, length: prefix.length } }; }
export function validateExecuted(item, { executed, body, map, source, contract }) { if (item.prefix !== contract.wrapper.prefix || item.suffix !== contract.wrapper.suffix || item.wrapperLength !== item.prefix.length)
    throw Error('Wrong actual wrapper'); if (executed !== item.prefix + body + item.suffix || sha256(executed) !== item.codeSha256 || sha256(body) !== item.bodySha256 || sha256(JSON.stringify(map)) !== item.mapSha256 || sha256(source) !== item.originalSourceSha256)
    throw Error('Stale body/map/source/runtime binding'); if (!map || map.version !== 3 || !Array.isArray(map.sources) || !Array.isArray(map.sourcesContent) || map.sources.length !== 1 || map.sourcesContent.length !== 1 || map.sourcesContent[0] !== source)
    throw Error('Original source-map content binding'); validateRanges(item.coverage,executed); return assertOriginalPolicy(source, item.file); }
export async function createSharedProvider(root) { const contract = createContract(root), provider = await coverageV8.getProvider(); if (typeof provider.remapCoverage !== 'function')
    throw Error('Pinned provider hook unavailable'); provider.options = { ignoreClassMethods: [] }; provider.ctx = { logger: { error: message => { throw Error(message); } } }; return { contract, async convert(item, bytes) { const audit = validateExecuted(item, { ...bytes, contract });const originalSources=validateSourceMap(bytes.map,item.file,root);if(originalSources.length!==1||originalSources[0].file!==item.file)throw Error('Source map original/module identity mismatch'); const invoke = () => provider.remapCoverage(pathToFileURL(item.file).href, item.wrapperLength, { code: bytes.body, map: bytes.map }, item.coverage.functions); const actual = Object.values(await invoke()), replayed = Object.values(await invoke()); if (actual.length !== 1 || !isDeepStrictEqual(actual, replayed))
        throw Error('Non-unique/non-repeatable provider output'); const providerRaw = actual[0], raw = originalCoverageData(providerRaw), replay = originalCoverageData(replayed[0]), provenance = { kind: 'actual-shared-provider-replay', sourceSha256: sha256(bytes.source), contractSha256: typedSha256(contract), providerSha256, bodySha256: item.bodySha256, mapSha256: item.mapSha256, executedSha256: item.codeSha256, rangesSha256: typedSha256(item.coverage.functions), replay }; const context = { source: bytes.source, sourceFile: item.file, contract, provenance, body: bytes.body, map: bytes.map }; const encoded = encodeCoverage(raw, context); if (!isDeepStrictEqual(decodeCoverage(encoded.wire, encoded.sidecar, context), raw))
        throw Error('Typed roundtrip changed original maps/counters'); return { raw, providerRaw, replay, encoded, provenance, audit }; } }; }

/** Bind every manifest script to the one actual inspector record before conversion. */
export function validateCapturedManifest(manifest,{raw,root,target,contract,producerId}) {
 const fail=message=>{throw Error('Actual capture manifest: '+message);};
 if(!manifest||manifest.schemaVersion!==3||manifest.kind!=='actual-P1-shared-Vite-Debugger-runtime'||manifest.root!==root||manifest.target!==target||target!=='tests/fabric-replica-generation.test.mjs')fail('root/target/schema identity');
 if(!isDeepStrictEqual(manifest.contract,contract)||manifest.contractSha256!==typedSha256(contract)||!isDeepStrictEqual(manifest.runtime,contract.runtime)||manifest.offsetEncoding!=='UTF-16 code units')fail('runtime/contract identity');
 if(typeof producerId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(producerId)||manifest.producerId!==producerId||manifest.snapshot?.id!==producerId+'-1'||manifest.snapshot?.reset!=='Profiler.startPreciseCoverage before imports; one take after actual node:test lifecycle'||manifest.snapshot?.overlap!=='single fresh process, single snapshot; no merge')fail('producer/snapshot identity');
 const start=Date.parse(manifest.snapshot.window?.startedAt),end=Date.parse(manifest.snapshot.window?.finishedAt);if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)fail('snapshot window');
 if(!raw||!Array.isArray(raw.result)||!Array.isArray(manifest.scripts)||manifest.scripts.length!==subjectFiles.length)fail('complete actual raw scripts');
 const rawIds=new Map();for(const record of raw.result){if(typeof record?.scriptId!=='string'||typeof record.url!=='string'||rawIds.has(record.scriptId))fail('duplicate/invalid actual script ID');rawIds.set(record.scriptId,record);}
 const files=new Set(),ids=new Set(),urls=new Set();
 for(const item of manifest.scripts){const file=path.relative(root,item.file).split(path.sep).join('/');if(!subjectFiles.includes(file)||files.has(file)||ids.has(item.scriptId))fail('duplicate/missing original or script');files.add(file);ids.add(item.scriptId);
  const record=rawIds.get(item.scriptId);if(!record||!isDeepStrictEqual(record,item.coverage)||item.coverage.scriptId!==item.scriptId||item.runtimeUrl!==record.url||urls.has(record.url))fail('manifest counters differ from unique actual raw record');urls.add(record.url);
  const url=pathToFileURL(item.file).href;if(![item.file,url].includes(record.url)||![item.file,url].includes(item.observedDebuggerUrl)||item.id!==item.file||item.url!=='/'+file)fail('ambiguous module/runtime URL');
  if(item.prefix!==contract.wrapper.prefix||item.suffix!==contract.wrapper.suffix||item.wrapperLength!==contract.wrapper.length||item.wrapperLength!==item.prefix.length)fail('actual wrapper identity');
 }
 return true;
}

/** Reuse the platform's authoritative inventory, including C++ and lockfiles. */
export function readSourceInputs(root) {
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'c5-source-'));
 try{
  const code="import importlib.util,json,sys; p=sys.argv[1]; spec=importlib.util.spec_from_file_location('maxbooster_coverage_common',p); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); print(json.dumps(module.source_inputs(),sort_keys=True,separators=(',',':')))";
  const result=spawnSync('python3',['-I','-B','-c',code,path.join(root,'scripts/testing/common.py')],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,env:{PATH:process.env.PATH||'/usr/bin:/bin',LANG:'C',HOME:home,TMPDIR:home}});
  if(result.error||result.status!==0)throw Error('Authoritative common.source_inputs failed (Python3 is required)');
  const inputs=JSON.parse(result.stdout);if(!inputs||typeof inputs.sha256!=='string'||!inputs.files)throw Error('Authoritative source inventory missing');return inputs;
 }finally{fs.rmSync(home,{recursive:true,force:true});}
}
