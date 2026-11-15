/** Exercise the actual installed public reporter lifecycle in owned child processes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = fs.realpathSync(process.env.C5_TEST_REPOSITORY_ROOT || path.resolve(here, '../..'));
const reporter = path.resolve(here, '../../scripts/testing/coverage-outcome-reporter.mjs');
const { runOwnedCommand } = await import(pathToFileURL(path.join(repositoryRoot, 'scripts/testing/coverage-provenance.mjs')).href);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const evidenceDirectory = process.env.C5_TEST_EVIDENCE_DIR;
let index = 0;
async function actualRun(mode, inspect) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'c5-outcome-'));
  const nonce = randomUUID(), selected = path.join(fixture, 'coverage'), outcomePath = path.join(selected, 'command-outcomes', nonce + '.json');
  let escape;
  try {
    fs.symlinkSync(path.join(repositoryRoot, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
    const subject = 'export function untouched(flag: boolean) {\n if (flag) return 1;\n return 2;\n}\n';
    let source = "import { test, expect } from 'vitest';\nimport './subject';\ntest('real passing assertion', () => { expect(1).toBe(1); });\n";
    if (mode === 'unhandled') source = "import { test, expect } from 'vitest';\nimport './subject';\ntest('real assertion passes with unhandled runtime failure', async () => { expect(1).toBe(1); void Promise.reject(new Error('owned-public-reporter-control')); await new Promise(resolve => setTimeout(resolve, 25)); });\n";
    if (mode === 'failed') source = "import { test, expect } from 'vitest';\nimport './subject';\ntest('real failed assertion', () => { expect(1).toBe(2); });\n";
    if (mode === 'skipped') source = "import { test } from 'vitest';\nimport './subject';\ntest.skip('real skipped assertion', () => {});\n";
    if (mode === 'collection') source = "import './missing-owned-fixture';\n";
    fs.writeFileSync(path.join(fixture, 'subject.ts'), subject);
    fs.writeFileSync(path.join(fixture, 'actual.test.ts'), source);
    const threshold = ['threshold', 'unhandled'].includes(mode) ? 100 : 0;
    const config = { root: fixture, cacheDir: path.join(fixture, 'cache'), test: { include: ['actual.test.ts'], pool: 'forks', maxWorkers: 1, retry: 0, watch: false, coverage: { enabled: true, provider: 'v8', include: ['subject.ts'], reporter: ['json', 'text'], reportsDirectory: selected, clean: !['existing', 'repeat'].includes(mode), thresholds: { lines: threshold, functions: threshold, statements: threshold, branches: threshold } } } };
    fs.writeFileSync(path.join(fixture, 'vitest.config.mjs'), 'export default '+JSON.stringify(config)+';\n');
    let original;
    if (['symlink', 'dangling'].includes(mode)) {
      escape = fs.mkdtempSync(path.join(os.tmpdir(), 'c5-output-escape-'));
      fs.symlinkSync(mode === 'dangling' ? path.join(escape, 'not-created') : escape, selected, 'dir');
      config.test.coverage.clean = false;
      fs.writeFileSync(path.join(fixture, 'vitest.config.mjs'), 'export default '+JSON.stringify(config)+';\n');
    }
    if (mode === 'existing') { fs.mkdirSync(path.dirname(outcomePath), { recursive: true }); original = '{"owned":"preexisting"}\n'; fs.writeFileSync(outcomePath, original); }
    const command = [process.execPath, path.join(repositoryRoot, 'node_modules/vitest/vitest.mjs'), 'run', '--config', path.join(fixture, 'vitest.config.mjs'), '--reporter=junit', '--reporter='+reporter, '--outputFile='+path.join(fixture, 'junit.xml')];
    const env = { PATH: process.env.PATH || '/usr/bin:/bin', HOME: fixture, TMPDIR: fixture, LANG: 'C', CI: '1', MAXBOOSTER_TEST_COVERAGE_DIR: selected, MAXBOOSTER_TEST_COVERAGE_OUTCOME: outcomePath, MAXBOOSTER_TEST_COVERAGE_RUN_ID: nonce };
    if (mode === 'nonce') delete env.MAXBOOSTER_TEST_COVERAGE_RUN_ID;
    const startedAt = new Date().toISOString();
    const run = await runOwnedCommand(command[0], command.slice(1), { cwd: fixture, env, timeoutMs: 45000, maxBuffer: 2 * 1024 * 1024 });
    const finishedAt = new Date().toISOString(), text = run.stdout + run.stderr;
    const outcome = fs.existsSync(outcomePath) ? JSON.parse(fs.readFileSync(outcomePath)) : null;
    const junit = fs.existsSync(path.join(fixture, 'junit.xml')) ? fs.readFileSync(path.join(fixture, 'junit.xml'), 'utf8') : '';
    let repeat;
    if (mode === 'repeat') {
      const firstBytes = fs.readFileSync(outcomePath), secondNonce = randomUUID(), secondOutcomePath = path.join(selected, 'command-outcomes', secondNonce + '.json');
      const secondEnv = { ...env, MAXBOOSTER_TEST_COVERAGE_RUN_ID: secondNonce, MAXBOOSTER_TEST_COVERAGE_OUTCOME: secondOutcomePath };
      const secondStartedAt = new Date().toISOString(), secondRun = await runOwnedCommand(command[0], command.slice(1), { cwd: fixture, env: secondEnv, timeoutMs: 45000, maxBuffer: 2 * 1024 * 1024 }), secondFinishedAt = new Date().toISOString();
      repeat = { run: secondRun, outcome: JSON.parse(fs.readFileSync(secondOutcomePath)), nonce: secondNonce, startedAt: secondStartedAt, finishedAt: secondFinishedAt, firstBytesPreserved: fs.readFileSync(outcomePath).equals(firstBytes), secondOutcomePath, secondJunit: fs.readFileSync(path.join(fixture, 'junit.xml'), 'utf8') };
    }
    assert.equal(run.timedOut, false); assert.equal(run.bufferExceeded, false); assert.equal(run.error, undefined); assert.equal(run.cleanup.complete, true); assert.deepEqual(run.cleanup.remainingLivePids, []);
    if (evidenceDirectory) {
      fs.mkdirSync(evidenceDirectory, { recursive: true });
      const destination = path.join(evidenceDirectory, String(++index).padStart(2,'0')+'-'+mode); fs.mkdirSync(destination);
      for (const name of ['subject.ts', 'actual.test.ts', 'vitest.config.mjs', 'junit.xml']) if (fs.existsSync(path.join(fixture, name))) fs.copyFileSync(path.join(fixture, name), path.join(destination, name));
      if (junit) fs.writeFileSync(path.join(destination, 'junit.xml'), junit);
      if (outcome) fs.writeFileSync(path.join(destination, 'command-outcome.json'), JSON.stringify(outcome, null, 2)+'\n');
      if (repeat) { fs.writeFileSync(path.join(destination, 'second-junit.xml'), repeat.secondJunit); fs.writeFileSync(path.join(destination, 'second-command-outcome.json'), JSON.stringify(repeat.outcome, null, 2)+'\n'); fs.writeFileSync(path.join(destination, 'second-command.txt'), repeat.run.stdout + repeat.run.stderr); fs.writeFileSync(path.join(destination, 'repeat.json'), JSON.stringify({runId:repeat.nonce,startedAt:repeat.startedAt,finishedAt:repeat.finishedAt,exitCode:repeat.run.status,cleanup:repeat.run.cleanup,firstBytesPreserved:repeat.firstBytesPreserved,secondOutcomePath:repeat.secondOutcomePath,junitSha256:hash(Buffer.from(repeat.secondJunit))},null,2)+'\n'); }
      fs.writeFileSync(path.join(destination, 'command.txt'), text);
      fs.writeFileSync(path.join(destination, 'receipt.json'), JSON.stringify({ command, startedAt, finishedAt, exitCode: run.status, signal: run.signal, timedOut: run.timedOut, cleanup: run.cleanup, runId: nonce, reporterSha256: hash(fs.readFileSync(reporter)), outcomeSha256: outcome ? hash(fs.readFileSync(outcomePath)) : null, junitSha256: junit ? hash(Buffer.from(junit)) : null, scope: 'Owned actual installed Vitest lifecycle fixture, not application execution or coverage credit' }, null, 2)+'\n');
    }
    await inspect({ run, text, outcome, junit, nonce, startedAt, finishedAt, outcomePath, original, escape, repeat });
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); if (escape) fs.rmSync(escape, { recursive: true, force: true }); }
}
function assertActualLifecycle({outcome,nonce,startedAt,finishedAt}) {
  assert.equal(outcome.schemaVersion, 1); assert.equal(outcome.kind, 'actual-public-Vitest-onTestRunEnd'); assert.equal(outcome.runId, nonce); assert.equal(outcome.reporterSha256, hash(fs.readFileSync(reporter))); assert.deepEqual(outcome.runtime, {node:process.versions.node,v8:process.versions.v8});
  assert.ok(Date.parse(outcome.initializedAt)>=Date.parse(startedAt)); assert.ok(Date.parse(outcome.startedAt)>=Date.parse(outcome.initializedAt)); assert.ok(Date.parse(outcome.finishedAt)>=Date.parse(outcome.startedAt)); assert.ok(Date.parse(outcome.finishedAt)<=Date.parse(finishedAt));
  assert.equal(outcome.testModuleCount, 1); assert.deepEqual(outcome.selectedModules, ['actual.test.ts']); assert.deepEqual(outcome.missingModules, []); assert.deepEqual(outcome.unexpectedModules, []); assert.equal(outcome.modules[0].file, 'actual.test.ts');
}
test('actual clean run has current nonce, exact passed case, public module identity and own time bounds', async()=>actualRun('passed', x=>{assert.equal(x.run.status,0,x.text);assertActualLifecycle(x);assert.equal(x.outcome.reason,'passed');assert.equal(x.outcome.unhandledErrorCount,0);assert.deepEqual(x.outcome.testCaseCounts,{total:1,passed:1,failed:0,skipped:0,pending:0});assert.equal(x.outcome.moduleErrorCount,0);assert.match(x.junit,/tests="1" failures="0" errors="0"/);}));
test('actual coverage threshold failure retains passing test outcome without claiming threshold success', async()=>actualRun('threshold', x=>{assert.equal(x.run.status,1,x.text);assertActualLifecycle(x);assert.equal(x.outcome.reason,'passed');assert.equal(x.outcome.unhandledErrorCount,0);assert.equal(x.outcome.testCaseCounts.passed,1);assert.equal((x.text.match(/^ERROR: Coverage for /gm)||[]).length,4);assert.match(x.junit,/tests="1" failures="0" errors="0"/);}));
test('actual unhandled rejection is recorded despite clean JUnit and the same four threshold errors', async()=>actualRun('unhandled', x=>{assert.equal(x.run.status,1,x.text);assertActualLifecycle(x);assert.equal(x.outcome.testCaseCounts.passed,1);assert.equal(x.outcome.testCaseCounts.failed,0);assert.equal(x.outcome.unhandledErrorCount,1);assert.equal((x.text.match(/^ERROR: Coverage for /gm)||[]).length,4);assert.match(x.junit,/tests="1" failures="0" errors="0"/);assert.equal(JSON.stringify(x.outcome).includes('owned-public-reporter-control'),false,'error content is not published');}));
test('actual failed assertion remains failed in both public outcome and JUnit', async()=>actualRun('failed',x=>{assert.equal(x.run.status,1,x.text);assertActualLifecycle(x);assert.equal(x.outcome.reason,'failed');assert.equal(x.outcome.testCaseCounts.failed,1);assert.ok(x.outcome.testCaseErrorCount>0);assert.match(x.junit,/failures="1"/);}));
test('actual skipped assertion is counted as skipped and cannot look fully executed', async()=>actualRun('skipped',x=>{assertActualLifecycle(x);assert.equal(x.outcome.testCaseCounts.skipped,1);assert.equal(x.outcome.testCaseCounts.passed,0);assert.match(x.junit,/<skipped\s*\/>/);}));
test('actual collection failure records failed module/error without inventing a passed case', async()=>actualRun('collection',x=>{assert.equal(x.run.status,1,x.text);assertActualLifecycle(x);assert.equal(x.outcome.reason,'failed');assert.equal(x.outcome.testCaseCounts.total,0);assert.equal(x.outcome.moduleStates.failed,1);assert.ok(x.outcome.moduleErrorCount>0);}));
test('missing parent nonce prevents outcome creation', async()=>actualRun('nonce',x=>{assert.equal(x.run.status,1);assert.equal(x.outcome,null);assert.match(x.text,/parent-owned run ID missing/);}));
test('output ancestor symlink cannot redirect the public outcome file', async()=>actualRun('symlink',x=>{assert.equal(x.run.status,1);assert.equal(x.outcome,null);assert.match(x.text,/symlink output ancestor/);assert.equal(fs.existsSync(path.join(x.escape,'command-outcomes',x.nonce+'.json')),false);}));
test('an existing owned outcome file is never overwritten', async()=>actualRun('existing',x=>{assert.equal(x.run.status,1);assert.equal(fs.readFileSync(x.outcomePath,'utf8'),x.original);assert.match(x.text,/EEXIST/);}));

test('two actual consecutive commands retain separate outcomes with coverage cleaning disabled', async()=>actualRun('repeat',x=>{assert.equal(x.run.status,0,x.text);assertActualLifecycle(x);assert.equal(x.repeat.run.status,0,x.repeat.run.stdout+x.repeat.run.stderr);assert.equal(x.repeat.run.timedOut,false);assert.equal(x.repeat.run.cleanup.complete,true);assert.deepEqual(x.repeat.run.cleanup.remainingLivePids,[]);assertActualLifecycle(x.repeat);assert.notEqual(x.repeat.nonce,x.nonce);assert.notEqual(x.repeat.secondOutcomePath,x.outcomePath);assert.equal(x.repeat.firstBytesPreserved,true);assert.equal(x.repeat.outcome.unhandledErrorCount,0);}));

test('a dangling output ancestor symlink is rejected explicitly before any file write', async()=>actualRun('dangling',x=>{assert.equal(x.run.status,1);assert.equal(x.outcome,null);assert.match(x.text,/symlink output ancestor/);assert.equal(fs.existsSync(path.join(x.escape,'not-created')),false);}));
