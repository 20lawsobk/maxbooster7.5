import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it, expect } from "vitest";
import { packCapsule, packCapsuleMembers } from "../../script/lib/capsulePack";
import { cachedCapsule, verifyCapsule, treeIdentity } from "../../script/lib/preparedCapsules";
import { inventory } from "../../script/lib/releaseInventory";
import { NODE_MODULE_CAPSULE_EXCLUDE_PATHS } from "../../script/lib/releaseCapsuleInputs.mjs";
import { execFileSync } from "node:child_process";

it("packs and production-restores capsules without changing source bytes or permissions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nondestructive-release-"));
  try {
    const source = path.join(root, "source");
    const output = path.join(root, "output");
    fs.mkdirSync(path.join(source, "example"), { recursive: true });
    fs.writeFileSync(path.join(source, "example/content"), "real capsule payload");
    fs.chmodSync(path.join(source, "example/content"), 0o640);
    const before = await inventory(source);
    await packCapsule({ root: source, dir: "example", capsule: "example.pdim", outputRoot: output, preserveSource: true, threads: 1 });
    expect(await inventory(source)).toEqual(before);
    await verifyCapsule(process.cwd(), root, output, "example", "example");
    expect(fs.readdirSync(root).some(name => name.startsWith("verify-"))).toBe(false);
    await packCapsuleMembers({ root: source, members: ["example/content"], capsule: "members.pdim", outputRoot: output, preserveSource: true, threads: 1 });
    expect(await inventory(source)).toEqual(before);
    await verifyCapsule(process.cwd(), root, output, "members", "example");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}, 60000);

it("ignores changing Vite build caches in dependency identities and actual capsule bytes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-cache-exclusions-"));
  try {
    fs.mkdirSync(path.join(root, "node_modules/runtime-package"), { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/runtime-package/index.js"), "export const value = 1;");
    for (const dir of NODE_MODULE_CAPSULE_EXCLUDE_PATHS) {
      fs.mkdirSync(path.join(root, "node_modules", dir));
      fs.writeFileSync(path.join(root, "node_modules", dir, "transient"), "before");
    }
    const before = await treeIdentity(root, "node_modules", NODE_MODULE_CAPSULE_EXCLUDE_PATHS);
    for (const dir of NODE_MODULE_CAPSULE_EXCLUDE_PATHS) {
      fs.writeFileSync(path.join(root, "node_modules", dir, "transient"), "changed during verification");
    }
    expect(await treeIdentity(root, "node_modules", NODE_MODULE_CAPSULE_EXCLUDE_PATHS)).toBe(before);
    await packCapsule({ root, dir: "node_modules", capsule: "node_modules.pdim", outputRoot: path.join(root, "output"),
      preserveSource: true, threads: 1, excludePaths: [...NODE_MODULE_CAPSULE_EXCLUDE_PATHS] });
    const members = execFileSync("tar", ["--zstd", "-tf", path.join(root, "output/node_modules.pdim")], { encoding: "utf8" });
    expect(members).toContain("node_modules/runtime-package/index.js");
    for (const dir of NODE_MODULE_CAPSULE_EXCLUDE_PATHS) expect(members).not.toContain(`node_modules/${dir}/`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}, 60000);

it("never commits a capsule when round-trip verification detects changed source", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-cache-source-change-"));
  try {
    const source = path.join(root, "source"), cache = path.join(root, "cache"), payload = path.join(root, "payload");
    fs.mkdirSync(path.join(source, "example"), { recursive: true });
    fs.mkdirSync(payload);
    fs.writeFileSync(path.join(source, "example/content"), "before packing");
    const before = await treeIdentity(source, "example");
    await expect(cachedCapsule({ cache, payload, name: "example", key: before,
      build: async output => {
        await packCapsule({ root: source, dir: "example", capsule: "example.pdim", outputRoot: output, preserveSource: true, threads: 1 });
        fs.writeFileSync(path.join(source, "example/content"), "changed during preparation");
      },
      verify: async output => {
        await verifyCapsule(process.cwd(), root, output, "example", "example");
        if (before !== await treeIdentity(source, "example")) throw new Error("source changed during preparation");
      },
    })).rejects.toThrow(/source changed/);
    expect(fs.readdirSync(cache)).toEqual([]);
    expect(fs.readdirSync(payload)).toEqual([]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}, 60000);

it("reuses only verified identical capsule identities and rejects corruption", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-cache-"));
  try {
    fs.mkdirSync(path.join(root, "source/example"), { recursive: true });
    fs.writeFileSync(path.join(root, "source/example/content"), "cache fixture");
    let builds = 0, verifies = 0;
    const prepare = async (key: string, name: string) => {
      const payload = path.join(root, name);
      fs.mkdirSync(payload);
      await cachedCapsule({ cache: path.join(root, "cache"), payload, name: "example", key,
        build: async output => {
          builds++;
          await packCapsule({ root: path.join(root, "source"), dir: "example", capsule: "example.pdim",
            outputRoot: output, preserveSource: true, threads: 1 });
        },
        verify: async output => { verifies++; await verifyCapsule(process.cwd(), root, output, "example", "example"); },
      });
    };
    await prepare("first", "one");
    await prepare("first", "two");
    expect([builds, verifies]).toEqual([1, 1]);
    await prepare("changed", "three");
    expect([builds, verifies]).toEqual([2, 2]);
    const capsule = path.join(root, "cache/example-first/example.pdim");
    fs.chmodSync(capsule, 0o644);
    fs.writeFileSync(capsule, "corrupt");
    await expect(prepare("first", "four")).rejects.toThrow(/damaged/);
    expect(builds).toBe(2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}, 60000);
