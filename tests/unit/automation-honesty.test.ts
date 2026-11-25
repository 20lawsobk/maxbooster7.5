import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import AutomationSystem from "../../server/automation-system";

// Regression tests for Task #104: automation actions must never report
// success:true without a real side effect, and the workflow dispatcher must
// only advance/complete a step when an action confirms success === true.

describe("Automation action honesty", () => {
  const system = AutomationSystem.getInstance();
  // Access the private actions map at runtime (TS `private` is compile-time
  // only) so we can exercise each registered action's real return contract.
  const actions = (system as unknown as { actions: Map<string, any> }).actions;

  const notImplementedActions = [
    "generate-analytics-report",
    "ai-mix-track",
    "ai-master-track",
    "upload-beat",
    "process-payment",
    "create-promo-video",
    "create-social-video",
    "create-lyric-video",
    "create-visualizer-video",
  ];

  for (const type of notImplementedActions) {
    it(`${type} honestly reports success:false (no real implementation exists)`, async () => {
      const action = actions.get(type);
      expect(action, `action ${type} should be registered`).toBeTruthy();
      const result = await action.execute({});
      expect(result).toMatchObject({ success: false });
      expect(typeof result.message).toBe("string");
    });
  }

  it("backup-data fails safely when no database is configured", () => {
    const entry = new URL("../../server/automation-system.ts", import.meta.url).href;
    const marker = "__AUTOMATION_ACTION_RESULT__";
    const source = `
      import AutomationSystem from ${JSON.stringify(entry)};
      const action = AutomationSystem.getInstance().actions.get("backup-data");
      const result = await action.execute({});
      process.stdout.write("\\n${marker}" + JSON.stringify(result) + "\\n", () => process.exit(0));
    `;
    const env = { ...process.env };
    delete env.NEON_PRIMARY_URL;
    delete env.NEON_DATABASE_URL;
    delete env.DATABASE_URL;
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", source],
      { cwd: process.cwd(), env, encoding: "utf8", timeout: 20_000 },
    );
    expect(result.error, result.stderr).toBeUndefined();
    expect(result.status, result.stderr + result.stdout).toBe(0);
    const resultIndex = result.stdout.lastIndexOf(marker);
    expect(resultIndex).toBeGreaterThanOrEqual(0);
    const resultLine = result.stdout.slice(resultIndex + marker.length).split(/\r?\n/, 1)[0];
    const actionResult = JSON.parse(resultLine);
    expect(actionResult).toMatchObject({ success: false });
    expect(actionResult.message).toContain(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }, 25_000);

  it("send-notification reports failure (not success) with zero recipients", async () => {
    const action = actions.get("send-notification");
    const result = await action.execute({
      title: "t",
      message: "m",
      recipients: [],
    });
    expect(result).toMatchObject({ success: false });
  });

  it("send-email reports failure (not success) when no userId/email can be resolved", async () => {
    const action = actions.get("send-email");
    const result = await action.execute({ subject: "s", body: "b" });
    expect(result).toMatchObject({ success: false });
  });

  it("keeps workflow start/stop idempotent and stops each configured trigger", () => {
    const stopped: string[] = [];
    for (const triggerType of ["test-trigger-a", "test-trigger-b"]) {
      system.registerTrigger(triggerType, {
        name: triggerType,
        description: "test-only trigger",
        parameters: [],
        start: () => ({ triggerType }),
        stop: (instance: unknown) => {
          expect(instance).toEqual({ triggerType });
          stopped.push(triggerType);
        },
      });
    }

    const workflow = system.createWorkflow({
      name: "lifecycle regression",
      description: "isolated lifecycle test",
      triggers: [
        { type: "test-trigger-a", parameters: {} },
        { type: "test-trigger-b", parameters: {} },
      ],
      actions: [],
    });
    const baseline = system.getMetrics().activeWorkflows;

    try {
      expect(system.startWorkflow(workflow.id)).toBe(true);
      expect(system.getMetrics().activeWorkflows).toBe(baseline + 1);
      expect(system.startWorkflow(workflow.id)).toBe(true);
      expect(system.getMetrics().activeWorkflows).toBe(baseline + 1);

      expect(system.stopWorkflow(workflow.id)).toBe(true);
      expect(system.getMetrics().activeWorkflows).toBe(baseline);
      expect(system.stopWorkflow(workflow.id)).toBe(true);
      expect(system.getMetrics().activeWorkflows).toBe(baseline);
      expect(stopped).toEqual(["test-trigger-a", "test-trigger-b"]);
    } finally {
      system.deleteWorkflow(workflow.id);
      const triggers = (system as unknown as {
        triggers: Map<string, unknown>;
      }).triggers;
      triggers.delete("test-trigger-a");
      triggers.delete("test-trigger-b");
    }
  });

  it("does not run the same slow workflow action concurrently", async () => {
    const actionType = "test-delayed-workflow-action";
    let calls = 0;
    let announceStarted = () => {};
    let releaseAction = () => {};
    const started = new Promise<void>((resolve) => {
      announceStarted = resolve;
    });
    const actionGate = new Promise<void>((resolve) => {
      releaseAction = resolve;
    });

    system.registerAction(actionType, {
      name: "test-only delayed action",
      description: "isolated concurrency test",
      parameters: [],
      execute: async () => {
        calls++;
        announceStarted();
        await actionGate;
        return { success: true };
      },
    });

    const workflow = system.createWorkflow({
      name: "concurrency regression",
      description: "isolated in-flight action test",
      triggers: [],
      actions: [{ type: actionType, parameters: {} }],
    });
    const runner = system as unknown as {
      executeWorkflowStep(workflow: unknown): Promise<void>;
      actions: Map<string, unknown>;
    };
    system.startWorkflow(workflow.id);
    workflow.status = "triggered";
    const firstRun = runner.executeWorkflowStep(workflow);

    try {
      await started;
      await runner.executeWorkflowStep(workflow);
      expect(calls).toBe(1);
      releaseAction();
      await firstRun;
      expect(workflow.status).toBe("completed");
      expect(calls).toBe(1);
    } finally {
      releaseAction();
      await firstRun;
      system.deleteWorkflow(workflow.id);
      runner.actions.delete(actionType);
    }
  });

  it("keeps raw provider exception text out of persisted workflow status", async () => {
    const actionType = "test-provider-error-action";
    const sensitiveMessage = "provider response contained a private credential";
    system.registerAction(actionType, {
      name: "test-only failing action",
      description: "isolated error-redaction test",
      parameters: [],
      execute: async () => {
        throw new Error(sensitiveMessage);
      },
    });

    const workflow = system.createWorkflow({
      name: "error-redaction regression",
      description: "isolated provider failure test",
      triggers: [],
      actions: [{ type: actionType, parameters: {} }],
    });
    const runner = system as unknown as {
      executeWorkflowStep(workflow: unknown): Promise<void>;
      actions: Map<string, unknown>;
    };
    system.startWorkflow(workflow.id);
    workflow.status = "triggered";

    try {
      await runner.executeWorkflowStep(workflow);
      expect(workflow.status).toBe("failed");
      expect(workflow.error).toMatch(
        /^Automation action failed \(reference [0-9a-f-]{36}\)$/,
      );
      expect(workflow.error).not.toContain(sensitiveMessage);
    } finally {
      system.deleteWorkflow(workflow.id);
      runner.actions.delete(actionType);
    }
  });

  it("every registered action returns an explicit success boolean (positive contract)", async () => {
    for (const [type, action] of actions.entries()) {
      // Actions that require real params/DB to run meaningfully are covered
      // elsewhere; here we just assert the ones safe to call with empty
      // params still return a well-formed { success: boolean } result rather
      // than throwing or returning something the dispatcher can't gate on.
      if (
        type === "send-email" ||
        type === "send-notification" ||
        type === "distribute-music" ||
        type === "post-social-media" ||
        // This invokes a real full-database export and must only run inside a
        // disposable backup integration test, never in a generic action sweep.
        type === "backup-data"
      ) {
        continue; // these hit real services/DB and are covered by other suites
      }
      const result = await action.execute({});
      expect(
        typeof result === "object" &&
          result !== null &&
          typeof (result as any).success === "boolean",
        `action ${type} must return { success: boolean }, got ${JSON.stringify(result)}`,
      ).toBe(true);
    }
  });
});
