/**
 * PDIM CAPSULE RESTORE — Pocket Dimension "Extract & Boot" mode
 *
 * Restores compressed .pdim capsules created by build.sh back into usable
 * runtime directories on first startup.  Implements the PocketDimension
 * storage engine's Extract & Boot flow: capsule → integrity check → extract.
 *
 * This file is committed to dist/ so it survives the build.sh source-tree
 * deletion and is always present in the run container.
 *
 * Behaviour:
 *   - No .pdim files found  → silent no-op (development environment)
 *   - Directory present WITH sentinel (.pdim-restored) → already healthy, skip
 *   - Directory present WITHOUT sentinel → stale/incomplete → re-extract
 *   - Capsule found, directory absent → verify checksum, extract, report timing
 *   - Extraction failure → exit(1) so the container never starts in a broken state
 *
 * Sentinel file: node_modules/.pdim-restored (written into capsule during build)
 * This detects a stale node_modules from a prior deployment where the PDIM
 * restore was skipped or interrupted, preventing MODULE_NOT_FOUND crashes.
 */

import { execSync }        from 'child_process';
import { existsSync, readFileSync, statSync, rmSync } from 'fs';
import { createHash }      from 'crypto';
import { join }            from 'path';

// ── Capsule registry ─────────────────────────────────────────────────────────
// Matches the directories packed by build.sh.
//
// autoRestore: true  — extracted on every startup before the server boots
// autoRestore: false — preserved in capsule form; restore manually when needed
//                      (e.g. for source inspection or triggering a SLOW PATH rebuild)
const CAPSULES = [
  {
    capsule:     'node_modules.pdim',
    dir:         'node_modules',
    label:       'Production node_modules',
    autoRestore: true,
    sentinel:    'node_modules/.pdim-restored',
  },
  {
    capsule:     'python_runtime.pdim',
    dir:         'python_runtime',
    label:       'Portable Python 3.12 runtime',
    autoRestore: true,
    sentinel:    null,   // no sentinel needed — python_runtime is self-contained
  },
  {
    capsule:     'source.pdim',
    dir:         null,            // multi-dir capsule — no single target dir
    label:       'Application source tree',
    autoRestore: false,           // not needed at runtime (server runs from dist/)
    sentinel:    null,
    note:        'Restore manually — check source.manifest.json for compression format (xz: tar -xJf source.pdim | gzip: tar -xzf source.pdim)',
  },
];

// ── Format-aware decompressor ─────────────────────────────────────────────────
// Reads the compression field written by build.sh into the .manifest.json.
// Supports: xz-* → tar -xJf | gzip-* / default → tar -xzf
function tarExtractCmd(capsule, manifestPath) {
  let compression = 'gzip-9';
  if (existsSync(manifestPath)) {
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (m.compression) compression = m.compression;
    } catch { /* use default */ }
  }
  if (compression.startsWith('xz')) return `tar -xJf ${capsule}`;
  return `tar -xzf ${capsule}`;
}

// ── Integrity check ──────────────────────────────────────────────────────────
function verifyCapsule(capsulePath, manifestPath) {
  if (!existsSync(manifestPath)) return true; // manifest optional
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!manifest.sha256) return true;
    const data = readFileSync(capsulePath);
    const actual = createHash('sha256').update(data).digest('hex');
    if (actual !== manifest.sha256) {
      process.stderr.write(
        `[PDIM] ⚠️  Checksum mismatch for ${capsulePath}\n` +
        `       expected: ${manifest.sha256}\n` +
        `       actual:   ${actual}\n`
      );
      return false;
    }
    return true;
  } catch {
    return true; // non-fatal: proceed without checksum
  }
}

// ── Restore loop ─────────────────────────────────────────────────────────────
let anyRestored = false;

for (const { capsule, dir, label, autoRestore, sentinel, note } of CAPSULES) {
  if (!existsSync(capsule)) continue; // no capsule → dev environment or already extracted

  // Skip capsules that should not be auto-restored at startup
  if (!autoRestore) {
    process.stdout.write(
      `[PDIM] ${label}: preserved as capsule (${(statSync(capsule).size / 1024 / 1024).toFixed(1)} MB)` +
      (note ? ` — ${note}` : '') + '\n'
    );
    continue;
  }

  // ── Sentinel-aware directory check ──────────────────────────────────────────
  // If the target directory already exists, check for a sentinel file that proves
  // it was extracted by PDIM (not left over from a broken prior deployment).
  // A directory without a sentinel is stale — delete it and re-extract.
  if (dir && existsSync(dir)) {
    if (sentinel && existsSync(sentinel)) {
      process.stdout.write(`[PDIM] ${label}: already restored — skipping\n`);
      continue;
    }
    // Stale directory: prior deployment left an incomplete node_modules or the
    // pdim-restore.mjs was missing and the capsule was never extracted.
    process.stdout.write(
      `[PDIM] ${label}: stale directory detected (missing sentinel ${sentinel}) — re-extracting...\n`
    );
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (rmErr) {
      process.stderr.write(`[PDIM] ⚠️  Could not remove stale ${dir}: ${rmErr.message} — attempting extraction anyway\n`);
    }
  }

  const manifestPath = capsule.replace(/\.pdim$/, '.manifest.json');
  const sizeMB = (statSync(capsule).size / 1024 / 1024).toFixed(1);

  process.stdout.write(`[PDIM] Restoring ${label} (${sizeMB} MB)...\n`);

  if (!verifyCapsule(capsule, manifestPath)) {
    process.stderr.write(`[PDIM] ❌ Integrity check failed for ${capsule} — aborting startup\n`);
    process.exit(1);
  }

  const cmd = tarExtractCmd(capsule, manifestPath);
  const t0 = Date.now();
  try {
    execSync(cmd, { stdio: 'inherit' });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`[PDIM] ✅ ${dir}/ restored in ${elapsed}s\n`);
    anyRestored = true;
  } catch (err) {
    process.stderr.write(`[PDIM] ❌ Failed to restore ${capsule} (cmd: ${cmd}): ${err.message}\n`);
    process.exit(1);
  }
}

if (anyRestored) {
  process.stdout.write('[PDIM] All capsules restored — booting platform\n\n');
}
