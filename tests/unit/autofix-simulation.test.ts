import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const { pdim, log } = vi.hoisted(() => ({
  pdim: new Map<string, string>(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/logger.js", () => ({ logger: log }));
vi.mock("../../server/services/structuredLogger.js", () => ({
  addLogTransport: vi.fn(),
}));
vi.mock("../../server/lib/pdimClient.js", () => ({
  getPdimClient: () => ({
    get: async (key: string) => pdim.get(key) ?? null,
    set: async (key: string, value: string) => void pdim.set(key, value),
    lpush: async () => 1,
    ltrim: async () => "OK",
  }),
  setPdimGapFloor: vi.fn(),
  setPdimAdaptiveGap: vi.fn(),
  getPdimAdaptiveGapMs: () => 17,
}));
vi.mock("../../server/lib/luaExecutor.js", () => ({
  setLuaScriptTimeout: vi.fn(),
  resetLuaExecutorSemaphore: vi.fn(() => 1),
}));

import { PlatformAutoFixer } from "../../server/services/platformAutoFixer.js";
import {
  PermanentFixRegistry,
  permanentFixRegistry,
} from "../../server/services/permanentFixRegistry.js";
import { ChainErrorAutoFixer } from "../../server/services/chainErrorAutoFixer.js";

const originalGc = global.gc;

describe("runtime autofix simulation (all providers mocked)", () => {
  beforeEach(() => {
    pdim.clear();
    vi.clearAllMocks();
    global.gc = vi.fn();
  });

  afterEach(() => {
    global.gc = originalGc;
    vi.useRealTimers();
  });

  it("records platform patches only after applied, not failed or explicit noop", async () => {
    const fixer = new PlatformAutoFixer() as any;
    const applied = vi.fn(async () => true);
    const failed = vi.fn(async () => {
      throw new Error("simulated remediation failure");
    });
    const noop = vi.fn(async () => false);

    expect(await fixer.applyPatch(patchOpts("applied", applied))).toMatch(/^patch_/);
    expect(await fixer.applyPatch(patchOpts("failed", failed))).toBe("");
    expect(await fixer.applyPatch(patchOpts("noop", noop))).toBe("");

    expect(fixer.getPatches().active.map((p: any) => p.name)).toEqual(["applied"]);
    expect(await fixer.revertPatch(fixer.getPatches().active[0].id, "simulation")).toBe(true);
    expect(fixer.getPatches().active).toHaveLength(0);
    expect(fixer.getPatches().history[0].status).toBe("reverted");
  });

  it("keeps a patch active when its transactional revert fails", async () => {
    const fixer = new PlatformAutoFixer() as any;
    const rollback = vi.fn(async () => {
      throw new Error("simulated rollback failure");
    });
    const id = await fixer.applyPatch({
      ...patchOpts("rollback failure", async () => true),
      revert: rollback,
    });

    const first = fixer.revertPatch(id, "simulation");
    const duplicate = fixer.revertPatch(id, "simulation duplicate");
    expect(await first).toBe(false);
    expect(await duplicate).toBe(false);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(fixer.getPatches().active[0]).toMatchObject({
      id,
      status: "active",
    });
    expect(fixer.getPatches().history).toHaveLength(0);
  });

  it("commits revert lifecycle only after compensation completes", async () => {
    const fixer = new PlatformAutoFixer() as any;
    let release!: () => void;
    const compensation = new Promise<void>((resolve) => {
      release = resolve;
    });
    const id = await fixer.applyPatch({
      ...patchOpts("ordered rollback", async () => true),
      revert: () => compensation,
    });

    const reverting = fixer.revertPatch(id, "simulation");
    await Promise.resolve();
    expect(fixer.getPatches().active[0]).toMatchObject({ id, status: "active" });
    expect(fixer.getPatches().history).toHaveLength(0);
    release();
    expect(await reverting).toBe(true);
    expect(fixer.getPatches().active).toHaveLength(0);
    expect(fixer.getPatches().history[0]).toMatchObject({ id, status: "reverted" });
  });

  it("keeps runtime success distinct from rejected durable promotion", async () => {
    const durable = vi
      .spyOn(permanentFixRegistry, "recordFix")
      .mockRejectedValueOnce(new Error("mock PDIM write rejected"));
    const platform = new PlatformAutoFixer() as any;
    const id = await platform.applyPatch({
      ...patchOpts("durability failure", async () => true),
      subsystem: "memory",
    });
    expect(platform.getPatches().active[0]).toMatchObject({
      id,
      status: "active",
      durablePromotion: {
        status: "failed",
        error: "mock PDIM write rejected",
      },
    });

    const chain = new ChainErrorAutoFixer() as any;
    const action = vi.fn(async () => true);
    const pattern = {
      id: "memory_pressure",
      name: "durable chain simulation",
      description: "durable chain simulation",
      matchers: [/durable/],
      levels: ["error"],
      severity: "low",
      category: "simulation",
      cooldownMs: 10_000,
      maxAttempts: 2,
      autoFix: action,
    };
    chain.addPattern(pattern);
    durable.mockRejectedValueOnce(new Error("mock PDIM write rejected"));
    await chain.triggerFix(pattern, "durable");
    const state = chain.getStatus().patterns.find((p: any) => p.id === pattern.id);
    expect(state).toMatchObject({
      lastFixResult: "success",
      successCount: 1,
      durableResult: "failed",
      durableError: "mock PDIM write rejected",
    });
    await chain.triggerFix(pattern, "durable");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("reports chain applied/noop/failure honestly and enforces adaptive cooldown", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const fixer = new ChainErrorAutoFixer() as any;
    const run = async (id: string, result: "ok" | "noop" | "fail") => {
      const pattern = {
        id,
        name: id,
        description: id,
        matchers: [/x/],
        levels: ["error"],
        severity: "low",
        category: "simulation",
        cooldownMs: 10_000,
        maxAttempts: 10,
        autoFix: async () => {
          if (result === "fail") throw new Error("expected");
          return result !== "noop";
        },
      };
      fixer.addPattern(pattern);
      await fixer.triggerFix(pattern, "x");
      return pattern;
    };

    await run("sim-ok", "ok");
    await run("sim-noop", "noop");
    const failed = await run("sim-fail", "fail");
    expect(fixer.getStatus().patterns.find((p: any) => p.id === "sim-ok").lastFixResult).toBe("success");
    expect(fixer.getStatus().patterns.find((p: any) => p.id === "sim-noop").lastFixResult).toBe("noop");
    expect(fixer.getStatus().patterns.find((p: any) => p.id === "sim-fail").lastFixResult).toBe("failed");

    const attempts = fixer.getStatus().patterns.find((p: any) => p.id === "sim-fail").attempts;
    await fixer.triggerFix(failed, "x");
    expect(fixer.getStatus().patterns.find((p: any) => p.id === "sim-fail").attempts).toBe(attempts);

    const adaptive = fixer.adaptiveCooldown.get("sim-fail");
    adaptive.recentFires = [
      Date.now() - 1000,
      Date.now() - 2000,
      Date.now() - 3000,
      Date.now() - 4000,
      Date.now() - 5000,
    ];
    expect(fixer._adaptiveCooldownMs(failed)).toBe(40_000);
    expect(fixer.getStatus().patterns.find((p: any) => p.id === "sim-fail").cooldownRemaining)
      .toBeGreaterThan(10_000);
  });

  it("persists escalation across registry restart and safely ignores unsupported patterns", async () => {
    const first = new PermanentFixRegistry();
    await first.loadPermanentOverrides();
    await first.recordFix("memory_pressure");
    await first.recordFix("memory_pressure");
    await first.recordFix("memory_pressure");
    expect(first.getHeapWarnRatio()).toBeCloseTo(0.78);
    expect(pdim.get("pfr:override:heap_warn_ratio")).toBe("0.78");

    const restarted = new PermanentFixRegistry();
    await restarted.loadPermanentOverrides();
    expect(restarted.getHeapWarnRatio()).toBeCloseTo(0.78);
    const before = restarted.getStatus();
    await restarted.recordFix("unsupported_simulation_pattern");
    expect(restarted.getStatus().sessionFixCounts).toEqual(before.sessionFixCounts);

    await (restarted as any)._runDeEscalationCheck();
    expect(restarted.getHeapWarnRatio()).toBeCloseTo(0.79);
    expect(restarted.getStatus().recentAudit[0].direction).toBe("de-escalation");
  });
});

describe("isolated deployment and fix-all simulation", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it("runs actual fix-all handler on a copied fixture and leaves unknown diagnostics untouched", () => {
    const root = fixtureRoot();
    roots.push(root);
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.copyFileSync(path.resolve("scripts/fix-all.mjs"), path.join(root, "scripts/fix-all.mjs"));
    fs.symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"), "dir");
    fs.writeFileSync(path.join(root, "known.ts"), "export const f = (value) => value;\n");
    fs.mkdirSync(path.join(root, "reports", "fix-all"), { recursive: true });
    const known = "known.ts(1,19): error TS7006: Parameter 'value' implicitly has an 'any' type.\n";
    fs.writeFileSync(path.join(root, "reports", "fix-all", "tc-server.txt"), known);

    const applied = isolatedNode(root, ["scripts/fix-all.mjs", "--phase", "ts-server", "--config", "server"]);
    expect(applied.status).toBe(0);
    expect(fs.readFileSync(path.join(root, "known.ts"), "utf8")).toContain("value: any");

    const before = fs.readFileSync(path.join(root, "known.ts"), "utf8");
    fs.writeFileSync(
      path.join(root, "reports", "fix-all", "tc-server.txt"),
      "known.ts(1,1): error TS9999: completely unknown diagnostic.\n",
    );
    expect(isolatedNode(root, ["scripts/fix-all.mjs", "--phase", "ts-server", "--config", "server"]).status).toBe(0);
    expect(fs.readFileSync(path.join(root, "known.ts"), "utf8")).toBe(before);
  });

  it.each([
    ["known repaired diagnostic", false, 0],
    ["unknown unresolved diagnostic", true, 1],
  ])("deployment gate: %s", (_name, remainBroken, expected) => {
    const root = fixtureRoot();
    roots.push(root);
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(root, "bin"), { recursive: true });
    fs.copyFileSync(path.resolve("scripts/deployment-autofix.mjs"), path.join(root, "scripts/deployment-autofix.mjs"));
    fs.writeFileSync(path.join(root, "scripts", "validate-error-research.mjs"), "");
    fs.writeFileSync(path.join(root, "bin", "npx"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    fs.writeFileSync(
      path.join(root, "scripts", "fix-all.mjs"),
      `import fs from "node:fs";
const a=process.argv;
const verify=a.includes("verify");
const marker=".applied";
if (verify && (!fs.existsSync(marker) || ${remainBroken})) process.exit(1);
if (!verify) fs.writeFileSync(marker,"known fix applied");
`,
    );
    fs.writeFileSync(path.join(root, "sentinel.txt"), "must-not-change");

    const result = isolatedNode(root, ["scripts/deployment-autofix.mjs"], path.join(root, "bin"));
    expect(result.status).toBe(expected);
    expect(fs.readFileSync(path.join(root, "sentinel.txt"), "utf8")).toBe("must-not-change");
  });
});

function patchOpts(name: string, action: () => Promise<boolean>) {
  return {
    subsystem: "database",
    name,
    description: name,
    triggeredBy: "simulation",
    runtimeEffect: name,
    action,
  };
}

function fixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "autofix-safe-"));
}

function isolatedNode(root: string, args: string[], prependPath?: string) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: {
      PATH: prependPath ? `${prependPath}:${process.env.PATH ?? "/usr/bin:/bin"}` : (process.env.PATH ?? "/usr/bin:/bin"),
      HOME: path.join(root, "home"),
      NODE_OPTIONS: "--no-warnings",
    },
    timeout: 30_000,
  });
}