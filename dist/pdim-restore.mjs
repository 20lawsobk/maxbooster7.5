#!/usr/bin/env node
/**
 * PDIM Capsule Restore — Extract & Boot
 *
 * Extracts node_modules.pdim (and python_runtime.pdim if present) on first
 * startup.  Idempotent: skips extraction when the sentinel file
 * node_modules/.pdim-restored already exists.
 *
 * Reads compression format from *.manifest.json written by build.sh:
 *   "xz-9e"  → tar -xJf  (XZ)
 *   "gzip-9" → tar -xzf  (gzip, fallback)
 */

import { existsSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function readManifest(manifestPath) {
  try {
    if (existsSync(manifestPath)) {
      return JSON.parse(readFileSync(manifestPath, "utf8"));
    }
  } catch (_) {}
  return null;
}

function restoreCapsule(capsuleName, manifestName, targetDir, sentinel) {
  const capsulePath = resolve(ROOT, capsuleName);
  const manifestPath = resolve(ROOT, manifestName);
  const sentinelPath = resolve(ROOT, targetDir, sentinel || ".pdim-restored");

  if (!existsSync(capsulePath)) {
    console.log(`[pdim-restore] ${capsuleName}: capsule not found — skipping`);
    return true;
  }

  if (existsSync(sentinelPath)) {
    console.log(`[pdim-restore] ${targetDir}/ already restored — skipping`);
    return true;
  }

  const manifest = readManifest(manifestPath);
  const compression = manifest?.compression || "gzip-9";
  const tarFlag = compression.startsWith("xz") ? "-xJf" : "-xzf";

  console.log(
    `[pdim-restore] Extracting ${capsuleName} (${compression}) → ${targetDir}/ ...`,
  );

  const result = spawnSync("tar", [tarFlag, capsulePath, "-C", ROOT], {
    stdio: "inherit",
    timeout: 300_000,
  });

  if (result.error) {
    console.error(
      `[pdim-restore] ERROR: tar spawn failed: ${result.error.message}`,
    );
    return false;
  }
  if (result.status !== 0) {
    console.error(
      `[pdim-restore] ERROR: tar exited with code ${result.status}`,
    );
    return false;
  }

  console.log(`[pdim-restore] ✅ ${targetDir}/ restored from ${capsuleName}`);
  return true;
}

let ok = true;

ok =
  restoreCapsule(
    "node_modules.pdim",
    "node_modules.manifest.json",
    "node_modules",
    ".pdim-restored",
  ) && ok;

restoreCapsule(
  "python_runtime.pdim",
  "python_runtime.manifest.json",
  "python_runtime",
  ".pdim-restored-py",
);

if (!ok) {
  console.error(
    "[pdim-restore] FATAL: node_modules restore failed — server will crash",
  );
  process.exit(1);
}

console.log("[pdim-restore] All capsules processed.");
