import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Extract the real committed Express handler, not a duplicated policy function.
// This is a mocked handler regression, NOT a real HTTP/PDIM integration test.
const source = readFileSync(new URL('../server/routes/hybridStorage.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('hybridStorage.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let handler;
function find(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(parsed) === 'router' &&
      node.expression.name.text === 'delete' && node.arguments[0]?.text === '/file/:fileKey') {
    assert.equal(handler, undefined, 'legacy delete route must be unique');
    handler = node.arguments[2];
  }
  ts.forEachChild(node, find);
}
find(parsed);
assert.ok(handler && ts.isArrowFunction(handler), 'legacy delete route handler missing');
const executable = ts.transpileModule('globalThis.__deleteHandler = ' + handler.getText(parsed) + ';', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

async function exercise(fileKey, { owner = 'owner-a', metadataOwner = 'owner-a', success = true, failure = false } = {}) {
  const calls = [];
  const sandbox = {
    hybridStorageService: {
      getMetadata(key) {
        calls.push(['metadata', key]);
        return metadataOwner === null ? undefined : { userId: metadataOwner };
      },
      async delete(user, key) {
        calls.push(['delete', user, key]);
        if (failure) throw new Error('storage unavailable');
        return success;
      },
    },
    logger: { warn() {} },
  };
  vm.runInNewContext(executable, sandbox);
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await sandbox.__deleteHandler({ user: { id: owner }, params: { fileKey } }, response);
  return { response, calls };
}

test('deletes only the exact once-decoded key for its owner', async () => {
  const { response, calls } = await exercise('folder/private.wav');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [['metadata', 'folder/private.wav'], ['delete', 'owner-a', 'folder/private.wav']]);
});

test('does not turn a literal percent-encoded-looking key into a different key', async () => {
  const { response, calls } = await exercise('folder%2Fprivate.wav');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [['metadata', 'folder%2Fprivate.wav'], ['delete', 'owner-a', 'folder%2Fprivate.wav']]);
});

test('does not fail on a literal percent sign in an existing key', async () => {
  const { response, calls } = await exercise('my-100%-mix.wav');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [['metadata', 'my-100%-mix.wav'], ['delete', 'owner-a', 'my-100%-mix.wav']]);
});

test('rejects traversal, leading slash, backslash, NUL and missing keys before metadata access', async () => {
  for (const bad of ['../secret.wav', '/absolute.wav', 'dir\\file.wav', 'dir\0file.wav', '', undefined]) {
    const { response, calls } = await exercise(bad);
    assert.equal(response.statusCode, 400, String(bad));
    assert.deepEqual(calls, [], String(bad));
  }
});

test('rejects other-account deletion without calling the byte store', async () => {
  const { response, calls } = await exercise('private.wav', { metadataOwner: 'owner-b' });
  assert.equal(response.statusCode, 403);
  assert.deepEqual(calls, [['metadata', 'private.wav']]);
});

test('returns 404 when metadata is missing without touching bytes', async () => {
  const { response, calls } = await exercise('missing.wav', { metadataOwner: null });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(calls, [['metadata', 'missing.wav']]);
});

test('storage deletion failure does not report success', async () => {
  const { response, calls } = await exercise('private.wav', { failure: true });
  assert.equal(response.statusCode, 500);
  assert.equal(calls.at(-1)[0], 'delete');
});
