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

function run({
  owner = 'owner', requester = 'outsider', publicFile = false,
  stemAccess = null, tracked = true, metadataOwner = null,
  key = 'uploads/non-user-prefix/private.bin',
} = {}) {
  const response = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  const result = check(tracked ? { userId: owner, deletedAt: null } : undefined,
    { user: { id: requester } }, stemAccess,
    { getMetadata: () => (publicFile || metadataOwner !== null)
      ? { isPublic: publicFile, userId: metadataOwner ?? owner } : null },
    key, response);
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
test('untracked direct keys outside a verified namespace fail closed', () => {
  assert.equal(run({ tracked: false }).code, 403);
  assert.equal(run({ tracked: false, stemAccess: false }).code, 403);
});
test('untracked legacy users/ keys are limited to their requester-owner prefix', () => {
  assert.equal(run({ tracked: false, key: 'users/outsider/legacy.bin' }).code, 200);
  assert.equal(run({ tracked: false, key: 'users/owner/legacy.bin' }).code, 403);
});
test('untracked hybrid metadata grants only its actual owner private access', () => {
  assert.equal(run({ tracked: false, metadataOwner: 'outsider' }).code, 200);
  assert.equal(run({ tracked: false, metadataOwner: 'owner' }).code, 403);
});
test('untracked hybrid objects explicitly marked public remain accessible', () => {
  assert.equal(run({ tracked: false, publicFile: true }).code, 200);
});
test('verified paid stem access remains an exception for untracked direct keys', () => {
  assert.equal(run({ tracked: false, stemAccess: true }).code, 200);
});
test('tracked owner and purchaser remain authorized', () => {
  assert.equal(run({ requester: 'owner' }).code, 200);
  assert.equal(run({ stemAccess: true }).code, 200);
});
