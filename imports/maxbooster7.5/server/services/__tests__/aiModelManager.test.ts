import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maxCoreRequest: vi.fn(),
}));

vi.mock("../maxcoreControlTransport.js", () => ({
  maxCoreControlTransport: { request: mocks.maxCoreRequest },
}));
vi.mock("../../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

import { aiModelManager } from "../aiModelManager.js";

describe("AIModelManager MaxCore engagement transport", () => {
  beforeEach(() => vi.resetAllMocks());

  it("sends the authenticated prediction request to MaxCore without local inference", async () => {
    const response = { success: true, engagement_score: 0.8 };
    mocks.maxCoreRequest.mockResolvedValue(response);

    await expect(
      aiModelManager.predictEngagement("creator-1", {
        platform: "instagram",
        content: "New release #music",
        extraContext: { contentFeatures: { hasHashtags: true } },
      }),
    ).resolves.toEqual(response);

    expect(mocks.maxCoreRequest).toHaveBeenCalledWith(
      "/predict/engagement",
      {
        method: "POST",
        authScope: "generation",
        userId: "creator-1",
        timeoutMs: 60_000,
        body: {
          platform: "instagram",
          action: "predict_engagement",
          content: "New release #music",
          extra_context:
            '{"contentFeatures":{"hasHashtags":true}}',
        },
      },
    );
  });

  it("preserves MaxCore prediction failures", async () => {
    const upstreamError = new Error("MaxCore returned 503");
    mocks.maxCoreRequest.mockRejectedValue(upstreamError);

    await expect(
      aiModelManager.predictEngagement("creator-1", {
        platform: "instagram",
        content: "New release",
      }),
    ).rejects.toBe(upstreamError);
  });
});