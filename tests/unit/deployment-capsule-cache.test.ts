import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { packCachedDeploymentCapsule, capsuleInputIdentity } from "../../script/lib/deploymentCapsuleCache";

it("reuses only matching verified archives, rejects tampering, and retains changed source", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "capsule-cache-contract-"));
  try {
    fs.mkdirSync(path.join(root, "runtime"));
    fs.writeFileSync(path.join(root, "runtime/a.txt"), "original content".repeat(1000));
    const options = { root, dir: "runtime", capsule: "runtime.pdim", threads: 1, preserveSource: true };
    const first = await packCachedDeploymentCapsule(options);
    const key = await capsuleInputIdentity(options);
    const archive = path.join(root, ".deployment-capsule-cache", key, "runtime.pdim");
    const created = fs.statSync(archive).mtimeMs;
    const second = await packCachedDeploymentCapsule(options);
    expect(second.sha256).toBe(first.sha256);
    expect(fs.statSync(archive).mtimeMs).toBe(created);
    fs.appendFileSync(archive, "corrupt");
    await expect(packCachedDeploymentCapsule({ ...options, preserveSource: false })).rejects.toThrow(/corrupt/);
    expect(fs.existsSync(path.join(root, "runtime/a.txt"))).toBe(true);
    fs.writeFileSync(path.join(root, "runtime/a.txt"), "different");
    expect(await capsuleInputIdentity(options)).not.toBe(key);
    await packCachedDeploymentCapsule({ ...options, preserveSource: false });
    expect(fs.existsSync(path.join(root, "runtime"))).toBe(false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
