import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Execute the actual workflow's shell gate, not a reimplementation of its rules.
const workflow = readFileSync(".github/workflows/test-runner.yml", "utf8");
const start = workflow.indexOf('          security_status="${{');
if (start < 0) throw new Error("Required CI summary gate was removed");
const template = workflow.slice(start).split("\n").map(line => line.slice(10)).join("\n");
function gate(suite: string, security: string, load: string, prelaunch: string, event = "workflow_dispatch") {
  const values: Record<string, string> = {
    "needs.security-tests.result": security,
    "needs.load-tests.result": load,
    "needs.prelaunch-check.result": prelaunch,
    "github.event.inputs.test_suite": suite,
    "github.event_name": event,
  };
  const script = template.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_match, key) => {
    if (!(key in values)) throw new Error(`Unexpected CI expression: ${key}`);
    return values[key];
  });
  return spawnSync("bash", ["-e", "-c", script], {
    env: { PATH: process.env.PATH, GITHUB_STEP_SUMMARY: "/dev/null" },
    timeout: 5000,
  }).status;
}
describe("required CI summary gate", () => {
  it.each([
    ["all", "success", "success", "success"],
    ["security", "success", "skipped", "skipped"],
    ["load", "skipped", "success", "skipped"],
    ["prelaunch", "skipped", "skipped", "success"],
  ])("accepts only the intended successful %s suite", (suite, security, load, prelaunch) => {
    expect(gate(suite, security, load, prelaunch)).toBe(0);
  });
  it.each(["failure", "cancelled", "skipped"])("rejects a required job that is %s", status => {
    for (let job = 0; job < 3; job++) {
      const states = ["success", "success", "success"];
      states[job] = status;
      expect(gate("all", states[0], states[1], states[2])).not.toBe(0);
    }
  });
  it("rejects unexpected skipped required and running excluded jobs in single suites", () => {
    expect(gate("security", "skipped", "skipped", "skipped")).not.toBe(0);
    expect(gate("load", "skipped", "cancelled", "skipped")).not.toBe(0);
    expect(gate("prelaunch", "success", "skipped", "success")).not.toBe(0);
  });
  it("checks scheduled runs and refuses unknown suite selection", () => {
    expect(gate("", "success", "skipped", "success", "schedule")).toBe(0);
    expect(gate("", "success", "skipped", "cancelled", "schedule")).not.toBe(0);
    expect(gate("unknown", "skipped", "skipped", "skipped")).not.toBe(0);
  });
});
