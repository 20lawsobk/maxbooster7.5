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

describe("authenticated async video generation contract", () => {
  it("requires an explicit topic and supported platform without synthesizing copy", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("server/routes/socialMedia.ts", "utf8"),
    );
    const start = source.indexOf('"/generate-video"');
    const pollStart = source.indexOf('"/video-job/:jobId"', start);
    const handler = source.slice(start, pollStart);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(pollStart).toBeGreaterThan(start);
    expect(handler).toContain("A supported platform is required");
    expect(handler).toContain(
      "URL topics are not supported here; use the URL analysis workflow",
    );
    expect(handler).toContain(
      "const resolvedTopic = topicText || hookText || bodyText",
    );
    expect(handler).not.toContain('"new music"');
    expect(handler).not.toContain('platform || "tiktok"');
    expect(handler).not.toContain("music platform promotional video");
    expect(handler).not.toContain("url=${result");
    expect(handler).toContain("userId,");
  });

  it("keeps async video errors private and polling bound to the session owner", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("server/routes/socialMedia.ts", "utf8"),
    );
    const pollStart = source.indexOf('"/video-job/:jobId"');
    const pollEnd = source.indexOf('"/video-templates"', pollStart);
    const handler = source.slice(pollStart, pollEnd);

    expect(pollStart).toBeGreaterThanOrEqual(0);
    expect(pollEnd).toBeGreaterThan(pollStart);
    expect(handler).toContain("ffmpegJob.userId !== req.user?.id");
    expect(handler).toContain('const jobErr = "Video generation failed"');
    expect(handler).not.toContain("ffmpegJob.error ??");
  });
});

describe("explicit social generation inputs and private failures", () => {
  it("rejects missing or unsupported social-generation inputs and incomplete output", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("server/routes/socialMedia.ts", "utf8"),
    );
    const start = source.indexOf('"/generate-content"');
    const end = source.indexOf("function getOptimalPostTime", start);
    const handler = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(handler).toContain("At least one target platform is required");
    expect(handler).toContain("Each target platform must be supported and unique");
    expect(handler).toContain("A non-empty topic of at most 4000 characters is required");
    expect(handler).toContain("typeof result?.data?.caption === \"string\"");
    expect(handler).toContain("success: completeSuccess");
    expect(handler).toContain('"partial"');
    expect(handler).not.toContain('topic = "new music"');
    expect(handler).not.toContain('topic: topic || "music"');
    expect(handler).not.toContain(".filter((p: string)");
  });

  it("requires explicit direction in music-video studio and redacts its failures", async () => {
    const [route, service, client] = await Promise.all([
      import("node:fs/promises").then((fs) =>
        fs.readFile("server/routes/socialMedia.ts", "utf8"),
      ),
      import("node:fs/promises").then((fs) =>
        fs.readFile("server/services/musicVideoStudioService.ts", "utf8"),
      ),
      import("node:fs/promises").then((fs) =>
        fs.readFile("client/src/components/content/ServerVideoGenerator.tsx", "utf8"),
      ),
    ]);
    const start = route.indexOf('"/generate-music-video"');
    const end = route.indexOf('"/music-video-job/:jobId"', start);
    const handler = route.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(handler).toContain("hasExplicitDirection");
    expect(handler).toContain("hasUrlDirection");
    expect(handler).toContain(
      "URL topics are not supported here; use the URL analysis workflow",
    );
    expect(handler).toContain("musicVideoJobOwners.set(jobId, authenticatedUserId)");
    expect(handler).toContain('error: "Music video generation failed"');
    expect(handler).not.toContain("error: studioResult.error");
    expect(handler).not.toContain("error: result.error");
    expect(handler).not.toContain("complete — durable MaxCore/PDIM asset ${result.url}");
    expect(service).toContain("topic: bodyText || hook");
    expect(service).not.toContain("`${artistName} music video`");
    expect(client).toContain("Enter a hook or topic so MaxCore has explicit direction");
    expect(client).toContain("(required)</span>");
  });

  it("does not return or log MaxCore video diagnostics on failed renders", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("server/services/advancedVideoRendererService.ts", "utf8"),
    );

    expect(source).toContain('error: "Video generation failed"');
    expect(source).not.toContain("video generation returned HTTP");
    expect(source).not.toContain("video generation returned non-JSON");
    expect(source).not.toContain("still ${status.status}");
    expect(source).not.toContain("Job ${jobId} timed out");
    expect(source).not.toContain("error: status.error");
  });
});