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

// The autopilot content generator delegates to advancedSocialAIService. We spy
// on it to observe the exact knobs (variantCount / includeEmojis) the engine
// passes through from the registry's content_optimization override.
const mockGenerateAdvancedContent = vi.fn().mockResolvedValue({
  primary: { body: 'post body', hashtags: ['#music'], hook: 'hook', callToAction: 'cta' },
  scoring: { overall: 80 },
  viralPotential: { score: 70 },
});
vi.mock('../../server/services/advancedSocialAIService.js', () => ({
  advancedSocialAIService: {
    generateAdvancedContent: mockGenerateAdvancedContent,
  },
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

describe('Self-Evolution → autopilot content generation (integration-style)', () => {
  beforeEach(() => {
    resetRegistry();
    vi.clearAllMocks();
    mockGenerateAdvancedContent.mockResolvedValue({
      primary: { body: 'post body', hashtags: ['#music'], hook: 'hook', callToAction: 'cta' },
      scoring: { overall: 80 },
      viralPotential: { score: 70 },
    });
  });

  type ContentEngine = {
    generateContentForAutopilot(params: {
      topic: string;
      platform: string;
      brandVoice: string;
      contentType: string;
      targetAudience: string;
      businessGoals: string[];
    }): Promise<unknown>;
  };

  // generateContentForAutopilot is private; the tests below access it via cast,
  // the same way the posting-time tests cast getOptimalTimesForPlatform.
  const GEN_PARAMS = {
    topic: 'new single',
    platform: 'instagram',
    brandVoice: 'energetic',
    contentType: 'announcements',
    targetAudience: 'fans',
    businessGoals: ['growth'],
  };

  it('generates with the static defaults (variantCount=3, includeEmojis=true) when no content_optimization override exists', async () => {
    const { AutopilotEngine } = await import('../../server/autopilot-engine.js');
    const engine = new AutopilotEngine('content-user-1') as unknown as ContentEngine;

    await engine.generateContentForAutopilot(GEN_PARAMS);

    expect(mockGenerateAdvancedContent).toHaveBeenCalledTimes(1);
    const callArg = mockGenerateAdvancedContent.mock.calls[0][0];
    expect(callArg.variantCount).toBe(3);
    expect(callArg.includeEmojis).toBe(true);
  });

  it('a generated content_optimization override (variantCount + visualPriority) changes the real generator inputs, and reverts on rollback', async () => {
    const { AutopilotEngine } = await import('../../server/autopilot-engine.js');
    const engine = new AutopilotEngine('content-user-2') as unknown as ContentEngine;

    // Baseline: defaults.
    await engine.generateContentForAutopilot(GEN_PARAMS);
    const baselineArg = mockGenerateAdvancedContent.mock.calls[0][0];
    expect(baselineArg.variantCount).toBe(3);
    expect(baselineArg.includeEmojis).toBe(true);

    // The engine generates this content_optimization payload for a detected
    // change; apply it to the live registry. visualPriority=false flips
    // includeEmojis off, variantCount=5 raises the variant count.
    const applyResult = await evolutionRegistry.apply({
      upgradeId: 'up-content-1',
      changeId: 'chg-content-1',
      category: 'content_optimization',
      title: 'Carousel format trending',
      source: 'tavily',
      payload: { platform: 'instagram', variantCount: 5, visualPriority: false },
    });
    expect(applyResult.applied).toBe(true);

    // The REAL consumer now passes the overridden knobs through to the generator.
    mockGenerateAdvancedContent.mockClear();
    await engine.generateContentForAutopilot(GEN_PARAMS);
    const overriddenArg = mockGenerateAdvancedContent.mock.calls[0][0];
    expect(overriddenArg.variantCount).toBe(5);
    expect(overriddenArg.includeEmojis).toBe(false);

    // Deactivating the enhancement reverts the generator to its static defaults.
    await evolutionRegistry.deactivateAll();
    mockGenerateAdvancedContent.mockClear();
    await engine.generateContentForAutopilot(GEN_PARAMS);
    const revertedArg = mockGenerateAdvancedContent.mock.calls[0][0];
    expect(revertedArg.variantCount).toBe(3);
    expect(revertedArg.includeEmojis).toBe(true);
  });

  it('baseline: hashtagStrategy / captionLength / callToActionStrength are undefined when no override exists', async () => {
    const { AutopilotEngine } = await import('../../server/autopilot-engine.js');
    const engine = new AutopilotEngine('content-user-3') as unknown as ContentEngine;

    await engine.generateContentForAutopilot(GEN_PARAMS);
    const callArg = mockGenerateAdvancedContent.mock.calls[0][0];
    expect(callArg.hashtagStrategy).toBeUndefined();
    expect(callArg.captionLength).toBeUndefined();
    expect(callArg.callToActionStrength).toBeUndefined();
  });

  it('a generated content_optimization override (hashtagStrategy + captionLength + callToActionStrength) reaches the real generator inputs, and reverts on rollback', async () => {
    const { AutopilotEngine } = await import('../../server/autopilot-engine.js');
    const engine = new AutopilotEngine('content-user-4') as unknown as ContentEngine;

    // These three knobs are now EFFECTIVE fields — a live consumer
    // (generateContentForAutopilot → generateAdvancedContent) reads them — so
    // apply() must report applied=true and they must flow to the generator.
    const applyResult = await evolutionRegistry.apply({
      upgradeId: 'up-content-2',
      changeId: 'chg-content-2',
      category: 'content_optimization',
      title: 'Niche hashtags + short captions + strong CTA',
      source: 'exa',
      payload: {
        platform: 'instagram',
        hashtagStrategy: 'niche',
        captionLength: 'short',
        callToActionStrength: 'high',
      },
    });
    expect(applyResult.applied).toBe(true);
    expect(applyResult.reason).toBeUndefined();

    await engine.generateContentForAutopilot(GEN_PARAMS);
    const overriddenArg = mockGenerateAdvancedContent.mock.calls[0][0];
    expect(overriddenArg.hashtagStrategy).toBe('niche');
    expect(overriddenArg.captionLength).toBe('short');
    expect(overriddenArg.callToActionStrength).toBe('high');

    // Deactivating the enhancement reverts the generator to its prior behavior
    // (the three knobs become undefined again).
    await evolutionRegistry.deactivateAll();
    mockGenerateAdvancedContent.mockClear();
    await engine.generateContentForAutopilot(GEN_PARAMS);
    const revertedArg = mockGenerateAdvancedContent.mock.calls[0][0];
    expect(revertedArg.hashtagStrategy).toBeUndefined();
    expect(revertedArg.captionLength).toBeUndefined();
    expect(revertedArg.callToActionStrength).toBeUndefined();
  });

  it('each newly-wired knob is independently honored (hashtagStrategy only)', async () => {
    const { AutopilotEngine } = await import('../../server/autopilot-engine.js');
    const engine = new AutopilotEngine('content-user-5') as unknown as ContentEngine;

    const applyResult = await evolutionRegistry.apply({
      upgradeId: 'up-content-3',
      changeId: 'chg-content-3',
      category: 'content_optimization',
      title: 'Trending hashtag strategy',
      source: 'tavily',
      payload: { platform: 'instagram', hashtagStrategy: 'trending' },
    });
    expect(applyResult.applied).toBe(true);

    await engine.generateContentForAutopilot(GEN_PARAMS);
    const callArg = mockGenerateAdvancedContent.mock.calls[0][0];
    expect(callArg.hashtagStrategy).toBe('trending');
    expect(callArg.captionLength).toBeUndefined();
    expect(callArg.callToActionStrength).toBeUndefined();
    // The previously-wired knobs still fall back to their defaults.
    expect(callArg.variantCount).toBe(3);
    expect(callArg.includeEmojis).toBe(true);
  });
});
