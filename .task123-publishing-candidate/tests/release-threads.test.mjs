import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseCapsuleThreads } from '../script/lib/releaseThreads.mjs';
import {
  DEDICATED_DEPLOYMENT_LIMITS,
  deploymentTaskWorkerBudget,
  deploymentWorkerBudget,
} from '../script/deployment/capacity.mjs';

test('deployment workers share the 16-CPU ceiling and honor lower live quotas', () => {
  assert.equal(deploymentWorkerBudget(undefined, 32), DEDICATED_DEPLOYMENT_LIMITS.cpus);
  assert.equal(deploymentWorkerBudget(undefined, 8), 8);
  assert.equal(deploymentWorkerBudget(undefined, 0.5), 1);
  assert.equal(deploymentTaskWorkerBudget('12', 8), 8);
  assert.equal(deploymentTaskWorkerBudget('4', 8), 4);
  assert.throws(() => deploymentTaskWorkerBudget('17', 32), /must not exceed 16/);
  assert.equal(releaseCapsuleThreads(undefined, 4), 4);
  assert.equal(releaseCapsuleThreads('2', 4), 2);
  assert.equal(releaseCapsuleThreads('4', 4), 4);
  assert.equal(releaseCapsuleThreads('1', 0.5), 1);
  assert.throws(() => deploymentWorkerBudget('17', 32), /1 to 16/);
  assert.throws(() => releaseCapsuleThreads('4', 3.9), /1 to 3/);
  for (const invalid of ['', '0', '-1', '1.5', '2e0', '2x', 'Infinity', 'NaN', '5', ' 2 ', '9007199254740992']) {
    assert.throws(() => releaseCapsuleThreads(invalid, 4), /RELEASE_CAPSULE_THREADS/);
  }
});
