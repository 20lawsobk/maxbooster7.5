/**
 * Integration-style tests for direct advancedSocialAIService generation (the
 * chokepoint for manual "generate a post" flows and scheduled publishing).
 *
 * These tests drive the REAL advancedSocialAIService + REAL evolutionRegistry (only
 * MaxCore, the DB, PDIM storage and the logger are stubbed) and assert:
 *
 *  1. MaxCore-backed generation honestly leaves unavailable media enrichment
 *     null.
 *  2. Registry-derived posting metadata does not mutate direct caller intent;
 *     explicit objective/contentType values remain the MaxCore transport input.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Real evolutionRegistry runs fully in-memory: no prior registry on disk.
vi.mock("../../server/services/storageService.js", () => ({
  storageService: {
    downloadFile: vi.fn().mockRejectedValue(new Error("not found")),
    uploadFile: vi.fn().mockResolvedValue("ok"),
  },
}));

// MaxCore is the only text source; return a fixed, well-formed response so the
// service produces deterministic output without any network call. Hoisted so the
// vi.mock factory (which is hoisted to the top of the file) can reference it.
const { mockInfer } = vi.hoisted(() => ({ mockInfer: vi.fn() }));
vi.mock("../../server/services/unifiedAIController.js", () => ({
  MaxCoreAIClient: { infer: mockInfer, generate: mockInfer },
}));
vi.mock("../../server/services/maxcoreClient.js", () => ({
  MaxCoreAIClient: { generate: mockInfer },
}));

// getUserContext() issues two select().from().where().limit() chains; return [].
vi.mock("../../server/db.js", () => {
  const dbChain: Record<string, unknown> = {
    from: () => dbChain,
    where: () => dbChain,
    limit: () => Promise.resolve([]),
  };
  return { db: { select: () => dbChain } };
});

import { evolutionRegistry } from "../../server/services/evolutionRegistry.js";
import {
  advancedSocialAIService,
} from "../../server/services/advancedSocialAIService.js";

function resetRegistry(): void {
  (evolutionRegistry as unknown as { enhancements: unknown[] }).enhancements =
    [];
  (evolutionRegistry as unknown as { lastLoadedAt: number }).lastLoadedAt =
    Date.now();
}

// The service caches by a key that includes contentType + objective, so distinct
// effective requests never collide; we also vary topic per assertion where a
// baseline and an override would otherwise share a key.
describe("Self-Evolution posting_optimization → direct advancedSocialAIService (non-autopilot)", () => {
  beforeEach(() => {
    resetRegistry();
    vi.clearAllMocks();
    mockInfer.mockResolvedValue({
      success: true,
      user_id: "direct-test-user",
      platform: "instagram",
      topic: "test topic",
      variants: [
        {
          hook: "Big news",
          body: "Listen now",
          cta: "Check it out",
          caption: "Big news\n\nListen now\n\nCheck it out",
          hashtags: ["#music"],
          source: "maxcore-model",
        },
      ],
    });
  });

  it("returns null media guidance on the MaxCore path instead of fabricating enrichment", async () => {
    const baseline = await advancedSocialAIService.generateAdvancedContent({
      userId: "direct-user-1",
      topic: "fmt-baseline",
      platforms: ["instagram"],
      objective: "awareness",
    });
    expect(baseline.mediaGuidance).toBeNull();

    const applyResult = await evolutionRegistry.apply({
      upgradeId: "up-direct-fmt",
      changeId: "chg-direct-fmt",
      category: "posting_optimization",
      title: "Short-form video priority",
      source: "rss",
      payload: {
        platform: "instagram",
        contentFormatPriority: ["video", "reel"],
      },
    });
    expect(applyResult.applied).toBe(true);

    const overridden = await advancedSocialAIService.generateAdvancedContent({
      userId: "direct-user-1",
      topic: "fmt-override",
      platforms: ["instagram"],
      objective: "awareness",
    });
    expect(overridden.mediaGuidance).toBeNull();
    expect(overridden.primary.body).toContain("Listen now");

    await evolutionRegistry.deactivateAll();
    const reverted = await advancedSocialAIService.generateAdvancedContent({
      userId: "direct-user-1",
      topic: "fmt-reverted",
      platforms: ["instagram"],
      objective: "awareness",
    });
    expect(reverted.mediaGuidance).toBeNull();
  });

  it("keeps media guidance null when the caller explicitly selects a content type", async () => {
    await evolutionRegistry.apply({
      upgradeId: "up-direct-fmt2",
      changeId: "chg-direct-fmt2",
      category: "posting_optimization",
      title: "Video priority",
      source: "rss",
      payload: { platform: "instagram", contentFormatPriority: ["video"] },
    });

    // Caller explicitly chose 'announcement' → bias must NOT override it.
    const result = await advancedSocialAIService.generateAdvancedContent({
      userId: "direct-user-2",
      topic: "explicit-type",
      platforms: ["instagram"],
      objective: "awareness",
      contentType: "announcement",
    });
    expect(result.mediaGuidance).toBeNull();
    expect(result.primary.headline).toBe("Big news");
  });
});

describe("direct generation preserves caller authority over posting metadata", () => {
  beforeEach(() => {
    resetRegistry();
    vi.clearAllMocks();
  });

  it("does not derive objective or content type from active registry metadata", async () => {
    await evolutionRegistry.apply({
      upgradeId: "up-eng",
      changeId: "chg-eng",
      category: "posting_optimization",
      title: "Prioritize engagement",
      source: "tavily",
      payload: {
        platform: "instagram",
        engagementTargeting: "high",
        contentFormatPriority: ["video"],
      },
    });

    await advancedSocialAIService.generateAdvancedContent({
      userId: "eng-user-authority",
      topic: "new single authority",
      platforms: ["instagram"],
      objective: "conversions",
    });

    expect(mockInfer).toHaveBeenLastCalledWith(
      "/api/platform/social/generate",
      expect.objectContaining({
        goal: "conversions",
        style_tags: [],
      }),
    );
  });

  it("forwards an explicit caller content type despite conflicting registry metadata", async () => {
    await evolutionRegistry.apply({
      upgradeId: "up-fmt3",
      changeId: "chg-fmt3",
      category: "posting_optimization",
      title: "Carousel priority",
      source: "exa",
      payload: {
        platform: "tiktok",
        contentFormatPriority: ["carousel", "image"],
      },
    });

    await advancedSocialAIService.generateAdvancedContent({
      userId: "fmt-user-authority",
      topic: "explicit format authority",
      platforms: ["tiktok"],
      objective: "awareness",
      contentType: "promotional",
    });

    expect(mockInfer).toHaveBeenLastCalledWith(
      "/api/platform/social/generate",
      expect.objectContaining({
        goal: "awareness",
        style_tags: ["promotional"],
      }),
    );
  });
});
