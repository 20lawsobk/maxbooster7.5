import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock("../../server/services/maxcoreClient.js", () => ({
  MaxCoreAIClient: { generate: mocks.generate },
}));

import {
  SOCIAL_URL_MAXCORE_ENDPOINT,
  buildSocialUrlMaxCoreRequest,
  generateSocialUrlWithMaxCore,
  normalizeSocialUrlMaxCoreResponse,
} from "../../server/services/socialUrlMaxCoreTransport.js";

describe("social URL to MaxCore transport contract", () => {
  beforeEach(() => vi.resetAllMocks());

  it("keeps the exact URL as topic and forwards every mounted UI control", () => {
    expect(
      buildSocialUrlMaxCoreRequest({
        url: "  https://artist.example/releases/night-drive?ref=social  ",
        platform: "threads",
        userId: "user-42",
        tone: "inspirational",
        format: "video",
        targetAudience: "electronic music fans",
        hashtagStrategy: "niche",
        captionLength: "short",
        callToActionStrength: "high",
        genre: "electronic",
        contentType: "track",
        intent: "announce",
        direction: { visual: "neon noir" },
        context: { releaseId: "release-9" },
        awareness: { avoid: ["comedy"] },
      }),
    ).toEqual({
      user_id: "user-42",
      topic: "https://artist.example/releases/night-drive?ref=social",
      platform: "instagram",
      tone: "inspirational",
      output_format: "video",
      num_variants: 1,
      target_audience: "electronic music fans",
      hashtag_strategy: "niche",
      caption_length: "short",
      call_to_action_strength: "high",
      genre: "electronic",
      content_type: "track",
      intent: "announce",
      direction: { visual: "neon noir" },
      context: { releaseId: "release-9" },
      awareness: { avoid: ["comedy"] },
    });
  });

  it("calls the dedicated MaxCore social endpoint and reads variants[0]", async () => {
    mocks.generate.mockResolvedValue({
      variants: [
        {
          hook: "A real hook",
          body: "A real body",
          cta: "Listen now",
          caption: "MaxCore caption",
          hashtags: ["#NightDrive"],
        },
        { caption: "second variant" },
      ],
    });

    const result = await generateSocialUrlWithMaxCore({
      url: "https://artist.example/night-drive",
      platform: "tiktok",
      userId: "user-42",
      tone: "promotional",
      format: "text",
    });

    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.generate).toHaveBeenCalledWith(
      SOCIAL_URL_MAXCORE_ENDPOINT,
      expect.objectContaining({
        user_id: "user-42",
        topic: "https://artist.example/night-drive",
        platform: "tiktok",
      }),
    );
    expect(result).toEqual({
      hook: "A real hook",
      body: "A real body",
      cta: "Listen now",
      caption: "MaxCore caption",
      hashtags: ["#NightDrive"],
    });
  });

  it("does not fabricate content when MaxCore returns no usable variant", () => {
    expect(normalizeSocialUrlMaxCoreResponse(null)).toBeNull();
    expect(normalizeSocialUrlMaxCoreResponse({ variants: [] })).toBeNull();
    expect(
      normalizeSocialUrlMaxCoreResponse({ variants: [{ hashtags: ["#only"] }] }),
    ).toBeNull();
  });

  it("constructs caption only from actual structured MaxCore fields", () => {
    expect(
      normalizeSocialUrlMaxCoreResponse({
        variants: [{ hook: "Hook", body: "Body", cta: "CTA", hashtags: [] }],
      }),
    ).toEqual({
      hook: "Hook",
      body: "Body",
      cta: "CTA",
      caption: "Hook\n\nBody\n\nCTA",
      hashtags: [],
    });
  });
});

describe("mounted Social Media URL UI wiring", () => {
  it("posts the page-level URL composer to its social backend contract", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("client/src/pages/SocialMedia.tsx", "utf8"),
    );
    expect(source).toContain(
      'apiRequest("POST", "/api/social/generate-from-url"',
    );
    expect(source).toContain(
      'apiRequest("POST", "/api/multimodal/generate"',
    );
    expect(source).toContain(
      "MaxCore did not render any ${outputModality} assets",
    );
    expect(source).toContain("mediaByPlatform.get(item.platform)");
    expect(source).toContain('item.format === "image" && item.mediaUrl');
    expect(source).toContain('item.format === "audio" && item.mediaUrl');
    expect(source).toContain('item.format === "video" && item.mediaUrl');
    expect(source).toContain("<VideoPlayer");
    expect(source).toContain(
      "...new Set(data.platforms.flatMap(expandPlatform))",
    );
    expect(source).toContain("data.generatedContent");
    expect(source).toContain("data.failedPlatforms");

    const backendSource = await import("node:fs/promises").then((fs) =>
      fs.readFile("server/routes/socialMedia.ts", "utf8"),
    );
    const handlerStart = backendSource.indexOf('"/generate-from-url"');
    const handlerEnd = backendSource.indexOf(
      "// GET /api/social/scheduled",
      handlerStart,
    );
    const handler = backendSource.slice(handlerStart, handlerEnd);
    expect(handler).toContain("generateSocialUrlWithMaxCore");
    expect(handler).toContain("failedPlatforms");
    expect(handler).not.toContain("getUnifiedAI()");
  });
});