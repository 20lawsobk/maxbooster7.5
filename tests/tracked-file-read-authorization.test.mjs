import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Execute the real, unmodified authorization guard extracted from the route.
// This is an isolated route-guard regression, NOT an Express/DB integration test.
const source = readFileSync(new URL('../server/routes.ts', import.meta.url), 'utf8');
const startMarker = '// Deny cross-account reads of tracked files regardless of storage key prefix.';
const endMarker = 'if (row?.deletedAt) {';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
assert.ok(start >= 0 && end > start, 'tracked-file authorization guard must be present');
assert.ok(end < source.indexOf('storageService.downloadFile(key)', end), 'deny before byte fetch');
const guard = source.slice(start, end);
const check = new Function('row', 'req', 'stemAccess', 'hybridStorageService', 'key', 'res', guard);

function run({ owner = 'owner', requester = 'outsider', publicFile = false, stemAccess = null, tracked = true } = {}) {
  const response = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  const result = check(tracked ? { userId: owner, deletedAt: null } : undefined,
    { user: { id: requester } }, stemAccess,
    { getMetadata: () => publicFile ? { isPublic: true, userId: owner } : null },
    'uploads/non-user-prefix/private.bin', response);
  return { code: response.code, body: response.body, result };
}

test('different authenticated account cannot read tracked private direct bytes', () => {
  assert.equal(run().code, 403);
});
test('file owner retains tracked direct access', () => {
  assert.equal(run({ requester: 'owner' }).code, 200);
});
test('explicit public hybrid metadata preserves public access', () => {
  assert.equal(run({ publicFile: true }).code, 200);
});
test('separately verified marketplace entitlement preserves purchased access', () => {
  assert.equal(run({ stemAccess: true }).code, 200);
});
test('false or missing marketplace entitlement never grants private access', () => {
  assert.equal(run({ stemAccess: false }).code, 403);
  assert.equal(run({ stemAccess: null }).code, 403);
});
test('untracked legacy keys are not covered by this narrow guard', () => {
  // Explicitly document remaining integration work; do not claim these are safe.
  assert.equal(run({ tracked: false }).code, 200);
});
