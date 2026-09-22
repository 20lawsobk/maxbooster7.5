import http from "node:http";
import { evolutionConsumers } from "../../server/services/evolutionConsumers.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeStorage = vi.hoisted(() => {
  const files = new Map<string, Buffer>();
  return {
    files,
    failUploads: false,
    downloadFile: vi.fn(async (key: string) => {
      const value = files.get(key);
      if (!value) throw new Error("not found");
      return Buffer.from(value);
    }),
    uploadFile: vi.fn(async (data: Buffer, key: string) => {
      if (fakeStorage.failUploads) throw new Error("fake storage unavailable");
      files.set(key, Buffer.from(data));
      return "ok";
    }),
  };
});

vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/services/storageService.js", () => ({
  storageService: fakeStorage,
}));

vi.mock("../../server/storage.js", () => ({
  storage: { createOptimizationTask: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../server/custom-ai-engine.js", () => ({
  customAI: { recordPerformance: vi.fn() },
}));

vi.mock("../../server/services/industryMonitorService.js", () => ({
  industryMonitor: {
    fetchLiveChanges: vi.fn().mockResolvedValue([]),
    getStatus: vi.fn(() => ({})),
    clearCache: vi.fn(),
    getCompetitiveIntelligence: vi.fn(() => ({})),
  },
}));

vi.mock("../../server/lib/envHelpers.js", () => ({
  isProductionEnv: () => false,
}));

const learnedTimes = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("../../server/services/autopilotLearningService.js", () => ({
  autopilotLearningService: {
    getOptimalPostingTimes: learnedTimes,
    recordPerformance: vi.fn(),
  },
}));
vi.mock("../../server/platform-apis.js", () => ({ platformAPI: {} }));
vi.mock("../../server/services/advancedSocialAIService.js", () => ({
  advancedSocialAIService: { generateAdvancedContent: vi.fn() },
}));
vi.mock("../../server/services/adaptiveGenerationEngine.js", () => ({
  recordOutcome: vi.fn(),
}));
vi.mock("../../server/services/autopilotCoordinatorService.js", () => ({
  autopilotCoordinatorService: {},
}));
vi.mock("../../server/services/contentQualityPipeline.js", () => ({
  updateSchedulePressure: vi.fn(),
}));
vi.mock("../../server/services/maxcoreControlTransport.js", () => ({
  maxCoreControlTransport: {},
}));

import { AutopilotEngine } from "../../server/autopilot-engine.js";
import { AutonomousAutopilot } from "../../server/autonomous-autopilot.js";
import {
  SelfEvolutionEngine,
  selfEvolution,
} from "../../server/self-evolution-engine.js";
import {
  EvolutionRegistry,
  evolutionRegistry,
} from "../../server/services/evolutionRegistry.js";

type InternalEngine = SelfEvolutionEngine & {
  assessCompetitiveLeadership(): Promise<Record<string, unknown>[]>;
  monitorIndustryLandscape(): Promise<Record<string, unknown>[]>;
  monitorDeploymentHealth(ids: string[]): Promise<boolean>;
  testUpgrades(upgrades: Record<string, unknown>[]): Promise<Record<string, unknown>[]>;
  deployUpgrades(upgrades: Record<string, unknown>[]): Promise<number>;
  upgradeQueue: Record<string, unknown>[];
  industryChanges: Record<string, unknown>[];
  seenChangeIds: Set<string>;
  isCycleRunning: boolean;
};

function resetSingletons(): void {
  fakeStorage.files.clear();
  fakeStorage.failUploads = false;
  const registry = evolutionRegistry as unknown as {
    enhancements: unknown[];
    lastLoadedAt: number;
    loadInFlight: Promise<void> | null;
  };
  registry.enhancements = [];
  registry.lastLoadedAt = Date.now();
  registry.loadInFlight = null;

  const engine = selfEvolution as unknown as InternalEngine;
  engine.upgradeQueue = [];
  engine.industryChanges = [];
  engine.seenChangeIds = new Set();
  engine.isCycleRunning = false;
}

function upgrade(
  id: string,
  category: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id,
    changeId: `change-${id}`,
    type: "optimization",
    targetFiles: [],
    generatedCode: new Map(),
    testCode: "",
    status: "pending",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    performanceImpact: { before: {}, after: {} },
    enhancementCategory: category,
    enhancementPayload: payload,
    applied: false,
  };
}

beforeEach(() => {
  resetSingletons();
  learnedTimes.mockResolvedValue([]);
  vi.restoreAllMocks();
});

afterEach(() => {
  delete process.env.PORT;
});

describe("isolated real self-evolution simulation", () => {
  it("rejects a broken scheduler before issuing a health probe", async () => {
    const engine = selfEvolution as unknown as InternalEngine;
    const candidate = upgrade("broken-schedule", "posting_optimization", {
      platform: "twitter", optimalHours: [0, 12],
    });
    engine.upgradeQueue.push(candidate);
    expect(await engine.deployUpgrades([candidate])).toBe(1);
    vi.spyOn(evolutionConsumers, "nextPostTime").mockImplementation((now) => now);
    const health = vi.spyOn(http, "get");
    await expect(engine.monitorDeploymentHealth([candidate.id])).resolves.toBe(false);
    expect(health).not.toHaveBeenCalled();
    expect(evolutionRegistry.getOptimalHoursOverride("twitter")).toBeNull();
    expect(candidate.applied).toBe(false);
  });

  it("preserves midnight and orders twice-daily windows in the production scheduler", () => {
    const now = new Date(2026, 0, 15, 23, 30);
    const next = evolutionConsumers.nextPostTime(now, "daily", [0]);
    expect(next.getHours()).toBe(0);
    expect(next.getDate()).toBe(16);
    expect(evolutionConsumers.nextPostTime(new Date(2026, 0, 15, 8), "twice-daily", [20, 9]).getHours()).toBe(9);
  });

  it("rolls back broken consumer requests despite healthy HTTP and retains unrelated upgrades", async () => {
    const engine = selfEvolution as unknown as InternalEngine;
    const good = upgrade("good-posting", "posting_optimization", {
      platform: "twitter", optimalHours: [0, 12],
    });
    const broken = upgrade("broken-content", "content_optimization", {
      platform: "tiktok", variantCount: 5,
    });
    engine.upgradeQueue.push(good, broken);
    expect(await engine.deployUpgrades([good, broken])).toBe(2);
    const actual = evolutionConsumers.contentRequest;
    vi.spyOn(evolutionConsumers, "contentRequest").mockImplementation((registry, platform, objective) => {
      const request = actual(registry, platform, objective);
      return platform === "tiktok" ? { ...request, variantCount: 0 } : request;
    });
    const probe = vi.spyOn(http, "get").mockImplementation(((_url: unknown, callback: any) => {
      queueMicrotask(() => callback({
        statusCode: 200, resume() {},
        on(_event: string, done: () => void) { queueMicrotask(done); },
      }));
      return { setTimeout() {}, on() {} };
    }) as any);
    await expect(engine.monitorDeploymentHealth([good.id, broken.id])).resolves.toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(evolutionRegistry.getContentOptimization("tiktok")).toBeNull();
    expect(evolutionRegistry.getOptimalHoursOverride("twitter")).toEqual([0, 12]);
    expect(broken).toMatchObject({ applied: false, status: "rolled_back" });
    expect(good).toMatchObject({ applied: true, status: "deployed" });
    const stored = JSON.parse(fakeStorage.files.get("evolution-state/registry.json")!.toString());
    expect(stored.enhancements.find((entry: any) => entry.upgradeId === broken.id))
      .toMatchObject({ active: false, consumerValidation: { passed: false, contract: "consumer-request-v1" } });
  });

  it("certifies actual request fields and posting windows across reload and rollback", async () => {
    const engine = selfEvolution as unknown as InternalEngine;
    const candidate = upgrade("all-knobs", "content_optimization", {
      platform: "instagram", variantCount: 4, visualPriority: false,
      hashtagStrategy: "niche", captionLength: "short", callToActionStrength: "high",
    });
    engine.upgradeQueue.push(candidate);
    expect(await engine.deployUpgrades([candidate])).toBe(1);
    vi.spyOn(http, "get").mockImplementation(((_url: unknown, callback: any) => {
      queueMicrotask(() => callback({
        statusCode: 200, resume() {},
        on(_event: string, done: () => void) { queueMicrotask(done); },
      }));
      return { setTimeout() {}, on() {} };
    }) as any);
    await expect(engine.monitorDeploymentHealth([candidate.id])).resolves.toBe(true);
    const reloaded = new EvolutionRegistry(fakeStorage);
    await reloaded.load();
    expect(reloaded.getActiveUpgradeEnhancements(candidate.id)[0].consumerValidation?.passed).toBe(true);
    expect(evolutionConsumers.contentRequest(reloaded, "instagram", "awareness")).toMatchObject({
      variantCount: 4, includeEmojis: false, hashtagStrategy: "niche", captionLength: "short",
      callToActionStrength: "high", objective: "awareness",
    });
    await reloaded.deactivateByUpgrade(candidate.id);
    expect(evolutionConsumers.contentRequest(reloaded, "instagram", "awareness").variantCount).toBe(3);
  });

  it("orchestrates detected change -> proposal -> validation -> apply -> real consumer effect", async () => {
    const engine = selfEvolution as unknown as InternalEngine;
    const change = {
      id: "sim-tiktok-timing",
      source: "social_media",
      category: "optimization",
      title: "TikTok peak posting timing changed",
      description: "TikTok creators see a new best time to post",
      detectedAt: new Date("2026-01-01T00:00:00.000Z"),
      urgency: "critical",
      affectedModules: ["social"],
      competitiveImpact: 95,
      implementationComplexity: "simple",
      estimatedImplementationHours: 1,
    };

    vi.spyOn(engine, "assessCompetitiveLeadership").mockResolvedValue([change]);
    vi.spyOn(engine, "monitorIndustryLandscape").mockResolvedValue([]);
    vi.spyOn(engine, "monitorDeploymentHealth").mockResolvedValue(true);

    const consumer = new AutopilotEngine("simulation-user") as unknown as {
      getOptimalTimesForPlatform(platform: string): Promise<number[]>;
    };
    expect(await consumer.getOptimalTimesForPlatform("tiktok")).toEqual([
      6, 10, 16, 19,
    ]);

    await selfEvolution.forceEvolutionCycle();

    const history = selfEvolution.getUpgradeHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      changeId: "sim-tiktok-timing",
      enhancementCategory: "posting_optimization",
      status: "deployed",
      applied: true,
    });
    expect(evolutionRegistry.getStats().active).toBe(1);
    expect(await consumer.getOptimalTimesForPlatform("tiktok")).toEqual([
      11, 14, 17, 19, 21,
    ]);
  });

  it("persists applied state and restores it in a fresh registry instance", async () => {
    const first = new EvolutionRegistry(fakeStorage);
    const result = await first.apply({
      upgradeId: "restart-upgrade",
      changeId: "restart-change",
      category: "posting_optimization",
      title: "Restart-safe hours",
      source: "simulation",
      payload: { platform: "instagram", optimalHours: [7, 13, 20] },
    });
    expect(result.applied).toBe(true);

    const restarted = new EvolutionRegistry(fakeStorage);
    await restarted.load(true);
    expect(restarted.getOptimalHoursOverride("instagram")).toEqual([7, 13, 20]);
    expect(restarted.getStats()).toMatchObject({ total: 1, active: 1 });
  });

  it("changes the autonomous autopilot posting-window decision and reverts it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T03:00:00.000Z"));
    try {
      const autonomous = new AutonomousAutopilot(
        "autonomous-simulation-user",
      ) as unknown as {
        updateAutonomousConfig(config: {
          minPostsPerDay: number;
        }): Promise<void>;
        shouldGenerateContentForPlatform(platform: string): Promise<boolean>;
      };
      await autonomous.updateAutonomousConfig({ minPostsPerDay: 0 });

      expect(
        await autonomous.shouldGenerateContentForPlatform("TikTok"),
      ).toBe(false);
      await evolutionRegistry.apply({
        upgradeId: "autonomous-window",
        changeId: "autonomous-window-change",
        category: "posting_optimization",
        title: "TikTok early window",
        source: "simulation",
        payload: { platform: "tiktok", optimalHours: [3] },
      });
      expect(
        await autonomous.shouldGenerateContentForPlatform("TikTok"),
      ).toBe(true);

      await evolutionRegistry.deactivateByUpgrade("autonomous-window");
      expect(
        await autonomous.shouldGenerateContentForPlatform("TikTok"),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid proposals and records unsupported categories only as advisory", async () => {
    const engine = selfEvolution as unknown as InternalEngine;
    const invalid = upgrade("invalid", "posting_optimization", {
      optimalHours: ["not-an-hour"],
    });
    const unsupported = upgrade("unsupported", "feature_flag", {
      name: "futureCapability",
      enabled: true,
    });
    engine.upgradeQueue.push(invalid, unsupported);

    const validated = await engine.testUpgrades([invalid, unsupported]);
    expect(validated).toEqual([unsupported]);
    expect(invalid).toMatchObject({
      status: "failed",
      applied: false,
    });

    expect(await engine.deployUpgrades(validated)).toBe(0);
    expect(unsupported).toMatchObject({
      status: "deployed",
      applied: false,
    });
    expect(String(unsupported.notAppliedReason)).toContain(
      "no wired runtime consumer",
    );
  });

  it("fails closed when durable storage cannot accept an applied proposal", async () => {
    const engine = selfEvolution as unknown as InternalEngine;
    const candidate = upgrade("storage-failure", "content_optimization", {
      platform: "instagram",
      variantCount: 5,
    });
    engine.upgradeQueue.push(candidate);
    fakeStorage.failUploads = true;

    expect(await engine.deployUpgrades([candidate])).toBe(0);
    expect(candidate).toMatchObject({ status: "failed", applied: false });
    expect(String(candidate.notAppliedReason)).toContain(
      "registry persistence failed",
    );
    expect(evolutionRegistry.getStats().active).toBe(0);
  });

  it("rolls back only the failing canary when loopback validation returns 503", async () => {
    const engine = selfEvolution as unknown as InternalEngine;
    const historical = upgrade("historical-good", "posting_optimization", {
      platform: "twitter",
      optimalHours: [8, 12],
    });
    const canary = upgrade("failing-canary", "posting_optimization", {
      platform: "tiktok",
      optimalHours: [11, 21],
    });
    engine.upgradeQueue.push(historical, canary);
    expect(await engine.deployUpgrades([historical, canary])).toBe(2);

    const server = http.createServer((_req, res) => {
      res.statusCode = 503;
      res.end("isolated simulated failure");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("loopback server did not expose a port");
    }
    process.env.PORT = String(address.port);

    try {
      await expect(
        engine.monitorDeploymentHealth(["failing-canary"]),
      ).resolves.toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }

    expect(evolutionRegistry.getOptimalHoursOverride("tiktok")).toBeNull();
    expect(evolutionRegistry.getOptimalHoursOverride("twitter")).toEqual([8, 12]);
    expect(canary).toMatchObject({
      status: "rolled_back",
      applied: false,
      rollbackReason: "post-deployment health validation failed",
    });
    expect(historical).toMatchObject({ status: "deployed", applied: true });
  });
});