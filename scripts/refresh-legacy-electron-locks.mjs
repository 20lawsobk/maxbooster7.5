// Regenerate the guarded legacy replay bundle without editing retained sources.
// Package-manager outputs are generated in isolated staging directories.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundleFile = path.join(root, "tools/legacy-security-update.json");
const original = fs.readFileSync(bundleFile, "utf8");
const bundle = JSON.parse(original);
const hash = text => createHash("sha256").update(text).digest("hex");
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-electron-locks-"));
try {
  for (const scope of ["maxbooster7.5", "maxbooster7.5/maxbooster7.5"]) {
    const dir = path.join(stage, scope);
    fs.mkdirSync(dir, { recursive: true });
    const entries = ["package.json", "package-lock.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]
      .map(name => bundle.files.find(entry => entry.path === `${scope}/${name}`));
    if (entries.some(entry => !entry || hash(entry.content) !== entry.afterSha256)) {
      throw new Error(`Missing or corrupt known replay inputs for ${scope}`);
    }
    for (const entry of entries) fs.writeFileSync(path.join(dir, path.basename(entry.path)), entry.content);
    const pkg = JSON.parse(entries[0].content);
    pkg.overrides["@electron/get"] = "5.1.0";
    pkg.engines.node = ">=22.12.0";
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    const workspace = entries[3].content;
    if (!workspace.includes("overrides:\n")) throw new Error("Missing pnpm overrides");
    fs.writeFileSync(path.join(dir, "pnpm-workspace.yaml"),
      workspace.replace("overrides:\n", "overrides:\n  '@electron/get': 5.1.0\n"));
    for (const [command, args] of [
      ["npm", ["install", "--package-lock-only", "--ignore-scripts", "--legacy-peer-deps", "--no-audit", "--no-fund"]],
      ["pnpm", ["install", "--lockfile-only", "--ignore-scripts", "--config.manage-package-manager-versions=false"]],
    ]) {
      const result = spawnSync(command, args, { cwd: dir, encoding: "utf8", timeout: 180000,
        maxBuffer: 4 * 1024 * 1024, env: { ...process.env, CI: "true" } });
      if (result.error || result.status !== 0) {
        throw new Error(`${scope}: ${command} failed: ${result.error?.message ?? result.stderr}\n${result.stdout}`);
      }
    }
    for (const entry of entries) {
      const content = fs.readFileSync(path.join(dir, path.basename(entry.path)), "utf8");
      if (content.includes('"http-cache-semantics":') || content.includes("  http-cache-semantics@")) {
        throw new Error(`${entry.path}: vulnerable cache dependency survived`);
      }
      if (content !== entry.content) {
        entry.acceptedBeforeSha256 = [...new Set([...(entry.acceptedBeforeSha256 ?? []), entry.afterSha256])];
        entry.content = content;
        entry.afterSha256 = hash(content);
      }
    }
  }
  if (fs.readFileSync(bundleFile, "utf8") !== original) throw new Error("Replay bundle changed during generation");
  fs.writeFileSync(bundleFile, JSON.stringify(bundle, null, 2) + "\n");
  console.log("Updated both legacy lock pairs; original and predecessor checksums retained.");
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}