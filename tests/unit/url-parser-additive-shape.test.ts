/**
 * Additivity lock-in for the advanced-URL-parser feature in AutopilotEngine.
 *
 * The hard guarantee: when NO source URL is configured (the default), the
 * objects produced by the autopilot pipeline must be BYTE-FOR-BYTE identical to
 * the pre-feature behavior — no `undefined`-valued own keys leaked by the new
 * conditional spreads. A previous iteration regressed this (genre/artistName/
 * promotionContext:undefined on the generation request, sourceUrl:undefined on
 * the queue item). These tests drive the REAL engine merge logic (only the
 * content generator, the URL parser, evolutionRegistry's disk load, the logger
 * and the heavy peripheral imports are stubbed) and assert:
 *
 *   1. With no URL brief, the generateAdvancedContent request carries NO
 *      genre/artistName/promotionContext own keys, and topic/contentType keep
 *      their original topic-only values.
 *   2. With a brief, those fields ARE injected and topic/contentType are
 *      overridden by the brief.
 *   3. The content queue item carries NO `sourceUrl` key with no sources, and
 *      DOES carry it when a configured source yields a brief.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Heavy peripheral imports the engine module pulls in — trivial stubs so the
// module (and its bottom-of-file singleton) loads without booting real SDKs.
vi.mock("../../server/platform-apis.js", () => ({ platformAPI: {} }));
vi.mock("../../server/services/autopilotLearningService.js", () => ({
  autopilotLearningService: {},
}));

// Stub the Self-Evolution registry to a reachable "no active override" state so
// the URL-brief merge logic runs in isolation (registry behavior itself is
// covered by the posting-optimization tests). getContentOptimization must return
// an object — the engine reads it without a null guard — while
// getPostingOptimization is consulted null-safely at the call site.
vi.mock("../../server/services/evolutionRegistry.js", () => ({
  evolutionRegistry: {
    getContentOptimization: () => ({}),
    getPostingOptimization: () => null,
  },
}));

// Capture the request object handed to the content generator — the seam whose
// no-URL shape must stay byte-for-byte identical.
const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));
vi.mock("../../server/services/advancedSocialAIService.js", () => ({
  advancedSocialAIService: { generateAdvancedContent: mockGenerate },
}));

// Control resolveUrlBrief's output deterministically — no network fetch.
const { mockToContentBrief } = vi.hoisted(() => ({
  mockToContentBrief: vi.fn(),
}));
vi.mock("../../server/services/advancedUrlParser.js", () => ({
  advancedUrlParser: {
    parseUrl: vi.fn().mockResolvedValue({}),
    toContentBrief: mockToContentBrief,
  },
}));

import { AutopilotEngine } from "../../server/autopilot-engine.js";

type GenObj = Record<string, unknown>;
type QueueItem = Record<string, unknown>;
type EnginePrivate = {
  config: {
    sourceUrls?: string[];
    targetAudience: string;
    businessGoals: string[];
  };
  generateContentForAutopilot(p: {
    topic: string;
    platform: string;
    brandVoice: string;
    contentType: string;
    targetAudience: string;
    businessGoals: string[];
    urlBrief?: unknown;
  }): Promise<unknown>;
  executeContentGeneration(job: unknown): Promise<void>;
  contentQueue: Map<string, QueueItem[]>;
};

function newEngine(): EnginePrivate {
  return new AutopilotEngine("test-user") as unknown as EnginePrivate;
}

function lastGenObj(): GenObj {
  expect(mockGenerate.mock.calls.length).toBeGreaterThan(0);
  return mockGenerate.mock.calls[
    mockGenerate.mock.calls.length - 1
  ][0] as GenObj;
}

const JOB = {
  id: "job-1",
  type: "content_generation",
  platform: "Instagram",
  status: "pending",
  scheduledFor: new Date(),
  data: {
    topic: "new single",
    brandVoice: "energetic",
    contentType: "announcements",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerate.mockResolvedValue({
    scoring: { overall: 8.5 },
    viralPotential: { score: 7.2 },
    primary: {
      body: "body",
      hashtags: ["#music"],
      hook: "hook",
      callToAction: "cta",
    },
  });
});

describe("AutopilotEngine generateAdvancedContent request — URL-brief additivity", () => {
  it("omits genre/artistName/promotionContext keys entirely when no brief exists", async () => {
    const priv = newEngine();
    await priv.generateContentForAutopilot({
      topic: "new single",
      platform: "Instagram",
      brandVoice: "energetic",
      contentType: "announcements",
      targetAudience: "fans",
      businessGoals: ["brand awareness"],
    });

    const obj = lastGenObj();
    // The new optional fields must NOT be present as undefined-valued own keys.
    expect(obj).not.toHaveProperty("genre");
    expect(obj).not.toHaveProperty("artistName");
    expect(obj).not.toHaveProperty("promotionContext");
    // Existing keys keep their original topic-only values.
    expect(obj.topic).toBe("new single");
    expect(typeof obj.contentType).toBe("string");
  });

  it("injects the brief fields and overrides topic/contentType when a brief is present", async () => {
    const priv = newEngine();
    await priv.generateContentForAutopilot({
      topic: "ignored-fallback",
      platform: "Instagram",
      brandVoice: "energetic",
      contentType: "announcements",
      targetAudience: "fans",
      businessGoals: ["brand awareness"],
      urlBrief: {
        topic: "Brief Topic",
        genre: "hip-hop",
        artistName: "Artist X",
        promotionContext: "new release out now",
        contentType: "promotional",
        sourceUrl: "https://example.com/track",
      },
    });

    const obj = lastGenObj();
    expect(obj.genre).toBe("hip-hop");
    expect(obj.artistName).toBe("Artist X");
    expect(obj.promotionContext).toBe("new release out now");
    expect(obj.topic).toBe("Brief Topic");
    expect(obj.contentType).toBe("promotional");
  });
});

describe("AutopilotEngine content queue item — sourceUrl additivity", () => {
  it("does not attach a sourceUrl key when no sourceUrls are configured", async () => {
    const priv = newEngine();
    expect(priv.config.sourceUrls).toBeUndefined();

    await priv.executeContentGeneration({ ...JOB });

    const items = priv.contentQueue.get("Instagram") ?? [];
    expect(items.length).toBe(1);
    expect(items[0]).not.toHaveProperty("sourceUrl");
  });

  it("attaches sourceUrl when a configured source URL yields a brief", async () => {
    const priv = newEngine();
    priv.config.sourceUrls = ["https://example.com/track"];
    mockToContentBrief.mockReturnValue({
      topic: "Brief Topic",
      sourceUrl: "https://example.com/track",
      contentType: "promotional",
    });

    await priv.executeContentGeneration({ ...JOB });

    const items = priv.contentQueue.get("Instagram") ?? [];
    expect(items.length).toBe(1);
    expect(items[0].sourceUrl).toBe("https://example.com/track");
  });
});
