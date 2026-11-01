import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockMaxCoreControlError extends Error {
    constructor(
      message: string,
      readonly status = 503,
      readonly details?: unknown,
    ) {
      super(message);
      this.name = "MaxCoreControlError";
    }
  }

  return {
    queryLimit: vi.fn(),
    maxCoreRequest: vi.fn(),
    MockMaxCoreControlError,
  };
});

vi.mock("../../db.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: mocks.queryLimit }),
        }),
      }),
    }),
  },
}));
vi.mock("@shared/schema", () => ({
  autopilotLearningData: { userId: {}, createdAt: {} },
  autopilotInsights: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn(),
  avg: vi.fn(),
  count: vi.fn(),
}));
vi.mock("../../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../maxcoreSync.js", () => ({ pushTrainingFeedback: vi.fn() }));
vi.mock("../maxcoreControlTransport.js", () => ({
  MaxCoreControlError: mocks.MockMaxCoreControlError,
  maxCoreControlTransport: { request: mocks.maxCoreRequest },
}));

import { autopilotLearningService } from "../autopilotLearningService.js";

describe("autopilot learning MaxCore integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("forwards measured user history and optional context to MaxCore autopilot", async () => {
    const createdAt = new Date("2026-09-29T15:00:00.000Z");
    mocks.queryLimit.mockResolvedValue([
      {
        platform: "tiktok",
        contentType: "video",
        hookType: "story",
        engagementRate: 4.2,
        createdAt,
      },
    ]);
    mocks.maxCoreRequest.mockResolvedValue({
      success: true,
      model_powered: true,
      analysis: {
        avg_engagement_rate: 4.2,
        top_style_tags: ["story"],
        best_content_type: "video",
        data_points: 1,
      },
      recommendations: {
        next_topics: [
          {
            topic: "Studio process",
            hook: "A look behind the track",
            cta: "Watch the process",
            source: "model",
          },
        ],
        best_posting_times: ["18:00"],
        content_type: "video",
        style_focus: ["story"],
      },
    });

    const result = await autopilotLearningService.getRecommendations(
      "creator-1",
      {
        platform: "tiktok",
        contentType: "video",
        extraContext: { mood: "reflective" },
      },
    );

    expect(mocks.maxCoreRequest).toHaveBeenCalledWith(
      "/platform/social/autopilot",
      {
        method: "POST",
        authScope: "generation",
        userId: "creator-1",
        timeoutMs: 600_000,
        body: {
          user_id: "creator-1",
          platform: "tiktok",
          target_metric: "engagement",
          recent_posts: [
            {
              content_type: "video",
              style_tags: ["story"],
              engagement_rate: 4.2,
              posted_at: createdAt,
            },
          ],
          content_themes: ["video"],
          extra_context: '{"mood":"reflective"}',
        },
      },
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "content",
          title: "Studio process",
          description: "A look behind the track",
          data: expect.objectContaining({ source: "maxcore" }),
        }),
      ]),
    );
  });

  it("rejects unpowered MaxCore recommendations instead of presenting them as model output", async () => {
    mocks.queryLimit.mockResolvedValue([]);
    mocks.maxCoreRequest.mockResolvedValue({
      success: true,
      model_powered: false,
      analysis: {
        avg_engagement_rate: 0,
        top_style_tags: [],
        best_content_type: "post",
        data_points: 0,
      },
      recommendations: {
        next_topics: [{ topic: "Default", hook: "Default", source: "model" }],
        best_posting_times: [],
      },
    });

    await expect(
      autopilotLearningService.getRecommendations("creator-1"),
    ).rejects.toMatchObject({
      name: "MaxCoreControlError",
      status: 503,
    });
  });
});