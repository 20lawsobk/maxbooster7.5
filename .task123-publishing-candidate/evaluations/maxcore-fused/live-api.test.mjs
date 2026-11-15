import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { apiRequest, observe, compareAttempts, runActualApi } from './live-api.mjs';

test('all frozen cases have concrete ordinary public endpoints', async () => {
  const cases = JSON.parse(await readFile('evaluations/maxcore-fused/cases.json','utf8'));
  for (const c of cases.cases) {
    assert.ok(Array.isArray(c.criteria) && c.criteria.length > 0, `${c.id} needs explicit review criteria`);
    const req = apiRequest(c,cases.seed);
    assert.match(req.path,/^\/api\/(generate\/(text|audio)|video\/generate-ai)$/);
    assert.equal(req.body.prompt,c.prompt);
    assert.equal(req.body.seed,cases.seed);
    assert.equal(req.body.awareness,undefined); // Never replace actual knowledge with fixtures.
    assert.equal(req.body.dedicated_controls,undefined); // No silent procedural substitution.
  }
});
test('held-out social text targets match the eight client cards and reach the API unchanged', async () => {
  const cases = JSON.parse(await readFile('evaluations/maxcore-fused/cases.json','utf8'));
  const [page, status] = await Promise.all([
    readFile('client/src/pages/SocialMedia.tsx','utf8'),
    readFile('client/src/lib/socialPlatformStatus.ts','utf8'),
  ]);
  const pageBlock = page.match(/const SOCIAL_PLATFORMS: SocialPlatform\[\] = \[([\s\S]*?)\n\];/);
  const statusBlock = status.match(/export const SOCIAL_PLATFORM_CARD_IDS = \[([\s\S]*?)\] as const;/);
  assert.ok(pageBlock, 'client social platform cards must remain discoverable');
  assert.ok(statusBlock, 'canonical client social platform IDs must remain discoverable');
  const pageIds = [...pageBlock[1].matchAll(/\bid:\s*"([^"]+)"/g)].map(([, id]) => id);
  const statusIds = [...statusBlock[1].matchAll(/"([^"]+)"/g)].map(([, id]) => id);
  const heldOut = cases.cases.filter(c => c.kind === 'text' && c.platform);
  assert.equal(pageIds.length, 8);
  assert.deepEqual(statusIds, pageIds);
  assert.deepEqual(heldOut.map(c => c.platform), pageIds);
  for (const c of heldOut) {
    assert.equal(apiRequest(c, cases.seed).body.platform, c.platform);
  }
});
test('actual telemetry observation rejects stale snapshot and wrong checkpoint', () => {
  const frozen = {snapshotId:'live',checkpointHash:'a'.repeat(64)};
  const req = {body:{seed:7}};
  const result = {text:'Fictional output',generation_plan:{snapshot_id:'old',snapshot:{id:'old'},checkpoint:'b'.repeat(64),seed:7}};
  const row = observe(result,frozen,req);
  assert.equal(row.snapshotMatch,'FAIL');
  assert.equal(row.checkpointPinned,false);
  assert.equal(row.requestScopedGpuDispatch,'NOT_ESTABLISHED');
});
test('cache replay never establishes uncached execution', () => {
  const a = {snapshotMatch:'PASS',checkpointPinned:true,checkpointHash:'x',seed:7,cacheIdentity:'same',outputHash:'same',cached:true};
  assert.equal(compareAttempts(a,a).exactTextReplay,'PASS');
  assert.equal(compareAttempts(a,a).uncachedReplay,'NOT_ESTABLISHED');
  assert.equal(compareAttempts({...a,cached:false},{...a,cached:false}).uncachedReplay,'PASS');
  assert.equal(compareAttempts(a,{...a,seed:8}).sameFrozenInputs,'NOT_ESTABLISHED');
});
test('actual API runner refuses to touch network before approval', async () => {
  await assert.rejects(runActualApi({}),/PARENT_APPROVAL_REQUIRED/);
});