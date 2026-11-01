// Reproduce the real guarded replay upgrade from the saved pre-advisory bundle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { applyLegacyUpdate } from '../../../scripts/apply-legacy-security-update.mjs';
const baseline = process.argv[2] || 'c06fbecdb32a5c3b76662f631604bfd9abac386b';
const original = JSON.parse(execFileSync('git', ['show', `${baseline}:tools/legacy-security-update.json`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
const current = JSON.parse(fs.readFileSync('tools/legacy-security-update.json', 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maxbooster-qs-replay-'));
const result = { baseline, originalEntries: original.files.length, fixtureIsolated: true };
try {
  for (const entry of original.files) {
    const target = path.join(directory, entry.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.content);
  }
  const unrelated = path.join(directory, 'maxbooster7.5/user-content.txt');
  fs.writeFileSync(unrelated, 'Unrelated user content');
  const pending = applyLegacyUpdate(directory, current);
  assert.equal(pending.pending.length, 8);
  const applied = applyLegacyUpdate(directory, current, { apply: true });
  assert.equal(applied.applied.length, 8);
  for (const entry of current.files) assert.equal(digest(fs.readFileSync(path.join(directory, entry.path))), entry.afterSha256);
  assert.deepEqual(applyLegacyUpdate(directory, current, { apply: true }).applied, []);
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'Unrelated user content');
  const custom = path.join(directory, applied.applied[0]);
  fs.writeFileSync(custom, 'Custom user change');
  assert.throws(() => applyLegacyUpdate(directory, current, { apply: true }), /refusing overwrite/);
  assert.equal(fs.readFileSync(custom, 'utf8'), 'Custom user change');
  Object.assign(result, { status: 'passed', updatedEntries: applied.applied, allCurrentChecksumsVerified: true,
    idempotent: true, customChangesRejectedAndPreserved: true, unrelatedFilePreserved: true });
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
  result.fixtureCleaned = !fs.existsSync(directory);
}
console.log(JSON.stringify(result, null, 2));
