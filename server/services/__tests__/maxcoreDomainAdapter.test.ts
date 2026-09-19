import { describe, expect, it } from "vitest";
import {
  generateAdsDirect,
  generateSocialDirect,
  getSocialAutopilotDirect,
  type MaxCoreTransport,
} from "../maxcoreDomainAdapter.js";

describe("MaxCore domain adapter contracts", () => {
  it("sends the current social schema and preserves variants", async () => {
    let sentPath = "";
    let sentBody: Record<string, unknown> = {};
    const transport: MaxCoreTransport = async (path, body) => {
      sentPath = path;
      sentBody = body;
      return {
        success: true,
        user_id: "u1",
        platform: "instagram",
        topic: "release",
        variants: [{
          variant: 1,
          hook: "Listen",
          body: "New release",
          cta: "Stream now",
          caption: "Listen\nNew release\nStream now",
          hashtags: ["#newmusic"],
          source: "model",
        }],
      } as never;
    };
    const result = await generateSocialDirect(
      {
        userId: "u1",
        platform: "instagram",
        topic: "release",
        numVariants: 1,
        intent: "announce",
        direction: { pacing: "slow" },
        context: { releaseId: "r1" },
        awareness: { avoid: ["hype"] },
      },
      transport,
    );
    expect(sentPath).toBe("/api/platform/social/generate");
    expect(sentBody).toMatchObject({ user_id: "u1", num_variants: 1 });
    expect(sentBody).toMatchObject({
      intent: "announce",
      direction: { pacing: "slow" },
      context: { releaseId: "r1" },
      awareness: { avoid: ["hype"] },
    });
    expect(result.variants[0].caption).toBe("Listen\nNew release\nStream now");
  });

  it("sends the current ads schema and rejects empty output", async () => {
    let sentBody: Record<string, unknown> = {};
    const transport: MaxCoreTransport = async (_path, body) => {
      sentBody = body;
      return {
        success: true,
        user_id: "u2",
        platform: "meta",
        ad_type: "video",
        product: "Single",
        goal: "streams",
        creatives: [
          { hook: "Hear it", headline: "Out now", body: "Play it", cta: "Listen", source: "model" },
        ],
        targeting: { primary_interests: ["hip-hop"] },
      } as never;
    };
    const result = await generateAdsDirect(
      {
        userId: "u2",
        platform: "meta",
        product: "Single",
        budgetDaily: 25,
        intent: "pre-save",
        direction: "understated",
        context: { campaignId: "c1" },
        awareness: { audienceState: "warm" },
      },
      transport,
    );
    expect(sentBody).toMatchObject({ user_id: "u2", budget_daily: 25 });
    expect(sentBody).toMatchObject({
      intent: "pre-save",
      direction: "understated",
      context: { campaignId: "c1" },
      awareness: { audienceState: "warm" },
    });
    expect(result.creatives[0].headline).toBe("Out now");
    await expect(
      generateAdsDirect(
        { userId: "u2", platform: "meta", product: "Single" },
        async () => ({ success: true, creatives: [] }) as never,
      ),
    ).rejects.toThrow(/ad generation/i);
  });

  it("preserves social autopilot recommendations", async () => {
    const result = await getSocialAutopilotDirect(
      { userId: "u3", platform: "tiktok" },
      async () => ({
        success: true,
        user_id: "u3",
        platform: "tiktok",
        analysis: { data_points: 2 },
        recommendations: {
          next_topics: [{ topic: "studio", hook: "Watch this", cta: "Follow", source: "model" }],
          best_posting_times: ["T19:00:00Z"],
        },
        model_powered: true,
      }) as never,
    );
    expect(result.recommendations.next_topics[0].hook).toBe("Watch this");
  });

});