import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../server/services/hybridStorageService.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('hybridStorageService.ts', source, ts.ScriptTarget.Latest, true);
const service = ast.statements.find((node) =>
  ts.isClassDeclaration(node) && node.name?.text === 'HybridStorageService');
assert.ok(service, 'real HybridStorageService must be present');

const methods = ['upload', 'delete'].map((name) => {
  const method = service.members.find((node) => ts.isMethodDeclaration(node) && node.name?.getText(ast) === name);
  assert.ok(method, name + ' must be present in committed service');
  return method.getText(ast);
});
const policy = ast.statements.find((node) =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'mayDeduplicateHybridBytes');
assert.ok(policy, 'explicit deduplication authorization policy must be present');

const javascript = ts.transpileModule(
  policy.getText(ast) + '\nclass Harness {\n' + methods.join('\n') + '\n}\nglobalThis.Harness = Harness;',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;
const context = vm.createContext({
  Buffer, Date, Map, Error,
  logger: { info() {}, warn() {} },
  normalizeHybridUploadFolder: (value) => value,
});
vm.runInContext(javascript, context);
const { Harness } = context;
const bytes = Buffer.from('private test bytes; deterministic content hash');

function createHarness() {
  const harness = new Harness();
  harness.fileIndex = new Map();
  harness.contentHashIndex = new Map();
  harness.publicContentHashes = new Map();
  harness.writes = [];
  harness.deletes = [];
  let sequence = 0;
  harness.initialize = async () => {};
  harness.computeContentHash = (data) => createHash('sha256').update(data).digest('hex');
  harness.generateFileKey = (user, name) => user + '/' + (++sequence) + '-' + name;
  harness.determineInitialTier = () => 'cold';
  harness.coldPocket = {
    write: async (key, data) => {
      harness.writes.push(key);
      return { compressedSize: data.length };
    },
    delete: async (key) => {
      harness.deletes.push(key);
      return true;
    },
  };
  harness.saveIndex = async () => {};
  harness.commitUploadIndex = async (entry, publicPrimaryKey) => {
    if (harness.fileIndex.has(entry.key)) throw new Error('collision');
    harness.fileIndex.set(entry.key, entry);
    harness.contentHashIndex.set(entry.contentHash, [
      ...(harness.contentHashIndex.get(entry.contentHash) || []), entry.key,
    ]);
    if (publicPrimaryKey !== undefined) {
      harness.publicContentHashes.set(entry.contentHash, publicPrimaryKey);
    }
  };
  return harness;
}

test('another tenant private primary never causes cross-account deduplication', async () => {
  const h = createHarness();
  const alice = await h.upload('alice', 'private.wav', bytes, 'audio/wav');
  const bob = await h.upload('bob', 'private.wav', bytes, 'audio/wav');
  assert.equal(alice.isDeduplicated, false);
  assert.equal(bob.isDeduplicated, false);
  assert.equal(h.writes.length, 2);
  assert.equal(h.fileIndex.get(bob.key).deduplicationRef, undefined);
  assert.equal(await h.delete('alice', alice.key), true,
    'independent same-hash primary must be deletable');
  assert.equal(await h.delete('bob', bob.key), true);
  assert.equal(h.deletes.length, 2);
});

test('public primary remains eligible for another tenant without an extra write', async () => {
  const h = createHarness();
  const alice = await h.upload('alice', 'public.wav', bytes, 'audio/wav', { isPublic: true });
  const bob = await h.upload('bob', 'copy.wav', bytes, 'audio/wav');
  assert.equal(bob.isDeduplicated, true);
  assert.equal(h.fileIndex.get(bob.key).deduplicationRef, alice.key);
  assert.equal(h.writes.length, 1);
  assert.equal(await h.delete('alice', alice.key), false,
    'primary with a live alias must not be physically deleted');
  assert.equal(await h.delete('bob', bob.key), true);
  assert.equal(await h.delete('alice', alice.key), true);
});

test('public upload cannot reveal another tenant private primary', async () => {
  const h = createHarness();
  await h.upload('alice', 'private.wav', bytes, 'audio/wav');
  const bob = await h.upload('bob', 'public.wav', bytes, 'audio/wav', { isPublic: true });
  assert.equal(bob.isDeduplicated, false);
  assert.equal(h.writes.length, 2);
  assert.equal(h.publicContentHashes.get(bob.contentHash), bob.key);
});

test('same-owner deduplication remains available', async () => {
  const h = createHarness();
  const first = await h.upload('alice', 'first.wav', bytes, 'audio/wav');
  const second = await h.upload('alice', 'second.wav', bytes, 'audio/wav');
  assert.equal(second.isDeduplicated, true);
  assert.equal(h.fileIndex.get(second.key).deduplicationRef, first.key);
  assert.equal(h.writes.length, 1);
});

test('eligible public primary wins over earlier private foreign primary', async () => {
  const h = createHarness();
  await h.upload('alice', 'private.wav', bytes, 'audio/wav');
  const bob = await h.upload('bob', 'public.wav', bytes, 'audio/wav', { isPublic: true });
  const charlie = await h.upload('charlie', 'copy.wav', bytes, 'audio/wav');
  assert.equal(charlie.isDeduplicated, true);
  assert.equal(h.fileIndex.get(charlie.key).deduplicationRef, bob.key);
  assert.equal(h.writes.length, 2);
});

test('corrupt hash bucket without a primary fails closed', async () => {
  const h = createHarness();
  const hash = h.computeContentHash(bytes);
  h.fileIndex.set('alice/alias', { key: 'alice/alias', contentHash: hash, userId: 'alice',
    isDeduplicated: true, deduplicationRef: 'missing' });
  h.contentHashIndex.set(hash, ['alice/alias']);
  await assert.rejects(h.upload('bob', 'new.wav', bytes, 'audio/wav'),
    /no primary byte owner/);
  assert.equal(h.writes.length, 0);
});

test('legacy public pointer to another tenant private primary is not reused', async () => {
  const h = createHarness();
  const alice = await h.upload('alice', 'private.wav', bytes, 'audio/wav');
  h.publicContentHashes.set(alice.contentHash, alice.key);
  const bob = await h.upload('bob', 'public.wav', bytes, 'audio/wav', { isPublic: true });
  assert.equal(bob.isDeduplicated, false);
  assert.equal(h.writes.length, 2);
});

test('new independent same-hash primaries survive alias deletion', async () => {
  const h = createHarness();
  const alice = await h.upload('alice', 'private.wav', bytes, 'audio/wav');
  const bob = await h.upload('bob', 'private.wav', bytes, 'audio/wav');
  const bobAlias = await h.upload('bob', 'second.wav', bytes, 'audio/wav');
  assert.equal(await h.delete('bob', bob.key), false);
  assert.equal(await h.delete('bob', bobAlias.key), true);
  assert.equal(await h.delete('alice', alice.key), true);
  assert.equal(await h.delete('bob', bob.key), true);
});
