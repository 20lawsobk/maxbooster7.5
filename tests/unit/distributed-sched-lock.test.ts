/**
 * Unit tests for the BullMQ-based autonomous job scheduler.
 *
 * Tests verify that:
 *   1. setupRepeatableJobs() registers all 7 recurring tasks via BullMQ queue.add()
 *      with the correct repeat.every option — making them visible in the BullMQ dashboard.
 *   2. A BullMQ Worker is created and started for exactly-once processing per interval.
 *   3. teardownRepeatableJobs() / closeScheduler() drain the worker gracefully.
 *   4. isSchedulerLeader() tracks whether this pod is currently executing a job.
 *   5. Campaign optimization jobs use repeatable BullMQ jobs (not setInterval).
 *
 * Also includes smoke tests for the withSchedLock utility in distributedLock.ts,
 * which remains available for stateful-aggregation use cases.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── All hoisted mocks in a single vi.hoisted block ────────────────────────────

const mocks = vi.hoisted(() => {
  // BullMQ Queue mock functions
  const mockAdd               = vi.fn().mockResolvedValue({ id: 'job-1' });
  const mockGetRepeatableJobs = vi.fn().mockResolvedValue([]);
  const mockRemoveRepeatableByKey = vi.fn().mockResolvedValue(true);
  const mockQueueClose        = vi.fn().mockResolvedValue(undefined);

  // BullMQ Worker mock functions
  const mockWorkerRun   = vi.fn().mockResolvedValue(undefined);
  const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
  const mockWorkerOn    = vi.fn();

  // Queue constructor — use function declaration so `new Queue()` works
  const MockQueue = vi.fn(function(this: Record<string, unknown>) {
    this.add               = mockAdd;
    this.getRepeatableJobs = mockGetRepeatableJobs;
    this.removeRepeatableByKey = mockRemoveRepeatableByKey;
    this.close             = mockQueueClose;
  });

  // Worker constructor
  const MockWorker = vi.fn(function(this: Record<string, unknown>) {
    this.run   = mockWorkerRun;
    this.close = mockWorkerClose;
    this.on    = mockWorkerOn;
  });

  // Redis / PDIM mocks
  const mockRedisSet = vi.fn();
  const mockRedisGet = vi.fn();
  const mockRedisDel = vi.fn();
  const mockGetRedisClient = vi.fn(() => ({
    set: mockRedisSet,
    get: mockRedisGet,
    del: mockRedisDel,
  }));
  const pdimState = { configured: false };
  const mockIsPdimConfigured = vi.fn(() => pdimState.configured);

  return {
    mockAdd, mockGetRepeatableJobs, mockRemoveRepeatableByKey, mockQueueClose,
    mockWorkerRun, mockWorkerClose, mockWorkerOn,
    MockQueue, MockWorker,
    mockRedisSet, mockRedisGet, mockRedisDel, mockGetRedisClient,
    pdimState, mockIsPdimConfigured,
  };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('bullmq', () => ({ Queue: mocks.MockQueue, Worker: mocks.MockWorker }));

vi.mock('../../server/lib/redisClient.js', () => ({
  newBullMQRedisConnection: vi.fn().mockReturnValue({ host: 'mock' }),
  getRedisClient: mocks.mockGetRedisClient,
}));

vi.mock('../../server/lib/pdimClient.js', () => ({
  isPdimConfigured: mocks.mockIsPdimConfigured,
}));

vi.mock('../../server/db.js', () => ({
  db: { execute: vi.fn().mockResolvedValue({ rowCount: 0 }) },
}));

vi.mock('../../server/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Module under test ─────────────────────────────────────────────────────────

import {
  setupRepeatableJobs,
  teardownRepeatableJobs,
  closeScheduler,
  scheduleCampaignOptimization,
  removeCampaignOptimization,
  isSchedulerLeader,
  AUTONOMOUS_QUEUE,
} from '../../server/services/autonomousJobScheduler.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetMocks() {
  mocks.mockAdd.mockClear().mockResolvedValue({ id: 'job-1' });
  mocks.mockGetRepeatableJobs.mockClear().mockResolvedValue([]);
  mocks.mockRemoveRepeatableByKey.mockClear().mockResolvedValue(true);
  mocks.mockQueueClose.mockClear();
  mocks.mockWorkerRun.mockClear();
  mocks.mockWorkerClose.mockClear();
  mocks.mockWorkerOn.mockClear();
  mocks.MockQueue.mockClear();
  mocks.MockWorker.mockClear();
  mocks.mockRedisSet.mockClear();
  mocks.mockRedisGet.mockClear();
  mocks.mockRedisDel.mockClear();
  mocks.pdimState.configured = false;
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('BullMQ autonomous scheduler — setupRepeatableJobs()', () => {
  beforeEach(resetMocks);
  afterEach(() => closeScheduler().catch(() => {}));

  it('registers all 7 recurring tasks via queue.add()', async () => {
    await setupRepeatableJobs();
    const names = mocks.mockAdd.mock.calls.map(([n]: [string]) => n);
    expect(names).toContain('content-dispatch');
    expect(names).toContain('analytics');
    expect(names).toContain('metrics-persist');
    expect(names).toContain('prune-system-logs');
    expect(names).toContain('prune-audit-log');
    expect(names).toContain('prune-notifications');
    expect(names).toContain('prune-upload-dirs');
    expect(mocks.mockAdd).toHaveBeenCalledTimes(7);
  });

  it('passes repeat.every to every registered job (BullMQ dashboard visibility)', async () => {
    await setupRepeatableJobs();
    for (const [, , opts] of mocks.mockAdd.mock.calls) {
      expect(opts).toHaveProperty('repeat.every');
      expect(typeof (opts as { repeat: { every: number } }).repeat.every).toBe('number');
    }
  });

  it('creates a BullMQ Worker for the autonomous queue', async () => {
    await setupRepeatableJobs();
    expect(mocks.MockWorker).toHaveBeenCalledWith(
      AUTONOMOUS_QUEUE,
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 }),
    );
  });

  it('starts the worker via run() (deferred via setImmediate)', async () => {
    await setupRepeatableJobs();
    await new Promise(r => setImmediate(r));
    expect(mocks.mockWorkerRun).toHaveBeenCalled();
  });

  it('is idempotent — second call closes old worker before creating a new one', async () => {
    await setupRepeatableJobs();
    await setupRepeatableJobs();
    // Old worker closed once, new one created
    expect(mocks.mockWorkerClose).toHaveBeenCalledTimes(1);
  });

  it('content-dispatch repeats every 60 seconds', async () => {
    await setupRepeatableJobs();
    const call = mocks.mockAdd.mock.calls.find(([n]: [string]) => n === 'content-dispatch');
    expect((call![2] as { repeat: { every: number } }).repeat.every).toBe(60_000);
  });

  it('analytics repeats every hour', async () => {
    await setupRepeatableJobs();
    const call = mocks.mockAdd.mock.calls.find(([n]: [string]) => n === 'analytics');
    expect((call![2] as { repeat: { every: number } }).repeat.every).toBe(3_600_000);
  });

  it('all prune jobs repeat at least hourly (≥ 3_600_000 ms)', async () => {
    await setupRepeatableJobs();
    for (const [name, , opts] of mocks.mockAdd.mock.calls) {
      if ((name as string).startsWith('prune-')) {
        expect((opts as { repeat: { every: number } }).repeat.every).toBeGreaterThanOrEqual(3_600_000);
      }
    }
  });

  it('all jobs have removeOnComplete:true', async () => {
    await setupRepeatableJobs();
    for (const [, , opts] of mocks.mockAdd.mock.calls) {
      expect((opts as Record<string, unknown>).removeOnComplete).toBe(true);
    }
  });
});

describe('BullMQ autonomous scheduler — teardown & shutdown', () => {
  beforeEach(resetMocks);

  it('teardownRepeatableJobs() closes the worker (graceful drain)', async () => {
    await setupRepeatableJobs();
    await teardownRepeatableJobs();
    expect(mocks.mockWorkerClose).toHaveBeenCalledTimes(1);
  });

  it('teardownRepeatableJobs() resets isSchedulerLeader to false', async () => {
    await setupRepeatableJobs();
    await teardownRepeatableJobs();
    expect(isSchedulerLeader()).toBe(false);
  });

  it('teardownRepeatableJobs() is safe when no worker is running', async () => {
    await expect(teardownRepeatableJobs()).resolves.not.toThrow();
  });

  it('closeScheduler() closes both worker and queue', async () => {
    await setupRepeatableJobs();
    await closeScheduler();
    expect(mocks.mockWorkerClose).toHaveBeenCalled();
    expect(mocks.mockQueueClose).toHaveBeenCalled();
  });

  it('closeScheduler() is safe to call multiple times', async () => {
    await closeScheduler();
    await expect(closeScheduler()).resolves.not.toThrow();
  });
});

describe('BullMQ autonomous scheduler — isSchedulerLeader()', () => {
  beforeEach(resetMocks);
  afterEach(() => closeScheduler().catch(() => {}));

  it('returns false before any jobs are set up', () => {
    expect(isSchedulerLeader()).toBe(false);
  });

  it('returns false after teardown', async () => {
    await setupRepeatableJobs();
    await teardownRepeatableJobs();
    expect(isSchedulerLeader()).toBe(false);
  });

  it('returns false after closeScheduler', async () => {
    await setupRepeatableJobs();
    await closeScheduler();
    expect(isSchedulerLeader()).toBe(false);
  });
});

describe('BullMQ autonomous scheduler — campaign optimization', () => {
  beforeEach(resetMocks);
  // Note: no afterEach closeScheduler here — campaign tests call getQueue() lazily;
  // we let tests manage the queue state explicitly to avoid constructor reuse issues.

  it('scheduleCampaignOptimization() registers a repeatable job with every:300_000', async () => {
    await scheduleCampaignOptimization('camp-1');
    const call = mocks.mockAdd.mock.calls.find(([n]: [string]) => n === 'campaign-optimize-camp-1');
    expect(call).toBeDefined();
    expect((call![2] as { repeat: { every: number } }).repeat.every).toBe(300_000);
  });

  it('scheduleCampaignOptimization() is idempotent for the same campaign', async () => {
    await scheduleCampaignOptimization('camp-2');
    await scheduleCampaignOptimization('camp-2');
    const calls = mocks.mockAdd.mock.calls.filter(([n]: [string]) => n === 'campaign-optimize-camp-2');
    expect(calls).toHaveLength(1);
  });

  it('different campaigns can be scheduled independently', async () => {
    await scheduleCampaignOptimization('camp-A');
    await scheduleCampaignOptimization('camp-B');
    const campaignCalls = mocks.mockAdd.mock.calls.filter(([n]: [string]) =>
      (n as string).startsWith('campaign-optimize-')
    );
    expect(campaignCalls).toHaveLength(2);
  });

  it('removeCampaignOptimization() calls removeRepeatableByKey when key is stored', async () => {
    mocks.mockGetRepeatableJobs.mockResolvedValue([
      { name: 'campaign-optimize-camp-3', key: 'repeat:campaign-optimize-camp-3:300000' },
    ]);
    await scheduleCampaignOptimization('camp-3');
    await removeCampaignOptimization('camp-3');
    expect(mocks.mockRemoveRepeatableByKey).toHaveBeenCalledWith(
      'repeat:campaign-optimize-camp-3:300000',
    );
  });

  it('removeCampaignOptimization() falls back to scanning when key not locally stored', async () => {
    mocks.mockGetRepeatableJobs.mockResolvedValue([
      { name: 'campaign-optimize-camp-4', key: 'repeat:camp-4-key' },
    ]);
    await removeCampaignOptimization('camp-4'); // never scheduled via scheduleCampaignOptimization
    expect(mocks.mockRemoveRepeatableByKey).toHaveBeenCalled();
  });

  it('removeCampaignOptimization() is safe when campaign was never scheduled', async () => {
    mocks.mockGetRepeatableJobs.mockResolvedValue([]);
    await expect(removeCampaignOptimization('camp-never')).resolves.not.toThrow();
  });
});

describe('BullMQ autonomous scheduler — AUTONOMOUS_QUEUE constant', () => {
  it('exports a non-empty string queue name', () => {
    expect(typeof AUTONOMOUS_QUEUE).toBe('string');
    expect(AUTONOMOUS_QUEUE.length).toBeGreaterThan(0);
  });
});

// ── withSchedLock utility — kept for stateful aggregation tasks ───────────────
//
// withSchedLock remains in distributedLock.ts for tasks that need a lock around
// in-memory state flushes (per task spec step 3). It is NO LONGER used as the
// primary scheduler — BullMQ repeatable jobs fulfil that role.

describe('withSchedLock utility (distributedLock — aggregation use)', () => {
  beforeEach(() => {
    mocks.mockRedisSet.mockClear();
    mocks.mockRedisGet.mockClear();
    mocks.mockRedisDel.mockClear();
    mocks.pdimState.configured = false;
  });

  it('exports withSchedLock, acquireLock, releaseLock, withLock', async () => {
    const mod = await import('../../server/lib/distributedLock.js');
    expect(typeof mod.withSchedLock).toBe('function');
    expect(typeof mod.acquireLock).toBe('function');
    expect(typeof mod.releaseLock).toBe('function');
    expect(typeof mod.withLock).toBe('function');
  });

  it('single-instance mode: always executes fn (no PDIM)', async () => {
    mocks.pdimState.configured = false;
    const { withSchedLock } = await import('../../server/lib/distributedLock.js');
    const fn = vi.fn().mockResolvedValue(undefined);
    await withSchedLock('test-task', 10, fn);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('single-instance mode: does not call SET NX (no Redis needed)', async () => {
    mocks.pdimState.configured = false;
    const { withSchedLock } = await import('../../server/lib/distributedLock.js');
    await withSchedLock('test-task', 10, async () => {});
    expect(mocks.mockRedisSet).not.toHaveBeenCalled();
  });

  it('PDIM mode: executes fn when SET NX returns OK', async () => {
    mocks.pdimState.configured = true;
    mocks.mockRedisSet.mockResolvedValue('OK');
    mocks.mockRedisGet.mockResolvedValue(null);
    const { withSchedLock } = await import('../../server/lib/distributedLock.js');
    const fn = vi.fn().mockResolvedValue(undefined);
    await withSchedLock('task-b', 54, fn);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('PDIM mode: skips fn when SET NX returns null (lock held by another pod)', async () => {
    mocks.pdimState.configured = true;
    mocks.mockRedisSet.mockResolvedValue(null);
    const { withSchedLock } = await import('../../server/lib/distributedLock.js');
    const fn = vi.fn().mockResolvedValue(undefined);
    await withSchedLock('task-c', 54, fn);
    expect(fn).not.toHaveBeenCalled();
  });

  it('PDIM mode: graceful degradation — executes fn when PDIM throws', async () => {
    mocks.pdimState.configured = true;
    mocks.mockRedisSet.mockRejectedValue(new Error('PDIM HTTP 503'));
    const { withSchedLock } = await import('../../server/lib/distributedLock.js');
    const fn = vi.fn().mockResolvedValue(undefined);
    await withSchedLock('task-d', 54, fn);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('PDIM mode: swallows fn() errors without propagating', async () => {
    mocks.pdimState.configured = true;
    mocks.mockRedisSet.mockResolvedValue('OK');
    mocks.mockRedisGet.mockResolvedValue(null);
    const { withSchedLock } = await import('../../server/lib/distributedLock.js');
    const fn = vi.fn().mockRejectedValue(new Error('task exploded'));
    await expect(withSchedLock('task-e', 54, fn)).resolves.toBeUndefined();
  });
});
