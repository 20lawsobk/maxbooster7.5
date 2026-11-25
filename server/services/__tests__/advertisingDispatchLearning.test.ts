import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  collectEngagementData: vi.fn(),
  recordPerformance: vi.fn(),
}));

vi.mock("../../db.js", () => ({
  db: {
    select: () => {
      const result = mocks.selectResults.shift() ?? [];
      const query: any = {
        from: () => query,
        where: () => query,
        limit: async () => result,
        then: (
          resolve: (value: unknown) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    },
    update: () => ({
      set: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
  },
}));
vi.mock("../../storage.js", () => ({ storage: {} }));
vi.mock("../../platform-apis.js", () => ({
  platformAPI: { collectEngagementData: mocks.collectEngagementData },
}));
vi.mock("../../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../autopilotLearningService.js", () => ({
  autopilotLearningService: { recordPerformance: mocks.recordPerformance },
}));
vi.mock("@shared/schema", () => ({
  adCampaigns: { id: {}, userId: {}, status: {}, organicMetrics: {}, metadata: {} },
  adCreatives: { id: {}, userId: {}, campaignId: {} },
  contentCalendar: {},
  socialAccounts: {},
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
}));

import { advertisingDispatchService } from "../advertisingDispatchService.js";

describe("advertising campaign MaxCore learning", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.selectResults.length = 0;
    mocks.recordPerformance.mockResolvedValue("learning-record-1");
  });

  it("sends changed, measured organic campaign results to the campaign owner's curriculum", async () => {
    mocks.selectResults.push(
      [
        {
          id: "campaign-1",
          userId: "admin-owner",
          metadata: { source: "advertising-autopilot" },
          organicMetrics: {
            activatedAt: "2026-11-10T10:00:00.000Z",
            posts: [
              {
                platform: "instagram",
                postId: "platform-post-1",
                creativeId: "creative-1",
                postedAt: "2026-11-10T10:00:00.000Z",
                metrics: {
                  impressions: 0,
                  engagements: 0,
                  reach: 0,
                  engagementRate: 0,
                },
              },
            ],
          },
        },
      ],
      [
        {
          id: "creative-1",
          userId: "admin-owner",
          description: "New release out now #music",
          headline: "New release",
          mediaUrl: null,
        },
      ],
    );
    mocks.collectEngagementData.mockResolvedValue({
      impressions: 100,
      likes: 4,
      comments: 2,
      shares: 1,
      reach: 90,
      engagementRate: 7,
    });

    await advertisingDispatchService.collectCampaignEngagement(
      "campaign-1",
      "admin-owner",
    );

    expect(mocks.recordPerformance).toHaveBeenCalledWith(
      "admin-owner",
      expect.objectContaining({
        platform: "instagram",
        contentType: "advertising_campaign_post",
        contentText: "New release out now #music",
        postId: "platform-post-1",
        metadata: expect.objectContaining({
          source: "advertising_autopilot",
          campaignId: "campaign-1",
          creativeId: "creative-1",
        }),
      }),
      expect.objectContaining({
        impressions: 100,
        likes: 4,
        comments: 2,
        shares: 1,
        reach: 90,
        engagementRate: 7,
      }),
    );
  });

  it("does not resend unchanged metrics as a new learning observation", async () => {
    const metrics = {
      impressions: 100,
      likes: 4,
      comments: 2,
      shares: 1,
      saves: 0,
      clicks: 0,
      engagements: 7,
      reach: 90,
      engagementRate: 7,
    };
    mocks.selectResults.push(
      [
        {
          id: "campaign-1",
          userId: "creator-1",
          metadata: { source: "advertising-autopilot" },
          organicMetrics: {
            posts: [
              {
                platform: "instagram",
                postId: "platform-post-1",
                creativeId: "creative-1",
                metrics,
              },
            ],
          },
        },
      ],
      [{ id: "creative-1", userId: "creator-1", description: "Post copy" }],
    );
    mocks.collectEngagementData.mockResolvedValue({
      impressions: 100,
      likes: 4,
      comments: 2,
      shares: 1,
      reach: 90,
      engagementRate: 7,
    });

    await advertisingDispatchService.collectCampaignEngagement(
      "campaign-1",
      "creator-1",
    );

    expect(mocks.recordPerformance).not.toHaveBeenCalled();
  });
});
