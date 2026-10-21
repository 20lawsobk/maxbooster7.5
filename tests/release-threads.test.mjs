import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseCapsuleThreads } from '../script/lib/releaseThreads.mjs';

test('compression threads default to serial and honor explicit quota-bounded allocation', () => {
  assert.equal(releaseCapsuleThreads(undefined, 4), 1);
  assert.equal(releaseCapsuleThreads('2', 4), 2);
  assert.equal(releaseCapsuleThreads('4', 4), 4);
  assert.equal(releaseCapsuleThreads('1', 0.5), 1);
  assert.throws(() => releaseCapsuleThreads('4', 3.9), /1 to 3/);
  for (const invalid of ['', '0', '-1', '1.5', '2e0', '2x', 'Infinity', 'NaN', '5', ' 2 ', '9007199254740992']) {
    assert.throws(() => releaseCapsuleThreads(invalid, 4), /RELEASE_CAPSULE_THREADS/);
  }
});
