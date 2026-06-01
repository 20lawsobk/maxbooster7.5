/**
 * Integration-style tests proving the Self-Evolution posting_optimization knobs
 * (contentFormatPriority / engagementTargeting) now reach NON-autopilot content
 * generation — i.e. the advancedSocialAIService called directly (the chokepoint
 * for manual "generate a post" flows, the content-quality pipeline, and the
 * scheduled autopilot publisher).
 *
 * Before this wiring only the autopilot ENGINE consulted
 * evolutionRegistry.getPostingOptimization(); direct callers ignored it. These
 * tests drive the REAL advancedSocialAIService + REAL evolutionRegistry (only
 * MaxCore, the DB, PDIM storage and the logger are stubbed) and assert:
 *
 *  1. a contentFormatPriority override biases the generated output's media
 *     guidance toward the prioritized format (video → behind_scenes), and
 *     reverts after deactivateAll().
 *  2. engagementTargeting='high' steers the request objective to 'engagement'
 *     the same way autopilot does, while an explicit caller objective/contentType
 *     still wins, and everything reverts on rollback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────
vi.mock('../../server/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Real evolutionRegistry runs fully in-memory: no prior registry on disk.
vi.mock('../../server/services/storageService.js', () => ({
  storageService: {
    downloadFile: vi.fn().mockRejectedValue(new Error('not found')),
    uploadFile: vi.fn().mockResolvedValue('ok'),
  },
}));

// MaxCore is the only text source; return a fixed, well-formed response so the
// service produces deterministic output without any network call. Hoisted so the
// vi.mock factory (which is hoisted to the top of the file) can reference it.
const { mockInfer } = vi.hoisted(() => ({ mockInfer: vi.fn() }));
vi.mock('../../server/services/unifiedAIController.js', () => ({
  MaxCoreAIClient: { infer: mockInfer },
}));

// getUserContext() issues two select().from().where().limit() chains; return [].
vi.mock('../../server/db.js', () => {
  const dbChain: Record<string, unknown> = {
    from: () => dbChain,
    where: () => dbChain,
    limit: () => Promise.resolve([]),
  };
  return { db: { select: () => dbChain } };
});

import { evolutionRegistry } from '../../server/services/evolutionRegistry.js';
import {
  advancedSocialAIService,
  type AdvancedContentRequest,
} from '../../server/services/advancedSocialAIService.js';

function resetRegistry(): void {
  (evolutionRegistry as unknown as { enhancements: unknown[] }).enhancements = [];
  (evolutionRegistry as unknown as { lastLoadedAt: number }).lastLoadedAt = Date.now();
}

// The service caches by a key that includes contentType + objective, so distinct
// effective requests never collide; we also vary topic per assertion where a
// baseline and an override would otherwise share a key.
const BEHIND_SCENES_NOTE = 'Raw, authentic footage performs better than polished';

describe('Self-Evolution posting_optimization → direct advancedSocialAIService (non-autopilot)', () => {
  beforeEach(() => {
    resetRegistry();
    vi.clearAllMocks();
    mockInfer.mockResolvedValue({
      hook: 'Big news',
      body: 'Listen now',
      cta: 'Check it out',
      caption: 'Big news\n\nListen now\n\nCheck it out',
      hashtags: ['#music'],
    });
  });

  it('a contentFormatPriority override biases the generated media guidance, and reverts on rollback', async () => {
    // Baseline: no override, caller pins no contentType → no behind_scenes note.
    const baseline = await advancedSocialAIService.generateAdvancedContent({
      userId: 'direct-user-1',
      topic: 'fmt-baseline',
      platforms: ['instagram'],
      objective: 'awareness',
    });
    expect(baseline.mediaGuidance.styleNotes).not.toContain(BEHIND_SCENES_NOTE);

    // A real detected change prioritizes the 'video' media format. video maps to
    // the behind_scenes content type, whose media guidance carries a distinctive
    // style note — observable proof the knob reshaped the output.
    const applyResult = await evolutionRegistry.apply({
      upgradeId: 'up-direct-fmt',
      changeId: 'chg-direct-fmt',
      category: 'posting_optimization',
      title: 'Short-form video priority',
      source: 'rss',
      payload: { platform: 'instagram', contentFormatPriority: ['video', 'reel'] },
    });
    expect(applyResult.applied).toBe(true);

    const overridden = await advancedSocialAIService.generateAdvancedContent({
      userId: 'direct-user-1',
      topic: 'fmt-override',
      platforms: ['instagram'],
      objective: 'awareness',
    });
    expect(overridden.mediaGuidance.styleNotes).toContain(BEHIND_SCENES_NOTE);

    // Rollback reverts the consumer to its prior (no-override) behavior.
    await evolutionRegistry.deactivateAll();
    const reverted = await advancedSocialAIService.generateAdvancedContent({
      userId: 'direct-user-1',
      topic: 'fmt-reverted',
      platforms: ['instagram'],
      objective: 'awareness',
    });
    expect(reverted.mediaGuidance.styleNotes).not.toContain(BEHIND_SCENES_NOTE);
  });

  it('an explicit caller contentType always wins over the format-priority bias', async () => {
    await evolutionRegistry.apply({
      upgradeId: 'up-direct-fmt2',
      changeId: 'chg-direct-fmt2',
      category: 'posting_optimization',
      title: 'Video priority',
      source: 'rss',
      payload: { platform: 'instagram', contentFormatPriority: ['video'] },
    });

    // Caller explicitly chose 'announcement' → bias must NOT override it.
    const result = await advancedSocialAIService.generateAdvancedContent({
      userId: 'direct-user-2',
      topic: 'explicit-type',
      platforms: ['instagram'],
      objective: 'awareness',
      contentType: 'announcement',
    });
    expect(result.mediaGuidance.styleNotes).not.toContain(BEHIND_SCENES_NOTE);
    // The announcement-specific guidance note IS present instead.
    expect(result.mediaGuidance.styleNotes).toContain('Bold text overlay with release info');
  });
});

describe('applyPostingOptimization — objective/contentType bias on the direct path', () => {
  type WithApply = {
    applyPostingOptimization(r: AdvancedContentRequest): AdvancedContentRequest;
  };
  const svc = advancedSocialAIService as unknown as WithApply;

  beforeEach(() => {
    resetRegistry();
    vi.clearAllMocks();
  });

  it('engagementTargeting=high steers the objective to "engagement", and reverts on rollback', async () => {
    const base: AdvancedContentRequest = {
      userId: 'eng-user',
      topic: 'new single',
      platforms: ['instagram'],
      objective: 'conversions',
    };

    // No override → objective untouched.
    expect(svc.applyPostingOptimization(base).objective).toBe('conversions');

    await evolutionRegistry.apply({
      upgradeId: 'up-eng',
      changeId: 'chg-eng',
      category: 'posting_optimization',
      title: 'Prioritize engagement',
      source: 'tavily',
      payload: { platform: 'instagram', engagementTargeting: 'high' },
    });
    expect(svc.applyPostingOptimization(base).objective).toBe('engagement');

    // 'standard' does NOT override the caller's objective.
    await evolutionRegistry.deactivateAll();
    await evolutionRegistry.apply({
      upgradeId: 'up-eng2',
      changeId: 'chg-eng2',
      category: 'posting_optimization',
      title: 'Standard engagement',
      source: 'tavily',
      payload: { platform: 'instagram', engagementTargeting: 'standard' },
    });
    expect(svc.applyPostingOptimization(base).objective).toBe('conversions');

    // Rollback fully reverts.
    await evolutionRegistry.deactivateAll();
    expect(svc.applyPostingOptimization(base).objective).toBe('conversions');
  });

  it('contentFormatPriority biases contentType only when the caller did not pin one', async () => {
    await evolutionRegistry.apply({
      upgradeId: 'up-fmt3',
      changeId: 'chg-fmt3',
      category: 'posting_optimization',
      title: 'Carousel priority',
      source: 'exa',
      payload: { platform: 'tiktok', contentFormatPriority: ['carousel', 'image'] },
    });

    // Caller left contentType undefined → biased toward carousel → storytelling.
    const biased = svc.applyPostingOptimization({
      userId: 'fmt-user',
      topic: 't',
      platforms: ['tiktok'],
      objective: 'awareness',
    });
    expect(biased.contentType).toBe('storytelling');

    // Caller pinned a contentType → respected.
    const pinned = svc.applyPostingOptimization({
      userId: 'fmt-user',
      topic: 't',
      platforms: ['tiktok'],
      objective: 'awareness',
      contentType: 'promotional',
    });
    expect(pinned.contentType).toBe('promotional');
  });
});
