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

  it.each(["admin-owner", "regular-owner"])(
    "routes %s social autopilot generation to its account curriculum",
    async (userId) => {
      mocks.maxCoreRequest
        .mockResolvedValueOnce({
          domain: "social",
          version: "trained-1",
          session_count: 7,
          weights: { ready: true },
        })
        .mockResolvedValueOnce({
          success: true,
          platform: "instagram",
          variants: [
            {
              body: "A new release is here",
              source: "model",
            },
          ],
        });

      const model = await aiModelManager.getSocialAutopilot(userId);
      const recommendations = await model.generateContentRecommendations("release");

      expect(recommendations[0]?.content).toBe("A new release is here");
      expect(mocks.maxCoreRequest).toHaveBeenNthCalledWith(
        1,
        "/api/models/social/state",
        { method: "GET", authScope: "admin" },
      );
      expect(mocks.maxCoreRequest).toHaveBeenNthCalledWith(
        2,
        "/api/platform/social/generate",
        expect.objectContaining({
          method: "POST",
          authScope: "generation",
          userId,
          body: expect.objectContaining({ user_id: userId }),
        }),
      );
    },
  );

  it.each(["admin-owner", "regular-owner"])(
    "routes %s advertising autopilot generation to MaxCore",
    async (userId) => {
      mocks.maxCoreRequest
        .mockResolvedValueOnce({
          domain: "advertising",
          version: "trained-1",
          session_count: 7,
          weights: { ready: true },
        })
        .mockResolvedValueOnce({
          success: true,
          platform: "instagram",
          creatives: [
            {
              content_type: "text",
              headline: "New release",
              body: "Listen to the new track",
              source: "model",
            },
          ],
        });

      const model = await aiModelManager.getAdvertisingAutopilot(userId);
      const recommendations = await model.generateCampaignRecommendations(
        "awareness",
        { platform: "instagram", product: "new release", mediaType: "text" },
      );

      expect(recommendations[0]?.content).toBe("Listen to the new track");
      expect(mocks.maxCoreRequest).toHaveBeenNthCalledWith(
        1,
        "/api/models/advertising/state",
        { method: "GET", authScope: "admin" },
      );
      expect(mocks.maxCoreRequest).toHaveBeenNthCalledWith(
        2,
        "/api/platform/ads/generate",
        expect.objectContaining({
          method: "POST",
          authScope: "generation",
          userId,
          body: expect.objectContaining({
            user_id: userId,
            platform: "instagram",
            product: "new release",
            goal: "awareness",
          }),
        }),
      );
    },
  );
});