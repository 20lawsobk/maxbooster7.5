// Regenerate package-manager outputs from checksum-verified replay inputs.
// Retained sources are changed only by apply-legacy-security-update.mjs.
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
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-advisory-locks-"));
const overrides = {
  "proxy-addr": "^2.0.8", "source-map-js": "^1.2.2",
  "fast-copy": "^4.1.0", "postcss-selector-parser": "^7.1.6",
};
try {
  for (const scope of ["maxbooster7.5", "maxbooster7.5/maxbooster7.5"]) {
    const dir = path.join(stage, scope);
    fs.mkdirSync(dir, { recursive: true });
    const entries = ["package.json", "package-lock.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]
      .map(name => bundle.files.find(entry => entry.path === `${scope}/${name}`));
    if (entries.some(entry => !entry || hash(entry.content) !== entry.afterSha256)) {
      throw new Error(`Missing or corrupt replay inputs for ${scope}`);
    }
    for (const entry of entries) fs.writeFileSync(path.join(dir, path.basename(entry.path)), entry.content);
    const pkg = JSON.parse(entries[0].content);
    pkg.dependencies.compression = "^1.8.2";
    pkg.dependencies["@capacitor/core"] = "^8.5.2";
    for (const name of ["android", "ios", "cli"]) pkg.devDependencies[`@capacitor/${name}`] = "^8.5.2";
    Object.assign(pkg.overrides, overrides);
    pkg.overrides["@tensorflow/tfjs"] = { ...pkg.overrides["@tensorflow/tfjs"], argparse: "^2.0.1" };
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    if (!entries[3].content.includes("overrides:\n")) throw new Error("Missing pnpm overrides");
    let workspace = entries[3].content;
    for (const [key, value] of Object.entries({
      ...overrides, compression: "^1.8.2", "@tensorflow/tfjs>argparse": "^2.0.1", "xcode>uuid": "11.1.1",
    })) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const existing = new RegExp(`^  ['"]?${escaped}['"]?:.*$`, "m");
      const line = `  '${key}': '${value}'`;
      workspace = existing.test(workspace) ? workspace.replace(existing, line)
        : workspace.replace("overrides:\n", `overrides:\n${line}\n`);
    }
    fs.writeFileSync(path.join(dir, "pnpm-workspace.yaml"), workspace);
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
      if (/"node_modules\/sprintf-js":|^\s{2}sprintf-js@/m.test(content)) {
        throw new Error(`${entry.path}: unpatched sprintf-js survived`);
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
  console.log("Updated legacy locks with verified predecessor checksums retained.");
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
