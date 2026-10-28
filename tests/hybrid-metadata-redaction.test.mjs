import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

const source = readFileSync(new URL('../server/services/hybridStorageService.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../server/routes/hybridStorage.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('hybridStorageService.ts', source, ts.ScriptTarget.Latest, true);
const names = ['toPublicHybridFileMetadata', 'toPublicHybridStorageAnalytics'];
const fns = names.map((name) => {
  const fn = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn, name + ' must exist in the committed service');
  return fn.getText(ast);
});
const js = ts.transpileModule(fns.join('\n') + '\nglobalThis.exported = {toPublicHybridFileMetadata,toPublicHybridStorageAnalytics};', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const context = vm.createContext({ exports: {} });
vm.runInContext(js, context);
const { toPublicHybridFileMetadata: redact, toPublicHybridStorageAnalytics: redactAnalytics } = context.exported;
const own = { key: 'bob/asset', userId: 'bob', contentHash: 'hash', isDeduplicated: true,
  deduplicationRef: 'alice/private/secret-name.mp3', originalName: 'song.mp3',
  metadata: { title: 'owned metadata' }, lastAccessed: new Date('2026-10-28') };

test('cross-account deduplication reference is never exposed to owner of alias', () => {
  const out = redact(own);
  assert.equal(Object.hasOwn(out, 'deduplicationRef'), false);
  assert.equal(out.key, own.key);
  assert.equal(out.userId, 'bob');
  assert.equal(out.metadata.title, 'owned metadata');
});

test('redaction is non-mutating and preserves normal primary file metadata', () => {
  const out = redact(own);
  assert.equal(own.deduplicationRef, 'alice/private/secret-name.mp3');
  assert.notEqual(out, own);
  const primary = { key: 'bob/primary', userId: 'bob', isDeduplicated: false };
  assert.equal(redact(primary).key, primary.key);
});

test('all three analytics access-pattern arrays are redacted', () => {
  const analytics = { totalFiles: 1, accessPatterns: {
    mostAccessed: [own], leastAccessed: [own], recentlyAccessed: [own],
  } };
  const out = redactAnalytics(analytics);
  for (const records of Object.values(out.accessPatterns)) {
    assert.equal(records.length, 1);
    assert.equal(Object.hasOwn(records[0], 'deduplicationRef'), false);
  }
  assert.equal(analytics.accessPatterns.mostAccessed[0].deduplicationRef, own.deduplicationRef);
  assert.equal(out.totalFiles, 1);
});

test('file listing route sanitizes before serializing', () => {
  assert.match(route, /res\.json\(\{ files: files\.map\(toPublicHybridFileMetadata\) \}\)/);
});

test('single-file metadata route sanitizes before serializing', () => {
  assert.match(route, /res\.json\(\{ metadata: toPublicHybridFileMetadata\(metadata\) \}\)/);
});

test('migration response sanitizes before serializing', () => {
  assert.match(route, /metadata: newMetadata \? toPublicHybridFileMetadata\(newMetadata\) : undefined/);
});

test('analytics route sanitizes before serializing', () => {
  assert.match(route, /res\.json\(\{ analytics: toPublicHybridStorageAnalytics\(analytics\) \}\)/);
});

test('private metadata endpoints disable caching', () => {
  const files = route.slice(route.indexOf('router.get("/files"'), route.indexOf('/**\n * GET /api/hybrid-storage/metadata'));
  const analytics = route.slice(route.indexOf('router.get("/analytics"'), route.indexOf('/**\n * POST /api/hybrid-storage/optimize'));
  for (const handler of [files, analytics]) assert.match(handler, /res\.setHeader\("Cache-Control", "private, no-store"\)/);
});
