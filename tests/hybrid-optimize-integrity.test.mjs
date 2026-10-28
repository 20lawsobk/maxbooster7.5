import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

// Execute the actual committed optimizeStorage method, not a rewritten model.
const source = fs.readFileSync('server/services/hybridStorageService.ts', 'utf8');
const ast = ts.createSourceFile('hybridStorageService.ts', source, ts.ScriptTarget.Latest, true);
const service = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'HybridStorageService');
assert.ok(service, 'HybridStorageService exists');
const method = service.members.find(n => ts.isMethodDeclaration(n) && n.name?.getText(ast) === 'optimizeStorage');
assert.ok(method, 'optimizeStorage exists');
const js = ts.transpileModule(
  'class TestStorage { ' + method.getText(ast) + ' }; globalThis.TestStorage = TestStorage;',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

function entry(key, userId, isDeduplicated = false, deduplicationRef = undefined) {
  return { key, userId, contentHash: 'same-bytes', isDeduplicated, deduplicationRef };
}

function setup(files, tiering = { tieredDown: 1, tieredUp: 0 }) {
  const ctx = vm.createContext({});
  vm.runInContext(js, ctx);
  const storage = new ctx.TestStorage();
  storage.fileIndex = new Map(files.map(file => [file.key, file]));
  let saves = 0;
  let tierCalls = 0;
  storage.initialize = async () => {};
  storage.runAutoTiering = async () => { tierCalls++; return tiering; };
  storage.saveIndex = async () => { saves++; };
  storage.listFiles = userId => [...storage.fileIndex.values()].filter(f => f.userId === userId);
  return { storage, getSaves: () => saves, getTierCalls: () => tierCalls };
}

test('two existing primaries with identical content retain physical ownership', async () => {
  const first = entry('owner/primary-a', 'owner');
  const second = entry('owner/primary-b', 'owner');
  const { storage, getSaves, getTierCalls } = setup([first, second]);
  const result = await storage.optimizeStorage('owner');
  assert.equal(result.deduplicated, 0);
  assert.equal(result.tieredDown, 1);
  assert.equal(result.tieredUp, 0);
  assert.equal(first.isDeduplicated, false);
  assert.equal(second.isDeduplicated, false);
  assert.equal(second.deduplicationRef, undefined);
  assert.equal(getSaves(), 0);
  assert.equal(getTierCalls(), 1);
});

test('primary with an existing cross-account alias is never converted into a chained reference', async () => {
  const primaryA = entry('owner/primary-a', 'owner');
  const primaryB = entry('owner/primary-b', 'owner');
  const buyerAlias = entry('buyer/alias', 'buyer', true, primaryB.key);
  const { storage, getSaves } = setup([primaryA, primaryB, buyerAlias]);
  const result = await storage.optimizeStorage('owner');
  assert.equal(result.deduplicated, 0);
  assert.equal(primaryB.isDeduplicated, false);
  assert.equal(buyerAlias.deduplicationRef, primaryB.key);
  assert.equal(getSaves(), 0);
});

test('other tenants and public references remain unchanged', async () => {
  const owner = entry('owner/primary', 'owner');
  const outsider = entry('other/primary', 'other');
  const publicAlias = entry('other/public-alias', 'other', true, owner.key);
  const { storage } = setup([owner, outsider, publicAlias]);
  await storage.optimizeStorage('owner');
  assert.equal(outsider.isDeduplicated, false);
  assert.equal(publicAlias.deduplicationRef, owner.key);
  assert.equal(owner.isDeduplicated, false);
});

test('repeated optimization is idempotent without metadata writes', async () => {
  const a = entry('owner/a', 'owner');
  const b = entry('owner/b', 'owner');
  const { storage, getSaves, getTierCalls } = setup([a, b]);
  for (let i = 0; i < 3; i++) {
    assert.equal((await storage.optimizeStorage('owner')).deduplicated, 0);
  }
  assert.equal(getSaves(), 0);
  assert.equal(getTierCalls(), 3);
  assert.equal(b.isDeduplicated, false);
});

test('no duplicates still returns honest zero compaction', async () => {
  const { storage, getSaves } = setup([entry('owner/a', 'owner')], { tieredDown: 0, tieredUp: 0 });
  const result = await storage.optimizeStorage('owner');
  assert.equal(result.deduplicated, 0);
  assert.equal(result.tieredDown, 0);
  assert.equal(getSaves(), 0);
});

test('tiering errors are not converted into false optimization success', async () => {
  const { storage } = setup([]);
  storage.runAutoTiering = async () => { throw new Error('tiering unavailable'); };
  await assert.rejects(() => storage.optimizeStorage('owner'), /tiering unavailable/);
});
