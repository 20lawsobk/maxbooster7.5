import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import vm from "node:vm";
import ts from "typescript";
import {
  createVideoJobPollHandler,
  rejectInvalidMusicVideoSceneRequest,
} from "../../server/routes/socialMediaJobHandlers.js";
import { cleanupMediaUploadFiles } from "../../server/services/mediaUploadCleanup.js";

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

    const urlMutationStart = source.indexOf(
      'apiRequest("POST", "/api/social/generate-from-url"',
    );
    const urlMutationEnd = source.indexOf(
      "const mediaResult = await mediaResponse.json()",
      urlMutationStart,
    );
    const urlMutation = source.slice(urlMutationStart, urlMutationEnd);
    expect(urlMutation).toContain('modality: "text"');
    expect(urlMutation).toContain("socialResult.generatedContent");
    expect(urlMutation).toContain("socialResult.metadata");
    expect(urlMutation).not.toContain('modality: "url"');
    expect(urlMutation).not.toContain("payload: data.url");

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
    expect(handler).toContain("verifiedSourceContext");
    expect(handler).toContain("Untrusted source-page metadata");
    expect(handler).toContain("failedPlatforms");
    expect(handler).not.toContain("firstPartySource && format !==");
    expect(handler).not.toContain("supports text drafts only");
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
    const tree = ts.createSourceFile("socialMedia.ts", source, ts.ScriptTarget.Latest, true);
    const registrations = tree.statements.filter(node => ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) && node.expression.expression.getText(tree) === "router.get" &&
      ts.isStringLiteral(node.expression.arguments[0]) && node.expression.arguments[0].text === "/video-job/:jobId");
    expect(registrations).toHaveLength(1);
    const router = express.Router();
    const get = vi.fn(async (_family: string, _id: string, owner: string) => owner === "owner"
      ? { status: "done", result: { url: "/api/files/owned-video" } } : undefined);
    const requireAuthOnly = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const owner = req.get("X-Fixture-Owner");
      if (!owner) return void res.status(401).json({ error: "Authentication required" });
      req.user = { id: owner } as Express.User;
      next();
    };
    // Execute the actual mounted registration with the production polling
    // handler. The real-PG Node suite separately proves row-owner isolation.
    vm.runInNewContext(ts.transpileModule(registrations[0].getText(tree), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText, { router, requireAuthOnly, createVideoJobPollHandler, mediaJobs: { get } });
    const app = express(); app.use(router);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/video-job/video-owned`;
      expect((await fetch(url)).status).toBe(401);
      expect(get).not.toHaveBeenCalled();
      const foreign = await fetch(url, { headers: { "X-Fixture-Owner": "foreign" } });
      expect(foreign.status).toBe(404);
      expect(await foreign.json()).not.toHaveProperty("url");
      expect(get).toHaveBeenLastCalledWith("video", "video-owned", "foreign");
      const owned = await fetch(url, { headers: { "X-Fixture-Owner": "owner" } });
      expect(owned.status).toBe(200);
      expect(await owned.json()).toMatchObject({ status: "completed", url: "/api/files/owned-video" });
      expect(get).toHaveBeenLastCalledWith("video", "video-owned", "owner");
      get.mockRejectedValueOnce(new Error("private provider response and credential"));
      const unavailable = await fetch(url, { headers: { "X-Fixture-Owner": "owner" } });
      expect(unavailable.status).toBe(503);
      expect(await unavailable.json()).toEqual({ success: false, status: "error", message: "Job status is temporarily unavailable" });
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});

describe("explicit social generation inputs and private failures", () => {
  it("keeps one active manual social route on the dedicated MaxCore adapter", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("server/routes/socialMedia.ts", "utf8"),
    );
    const routeRegistrations =
      source.match(/router\.post\(\s*["']\/generate-content["']/g) ?? [];
    const start = source.indexOf('"/generate-content"');
    const end = source.indexOf('"/generate-from-url"', start);
    const handler = source.slice(start, end);

    expect(routeRegistrations).toHaveLength(1);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(handler).toContain("manualSocialGenerationSchema.safeParse");
    expect(handler).toContain("generateSocialDirect");
    expect(handler).toContain("Promise.allSettled");
    expect(handler).toContain("failedPlatforms");
    expect(handler).not.toContain("getUnifiedAI()");
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
    const tree = ts.createSourceFile("socialMedia.ts", route, ts.ScriptTarget.Latest, true);
    const registrations = tree.statements.filter(node => ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) && node.expression.expression.getText(tree) === "router.post" &&
      ts.isStringLiteral(node.expression.arguments[0]) && node.expression.arguments[0].text === "/generate-music-video");
    expect(registrations).toHaveLength(1);
    const router = express.Router();
    const create = vi.fn().mockRejectedValue(new Error("private database diagnostic"));
    const requireAuthOnly = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const owner = req.get("X-Fixture-Owner");
      if (!owner) return void res.status(401).json({ error: "Authentication required" });
      req.user = { id: owner } as Express.User;
      next();
    };
    vm.runInNewContext(ts.transpileModule(registrations[0].getText(tree), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      router, requireAuthOnly, rejectInvalidMusicVideoSceneRequest, cleanupMediaUploadFiles,
      mediaJobs: { create }, VALID_PLATFORMS: ["tiktok"],
      handleMediaUpload: (middleware: express.RequestHandler) => middleware,
      mediaUpload: { fields: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        req.files = req.body.fixtureAudio ? { audio: [{ path: "" } as Express.Multer.File] } : {};
        next();
      } },
    });
    const app = express(); app.use(express.json()); app.use(router);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/generate-music-video`;
      const send = (body: Record<string, unknown>, owner?: string) => fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", ...(owner ? { "X-Fixture-Owner": owner } : {}) },
        body: JSON.stringify(body),
      });
      expect((await send({})).status).toBe(401);
      const valid = { ai_generate_scenes: "true", platform: "tiktok", topic: "My release", fixtureAudio: true };
      for (const [overrides, message] of [
        [{ topic: "" }, "A video topic, hook, or body is required"],
        [{ topic: "https://source.invalid/music" }, "URL topics are not supported here; use the URL analysis workflow"],
        [{ platform: "invalid" }, "A supported platform is required for video generation"],
        [{ fixtureAudio: false }, "An audio file is required for music video generation"],
      ] as const) {
        const response = await send({ ...valid, ...overrides }, "owner");
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ success: false, error: message });
      }
      expect(create).not.toHaveBeenCalled();
      const admitted = await send(valid, "owner");
      expect(admitted.status).toBe(503);
      expect(await admitted.json()).toEqual({ success: false, error: "Unable to save render job. Please try again." });
      expect(create).toHaveBeenCalledWith("music-video", expect.stringMatching(/^mvjob_/), "owner");
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
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

  it("uses shared MaxCore transport for video submission and owner-bound polling", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("server/services/advancedVideoRendererService.ts", "utf8"),
    );
    const start = source.indexOf("async function maxCoreOwnedRequest");
    const end = source.indexOf("// ── MaxCore video URL cache", start);
    const transport = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(transport).toContain("MaxCoreAIClient.generate<T>");
    expect(transport).toContain("MaxCoreAIClient.poll<T>");
    expect(transport).toContain("45_000");
    expect(transport).not.toContain("await fetch(");
  });
});