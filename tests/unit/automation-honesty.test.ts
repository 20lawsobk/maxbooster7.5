import { describe, it, expect } from "vitest";
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
    "backup-data",
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
        type === "post-social-media"
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
