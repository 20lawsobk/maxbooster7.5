import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

// Execute the committed TypeScript saveIndex method, not a policy approximation.
const source = fs.readFileSync('server/services/hybridStorageService.ts', 'utf8');
const ast = ts.createSourceFile('hybridStorageService.ts', source, ts.ScriptTarget.Latest, true);
const service = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'HybridStorageService');
assert.ok(service, 'HybridStorageService class exists');
const method = service.members.find(n => ts.isMethodDeclaration(n) && n.name?.getText(ast) === 'saveIndex');
assert.ok(method, 'HybridStorageService.saveIndex method exists');
const js = ts.transpileModule('class TestStorage { static MAX_FILE_INDEX_ENTRIES = 2; static FILE_INDEX_WARN_THRESHOLD = 1; ' + method.getText(ast) + ' }; const HybridStorageService = TestStorage; globalThis.TestStorage = TestStorage;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function setup({count = 1, persistError = null} = {}) {
  const saved = [];
  const context = vm.createContext({
    logger: {warn() {}, error() {}},
    getPdimClient: () => ({set: async (...args) => {
      saved.push(args);
      if (persistError) throw persistError;
    }}),
  });
  vm.runInContext(js, context);
  const s = new context.TestStorage();
  const fileIndex = new Map();
  for (let i=0; i<count; i++) fileIndex.set('key-' + i, {userId: 'owner-' + i, contentHash: 'hash-' + i, lastAccessed: new Date()});
  const contentHashIndex = new Map([...fileIndex.keys()].map((key, i) => ['hash-' + i, [key]]));
  const publicContentHashes = new Map([['hash-0', 'key-0']]);
  Object.assign(s, {fileIndex, contentHashIndex, publicContentHashes});
  return {s, saved, fileIndex, contentHashIndex, publicContentHashes};
}

test('capacity fails closed without evicting ownership records or writing an inconsistent index', async () => {
  const {s, saved, fileIndex, contentHashIndex, publicContentHashes} = setup({count: 2});
  await assert.rejects(() => s.saveIndex(), /ownership index capacity exceeded/);
  assert.deepEqual([...fileIndex.keys()], ['key-0', 'key-1']);
  assert.deepEqual([...contentHashIndex.get('hash-0')], ['key-0']);
  assert.equal(publicContentHashes.get('hash-0'), 'key-0');
  assert.equal(saved.length, 0);
});

test('below capacity, persist file ownership and matching hash indexes', async () => {
  const {s, saved} = setup({count: 1});
  await s.saveIndex();
  assert.equal(saved.length, 1);
  assert.equal(saved[0][0], 'hybrid:storage:index');
  const payload = JSON.parse(saved[0][1]);
  assert.equal(payload.files['key-0'].userId, 'owner-0');
  assert.deepEqual(payload.contentHashes['hash-0'], ['key-0']);
  assert.equal(payload.publicHashes['hash-0'], 'key-0');
});

test('PDIM persistence failure rejects instead of acknowledging an unsaved index', async () => {
  const {s, saved, fileIndex} = setup({persistError: new Error('simulated outage')});
  await assert.rejects(() => s.saveIndex(), /Failed to persist hybrid storage ownership index/);
  assert.equal(saved.length, 1);
  assert.equal(fileIndex.has('key-0'), true);
});

test('capacity failure avoids backend writes even during a PDIM outage', async () => {
  const {s, saved, fileIndex} = setup({count: 2, persistError: new Error('simulated outage')});
  await assert.rejects(() => s.saveIndex(), /ownership index capacity exceeded/);
  assert.equal(saved.length, 0);
  assert.equal(fileIndex.size, 2);
});
