import { beforeEach, describe, expect, it, vi } from "vitest";

const generateSocialDirect = vi.fn();

vi.mock("../maxcoreDomainAdapter.js", () => ({
  generateSocialDirect,
}));

describe("AdvancedSocialAIService live generation", () => {
  beforeEach(() => {
    generateSocialDirect.mockReset();
  });

  it("preserves MaxCore variant order and leaves unsupported scores null", async () => {
    generateSocialDirect.mockResolvedValue({
      success: true,
      user_id: "user-1",
      platform: "instagram",
      topic: "release",
      variants: [
        {
          variant: 1,
          hook: "First",
          body: "First body",
          cta: "Listen",
          caption: "First caption",
          hashtags: ["#one"],
          source: "model",
        },
        {
          variant: 2,
          hook: "Second",
          body: "Second body",
          cta: "Save",
          caption: "Second caption",
          hashtags: ["#two"],
          source: "model",
        },
      ],
    });
    const { advancedSocialAIService } = await import(
      "../advancedSocialAIService.js"
    );
    vi.spyOn(advancedSocialAIService as any, "getUserContext").mockResolvedValue(
      {},
    );

    const result = await advancedSocialAIService.generateAdvancedContent({
      userId: "user-1",
      topic: "release",
      platforms: ["instagram"],
      objective: "engagement",
      variantCount: 2,
    });

    expect(result.variants.map((variant) => variant.content)).toEqual([
      "First caption",
      "Second caption",
    ]);
    expect(result.variants.every((variant) => variant.predictedScore === null))
      .toBe(true);
    expect(result.scoring).toBeNull();
  });

  it("uses a stable collision-resistant digest of the full caller context", async () => {
    generateSocialDirect.mockImplementation(async (request) => ({
      success: true,
      user_id: request.userId,
      platform: request.platform,
      topic: request.topic,
      variants: [
        {
          variant: 1,
          hook: "Hook",
          body: "Body",
          cta: "Listen",
          caption: `Result ${generateSocialDirect.mock.calls.length}`,
          hashtags: [],
          source: "model",
        },
      ],
    }));
    const { advancedSocialAIService } = await import(
      "../advancedSocialAIService.js"
    );
    vi.spyOn(advancedSocialAIService as any, "getUserContext").mockResolvedValue(
      {},
    );

    const base = {
      userId: "cache-context-user",
      topic: "cache collision release",
      platforms: ["instagram"],
      objective: "engagement" as const,
      direction: { pacing: "slow", palette: { accent: "blue", base: "black" } },
      context: { release: { id: "r1", phase: "announce" } },
    };

    await advancedSocialAIService.generateAdvancedContent({
      ...base,
      intent: "announce",
      awareness: { audience: "warm", constraints: { humor: false, hype: 1 } },
    });
    // Same JSON meaning with recursively reordered object keys must hit cache.
    await advancedSocialAIService.generateAdvancedContent({
      ...base,
      direction: { palette: { base: "black", accent: "blue" }, pacing: "slow" },
      context: { release: { phase: "announce", id: "r1" } },
      intent: "announce",
      awareness: { constraints: { hype: 1, humor: false }, audience: "warm" },
    });
    // Distinct structured awareness and intent must each miss independently.
    await advancedSocialAIService.generateAdvancedContent({
      ...base,
      intent: "announce",
      awareness: { audience: "cold", constraints: { humor: false, hype: 1 } },
    });
    await advancedSocialAIService.generateAdvancedContent({
      ...base,
      intent: "pre-save",
      awareness: { audience: "warm", constraints: { humor: false, hype: 1 } },
    });

    expect(generateSocialDirect).toHaveBeenCalledTimes(3);
    expect(generateSocialDirect.mock.calls.map(([request]) => request.intent))
      .toEqual(["announce", "announce", "pre-save"]);
  });
});
