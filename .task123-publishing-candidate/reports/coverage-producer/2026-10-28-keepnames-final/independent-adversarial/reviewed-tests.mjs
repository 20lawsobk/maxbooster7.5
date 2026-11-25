/** Outside-checkout candidate regressions. No product collection or counter merge. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { transformSync } from 'esbuild';
import { parseAstAsync } from 'vite';
import { convert } from 'ast-v8-to-istanbul';
import os from 'node:os';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { Session } from 'node:inspector';
import { createKeepNamesPolicy } from '../generated-node-policy.mjs';
const root = '/workspace/maxbooster7.5';
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
  fs.writeFileSync('/workspace/onboarding-results/c5-candidate/independent-adversarial/synthetic-runtime-proof.json', JSON.stringify({ runtime: { node: process.versions.node, v8: process.versions.v8 }, source, executedCode: observed, sourceMap, rawSelectedRuntimeCoverage: raw, generatedPolicy: policy.audit, candidate, denominatorControl: { statementMap: control.statementMap, fnMap: control.fnMap, branchMap: control.branchMap }, productionReady: false, mergedIntoGlobalCoverage: false }, null, 2));
});
test('retained ports runtime loses phantom helpers and retains every real node and zero-hit function', async () => {
  const directory = path.join(root, 'reports/coverage-producer/2026-10-28-a1603b13-node/125755-0');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json')));
  const script = manifest.scripts.find(script => script.originalSources.some(source => source.file.endsWith('/server/config/ports.ts')));
  assert.ok(script);
  const code = fs.readFileSync(path.join(directory, script.codeFile), 'utf8'), sourceMap = JSON.parse(fs.readFileSync(path.join(directory, script.mapFile)));
  const ast = await parseAstAsync(code), policy = createKeepNamesPolicy({ code, sourceMap, ast });
  assert.equal(policy.audit.ignoredGeneratedNodes.length, 5);
  const output = await convert({ code, sourceMap, ast, ignoreNode: policy.ignoreNode, coverage: { url: script.url, functions: script.coverage.functions } });
  const file = script.originalSources[0].file, actual = JSON.parse(JSON.stringify(output[file]));
  const expected = JSON.parse(fs.readFileSync(path.join(root, 'reports/coverage-producer/2026-10-28-compatibility-trace/baseline-selected-files.json')))[file];
  for (const key of ['statementMap', 'fnMap', 'branchMap']) assert.deepEqual(actual[key], expected[key]);
  assert.equal(Object.keys(actual.statementMap).length, 21); assert.equal(Object.keys(actual.fnMap).length, 3);
  const originalRuntime = JSON.parse(fs.readFileSync(path.join(root, 'reports/coverage-producer/2026-10-28-a1603b13-node/coverage-final.json')))[file];
  for (const [id, fn] of Object.entries(actual.fnMap)) {
    const originalId = Object.keys(originalRuntime.fnMap).find(key => originalRuntime.fnMap[key].name === fn.name);
    assert.ok(originalId !== undefined); assert.equal(actual.f[id], originalRuntime.f[originalId]);
  }
  const uncalled = Object.keys(actual.fnMap).find(id => actual.fnMap[id].name === 'loopbackUrl');
  assert.equal(actual.f[uncalled], 0, 'Executed compiler name-setting call cannot credit the uncalled original function');
  assert.deepEqual(actual.b, originalRuntime.b, 'Every real original branch keeps its exact runtime counters');
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
