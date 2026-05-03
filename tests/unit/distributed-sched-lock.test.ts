/**
 * Unit tests for withSchedLock — distributed cron job deduplication.
 *
 * These tests verify that:
 *   1. When PDIM is not configured, the function always executes (single-instance mode).
 *   2. When PDIM is configured and SET NX succeeds, the function executes and the lock is released.
 *   3. When PDIM is configured and SET NX fails (lock held by another pod), execution is skipped.
 *   4. When PDIM throws an error, execution is allowed (graceful degradation).
 *   5. isSchedulerLeader() tracks active execution correctly.
 *   6. Errors inside fn() are caught and logged; lock is still released.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (vi.hoisted runs before vi.mock factories) ─────────────────
const { mockRedisSet, mockRedisGet, mockRedisDel, mockGetRedisClient, mockIsPdimConfigured, pdimState } =
  vi.hoisted(() => {
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
    return { mockRedisSet, mockRedisGet, mockRedisDel, mockGetRedisClient, mockIsPdimConfigured, pdimState };
  });

vi.mock('../../server/lib/redisClient.js', () => ({
  getRedisClient: mockGetRedisClient,
  newBullMQRedisConnection: vi.fn(),
}));

vi.mock('../../server/lib/pdimClient.js', () => ({
  isPdimConfigured: mockIsPdimConfigured,
}));

vi.mock('../../server/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import AFTER mocks are wired
import { withSchedLock, isSchedulerLeader } from '../../server/lib/distributedLock.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function setAcquired() {
  mockRedisSet.mockResolvedValue('OK');
  mockRedisGet.mockResolvedValue(null); // GET returns nothing — del skipped
  mockRedisDel.mockResolvedValue(1);
}

function setBlocked() {
  mockRedisSet.mockResolvedValue(null); // NX failed — another pod holds lock
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('withSchedLock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdimState.configured = false;
  });

  // 1. Single-instance mode (PDIM not configured) ───────────────────────────
  describe('single-instance mode (PDIM not configured)', () => {
    it('always executes fn when PDIM is not configured', async () => {
      pdimState.configured = false;
      const fn = vi.fn().mockResolvedValue(undefined);
      await withSchedLock('test-job', 54, fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('does NOT call getRedisClient when PDIM is not configured', async () => {
      pdimState.configured = false;
      await withSchedLock('test-job', 54, async () => {});
      expect(mockGetRedisClient).not.toHaveBeenCalled();
    });

    it('isSchedulerLeader() is false between ticks', async () => {
      pdimState.configured = false;
      await withSchedLock('test-job', 54, async () => {});
      expect(isSchedulerLeader()).toBe(false);
    });
  });

  // 2. Lock acquired (this pod wins) ─────────────────────────────────────────
  describe('distributed mode — lock acquired', () => {
    beforeEach(() => {
      pdimState.configured = true;
      setAcquired();
    });

    it('executes fn when SET NX returns OK', async () => {
      const fn = vi.fn().mockResolvedValue(undefined);
      await withSchedLock('job-a', 54, fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('calls SET with NX and EX flags', async () => {
      await withSchedLock('job-a', 54, async () => {});
      expect(mockRedisSet).toHaveBeenCalledWith(
        'lock:job-a',
        expect.any(String),
        'EX',
        54,
        'NX',
      );
    });

    it('attempts to release the lock after fn completes (matching token)', async () => {
      // Return the same token from GET so del is triggered
      mockRedisSet.mockImplementation(async (_key: string, token: string) => {
        mockRedisGet.mockResolvedValueOnce(token);
        return 'OK';
      });

      await withSchedLock('job-b', 54, async () => {});
      expect(mockRedisGet).toHaveBeenCalledWith('lock:job-b');
      expect(mockRedisDel).toHaveBeenCalledWith('lock:job-b');
    });

    it('does NOT del when GET returns a different token (another pod re-acquired)', async () => {
      mockRedisSet.mockResolvedValue('OK');
      mockRedisGet.mockResolvedValueOnce('other-pod-token'); // different token
      await withSchedLock('job-b2', 54, async () => {});
      expect(mockRedisDel).not.toHaveBeenCalled();
    });

    it('isSchedulerLeader() is false after lock is released', async () => {
      await withSchedLock('job-c', 54, async () => {});
      expect(isSchedulerLeader()).toBe(false);
    });
  });

  // 3. Lock NOT acquired (another pod holds it) ─────────────────────────────
  describe('distributed mode — lock blocked', () => {
    beforeEach(() => {
      pdimState.configured = true;
      setBlocked();
    });

    it('skips fn when SET NX returns null', async () => {
      const fn = vi.fn().mockResolvedValue(undefined);
      await withSchedLock('job-d', 54, fn);
      expect(fn).not.toHaveBeenCalled();
    });

    it('does NOT attempt release when lock was not acquired', async () => {
      await withSchedLock('job-d', 54, async () => {});
      expect(mockRedisGet).not.toHaveBeenCalled();
      expect(mockRedisDel).not.toHaveBeenCalled();
    });

    it('isSchedulerLeader() remains false when lock is blocked', async () => {
      await withSchedLock('job-d', 54, async () => {});
      expect(isSchedulerLeader()).toBe(false);
    });
  });

  // 4. PDIM error — graceful degradation ─────────────────────────────────────
  describe('distributed mode — PDIM error on acquire', () => {
    beforeEach(() => {
      pdimState.configured = true;
      mockRedisSet.mockRejectedValue(new Error('PDIM HTTP 503'));
    });

    it('executes fn despite PDIM error (graceful degradation)', async () => {
      const fn = vi.fn().mockResolvedValue(undefined);
      await withSchedLock('job-e', 54, fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('does not propagate the PDIM error', async () => {
      await expect(withSchedLock('job-e', 54, async () => {})).resolves.toBeUndefined();
    });

    it('isSchedulerLeader() is false after PDIM-error execution completes', async () => {
      await withSchedLock('job-e', 54, async () => {});
      expect(isSchedulerLeader()).toBe(false);
    });
  });

  // 5. fn() throws — lock still released, error swallowed ───────────────────
  describe('fn() error handling', () => {
    beforeEach(() => {
      pdimState.configured = true;
      setAcquired();
    });

    it('swallows fn() errors without propagating', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('job boom'));
      await expect(withSchedLock('job-f', 54, fn)).resolves.toBeUndefined();
    });

    it('still attempts lock release even when fn() throws', async () => {
      mockRedisSet.mockImplementation(async (_key: string, token: string) => {
        mockRedisGet.mockResolvedValueOnce(token);
        return 'OK';
      });
      const fn = vi.fn().mockRejectedValue(new Error('boom'));
      await withSchedLock('job-f2', 54, fn);
      expect(mockRedisDel).toHaveBeenCalled();
    });

    it('isSchedulerLeader() is false even after fn() throws', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('oops'));
      await withSchedLock('job-g', 54, fn);
      expect(isSchedulerLeader()).toBe(false);
    });
  });

  // 6. Leader state ──────────────────────────────────────────────────────────
  describe('isSchedulerLeader()', () => {
    it('returns false when no locks are currently held', () => {
      expect(isSchedulerLeader()).toBe(false);
    });
  });
});
