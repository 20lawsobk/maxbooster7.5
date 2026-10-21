import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildDeploymentBootstrap } from "../../script/lib/serverBundles";

it("emits an executable dependency-free cold restore bootstrap outside application assets", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-bootstrap-"));
  try {
    await buildDeploymentBootstrap(process.cwd(), path.join(root, "dist"));
    for (const file of ["executive.mjs", "capacity.mjs", "plans.mjs", "restore-one.mjs",
      "port-contract.sh", "check-port-contract.mjs", "boot-stub-server.mjs", "ports.replit"]) {
      expect(fs.existsSync(path.join(root, "dist/deployment", file))).toBe(true);
    }
    // No source tree or node_modules exists in this cold target. Both import
    // closure and shell port validation must execute using only shipped files.
    const imported = spawnSync(process.execPath, ["--input-type=module", "-e",
      "await import('./dist/deployment/executive.mjs'); const {startPlan}=await import('./dist/deployment/plans.mjs'); if(!startPlan(process.execPath).at(-1).deps.includes('restore-app')) throw Error('app restore missing');"],
      { cwd: root, encoding: "utf8" });
    expect(imported.status, imported.stderr).toBe(0);
    const checked = spawnSync(process.execPath, ["dist/deployment/check-port-contract.mjs"], {
      cwd: root, encoding: "utf8", env: { PATH: process.env.PATH },
    });
    expect(checked.status, checked.stderr).toBe(0);
    const contract = spawnSync("bash", ["dist/deployment/port-contract.sh"], {
      cwd: root, encoding: "utf8", env: { PATH: process.env.PATH },
    });
    expect(contract.status, contract.stderr).toBe(0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
