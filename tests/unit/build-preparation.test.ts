import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { preparationConcurrency, runBuildProcess } from "../../script/lib/buildProcess";
import { runDeploymentJobs } from "../../script/lib/deploymentExecution";
import { computeRemainingAppMembers } from "../../script/lib/dockerignoreScan";

it("ships the readiness helper through the actual capsule exclusion policy", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "startup-payload-"));
  try {
    fs.copyFileSync(".dockerignore", path.join(root, ".dockerignore"));
    fs.mkdirSync(path.join(root, "scripts"));
    fs.writeFileSync(path.join(root, "scripts/startup-health.mjs"), "export {};");
    fs.writeFileSync(path.join(root, "scripts/dev-only.mjs"), "export {};");
    const members = computeRemainingAppMembers(root);
    expect(members).toContain("scripts/startup-health.mjs");
    expect(members).not.toContain("scripts/dev-only.mjs");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it("does not overlap heavyweight phases on small containers", () => {
  expect(preparationConcurrency({ cpus: 1, memoryGB: 8 })).toBe(1);
  expect(preparationConcurrency({ cpus: 4, memoryGB: 4 })).toBe(1);
  expect(preparationConcurrency({ cpus: 4, memoryGB: 8 })).toBe(2);
});

it("overlaps real phase processes and drains them before packing may start", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "build-phases-"));
  try {
    // A rendezvous rather than timing assumptions proves both children run
    // concurrently. Serial execution cannot create both readiness files.
    const child = `
      const fs = require('fs');
      const id = process.argv[1], other = id === 'a' ? 'b' : 'a';
      fs.writeFileSync(id, 'running');
      const deadline = Date.now()+3000;
      const timer = setInterval(() => {
        if (fs.existsSync(other)) {
          clearInterval(timer); fs.writeFileSync(id+'.done', 'complete');
        } else if (Date.now()>deadline) { clearInterval(timer); process.exit(2); }
      }, 10);
    `;
    await runDeploymentJobs(["a", "b"], 2,
      id => runBuildProcess(process.execPath, ["-e", child, id], root));
    expect(fs.readFileSync(path.join(root, "a.done"), "utf8")).toBe("complete");
    expect(fs.readFileSync(path.join(root, "b.done"), "utf8")).toBe("complete");
    await expect(runBuildProcess(process.execPath, ["-e", "process.exit(7)"], root)).rejects.toThrow(/7/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});