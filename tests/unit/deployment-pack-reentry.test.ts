import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  beginDeploymentPack,
  recoverDeploymentPack,
  RECOVERY_HELPER_PATH,
} from "../../script/lib/deploymentPackRecovery.mjs";
import { MODEL_RELEASE_MANIFEST, validateModelRelease } from "../../script/lib/modelRelease.js";
import { computeRemainingAppMembers } from "../../script/lib/dockerignoreScan.js";

// No application, DB, network, or real workspace payload is started/touched.
// Real capsule API + tar/zstd run in disposable isolated directories.
const hasZstd = spawnSync("zstd", ["--version"], { stdio: "ignore" }).status === 0;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-pack-reentry-"));
  roots.push(root);
  const files = new Map<string, Buffer>();
  function write(relative: string, value: string | Buffer) {
    const bytes = Buffer.from(value);
    files.set(relative, bytes);
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), bytes);
  }
  const content = Buffer.from("small authentic fixture checkpoint\n".repeat(128));
  const sha256 = createHash("sha256").update(content).digest("hex");
  const pointer = Buffer.from(`version https://git-lfs.github.com/spec/v1\noid sha256:${sha256}\nsize ${content.length}\n`);
  const sourceGitBlob = createHash("sha1").update(`blob ${pointer.length}\0`).update(pointer).digest("hex");
  const weights = "external/maxcore/artifacts/ai-training-server/ai_model/weights";
  write(`${weights}/model.corrupt`, content);
  write(`${weights}/model.pt`, content);
  write(MODEL_RELEASE_MANIFEST, JSON.stringify({
    schemaVersion: 1, sourcePath: `${weights}/model.corrupt`, sourceGitBlob,
    path: `${weights}/model.pt`, bytes: content.length, sha256,
    capability: "numerical-inference", qualityClaim: "not-evaluated",
  }));
  write("external/maxcore/source.py", "print('serving source')\n");
  write("external/pdim/source.py", "print('pdim source')\n");
  write("python_runtime/bin/python3", "fixture executable bytes\n");
  fs.chmodSync(path.join(root, "python_runtime/bin/python3"), 0o755);
  write("node_modules/fixture-package/index.js", "export const actual = 42;\n");
  fs.mkdirSync(path.join(root, "node_modules/.bin"));
  fs.symlinkSync("../fixture-package/index.js", path.join(root, "node_modules/.bin/fixture"));
  write("server/index.ts", "export const source = 'real fixture';\n");
  write("client/index.html", "<!doctype html><title>fixture</title>\n");
  write("script/build.ts", "// build source fixture\n");
  write("dist/index.mjs", "export const compiled = true;\n");
  write(RECOVERY_HELPER_PATH, fs.readFileSync(path.resolve(RECOVERY_HELPER_PATH)));
  write(".dockerignore", fs.readFileSync(path.join(process.cwd(), ".dockerignore"), "utf8"));
  return { root, files, weights };
}

function runPacking(root: string, scenario: string) {
  const helper = pathToFileURL(path.resolve(RECOVERY_HELPER_PATH)).href;
  const packer = pathToFileURL(path.resolve("script/lib/capsulePack.ts")).href;
  // The child actually dies with SIGKILL at pack boundaries; no finally/exit
  // hook repairs its sources. Recovery runs as a fresh dependency-free Node.
  const worker = path.join(root, ".pack-worker.mjs");
  fs.writeFileSync(worker, `
    import { beginDeploymentPack } from ${JSON.stringify(helper)};
    import { packCapsule, packCapsuleMembers, MAXCORE_CAPSULE_EXCLUDE_PATHS } from ${JSON.stringify(packer)};
    const root = ${JSON.stringify(root)};
    const transaction = beginDeploymentPack(root);
    const targets = [
      ["external/maxcore", "external_maxcore.pdim"],
      ["node_modules", "node_modules.pdim"],
      ["python_runtime", "python_runtime.pdim"],
      ["external/pdim", "external_pdim.pdim"],
    ];
    for (const [dir, capsule] of targets) {
      await packCapsule({ root, dir, capsule, threads: 1,
        excludePaths: dir === "external/maxcore" ? MAXCORE_CAPSULE_EXCLUDE_PATHS : [] });
      if (${JSON.stringify(scenario)} === "one") process.kill(process.pid, "SIGKILL");
    }
    const members = ["server/index.ts", "client/index.html", "script/build.ts", "dist/index.mjs"];
    transaction.preserveMembers(members);
    const remainder = packCapsuleMembers({ root, members, capsule: "app_remainder.pdim", threads: 1 });
    if (${JSON.stringify(scenario)} === "remainder-start") process.kill(process.pid, "SIGKILL");
    await remainder;
    if (${JSON.stringify(scenario)} === "complete") transaction.complete();
    process.kill(process.pid, "SIGKILL");
  `);
  const child = spawnSync(process.execPath, ["--import", "tsx", worker], {
    cwd: process.cwd(), encoding: "utf8", timeout: 60_000,
  });
  expect(child.signal, child.stderr + child.stdout).toBe("SIGKILL");
}

function recoverInFreshNode(root: string) {
  execFileSync(process.execPath, [
    path.join(root, RECOVERY_HELPER_PATH), "--recover", root,
  ], { encoding: "utf8" });
}

describe("deployment capsule build reentry (real tar/zstd)", () => {
  for (const scenario of ["one", "remainder-start", "remainder", "complete"]) {
    it.skipIf(!hasZstd)(`restores all build inputs after SIGKILL at ${scenario} pack boundary`, () => {
      const { root, files, weights } = fixture();
      runPacking(root, scenario);
      expect(fs.existsSync(path.join(root, MODEL_RELEASE_MANIFEST))).toBe(false);
      expect(fs.existsSync(path.join(root, weights, "model.corrupt"))).toBe(false);
      if (scenario === "remainder" || scenario === "complete") {
        expect(fs.existsSync(path.join(root, "server/index.ts"))).toBe(false);
      }
      if (scenario !== "one") {
        expect(fs.existsSync(path.join(root, "node_modules"))).toBe(false);
      }
      // Bootstrap helper itself must not have been packed.
      expect(fs.existsSync(path.join(root, RECOVERY_HELPER_PATH))).toBe(true);
      recoverInFreshNode(root);
      for (const [relative, bytes] of files) {
        expect(fs.readFileSync(path.join(root, relative)), relative).toEqual(bytes);
      }
      expect(fs.readlinkSync(path.join(root, "node_modules/.bin/fixture"))).toBe("../fixture-package/index.js");
      expect(fs.statSync(path.join(root, "python_runtime/bin/python3")).mode & 0o777).toBe(0o755);
      expect(validateModelRelease(root).bytes).toBe(files.get(`${weights}/model.pt`)!.length);
      expect(recoverDeploymentPack(root)).toBe(false);
      // A second genuine destructive build can snapshot the recovered sources.
      runPacking(root, "complete");
      recoverInFreshNode(root);
      expect(validateModelRelease(root).bytes).toBe(files.get(`${weights}/model.pt`)!.length);
    }, 120_000);
  }

  it("does not ship backup bytes through the existing dockerignore scanner", () => {
    const { root } = fixture();
    beginDeploymentPack(root);
    expect(computeRemainingAppMembers(root).some((member) => member.startsWith(".deployment-pack-state/"))).toBe(false);
    recoverDeploymentPack(root);
  });

  it("preserves later edits and fully enforces checkpoint validation after recovery", () => {
    const { root, weights } = fixture();
    const transaction = beginDeploymentPack(root);
    transaction.preserveMembers(["server/index.ts"]);
    fs.rmSync(path.join(root, "external/maxcore"), { recursive: true });
    fs.mkdirSync(path.join(root, weights), { recursive: true });
    fs.writeFileSync(path.join(root, weights, "model.pt"), "changed checkpoint");
    fs.writeFileSync(path.join(root, "server/index.ts"), "new edit");
    recoverDeploymentPack(root);
    expect(fs.readFileSync(path.join(root, "server/index.ts"), "utf8")).toBe("new edit");
    expect(() => validateModelRelease(root)).toThrow(/checkpoint size mismatch/);
  });

  it("fails closed on a missing backup without deleting remaining recovery data", () => {
    const { root } = fixture();
    beginDeploymentPack(root);
    const directory = path.join(root, ".deployment-pack-state/transaction");
    fs.rmSync(path.join(directory, "sources/node_modules"), { recursive: true });
    expect(() => recoverDeploymentPack(root)).toThrow(/backup missing/);
    expect(fs.existsSync(path.join(directory, "sources/external/maxcore"))).toBe(true);
  });

  it("rejects journal traversal before restoration", () => {
    const { root } = fixture();
    beginDeploymentPack(root);
    const journalPath = path.join(root, ".deployment-pack-state/transaction/journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    journal.members = ["../escape"];
    fs.writeFileSync(journalPath, JSON.stringify(journal));
    expect(() => recoverDeploymentPack(root)).toThrow(/Invalid deployment pack recovery path/);
  });
  it("does not confuse a reused PID from another boot with an active build", () => {
    const { root } = fixture();
    beginDeploymentPack(root);
    const journalPath = path.join(root, ".deployment-pack-state/transaction/journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    journal.ownerPid = process.ppid; // live, but not the recorded packing owner
    journal.ownerIdentity = "another-boot:123";
    fs.writeFileSync(journalPath, JSON.stringify(journal));
    expect(recoverDeploymentPack(root)).toBe(true);
  });
});