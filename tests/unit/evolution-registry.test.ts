/**
 * Unit + integration-style tests for the Self-Evolution honesty guarantee.
 *
 * The Self-Evolution Engine may only report an enhancement as "applied (live)"
 * when its sanitized payload carries a field a live subsystem actually reads
 * (the "effective field" rule). These tests lock that guarantee in so a future
 * change cannot silently reintroduce fake "applied" reporting:
 *
 *  1. evolutionRegistry.apply() returns applied=true ONLY when a consumed
 *     category's payload contains an effective field; otherwise applied=false
 *     with a non-empty advisory reason.
 *  2. deactivateAll() flips active entries inactive and consumers fall back to
 *     their defaults.
 *  3. Integration-style: a generated posting_optimization enhancement's
 *     optimalHours actually changes autopilot posting-window selection
 *     (the real consumer autopilot-engine.getOptimalTimesForPlatform) when no
 *     per-artist learned timing exists.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────
// The registry persists to storageService (PDIM) and logs via the pino logger.
// Keep both inert so the registry runs fully in-memory with no network/IO.

vi.mock('../../server/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../server/services/storageService.js', () => ({
  storageService: {
    // No prior registry on disk — downloadFile rejects so load() starts empty.
    downloadFile: vi.fn().mockRejectedValue(new Error('not found')),
    uploadFile: vi.fn().mockResolvedValue('ok'),
  },
}));

// No per-artist learned timing → the consumer falls through to the registry
// override (then static defaults). Returning [] proves the override path.
const mockGetOptimalPostingTimes = vi.fn().mockResolvedValue([]);
vi.mock('../../server/services/autopilotLearningService.js', () => ({
  autopilotLearningService: {
    getOptimalPostingTimes: mockGetOptimalPostingTimes,
  },
}));

// Heavy, unrelated imports pulled in transitively by autopilot-engine. Stub
// them so importing the real consumer does not boot the whole server.
vi.mock('../../server/platform-apis.js', () => ({ platformAPI: {} }));
vi.mock('../../server/services/advancedSocialAIService.js', () => ({
  advancedSocialAIService: {},
}));

import { evolutionRegistry } from '../../server/services/evolutionRegistry.js';

// Reset the singleton's in-memory state between tests. Setting lastLoadedAt to
// now keeps load() from re-reading (mocked) storage so each test starts clean.
function resetRegistry(): void {
  (evolutionRegistry as unknown as { enhancements: unknown[] }).enhancements = [];
  (evolutionRegistry as unknown as { lastLoadedAt: number }).lastLoadedAt = Date.now();
}

describe('evolutionRegistry.apply() — effective-field honesty rule', () => {
  beforeEach(() => {
    resetRegistry();
    vi.clearAllMocks();
    mockGetOptimalPostingTimes.mockResolvedValue([]);
  });

  it('reports applied=true for a consumed category WITH an effective field (posting_optimization + optimalHours)', async () => {
    const result = await evolutionRegistry.apply({
      upgradeId: 'up-1',
      changeId: 'chg-1',
      category: 'posting_optimization',
      title: 'Detected evening engagement shift',
      source: 'rss',
      payload: { platform: 'tiktok', optimalHours: [11, 14, 17, 19, 21], engagementTargeting: 'high' },
    });

    expect(result.consumed).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.enhancement?.active).toBe(true);
    expect((result.enhancement?.payload as { optimalHours?: number[] }).optimalHours)
      .toEqual([11, 14, 17, 19, 21]);
  });

  it('reports applied=true for content_optimization WITH an effective field (variantCount)', async () => {
    const result = await evolutionRegistry.apply({
      upgradeId: 'up-2',
      changeId: 'chg-2',
      category: 'content_optimization',
      title: 'Carousel format trending',
      source: 'tavily',
      payload: { platform: 'instagram', variantCount: 5, visualPriority: true },
    });

    expect(result.consumed).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('reports applied=false (advisory) for a consumed category WITHOUT an effective field (posting_optimization, only contentFormatPriority/engagementTargeting)', async () => {
    const result = await evolutionRegistry.apply({
      upgradeId: 'up-3',
      changeId: 'chg-3',
      category: 'posting_optimization',
      title: 'Short-form video priority',
      source: 'exa',
      // These knobs are sanitized & stored, but NO live consumer reads them yet,
      // so this must NOT count as an applied behavior change.
      payload: { contentFormatPriority: ['video', 'reel'], engagementTargeting: 'high' },
    });

    expect(result.consumed).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(typeof result.reason).toBe('string');
    expect(result.reason!.length).toBeGreaterThan(0);
    // The entry is still recorded (advisory), just not reported as applied.
    expect(result.enhancement).toBeDefined();
  });

  it('reports applied=false when the payload sanitizes to nothing usable', async () => {
    const result = await evolutionRegistry.apply({
      upgradeId: 'up-4',
      changeId: 'chg-4',
      category: 'posting_optimization',
      title: 'Empty payload',
      source: 'rss',
      payload: { optimalHours: ['not-a-number'] as unknown as number[] },
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});

describe('evolutionRegistry.deactivateAll() — reversibility', () => {
  beforeEach(() => {
    resetRegistry();
    vi.clearAllMocks();
  });

  it('flips active entries inactive so consumers fall back to defaults', async () => {
    await evolutionRegistry.apply({
      upgradeId: 'up-5',
      changeId: 'chg-5',
      category: 'posting_optimization',
      title: 'Posting hours override',
      source: 'rss',
      payload: { platform: 'tiktok', optimalHours: [11, 14, 17, 19, 21] },
    });

    // Consumer sees the override while active.
    expect(evolutionRegistry.getOptimalHoursOverride('tiktok')).toEqual([11, 14, 17, 19, 21]);
    expect(evolutionRegistry.getStats().active).toBe(1);

    const reverted = await evolutionRegistry.deactivateAll();
    expect(reverted).toBe(1);

    // After rollback the consumer gets null → it will use its static defaults.
    expect(evolutionRegistry.getOptimalHoursOverride('tiktok')).toBeNull();
    expect(evolutionRegistry.getStats().active).toBe(0);
  });
});

describe('Self-Evolution → autopilot posting-window selection (integration-style)', () => {
  beforeEach(() => {
    resetRegistry();
    vi.clearAllMocks();
    mockGetOptimalPostingTimes.mockResolvedValue([]);
  });

  it('a generated posting_optimization optimalHours override changes the real autopilot getOptimalTimesForPlatform result when no learned timing exists', async () => {
    const { AutopilotEngine } = await import('../../server/autopilot-engine.js');
    const engine = new AutopilotEngine('test-user') as unknown as {
      getOptimalTimesForPlatform(platform: string): Promise<number[]>;
    };

    // Static default for tiktok (no learned data, no override) is [6,10,16,19].
    const STATIC_TIKTOK_DEFAULT = [6, 10, 16, 19];
    const baseline = await engine.getOptimalTimesForPlatform('tiktok');
    expect(baseline).toEqual(STATIC_TIKTOK_DEFAULT);

    // The engine generates this exact posting_optimization payload for a
    // high-impact detected change; apply it to the live registry.
    const overrideHours = [11, 14, 17, 19, 21];
    const applyResult = await evolutionRegistry.apply({
      upgradeId: 'up-6',
      changeId: 'chg-6',
      category: 'posting_optimization',
      title: 'High-impact evening engagement shift',
      source: 'rss',
      payload: { platform: 'tiktok', optimalHours: overrideHours, engagementTargeting: 'high' },
    });
    expect(applyResult.applied).toBe(true);

    // The REAL consumer now returns the override instead of the static default.
    const afterOverride = await engine.getOptimalTimesForPlatform('tiktok');
    expect(afterOverride).toEqual(overrideHours);
    expect(afterOverride).not.toEqual(STATIC_TIKTOK_DEFAULT);

    // Deactivating the enhancement reverts the consumer to its static default.
    await evolutionRegistry.deactivateAll();
    const afterRollback = await engine.getOptimalTimesForPlatform('tiktok');
    expect(afterRollback).toEqual(STATIC_TIKTOK_DEFAULT);
  });

  it('an advisory (non-effective) posting_optimization payload does NOT change autopilot selection', async () => {
    const { AutopilotEngine } = await import('../../server/autopilot-engine.js');
    const engine = new AutopilotEngine('test-user-2') as unknown as {
      getOptimalTimesForPlatform(platform: string): Promise<number[]>;
    };
    const STATIC_TIKTOK_DEFAULT = [6, 10, 16, 19];

    const applyResult = await evolutionRegistry.apply({
      upgradeId: 'up-7',
      changeId: 'chg-7',
      category: 'posting_optimization',
      title: 'Format priority only',
      source: 'exa',
      payload: { platform: 'tiktok', contentFormatPriority: ['video', 'reel'] },
    });
    // Recorded but not applied — nothing a consumer reads changed.
    expect(applyResult.applied).toBe(false);

    const after = await engine.getOptimalTimesForPlatform('tiktok');
    expect(after).toEqual(STATIC_TIKTOK_DEFAULT);
  });
});
