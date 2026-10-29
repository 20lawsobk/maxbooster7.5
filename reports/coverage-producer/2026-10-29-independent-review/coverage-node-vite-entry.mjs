/** Real node:test entry; exactly one in-process suite, no listeners or watchers. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { after } from 'node:test';
import { Session } from 'node:inspector';
import { createServer, createServerModuleRunner } from 'vite';
import { ssrModuleExportsKey, ssrImportMetaKey, ssrImportKey, ssrDynamicImportKey, ssrExportAllKey, ssrExportNameKey } from 'vite/module-runner';
import { createContract, subjectFiles, transformOptions, prefix, suffix, assertOriginalPolicy } from './coverage-shared-provider.mjs';
import { sha256, typedSha256 } from './coverage-coordinate-contract.mjs';
const root = fs.realpathSync(process.env.P1_REPOSITORY_ROOT || '.'), target = process.env.P1_TARGET;
if (target !== 'tests/fabric-replica-generation.test.mjs')
    throw Error('Only the proven in-process P1 suite is supported');
const out = process.env.P1_OUTPUT;
if (!out || !fs.statSync(out).isDirectory())
    throw Error('Owned output missing');
const contract = createContract(root), inspector = new Session();
inspector.connect();
const post = (method, params = {}) => new Promise((resolve, reject) => inspector.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
const observed = new Map(), pending = new Set(), failures = [], transforms = new Map();
let server, runner, flushed = false, observedBytes = 0;
const producerId=process.env.P1_PRODUCER_ID,startedAt=new Date().toISOString();if(!/^[a-f0-9-]{36}$/.test(producerId||''))throw Error('Parent-owned producer identity missing');
const inScope = file => subjectFiles.includes(path.relative(root, file).split(path.sep).join('/'));
const isProduction = file => ['server/', 'shared/', 'client/', 'external/', 'built-in plugins dsp/'].some(p => path.relative(root, file).split(path.sep).join('/').startsWith(p)) && !file.split(path.sep).includes('node_modules');
inspector.on('Debugger.scriptParsed', ({ params }) => {
    if (!params.url.startsWith(root) && !params.url.startsWith(pathToFileURL(root).href))
        return;
    const task = post('Debugger.getScriptSource', { scriptId: params.scriptId }).then(({ scriptSource }) => { observedBytes += Buffer.byteLength(scriptSource); if (observedBytes > 16 * 1024 * 1024)
        throw Error('Owned script capture exceeds limit'); observed.set(params.scriptId, { url: params.url, code: scriptSource }); }).catch(error => failures.push(error.message));
    pending.add(task);
    void task.finally(() => pending.delete(task));
});
after(async () => {
    if (flushed)
        return;
    flushed = true;
    try {
        try{await runner?.close();}catch(error){failures.push('runner close: '+error.message);}try{await server?.close();}catch(error){failures.push('server close: '+error.message);}
        const raw = await post('Profiler.takePreciseCoverage');
        await Promise.all([...pending]);
        const rawBytes = JSON.stringify(raw);
        if (Buffer.byteLength(rawBytes) > 16 * 1024 * 1024)
            throw Error('Raw profiler output exceeds limit');
        fs.writeFileSync(path.join(out, 'raw-v8.json'), rawBytes, { flag: 'wx' });
        const scripts = [];
        for (const item of raw.result) {
            const actual = observed.get(item.scriptId);
            if (!actual)
                continue;
            const candidates = [...transforms.values()].filter(t => t.wrapped === actual.code);
            if (!candidates.length)
                continue;
            if (candidates.length !== 1)
                throw Error('Ambiguous wrapper/body match');
            const t = candidates[0], stem = sha256(actual.code);
            fs.writeFileSync(path.join(out, stem + '.executed.js'), actual.code, { flag: 'wx' });
            fs.writeFileSync(path.join(out, stem + '.body.js'), t.code, { flag: 'wx' });
            fs.writeFileSync(path.join(out, stem + '.js.map'), JSON.stringify(t.map), { flag: 'wx' });
            scripts.push({ ...t, code: undefined, wrapped: undefined, map: undefined, scriptId: item.scriptId, runtimeUrl: item.url, observedDebuggerUrl: actual.url, codeFile: stem + '.executed.js', bodyFile: stem + '.body.js', mapFile: stem + '.js.map', codeSha256: sha256(actual.code), bodySha256: sha256(t.code), mapSha256: sha256(JSON.stringify(t.map)), coverage: item });
        }
        if (scripts.length !== subjectFiles.length || scripts.length !== transforms.size)
            throw Error('Missing original runtime script coverage');
        if (failures.length)
            throw Error('Inspector capture failed: ' + failures.join(';'));
        fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ schemaVersion: 3, kind: 'actual-P1-shared-Vite-Debugger-runtime', producerId, snapshot: { id: producerId + '-1', window: { startedAt, finishedAt: new Date().toISOString() }, reset: 'Profiler.startPreciseCoverage before imports; one take after actual node:test lifecycle', overlap: 'single fresh process, single snapshot; no merge' }, root, target, runtime: { node: process.versions.node, v8: process.versions.v8 }, contract, contractSha256: typedSha256(contract), offsetEncoding: 'UTF-16 code units', rawSha256: sha256(rawBytes), scripts }, null, 2), { flag: 'wx' });
    }
    finally {
        try {
            await post('Profiler.stopPreciseCoverage');
        }
        finally {
            inspector.disconnect();
        }
    }
});
await post('Debugger.enable');
await post('Profiler.enable');
await post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
server = await createServer({ root, configFile: false, envFile: false, logLevel: 'silent', clearScreen: false, appType: 'custom', cacheDir: path.join(out, 'vite-cache'), server: { middlewareMode: true, hmr: false, watch: null }, esbuild: transformOptions, optimizeDeps: { noDiscovery: true, include: [] }, ssr: { optimizeDeps: { noDiscovery: true, include: [] } } });
const evaluator = { startOffset: 0, runExternalModule: id => import(id), async runInlinedModule(context, code, module) {
        const file = module.file, id = module.id, wrapped = prefix + code + suffix;
        const transformed = server.environments.ssr.moduleGraph.getModuleById(id)?.transformResult;
        if (isProduction(file)) {
            if (!inScope(file))
                throw Error('P1 production subject allowlist exceeded');
            assertOriginalPolicy(fs.readFileSync(file, 'utf8'), file);
            if (!transformed?.map || transforms.has(file))
                throw Error('Missing/duplicate actual transform');
            transforms.set(file, { file, id, url: module.url, code, wrapped, prefix, suffix, wrapperLength: prefix.length, map: transformed.map, originalSourceSha256: sha256(fs.readFileSync(file)) });
        }
        const exp = context[ssrModuleExportsKey], meta = context[ssrImportMetaKey], exportName = context[ssrExportNameKey] || ((name, get) => Object.defineProperty(exp, name, { enumerable: true, configurable: true, get }));
        const fn = vm.runInThisContext(wrapped, { filename: pathToFileURL(file).href, lineOffset: 0, columnOffset: -prefix.length });
        await fn(exp, meta, context[ssrImportKey], context[ssrDynamicImportKey], context[ssrExportAllKey], exportName, file, path.dirname(file), { exports: exp }, exp, createRequire(meta.url));
        Object.seal(exp);
    } };
runner = createServerModuleRunner(server.environments.ssr, { hmr: false, sourcemapInterceptor: false, evaluator });
await runner.import(path.join(root, target));
