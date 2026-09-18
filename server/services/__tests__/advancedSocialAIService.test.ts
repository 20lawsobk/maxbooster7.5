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
});