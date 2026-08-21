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

import { existsSync, readFileSync, writeFileSync, rmSync, createReadStream } from "fs";
import { createHash } from "crypto";
import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Streaming, non-blocking sha256 — reading large capsules synchronously
// (readFileSync + createHash) stalls Node's single event loop for the whole
// read+hash duration, which serializes every other "concurrent" restore
// behind it one at a time. A stream yields to the event loop between chunks,
// so multiple capsules' checksums (and their tar extractions) actually
// overlap instead of just appearing to.
function sha256File(path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolvePromise(hash.digest("hex")));
    stream.on("error", rejectPromise);
  });
}

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

async function restoreCapsule(capsuleName, manifestName, targetDir, sentinel) {
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
  // Streamed (see sha256File) so this doesn't block the other concurrent
  // restores' event-loop turns while it reads a large capsule.
  if (manifest?.sha256) {
    const actual = await sha256File(capsulePath);
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

  return new Promise((resolvePromise) => {
    const fail = (msg) => {
      console.error(`[pdim-restore] ERROR: ${msg}`);
      // Remove a partially extracted tree so the next boot retries cleanly.
      try {
        rmSync(resolve(ROOT, targetDir), { recursive: true, force: true });
      } catch {}
      resolvePromise(false);
    };

    // Each capsule extracts into its own target directory, so running the
    // four restores concurrently is safe (no shared-path writes) and turns
    // total wall-clock time from the SUM of all extractions into roughly the
    // MAX of the largest one — needed to stay under the deployment
    // promote-step startup-probe timeout now that four capsules ship.
    const child = spawn("tar", [tarFlag, capsulePath, "-C", ROOT], {
      stdio: "inherit",
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(`tar timed out after 900s extracting ${capsuleName}`);
    }, 900_000);

    child.on("error", (err) => {
      clearTimeout(timer);
      fail(`tar spawn failed: ${err.message}`);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) return fail(`tar exited with code ${code}`);

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
      resolvePromise(true);
    });
  });
}

const [nodeModulesOk, , maxcoreOk] = await Promise.all([
  restoreCapsule(
    "node_modules.pdim",
    "node_modules.manifest.json",
    "node_modules",
    ".pdim-restored",
  ),
  restoreCapsule(
    "python_runtime.pdim",
    "python_runtime.manifest.json",
    "python_runtime",
    ".pdim-restored-py",
  ),
  // external/maxcore — internalized MaxCore subsystem (packed by script/build.ts).
  // Required unless local MaxCore mode is explicitly disabled (MAXCORE_LOCAL=0).
  restoreCapsule(
    "external_maxcore.pdim",
    "external_maxcore.manifest.json",
    "external/maxcore",
    ".pdim-restored-maxcore",
  ),
  // external/pdim — vendored PDIM subsystem (packed by script/build.ts).
  // Shipped per user directive that the entire project be included; a failed
  // restore is logged but non-fatal since app runtime does not import it.
  restoreCapsule(
    "external_pdim.pdim",
    "external_pdim.manifest.json",
    "external/pdim",
    ".pdim-restored-pdim",
  ),
]);

let ok = nodeModulesOk;
if (process.env.MAXCORE_LOCAL !== "0") ok = maxcoreOk && ok;

if (!ok) {
  console.error(
    "[pdim-restore] FATAL: a required capsule restore failed — server will crash",
  );
  process.exit(1);
}

console.log("[pdim-restore] All capsules processed.");
