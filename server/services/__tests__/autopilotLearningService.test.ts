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
    insertReturning: vi.fn(),
    maxCoreRequest: vi.fn(),
    pushTrainingFeedback: vi.fn(),
    MockMaxCoreControlError,
  };
});

vi.mock("../../db.js", () => ({
  db: {
    select: () => {
      const query: any = {
        from: () => query,
        where: () => query,
        orderBy: () => query,
        limit: mocks.queryLimit,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve([{ count: 1 }]).then(resolve, reject),
      };
      return query;
    },
    insert: () => ({
      values: () => ({ returning: mocks.insertReturning }),
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
vi.mock("../maxcoreSync.js", () => ({
  pushTrainingFeedback: mocks.pushTrainingFeedback,
}));
vi.mock("../maxcoreControlTransport.js", () => ({
  MaxCoreControlError: mocks.MockMaxCoreControlError,
  maxCoreControlTransport: { request: mocks.maxCoreRequest },
}));

import { autopilotLearningService } from "../autopilotLearningService.js";

describe("autopilot learning MaxCore integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.queryLimit.mockResolvedValue([]);
    mocks.insertReturning.mockResolvedValue([{ id: "learning-record-1" }]);
    mocks.pushTrainingFeedback.mockResolvedValue(undefined);
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

  it("sends measured social outcomes to the matching user's MaxCore curriculum", async () => {
    await autopilotLearningService.recordPerformance(
      "admin-owner",
      {
        platform: "instagram",
        contentType: "video",
        hookType: "story",
        contentText: "A verified published post",
        postId: "post-123",
      },
      { impressions: 100, likes: 5 },
    );

    await vi.waitFor(() =>
      expect(mocks.pushTrainingFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "admin-owner",
          feedback_id: "learning-record-1",
          platform: "instagram",
          content_type: "video",
          hook_type: "story",
          engagement_rate: 5,
          trigger: "measured_autopilot_outcome",
        }),
      ),
    );
  });

  it("does not send an unmeasured publish as a training outcome", async () => {
    await autopilotLearningService.recordPerformance(
      "creator-1",
      { platform: "tiktok", contentType: "text" },
      {
        impressions: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        clicks: 0,
        saves: 0,
        reach: 0,
      },
    );

    expect(mocks.pushTrainingFeedback).not.toHaveBeenCalled();
  });

  it("does not reinforce a measured low-engagement result as a winning example", async () => {
    await autopilotLearningService.recordPerformance(
      "creator-1",
      { platform: "tiktok", contentType: "text" },
      { impressions: 100, likes: 1 },
    );

    expect(mocks.pushTrainingFeedback).not.toHaveBeenCalled();
  });

  it("does not invent a percentage when exposure counts are missing", () => {
    expect(
      autopilotLearningService.calculateEngagementScore({
        likes: 30,
        comments: 8,
      }),
    ).toBe(0);
  });
});