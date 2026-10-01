/**
 * Beat Money Loop — MaxCore observation propagation (regression test).
 *
 * When the caller leaves genre/mood/tempo unspecified, MaxCore decides them at
 * generation time and returns them as observations. Pricing, beat-record
 * creation and campaign launch must use the OBSERVED values — not the
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
  chain.returning = vi.fn(async () => [{ id: 99 }]);
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(async () => []);
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

const PRIVATES = [
  "_generateBeat",
  "_competitivePrice",
  "_createBeatRecord",
  "_launchCampaign",
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
  let campaignScan: any;

  beforeEach(() => {
    for (const m of PRIVATES) orig[m] = svc[m];
    priceGenre = undefined;
    recordScan = undefined;
    campaignArgs = undefined;
    campaignScan = undefined;

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
        audioUrl: "https://x/y.wav",
        previewUrl: "https://x/preview.wav",
      };
    });
    svc._launchCampaign = vi.fn(async (args: any) => {
      campaignArgs = args;
      campaignScan = args.scan;
      return { posted: true, campaignId: "camp-1" };
    });
    svc._computeNextCadenceMs = vi.fn(() => 3_600_000);
    svc._updateStateAfterCycle = vi.fn(async () => undefined);
    svc.analyseRecentCycles = vi.fn(async () => undefined);
  });

  afterEach(() => {
    for (const m of PRIVATES) svc[m] = orig[m];
    vi.unstubAllGlobals();
  });

  it("prices, records and advertises with observed genre/mood/tempo, not pre-generation fallbacks", async () => {
    const result = await svc.runCycle("manual", {});
    expect(result.status).toBe("completed");

    // Pricing must be based on what MaxCore actually produced…
    expect(priceGenre).toBe("drill");
    // …and the listing + campaign must carry the observed metadata.
    expect(recordScan.genre).toBe("drill");
    expect(recordScan.mood).toBe("aggressive");
    expect(recordScan.tempo).toBe(140);
    expect(campaignArgs.listingId).toBe("listing-1");
    expect(campaignScan.genre).toBe("drill");
    expect(campaignScan.mood).toBe("aggressive");
    expect(campaignScan.tempo).toBe(140);
  });

  it("honors caller-specified fields and falls back only for truly-unspecified ones", async () => {
    svc._generateBeat = vi.fn(async () => mockGeneration({}));
    const result = await svc.runCycle("manual", { genre: "afrobeats", mood: "uplifting" });
    expect(result.status).toBe("completed");

    expect(priceGenre).toBe("afrobeats");
    expect(recordScan.genre).toBe("afrobeats");
    expect(recordScan.mood).toBe("uplifting");
    // Tempo was never specified nor observed → documented fallback still applies.
    expect(recordScan.tempo).toBe(120);
    expect(campaignScan.tempo).toBe(120);
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
