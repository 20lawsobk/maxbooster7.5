import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual TypeScript route handlers with mocked storage. This is
// not an HTTP, database, signed-provider or PDIM integration test.
const source = readFileSync(new URL('../server/routes/hybridStorage.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('hybridStorage.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const routePaths = ['/metadata/:fileKey', '/download-url/:fileKey'];
const handlers = new Map();
function visit(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(parsed) === 'router' &&
      node.expression.name.text === 'get' &&
      routePaths.includes(node.arguments[0]?.text)) {
    const route = node.arguments[0].text;
    assert.ok(!handlers.has(route), 'duplicate route: ' + route);
    assert.ok(ts.isArrowFunction(node.arguments[2]), 'missing handler: ' + route);
    handlers.set(route, ts.transpileModule(
      'globalThis.__handler = ' + node.arguments[2].getText(parsed) + ';',
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
    ).outputText);
  }
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.equal(handlers.size, routePaths.length, 'both real handlers must be present');

async function exercise(route, fileKey, { requester = 'owner-a', metadataOwner = 'owner-a', failure = null } = {}) {
  const calls = [];
  const sandbox = {
    hybridStorageService: {
      getMetadata(key) {
        calls.push(['metadata', key]);
        if (failure === 'metadata') throw new Error('metadata unavailable');
        return metadataOwner === null ? undefined : { userId: metadataOwner, originalName: 'private.wav' };
      },
      async getDownloadUrl(user, key) {
        calls.push(['url', user, key]);
        if (failure === 'url') throw new Error('provider unavailable');
        return 'https://example.invalid/short-lived-url';
      },
    },
    logger: { warn() {} },
  };
  vm.runInNewContext(handlers.get(route), sandbox);
  const response = {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; return this; },
  };
  await sandbox.__handler({ user: { id: requester }, params: { fileKey } }, response);
  return { response, calls };
}

for (const route of routePaths) {
  test(route + ': preserves exact percent-encoded-looking key for its owner', async () => {
    const { response, calls } = await exercise(route, 'folder%2Fprivate.wav');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls[0], ['metadata', 'folder%2Fprivate.wav']);
    if (route === '/download-url/:fileKey') {
      assert.deepEqual(calls[1], ['url', 'owner-a', 'folder%2Fprivate.wav']);
      assert.equal(response.body.url, 'https://example.invalid/short-lived-url');
    } else {
      assert.equal(response.body.metadata.userId, 'owner-a');
    }
    assert.equal(response.headers['cache-control'], 'private, no-store');
  });

  test(route + ': accepts literal percent in existing key', async () => {
    const { response, calls } = await exercise(route, 'my-100%-mix.wav');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls[0], ['metadata', 'my-100%-mix.wav']);
  });

  test(route + ': rejects unsafe keys before metadata or URL access', async () => {
    for (const key of ['../private.wav', '/private.wav', 'dir\\private.wav', 'dir\0private.wav', '', undefined]) {
      const { response, calls } = await exercise(route, key);
      assert.equal(response.statusCode, 400, String(key));
      assert.deepEqual(calls, [], String(key));
    }
  });

  test(route + ': refuses other-account access before signing or metadata disclosure', async () => {
    const { response, calls } = await exercise(route, 'private.wav', { metadataOwner: 'owner-b' });
    assert.equal(response.statusCode, 403);
    assert.deepEqual(calls, [['metadata', 'private.wav']]);
  });

  test(route + ': missing metadata is not reported as success', async () => {
    const { response, calls } = await exercise(route, 'missing.wav', { metadataOwner: null });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(calls, [['metadata', 'missing.wav']]);
  });

  test(route + ': metadata errors fail closed', async () => {
    const { response } = await exercise(route, 'private.wav', { failure: 'metadata' });
    assert.equal(response.statusCode, 500);
  });
}

test('download URL route: provider errors do not report success', async () => {
  const { response, calls } = await exercise('/download-url/:fileKey', 'private.wav', { failure: 'url' });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(calls.at(-1), ['url', 'owner-a', 'private.wav']);
});
