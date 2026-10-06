/**
 * Beat Money Loop — MaxCore observation propagation (regression test).
 *
 * When the caller leaves genre/mood/tempo unspecified, MaxCore decides them at
 * generation time and returns them as observations. Pricing, beat-record
 * creation and social campaign launch must use the OBSERVED values — not the
 * pre-generation fallbacks (trap/dark/120).
 *
 * Previously `concreteScan` was snapshotted before generation, so downstream
 * business logic priced and listed the beat under the fallback genre even when
 * MaxCore had observed a different one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";

// ── Mock the DB layer (chainable drizzle stub) ─────────────────────────────
vi.mock("../../server/db.js", () => {
  const chain: Record<string, any> = {};
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(async () => [
    { id: "test-cycle-id", status: "awaiting_sale" },
  ]);
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve([]).then(resolve, reject);
  return {
    db: {
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
    },
    pool: {
      connect: vi.fn(async () => ({
        query: vi.fn(async () => ({ rows: [{ acquired: true }] })),
        release: vi.fn(),
      })),
    },
  };
});

vi.mock("../../server/services/adaptiveGenerationEngine.js", () => ({
  recordGeneration: vi.fn(async () => undefined),
}));

vi.mock("../../server/services/advertisingDispatchService.js", () => ({
  advertisingDispatchService: {
    activateCampaign: vi.fn(),
  },
}));

// queueService throws at import when PDIM/Redis isn't configured; stub the
// queue class it exports (pulled in transitively via socialQueueService).
vi.mock("../../server/services/queueService.js", () => ({
  BoosterQueue: class {
    constructor(..._args: any[]) {}
    async add() { return { id: "mock-job" }; }
    async close() {}
  },
}));

import { beatMoneyLoopService } from "../../server/services/beatMoneyLoopService.js";
import { advertisingDispatchService } from "../../server/services/advertisingDispatchService.js";

const PRIVATES = [
  "_generateBeat",
  "_competitivePrice",
  "_createBeatRecord",
  "_launchCampaign",
  "_requireAdminId",
  "_generateMaxCoreCaption",
  "_renderAdVideo",
  "_computeNextCadenceMs",
  "_updateStateAfterCycle",
  "analyseRecentCycles",
];

function mockGeneration(observation: Record<string, unknown>) {
  return {
    observation,
    audioAbsPath: "/tmp/beat.wav",
    previewAbsPath: "/tmp/beat-preview.mp3",
    title: "Test Beat",
    audioGenBackend: "test",
    musicalKey: "C",
    scratchDir: null,
  };
}

describe("Beat Money Loop — MaxCore observation propagation", () => {
  const svc: any = beatMoneyLoopService;
  const orig: Record<string, any> = {};

  let priceGenre: string | undefined;
  let recordScan: any;
  let campaignArgs: any;

  beforeEach(() => {
    for (const m of PRIVATES) orig[m] = svc[m];
    priceGenre = undefined;
    recordScan = undefined;
    campaignArgs = undefined;

    // MaxCore pre-warm: pretend it is already awake.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => "application/json" },
      })),
    );

    svc._generateBeat = vi.fn(async () => mockGeneration({
      genre: "drill",
      mood: "aggressive",
      tempo: 140,
    }));
    svc._competitivePrice = vi.fn(async (genre: string) => {
      priceGenre = genre;
      return 29.99;
    });
    svc._createBeatRecord = vi.fn(async (args: any) => {
      recordScan = args.scan;
      return {
        beatId: "beat-1",
        listingId: "listing-1",
      };
    });
    svc._launchCampaign = vi.fn(async (args: any) => {
      campaignArgs = args;
      return {
        campaignId: "campaign-1",
        posted: true,
        reason: "Posted to connected social accounts",
      };
    });
    svc._computeNextCadenceMs = vi.fn(() => 3_600_000);
    svc._updateStateAfterCycle = vi.fn(async () => undefined);
    svc.analyseRecentCycles = vi.fn(async () => undefined);
  });

  afterEach(() => {
    for (const m of PRIVATES) svc[m] = orig[m];
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("prices and lists from MaxCore observations, then promotes the marketplace listing", async () => {
    const result = await svc.runCycle("manual", {});
    expect(result.status).toBe("awaiting_sale");
    expect(result.advertised).toBe(true);
    expect(result.campaignId).toBe("campaign-1");

    // Pricing must be based on what MaxCore actually produced…
    expect(priceGenre).toBe("drill");
    // …and the marketplace listing must carry the observed metadata.
    expect(recordScan.genre).toBe("drill");
    expect(recordScan.mood).toBe("aggressive");
    expect(recordScan.tempo).toBe(140);
    expect(campaignArgs).toMatchObject({
      cycleId: result.cycleId,
      beatId: "beat-1",
      listingId: "listing-1",
      scan: { genre: "drill", mood: "aggressive", tempo: 140 },
    });
  });

  it("honors caller-specified fields and falls back only for truly-unspecified ones", async () => {
    svc._generateBeat = vi.fn(async () => mockGeneration({}));
    const result = await svc.runCycle("manual", { genre: "afrobeats", mood: "uplifting" });
    expect(result.status).toBe("awaiting_sale");

    expect(priceGenre).toBe("afrobeats");
    expect(recordScan.genre).toBe("afrobeats");
    expect(recordScan.mood).toBe("uplifting");
    // Tempo was never specified nor observed → documented fallback still applies.
    expect(recordScan.tempo).toBe(120);
  });

  it("keeps the listing awaiting sale when social promotion creates no posts", async () => {
    svc._launchCampaign = vi.fn(async () => ({
      campaignId: "campaign-2",
      posted: false,
      reason: "No connected social accounts",
    }));

    const result = await svc.runCycle("manual", {});
    expect(result.status).toBe("awaiting_sale");
    expect(result.advertised).toBe(false);
    expect(result.campaignId).toBe("campaign-2");
    expect(result.note).toBe("No connected social accounts");
  });

  it("dispatches the real BML campaign path and confirms posting only after posts exist", async () => {
    vi.stubEnv("PUBLIC_BASE_URL", "https://market.example");
    svc._requireAdminId = vi.fn(async () => "admin-user");
    svc._generateMaxCoreCaption = vi.fn(async () => "License this beat");
    svc._renderAdVideo = vi.fn(async () => ({
      absPath: "/tmp/beat-ad.mp4",
      storageUrl: "https://media.example/beat-ad.mp4",
    }));
    svc._launchCampaign = orig._launchCampaign;
    const activate = vi.mocked(advertisingDispatchService.activateCampaign);
    activate.mockResolvedValue({
      success: true,
      message: "Posted to connected accounts",
      results: {
        postsCreated: 2,
        platformsUsed: ["instagram", "tiktok"],
        postIds: {},
        calendarEntries: [],
        errors: [],
      },
    } as any);

    const posted = await svc._launchCampaign({
      cycleId: "cycle-1",
      beatId: "beat-1",
      listingId: "listing-1",
      scan: { genre: "drill", mood: "aggressive", tempo: 140, hooks: [] },
      price: 29.99,
      title: "Test Beat",
      audioAbsPath: "/tmp/beat.wav",
    });

    expect(posted).toMatchObject({
      campaignId: "test-cycle-id",
      posted: true,
    });
    expect(activate).toHaveBeenCalledWith("test-cycle-id", "admin-user");

    activate.mockResolvedValue({
      success: true,
      message: "Campaign activated! Posted 0 times.",
      results: {
        postsCreated: 0,
        platformsUsed: [],
        postIds: {},
        calendarEntries: [],
        errors: [],
      },
    } as any);
    const notPosted = await svc._launchCampaign({
      cycleId: "cycle-2",
      beatId: "beat-2",
      listingId: "listing-2",
      scan: { genre: "drill", mood: "aggressive", tempo: 140, hooks: [] },
      price: 29.99,
      title: "Second Test Beat",
      audioAbsPath: "/tmp/beat-2.wav",
    });
    expect(notPosted.posted).toBe(false);
    expect(notPosted.reason).toContain("No social posts were created");
  });

  it("uses the normal cadence when no numeric trend confidence was observed", () => {
    const computeNextCadenceMs = orig._computeNextCadenceMs.bind(svc);
    expect(
      computeNextCadenceMs(
        { hooks: [], productionStyles: [] },
        false,
        null,
      ),
    ).toBe(4 * 60 * 60 * 1000);
    expect(
      computeNextCadenceMs(
        { confidence: 0.75, hooks: [], productionStyles: [] },
        false,
        null,
      ),
    ).toBe(2 * 60 * 60 * 1000);
  });
});

describe("Beat Money Loop — marketplace sale completion", () => {
  it("promotes each listing without treating social posts as marketplace sales", async () => {
    const source = await readFile(
      "server/services/beatMoneyLoopService.ts",
      "utf8",
    );
    const runStart = source.indexOf("async runCycle(");
    const runEnd = source.indexOf("private _drainQueue()", runStart);
    const runCycle = source.slice(runStart, runEnd);
    const enableStart = source.indexOf("async enable()");
    const enableEnd = source.indexOf("registerReconnectHandler()", enableStart);
    const enable = source.slice(enableStart, enableEnd);
    const campaignStart = source.indexOf("private async _launchCampaign(");
    const campaignEnd = source.indexOf("private async _generateMaxCoreCaption(", campaignStart);
    const campaign = source.slice(campaignStart, campaignEnd);
    const failureHandler = runCycle.slice(runCycle.indexOf("const [failureCycle]"));

    expect(runStart).toBeGreaterThanOrEqual(0);
    expect(runEnd).toBeGreaterThan(runStart);
    expect(runCycle).toContain("this._launchCampaign");
    expect(runCycle).toContain("status: sql<string>`CASE WHEN ${beatMoneyLoopCycles.status} = 'sold' THEN 'sold' ELSE 'awaiting_sale' END`");
    expect(campaign).toContain("advertisingDispatchService.activateCampaign");
    expect(campaign).toContain("budget: 0");
    expect(campaign).toContain("postsCreated > 0");
    expect(runCycle).toContain("awaiting_sale");
    expect(failureHandler).toContain("listedBeatId ? \"awaiting_sale\" : \"failed\"");
    expect(failureHandler).toContain("WHEN ${beatMoneyLoopCycles.status} = 'sold' THEN 'sold'");
    expect(enable).not.toContain("setAutonomousMode");
  });

  it("requires a completed marketplace order for a loop-owned listing", async () => {
    const source = await readFile(
      "server/services/beatMoneyLoopService.ts",
      "utf8",
    );
    const start = source.indexOf("async recordMarketplaceSale(orderId: string)");
    const end = source.indexOf("async getStatus()", start);
    const recorder = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(recorder).toContain('eq(orders.status, "completed")');
    expect(recorder).toContain('eq(commerceSources.kind, "marketplace")');
    expect(recorder).toContain("listings.metadata}->>'source' = 'beat-money-loop'");
    expect(recorder).toContain('status: "sold"');
    expect(recorder).not.toContain("downloads");
    expect(recorder).not.toContain("plays");
  });

  it("hooks both completed-payment and idempotent replay paths without treating promotion as a sale", async () => {
    const source = await readFile("server/services/marketplaceService.ts", "utf8");
    const paymentStart = source.indexOf("async processPayment(");
    const paymentEnd = source.indexOf(
      "\n  async _deliverSaleNotifications(",
      paymentStart,
    );
    const processPayment = source.slice(paymentStart, paymentEnd);
    expect(processPayment.match(/_recordBeatMoneyLoopSale\(orderId,/g)).toHaveLength(2);
    expect(processPayment).toContain("dbOrder.status === \"completed\"");
    expect(processPayment).toContain("bookMarketplace(dbOrder)");
  });

  it("finalizes generation as awaiting sale and preserves a concurrent real sale", async () => {
    const source = await readFile(
      "server/services/beatMoneyLoopService.ts",
      "utf8",
    );
    expect(source).toContain(
      "CASE WHEN ${beatMoneyLoopCycles.status} = 'sold' THEN 'sold' ELSE 'awaiting_sale' END",
    );
    expect(source).toContain("settledAtByBeatId");
    expect(source).toContain("completedMarketplaceSales");
    expect(source).toContain("advertised: ad.posted");
    expect(source).not.toMatch(/ad\.posted\s*\?\s*["']sold/);
  });
});

describe("Beat Money Loop — settled revenue attribution", () => {
  it("uses completed commerce seller allocations, not downloads times asking price", async () => {
    const source = await readFile(
      "server/services/beatMoneyLoopService.ts",
      "utf8",
    );
    const start = source.indexOf("async analyseRecentCycles()");
    const end = source.indexOf("return { updated };", start);
    const analyzer = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(analyzer).toContain("commerceSources.kind");
    expect(analyzer).toContain("commerceAllocations.amountCents");
    expect(analyzer).toContain("commerceAllocations.reversedCents");
    expect(analyzer).toContain('eq(orders.status, "completed")');
    expect(analyzer).not.toContain("beats.price");
    expect(analyzer).not.toContain("downloads ?? 0) *");
  });
});

describe("Beat Money Loop — sales channel boundary", () => {
  it("does not enqueue DSP distribution releases", async () => {
    const source = await readFile(
      "server/services/beatMoneyLoopService.ts",
      "utf8",
    );

    expect(source).not.toContain("BEAT_AUTO_DISTRIBUTION");
    expect(source).not.toContain("db.insert(releases)");
  });
});
