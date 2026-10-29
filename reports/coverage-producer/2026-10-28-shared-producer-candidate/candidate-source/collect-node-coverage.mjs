/** Collect one existing P1 suite using the shared Vite/provider typed contract. */
import fs from 'node:fs';
import {randomUUID}from'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { serialize, deserialize } from 'node:v8';
import { isDeepStrictEqual } from 'node:util';
import { createSharedProvider, subjectFiles, originalCoverageData,validateCapturedManifest,readSourceInputs } from './coverage-shared-provider.mjs';
import { sha256, typedSha256, encodeCoverage, decodeCoverage } from './coverage-coordinate-contract.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), args = process.argv.slice(2);
let explicitRoot;
if (args[0] === '--repository-root') {
    args.shift();
    explicitRoot = args.shift();
}
const root = fs.realpathSync(explicitRoot || path.join(here, '../..')), target = args[0], requested = args[1], canonical = args[2];
if(explicitRoot&&(here===root||here.startsWith(root+path.sep)))throw Error('Repository override is only for an outside review copy');
// The allowlist is checked before importing app code or creating any output.
if (target !== 'tests/fabric-replica-generation.test.mjs' || !requested || args.length > 3)
    throw Error('P1 supports only tests/fabric-replica-generation.test.mjs and a new owned output');
const tracked = spawnSync('git', ['ls-files', '--', target], { cwd: root, encoding: 'utf8' });
if (tracked.status || tracked.stdout.trim() !== target || !/from\s*["']node:test["']/.test(fs.readFileSync(path.join(root, target), 'utf8')))
    throw Error('An existing Git-visible canonical node:test suite is required');
const { runOwnedCommand, ownedPath } = await import(path.join(root, 'scripts/testing/coverage-provenance.mjs'));
const out = ownedPath(explicitRoot ? here : path.join(root, 'reports'), path.resolve(root, requested));
if (fs.existsSync(out))
    throw Error('Producer output must be a new owned directory');
const sourceInputs=()=>readSourceInputs(root);
const inputsBefore = sourceInputs(), canonicalFile = path.join(root, 'reports/test-verification/coverage/coverage-final.json'), globalBefore = sha256(fs.readFileSync(canonicalFile)), testSha256 = sha256(fs.readFileSync(path.join(root, target))), candidateFiles = {};
const candidatePaths=Object.fromEntries(['coverage-coordinate-contract.mjs','coverage-shared-provider.mjs','coverage-node-vite-entry.mjs','collect-node-coverage.mjs','coverage-raw-sidecar-reporter.cjs'].map(f=>[f,path.join(here,f)]));candidatePaths['tests/testing/coverage-coordinate-contract.test.mjs']=explicitRoot?path.join(here,'coverage-coordinate-contract.test.mjs'):path.join(root,'tests/testing/coverage-coordinate-contract.test.mjs');for(const[f,full]of Object.entries(candidatePaths))candidateFiles[f]=sha256(fs.readFileSync(full));
const { contract, convert } = await createSharedProvider(root);const producerId=randomUUID();
fs.mkdirSync(out, { recursive: true, mode: 0o700 });
const home = path.join(out, 'home');
fs.mkdirSync(home, { mode: 0o700 });
const env = { PATH: process.env.PATH || '/usr/bin:/bin', HOME: home, TMPDIR: home, LANG: 'C', CI: '1', P1_REPOSITORY_ROOT: root, P1_TARGET: target, P1_OUTPUT: out,P1_PRODUCER_ID:producerId, NODE_V8_COVERAGE:path.join(out,'node-native-corroboration') };
if (process.env.LD_LIBRARY_PATH)
    env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH;
const command = ['--test', '--test-concurrency=1', '--test-reporter=tap', path.join(here, 'coverage-node-vite-entry.mjs')], run = await runOwnedCommand(process.execPath, command, { cwd: root, env, timeoutMs: 120000, maxBuffer: 8 * 1024 * 1024 });
fs.writeFileSync(path.join(out, 'test.txt'), run.stdout + run.stderr);
const receipt = { schemaVersion: 2, status: 'collecting', sourceRevision: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(), sourceInputsBeforeSha256: inputsBefore.sha256, test: target, testSha256, contract, contractSha256: typedSha256(contract), candidateFiles, command: [process.execPath, ...command], envKeys: Object.keys(env), exitCode: run.status, signal: run.signal, timedOut: run.timedOut, bufferExceeded: run.bufferExceeded, cleanup: run.cleanup, profiles: [], mergedIntoGlobalCoverage: false, productionReady: false };
try {
    if (run.status || run.error || run.timedOut || run.bufferExceeded || !run.cleanup.complete)
        throw Error('Actual suite or owned cleanup failed');
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json')));
    if (manifest.schemaVersion !== 3 || manifest.contractSha256 !== typedSha256(contract) || manifest.rawSha256 !== sha256(fs.readFileSync(path.join(out, 'raw-v8.json'))))
        throw Error('Unsupported/stale actual capture contract');
    const raw=JSON.parse(fs.readFileSync(path.join(out,'raw-v8.json')));validateCapturedManifest(manifest,{raw,root,target,contract,producerId});receipt.producerId = manifest.producerId;
    receipt.snapshot = manifest.snapshot;
    const rawManifest = canonical ? JSON.parse(fs.readFileSync(path.join(canonical, 'manifest.json'))) : null;
    if (rawManifest && rawManifest.contractSha256 !== typedSha256(contract))
        throw Error('Canonical sidecar has different/unproven producer contract');
    for (const item of manifest.scripts) {
        if (!subjectFiles.includes(path.relative(root, item.file)))
            throw Error('Unsupported retained production source');
        const bytes = { source: fs.readFileSync(item.file, 'utf8'), body: fs.readFileSync(ownedPath(out, path.resolve(out, item.bodyFile)), 'utf8'), executed: fs.readFileSync(ownedPath(out, path.resolve(out, item.codeFile)), 'utf8'), map: JSON.parse(fs.readFileSync(ownedPath(out, path.resolve(out, item.mapFile)))) };
        const result = await convert(item, bytes), stem = path.relative(root, item.file).replaceAll('/', '__');
        fs.writeFileSync(path.join(out, stem + '.raw.v8'), serialize(result.providerRaw));
        fs.writeFileSync(path.join(out, stem + '.wire.json'), JSON.stringify(result.encoded.wire));
        fs.writeFileSync(path.join(out, stem + '.typed.json'), JSON.stringify(result.encoded.sidecar, null, 2));
        const mapComparison = {};
        if (rawManifest) {
            const ci = rawManifest.files.find(x => x.file === path.relative(root, item.file));
            if (!ci)
                throw Error('Missing canonical original');
            const rawBytes = fs.readFileSync(ownedPath(canonical, path.resolve(canonical, ci.name)));
            assert.equal(sha256(rawBytes), ci.sha256);
            assert.equal(sha256(bytes.source), ci.sourceSha256);
            const canonicalRaw = originalCoverageData(deserialize(rawBytes)), provenance = { ...result.provenance, kind: 'actual-public-Istanbul-pre-JSON-sidecar', rawSidecarSha256: ci.sha256 }, context = { source: bytes.source, sourceFile: item.file, contract, provenance, body: bytes.body, map: bytes.map }, encoded = encodeCoverage(canonicalRaw, context), decoded = decodeCoverage(encoded.wire, encoded.sidecar, context);
            for (const k of ['statementMap', 'fnMap', 'branchMap'])
                mapComparison[k] = isDeepStrictEqual(decoded[k], result.raw[k]);
            if (Object.values(mapComparison).some(v => !v))
                throw Error('Complete canonical map mismatch');
            fs.writeFileSync(path.join(out, stem + '.canonical.wire.json'), JSON.stringify(encoded.wire));
            fs.writeFileSync(path.join(out, stem + '.canonical.typed.json'), JSON.stringify(encoded.sidecar, null, 2));
        }
        const zeros = { statements: Object.values(result.raw.s).filter(n => n === 0).length, functions: Object.values(result.raw.f).filter(n => n === 0).length, branchArms: Object.values(result.raw.b).flat().filter(n => n === 0).length };
        if (stem === 'server__config__ports.ts') {
            const id = Object.keys(result.raw.fnMap).find(id => result.raw.fnMap[id].name === 'loopbackUrl');
            assert.ok(id);
            assert.equal(result.raw.f[id], 0);
            assert.ok(zeros.branchArms > 0);
        }
        receipt.profiles.push({ file: path.relative(root, item.file), scriptId: item.scriptId, wrapperLength: item.wrapperLength, codeSha256: item.codeSha256, bodySha256: item.bodySha256, mapSha256: item.mapSha256, rawTypedSha256: typedSha256(result.raw), sentinels: result.encoded.sidecar.sentinels.length, zeros, mapComparison, audit: result.audit });
    }
    assert.deepEqual(receipt.profiles.map(x => x.file).sort(), [...subjectFiles].sort());
    const inputsAfter = sourceInputs();
    receipt.sourceInputs = { beforeSha256: inputsBefore.sha256, afterSha256: inputsAfter.sha256, unchanged: inputsBefore.sha256 === inputsAfter.sha256 };
    fs.writeFileSync(path.join(out, 'source-inputs.json'), JSON.stringify({ before: inputsBefore, after: inputsAfter }, null, 2));
    receipt.globalCoverage = { beforeSha256: globalBefore, afterSha256: sha256(fs.readFileSync(canonicalFile)) };
    if (!receipt.sourceInputs.unchanged || receipt.globalCoverage.beforeSha256 !== receipt.globalCoverage.afterSha256 || testSha256 !== sha256(fs.readFileSync(path.join(root, target))))
        throw Error('Source/global coverage changed during capture');
    for(const[f,sha]of Object.entries(candidateFiles))if(sha256(fs.readFileSync(candidatePaths[f]))!==sha)throw Error('Outside candidate files changed during execution');receipt.nativeCorroboration={directory:'node-native-corroboration',scope:'Separate Node native V8 corroboration; never combined with the same inspector snapshot'};receipt.status = rawManifest ? 'typed_compatible_unmerged' : 'typed_collected_no_canonical_baseline_unmerged';
}
catch (error) {
    receipt.status = 'failed';
    receipt.error = error.stack;
    process.exitCode = 1;
}
finally {
    fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2));
    fs.rmSync(home, { recursive: true, force: true });
}
console.log(JSON.stringify({ status: receipt.status, profiles: receipt.profiles.length, cleanup: receipt.cleanup, output: out }));
