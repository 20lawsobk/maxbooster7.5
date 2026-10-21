import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { AutomationSystem } = await import("../../server/automation-system");
const system = AutomationSystem.getInstance();
const flush = () => new Promise((resolve) => setImmediate(resolve));

function triggered(id: string, actions: unknown[]) {
  const wf = system.createWorkflow({ id, name: id, description: "", triggers: [], actions } as any);
  if (!system.startWorkflow(wf.id)) throw new Error("Unable to start workflow fixture");
  void (system as any).triggerWorkflow(wf);
  return wf;
}

describe("generic workflow dispatch", () => {
  it("never starts a second copy of a slow step and never resets a running workflow", async () => {
    let release!: () => void;
    let calls = 0;
    system.registerAction("test-slow", {
      name: "slow",
      execute: () => { calls++; return new Promise((r) => { release = () => r({ success: true }); }); },
    } as any);
    const wf = triggered("wf-slow", [{ type: "test-slow", parameters: {} }]);

    const first = system.executeWorkflows();
    await flush();
    await system.executeWorkflows();
    await (system as any).triggerWorkflow(wf);
    expect(calls).toBe(1);
    expect(wf.nextAction).toBe(0);

    release();
    await first;
    expect(wf.status).toBe("completed");
    expect(calls).toBe(1);
  });

  it("fails closed on an unknown condition instead of running the guarded action", async () => {
    const execute = vi.fn(async () => ({ success: true }));
    system.registerAction("test-guarded", { name: "guarded", execute } as any);
    const wf = triggered("wf-unknown-cond", [
      { type: "test-guarded", parameters: {}, conditions: [{ type: "no-such-condition", parameters: {} }] },
    ]);
    await system.executeWorkflows();
    expect(execute).not.toHaveBeenCalled();
    expect(wf.status).toBe("failed");
    expect(wf.error).toMatch(/^Automation action failed \(reference [0-9a-f-]+\)$/i);
    expect(wf.error).not.toContain("Unknown workflow condition");
  });

  it("completes when the final action is skipped by an unmet condition", async () => {
    system.registerCondition("test-false", { name: "false", evaluate: async () => false } as any);
    const execute = vi.fn(async () => ({ success: true }));
    system.registerAction("test-skipped", { name: "skipped", execute } as any);
    const wf = triggered("wf-skip-last", [
      { type: "test-skipped", parameters: {}, conditions: [{ type: "test-false", parameters: {} }] },
    ]);
    await system.executeWorkflows();
    expect(execute).not.toHaveBeenCalled();
    expect(wf.status).toBe("completed");
  });

  it("honors the kill switch and drains in-flight steps on shutdown", async () => {
    const execute = vi.fn(async () => ({ success: true }));
    system.registerAction("test-paused", { name: "paused", execute } as any);
    const wf = triggered("wf-paused", [{ type: "test-paused", parameters: {} }]);
    system._killSwitchPaused = true;
    await system.executeWorkflows();
    expect(execute).not.toHaveBeenCalled();
    system._killSwitchPaused = false;
    await system.executeWorkflows();
    expect(wf.status).toBe("completed");
    await system.shutdown();
  });
});
