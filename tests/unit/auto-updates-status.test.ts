/**
 * End-to-end honesty test for the admin Autonomy /status reporting path.
 *
 * The Self-Evolution honesty fix made the admin Autonomy page report
 * "Applied (live)" vs generated/advisory counts. This test locks in that the
 * status the admin UI consumes is HONEST end to end:
 *
 *   real engine.deployUpgrades()  →  engine.getStatus()  →  GET /status route
 *
 * so a future change to EITHER the getStatus() counting logic OR the route's
 * field mapping cannot silently re-introduce inflated "applied" counts without
 * failing a test.
 *
 * The guarantees asserted:
 *  - `upgradesApplied` (and the back-compat `upgradesDeployed`) count ONLY
 *    genuinely-applied upgrades — those whose enhancement landed in a consumed
 *    category WITH an effective field a live subsystem reads.
 *  - An upgrade in a consumed category but WITHOUT an effective field is NOT
 *    counted as applied (it must not inflate the number).
 *  - A recorded-but-not-applied upgrade (stored, no wired consumer) is surfaced
 *    as advisory with a notAppliedReason and excluded from `upgradesApplied`.
 *  - The route forwards exactly the engine's honest fields to the admin UI.
 *
 * The real evolutionRegistry and the real selfEvolution singleton are used;
 * only IO/heavy collaborators are mocked so the modules import without booting
 * the server.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks: keep IO/heavy deps inert; engine + registry stay REAL ────────────
vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/services/storageService.js", () => ({
  storageService: {
    // No prior state on disk — load()/seed start empty, fully in-memory.
    downloadFile: vi.fn().mockRejectedValue(new Error("not found")),
    uploadFile: vi.fn().mockResolvedValue("ok"),
  },
}));

// recordDeployment() writes an optimization task; keep it a no-op.
vi.mock("../../server/storage.js", () => ({
  storage: { createOptimizationTask: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../server/custom-ai-engine.js", () => ({
  customAI: { recordPerformance: vi.fn() },
}));

vi.mock("../../server/services/industryMonitorService.js", () => ({
  industryMonitor: {
    getStatus: vi.fn(() => ({})),
    clearCache: vi.fn(),
    fetchLiveChanges: vi.fn().mockResolvedValue([]),
    getCompetitiveIntelligence: vi.fn(() => ({})),
  },
}));

vi.mock("../../server/lib/envHelpers.js", () => ({
  isProductionEnv: () => false,
  isDevEnv: () => true,
}));

// Route module deps that are irrelevant to /status.
vi.mock("../../server/middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../../server/services/silentDeploymentService.js", () => ({
  silentDeployment: {
    getStatus: vi.fn(() => ({})),
    getHistory: vi.fn(() => []),
    enable: vi.fn(),
    disable: vi.fn(),
  },
}));

vi.mock("../../server/simulations/autonomousUpgradeSimulation.js", () => ({
  simulateAutonomousUpgrade: vi.fn(),
  simulateLongTermAdaptation: vi.fn(),
  generateSimulationReport: vi.fn(),
}));

import { selfEvolution } from "../../server/self-evolution-engine.js";
import { evolutionRegistry } from "../../server/services/evolutionRegistry.js";
import autoUpdatesRouter from "../../server/routes/autoUpdates.js";

// ── Helpers ────────────────────────────────────────────────────────────────

type AnyUpgrade = Record<string, unknown>;

function makeUpgrade(partial: AnyUpgrade): AnyUpgrade {
  return {
    id: `up-${Math.random().toString(36).slice(2)}`,
    changeId: `chg-${Math.random().toString(36).slice(2)}`,
    type: "optimization",
    targetFiles: [],
    generatedCode: new Map<string, string>(),
    testCode: "",
    status: "pending",
    createdAt: new Date(),
    performanceImpact: { before: {}, after: {} },
    ...partial,
  };
}

function resetEngineAndRegistry(): void {
  const eng = selfEvolution as unknown as {
    upgradeQueue: unknown[];
    industryChanges: unknown[];
  };
  eng.upgradeQueue = [];
  eng.industryChanges = [];
  (evolutionRegistry as unknown as { enhancements: unknown[] }).enhancements =
    [];
  (evolutionRegistry as unknown as { lastLoadedAt: number }).lastLoadedAt =
    Date.now();
}

/** Invoke the real GET /status handler from the router (auth is mocked through). */
async function callStatusRoute(): Promise<Record<string, unknown>> {
  const stack = (
    autoUpdatesRouter as unknown as {
      stack: Array<{
        route?: {
          path: string;
          methods: Record<string, boolean>;
          stack: Array<{ handle: Function }>;
        };
      }>;
    }
  ).stack;
  const layer = stack.find(
    (l) => l.route?.path === "/status" && l.route.methods.get,
  );
  if (!layer?.route) throw new Error("GET /status route not found on router");
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  let body: Record<string, unknown> = {};
  let statusCode = 200;
  const res = {
    json(payload: Record<string, unknown>) {
      body = payload;
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
  };
  await handler({ user: { id: "admin-user" } }, res, () => {});
  if (statusCode !== 200) throw new Error(`/status returned ${statusCode}`);
  return body;
}

describe("admin Autonomy /status — honest applied-vs-advisory counts (end to end)", () => {
  beforeEach(() => {
    resetEngineAndRegistry();
    vi.clearAllMocks();
  });

  it("counts only effective-field upgrades as applied; advisory ones surface with a reason", async () => {
    const engine = selfEvolution as unknown as {
      upgradeQueue: AnyUpgrade[];
      deployUpgrades(upgrades: AnyUpgrade[]): Promise<number>;
    };

    // U1 — posting_optimization WITH optimalHours (effective) → genuinely applied.
    const u1 = makeUpgrade({
      id: "u1-posting-applied",
      changeId: "chg-u1",
      enhancementCategory: "posting_optimization",
      enhancementPayload: {
        platform: "tiktok",
        optimalHours: [11, 14, 17, 19, 21],
      },
    });
    // U2 — content_optimization WITH variantCount (effective) → genuinely applied.
    const u2 = makeUpgrade({
      id: "u2-content-applied",
      changeId: "chg-u2",
      enhancementCategory: "content_optimization",
      enhancementPayload: {
        platform: "instagram",
        variantCount: 5,
        visualPriority: false,
      },
    });
    // U3 — feature_flag: stored, but NO live subsystem reads this category yet →
    // recorded as advisory (status 'deployed', applied=false, with a reason).
    const u3 = makeUpgrade({
      id: "u3-flag-advisory",
      changeId: "chg-u3",
      enhancementCategory: "feature_flag",
      enhancementPayload: { name: "experimentalThing", enabled: true },
    });
    // U4 — posting_optimization whose payload sanitizes to NOTHING usable (no
    // valid bounded knob survives) → rejected at apply, status 'failed', must
    // NOT count as applied (false-positive guard).
    const u4 = makeUpgrade({
      id: "u4-posting-noneffective",
      changeId: "chg-u4",
      enhancementCategory: "posting_optimization",
      enhancementPayload: {
        platform: "tiktok",
        optimalHours: ["not-a-number"],
      },
    });

    const upgrades = [u1, u2, u3, u4];
    engine.upgradeQueue.push(...upgrades);
    await engine.deployUpgrades(upgrades);

    // Per-upgrade ground truth after deploy.
    expect(u1.applied).toBe(true);
    expect(u2.applied).toBe(true);
    expect(u3.status).toBe("deployed");
    expect(u3.applied).toBe(false);
    expect(typeof u3.notAppliedReason).toBe("string");
    expect((u3.notAppliedReason as string).length).toBeGreaterThan(0);
    // U4 is in a consumed category but has no effective field → not applied.
    expect(u4.applied).not.toBe(true);

    // ── The end-to-end status the admin UI consumes ──────────────────────────
    const status = await callStatusRoute();

    expect(status.upgradesGenerated).toBe(4);
    // Only U1 + U2 are genuinely applied — NOT U3 (advisory) or U4 (non-effective).
    expect(status.upgradesApplied).toBe(2);
    // Back-compat field must equal the honest applied count, never inflated.
    expect(status.upgradesDeployed).toBe(2);
    // Recorded-but-not-applied = deployed advisory (U3); U4 ('failed') is excluded.
    expect(status.upgradesRecordedNotApplied).toBe(1);

    // appliedEnhancements mirrors the registry's active consumed-category count
    // (U1 + U2; U4's payload was rejected at sanitize so nothing was stored) —
    // it may legitimately equal or exceed upgradesApplied without lying, because
    // being "applied" requires an effective field, not just category membership.
    expect(status.appliedEnhancements).toBe(
      evolutionRegistry.getStats().consumedActive,
    );
    expect(status.appliedEnhancements as number).toBeGreaterThanOrEqual(
      status.upgradesApplied as number,
    );

    // The advisory upgrade is visible in the history the UI renders, carrying
    // applied=false + its notAppliedReason badge text.
    const recent = status.recentUpgrades as Array<Record<string, unknown>>;
    const advisory = recent.find((u) => u.id === "u3-flag-advisory");
    expect(advisory).toBeDefined();
    expect(advisory!.applied).not.toBe(true);
    expect(typeof advisory!.notAppliedReason).toBe("string");
    expect((advisory!.notAppliedReason as string).length).toBeGreaterThan(0);

    const appliedEntry = recent.find((u) => u.id === "u1-posting-applied");
    expect(appliedEntry).toBeDefined();
    expect(appliedEntry!.applied).toBe(true);
  });

  it("reports zero applied when every generated upgrade is advisory/non-effective", async () => {
    const engine = selfEvolution as unknown as {
      upgradeQueue: AnyUpgrade[];
      deployUpgrades(upgrades: AnyUpgrade[]): Promise<number>;
    };

    // A non-consumed feature_flag (advisory) and a posting_optimization whose
    // payload sanitizes to nothing usable (rejected at apply) — neither is a
    // genuine behavior change.
    const flag = makeUpgrade({
      id: "only-advisory-flag",
      changeId: "chg-a1",
      enhancementCategory: "feature_flag",
      enhancementPayload: { name: "flagA", enabled: false },
    });
    const noneffective = makeUpgrade({
      id: "only-noneffective-posting",
      changeId: "chg-a2",
      enhancementCategory: "posting_optimization",
      enhancementPayload: { optimalHours: [] },
    });

    const upgrades = [flag, noneffective];
    engine.upgradeQueue.push(...upgrades);
    await engine.deployUpgrades(upgrades);

    const status = await callStatusRoute();

    expect(status.upgradesGenerated).toBe(2);
    expect(status.upgradesApplied).toBe(0);
    expect(status.upgradesDeployed).toBe(0);
    // The non-consumed feature_flag is the only deployed-advisory entry.
    expect(status.upgradesRecordedNotApplied).toBe(1);
  });
});
