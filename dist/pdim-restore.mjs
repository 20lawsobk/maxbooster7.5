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

import { existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { createHash } from "crypto";
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

  // Verify capsule integrity before extraction when the manifest has a hash.
  if (manifest?.sha256) {
    const actual = createHash("sha256")
      .update(readFileSync(capsulePath))
      .digest("hex");
    if (actual !== manifest.sha256) {
      console.error(
        `[pdim-restore] ERROR: checksum mismatch for ${capsuleName}\n` +
          `  expected ${manifest.sha256}\n  actual   ${actual}`,
      );
      return false;
    }
  }

  console.log(
    `[pdim-restore] Extracting ${capsuleName} (${compression}) → ${targetDir}/ ...`,
  );

  const result = spawnSync("tar", [tarFlag, capsulePath, "-C", ROOT], {
    stdio: "inherit",
    timeout: 900_000,
  });

  const fail = (msg) => {
    console.error(`[pdim-restore] ERROR: ${msg}`);
    // Remove a partially extracted tree so the next boot retries cleanly.
    try {
      rmSync(resolve(ROOT, targetDir), { recursive: true, force: true });
    } catch {}
    return false;
  };
  if (result.error) return fail(`tar spawn failed: ${result.error.message}`);
  if (result.status !== 0) return fail(`tar exited with code ${result.status}`);

  // Write the sentinel only after a fully successful extraction so
  // subsequent boots skip re-extraction (idempotent restore).
  try {
    writeFileSync(sentinelPath, new Date().toISOString());
  } catch (e) {
    console.error(
      `[pdim-restore] WARN: could not write sentinel ${sentinelPath}: ${e.message}`,
    );
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

// external/maxcore — internalized MaxCore subsystem (packed by script/build.ts).
// Required unless local MaxCore mode is explicitly disabled (MAXCORE_LOCAL=0).
const maxcoreOk = restoreCapsule(
  "external_maxcore.pdim",
  "external_maxcore.manifest.json",
  "external/maxcore",
  ".pdim-restored-maxcore",
);
if (process.env.MAXCORE_LOCAL !== "0") ok = maxcoreOk && ok;

if (!ok) {
  console.error(
    "[pdim-restore] FATAL: a required capsule restore failed — server will crash",
  );
  process.exit(1);
}

console.log("[pdim-restore] All capsules processed.");
