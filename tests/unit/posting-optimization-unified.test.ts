/**
 * Integration-style tests proving the Self-Evolution posting_optimization knobs
 * (contentFormatPriority / engagementTargeting) now ALSO reach the user-facing
 * manual "generate a post" path — i.e. unifiedAIController.generateContent.
 *
 * Before this wiring only the autopilot ENGINE and advancedSocialAIService
 * consulted evolutionRegistry.getPostingOptimization(); the manual button (which
 * routes through unifiedAIController.generateContent, NOT generateAdvancedContent)
 * ignored it. These tests drive the REAL UnifiedAIController + REAL
 * evolutionRegistry (only MaxCore, the ML engines, storage, the music-industry
 * context filter and the logger are stubbed) and assert that the knobs reshape
 * the payload sent to MaxCore:
 *
 *  1. engagementTargeting='high' forwards objective='engagement' to MaxCore and
 *     reverts after deactivateAll().
 *  2. contentFormatPriority biases content_type toward the prioritized media
 *     format (video → behind-the-scenes) ONLY when the caller left contentType
 *     unpinned; an explicit caller contentType always wins.
 *  3. With no active knob, neither content_type nor objective is injected.
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

// MaxCore is the only text source; capture the payload and return a fixed,
// well-formed response so generateContent succeeds without any network call.
const { mockInfer } = vi.hoisted(() => ({ mockInfer: vi.fn() }));
vi.mock("../../server/services/maxcoreClient.js", () => ({
  MaxCoreAIClient: { infer: mockInfer },
}));

// Music-industry context appends background signal — not relevant here.
vi.mock("../../server/services/musicIndustryContextFilter.js", () => ({
  musicIndustryContextFilter: {
    getContextForMode: vi.fn().mockResolvedValue(null),
  },
}));

// Heavy ML / service deps the controller constructs — trivial stubs so the
// singleton instantiates without booting real models.
vi.mock("../../server/services/mlModelRegistry.js", () => ({
  MLModelRegistry: { getInstance: () => ({ initialize: vi.fn() }) },
}));
vi.mock("../../server/services/aiService.js", () => ({ AIService: class {} }));
vi.mock("../../server/services/aiAnalyticsService.js", () => ({}));
vi.mock("../../server/storage.js", () => ({ storage: {} }));
vi.mock("../../shared/ml/nlp/ContentGenerator.js", () => ({
  ContentGenerator: class {},
}));
vi.mock("../../shared/ml/nlp/SentimentAnalyzer.js", () => ({
  SentimentAnalyzer: class {},
}));
vi.mock("../../shared/ml/models/RecommendationEngine.js", () => ({
  RecommendationEngine: class {},
}));
vi.mock("../../shared/ml/models/AdOptimizationEngine.js", () => ({
  AdOptimizationEngine: class {
    initialize = vi.fn();
  },
}));
vi.mock("../../shared/ml/models/SocialAutopilotEngine.js", () => ({
  SocialAutopilotEngine: class {
    initialize = vi.fn();
  },
}));
vi.mock("../../shared/ml/models/AdvancedTimeSeriesModel.js", () => ({
  AdvancedTimeSeriesModel: class {},
}));

import { evolutionRegistry } from "../../server/services/evolutionRegistry.js";
import { UnifiedAIController } from "../../server/services/unifiedAIController.js";

function resetRegistry(): void {
  (evolutionRegistry as unknown as { enhancements: unknown[] }).enhancements =
    [];
  (evolutionRegistry as unknown as { lastLoadedAt: number }).lastLoadedAt =
    Date.now();
}

const controller = UnifiedAIController.getInstance();
// Skip the heavy async init — generateContent only needs MaxCore + the registry.
(controller as unknown as { initialized: boolean }).initialized = true;

/** Pull the MaxCore payload from the most recent infer() call. */
function lastPayload(): Record<string, unknown> {
  const calls = mockInfer.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][1] as Record<string, unknown>;
}

describe("Self-Evolution posting_optimization → unifiedAIController.generateContent (manual button)", () => {
  beforeEach(() => {
    resetRegistry();
    vi.clearAllMocks();
    mockInfer.mockResolvedValue({
      hook: "Big news",
      body: "Listen now",
      cta: "Check it out",
      caption: "Big news\n\nListen now\n\nCheck it out",
      hashtags: ["#music"],
    });
  });

  it("injects neither content_type nor objective when no knob is active", async () => {
    const res = await controller.generateContent({
      tone: "energetic",
      platform: "instagram" as never,
      topic: "new single",
    });
    expect(res.success).toBe(true);
    const payload = lastPayload();
    expect(payload.objective).toBeUndefined();
    expect(payload.content_type).toBeUndefined();
  });

  it("engagementTargeting='high' forwards objective='engagement', and reverts on rollback", async () => {
    await evolutionRegistry.apply({
      upgradeId: "up-uni-eng",
      changeId: "chg-uni-eng",
      category: "posting_optimization",
      title: "Prioritize engagement",
      source: "tavily",
      payload: { platform: "instagram", engagementTargeting: "high" },
    });

    await controller.generateContent({
      tone: "energetic",
      platform: "instagram" as never,
      topic: "eng-on",
    });
    expect(lastPayload().objective).toBe("engagement");

    // Rollback reverts the consumer to its prior (no-override) behavior.
    await evolutionRegistry.deactivateAll();
    await controller.generateContent({
      tone: "energetic",
      platform: "instagram" as never,
      topic: "eng-off",
    });
    expect(lastPayload().objective).toBeUndefined();
  });

  it("contentFormatPriority biases content_type only when the caller did not pin one", async () => {
    await evolutionRegistry.apply({
      upgradeId: "up-uni-fmt",
      changeId: "chg-uni-fmt",
      category: "posting_optimization",
      title: "Short-form video priority",
      source: "rss",
      payload: {
        platform: "instagram",
        contentFormatPriority: ["video", "reel"],
      },
    });

    // Caller left contentType undefined → biased toward video → behind-the-scenes.
    await controller.generateContent({
      tone: "energetic",
      platform: "instagram" as never,
      topic: "fmt-unpinned",
    });
    expect(lastPayload().content_type).toBe("behind-the-scenes");

    // Caller pinned a contentType → bias must NOT override it.
    await controller.generateContent({
      tone: "energetic",
      platform: "instagram" as never,
      topic: "fmt-pinned",
      contentType: "announcement",
    });
    expect(lastPayload().content_type).toBe("announcement");

    // Rollback reverts: no knob → no content_type injected for an unpinned caller.
    await evolutionRegistry.deactivateAll();
    await controller.generateContent({
      tone: "energetic",
      platform: "instagram" as never,
      topic: "fmt-reverted",
    });
    expect(lastPayload().content_type).toBeUndefined();
  });
});

describe("applyPostingOptimization — content-type/objective bias (unified controller)", () => {
  type WithApply = {
    applyPostingOptimization(
      platform: string | undefined,
      callerContentType: string | undefined,
    ): { contentType?: string; objective?: "engagement" };
  };
  const svc = controller as unknown as WithApply;

  beforeEach(() => {
    resetRegistry();
    vi.clearAllMocks();
  });

  it("maps carousel → engagement when unpinned, and respects a pinned contentType", async () => {
    await evolutionRegistry.apply({
      upgradeId: "up-uni-fmt2",
      changeId: "chg-uni-fmt2",
      category: "posting_optimization",
      title: "Carousel priority",
      source: "exa",
      payload: {
        platform: "tiktok",
        contentFormatPriority: ["carousel", "image"],
      },
    });

    // Unpinned → biased toward carousel → engagement.
    expect(svc.applyPostingOptimization("tiktok", undefined).contentType).toBe(
      "engagement",
    );

    // Pinned → caller choice wins.
    expect(
      svc.applyPostingOptimization("tiktok", "promotional").contentType,
    ).toBe("promotional");
  });

  it("returns nothing extra when there is no active knob", async () => {
    const out = svc.applyPostingOptimization("instagram", undefined);
    expect(out.objective).toBeUndefined();
    expect(out.contentType).toBeUndefined();
  });
});
