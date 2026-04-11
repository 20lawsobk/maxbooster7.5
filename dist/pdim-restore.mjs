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
 *   - Directory present WITH sentinel matching capsule SHA256 → already healthy, skip
 *   - Directory present WITH sentinel but SHA256 mismatch → capsule changed, re-extract
 *   - Directory present WITHOUT sentinel → stale/incomplete → re-extract
 *   - Capsule found, directory absent → verify checksum, extract, report timing
 *   - Extraction failure → exit(1) so the container never starts in a broken state
 *
 * Sentinel file: node_modules/.pdim-restored (written into capsule during build,
 *   then overwritten after extraction with the capsule's manifest SHA256 so that
 *   stale node_modules from a prior deployment are detected and re-extracted).
 */

import { execSync }        from 'child_process';
import { existsSync, readFileSync, writeFileSync, statSync, rmSync } from 'fs';
import { createHash }      from 'crypto';

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

// ── Read manifest SHA256 ──────────────────────────────────────────────────────
// Returns the expected SHA256 from the capsule's .manifest.json, or null if
// the manifest is missing or has no checksum.
function manifestSha256(manifestPath) {
  if (!existsSync(manifestPath)) return null;
  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return m.sha256 || null;
  } catch {
    return null;
  }
}

// ── Integrity check ──────────────────────────────────────────────────────────
function verifyCapsule(capsulePath, manifestPath) {
  const expected = manifestSha256(manifestPath);
  if (!expected) return true; // manifest optional
  try {
    const data = readFileSync(capsulePath);
    const actual = createHash('sha256').update(data).digest('hex');
    if (actual !== expected) {
      process.stderr.write(
        `[PDIM] ⚠️  Checksum mismatch for ${capsulePath}\n` +
        `       expected: ${expected}\n` +
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
  //
  // The sentinel stores the manifest SHA256 of the capsule that was extracted.
  // If the sentinel SHA256 matches the CURRENT capsule's manifest SHA256, the
  // directory is up-to-date and extraction is skipped.  A mismatch means the
  // capsule changed (new deployment with updated packages) — delete and re-extract.
  if (dir && existsSync(dir)) {
    if (sentinel && existsSync(sentinel)) {
      const manifestPath = capsule.replace(/\.pdim$/, '.manifest.json');
      const currentSha = manifestSha256(manifestPath);
      let sentinelSha = null;
      try {
        sentinelSha = readFileSync(sentinel, 'utf8').trim() || null;
      } catch { /* sentinel unreadable — treat as mismatch */ }

      if (currentSha && sentinelSha && currentSha === sentinelSha) {
        process.stdout.write(`[PDIM] ${label}: already restored (sha256 verified) — skipping\n`);
        continue;
      } else if (!currentSha) {
        // No manifest SHA — fall back to trusting the sentinel presence
        process.stdout.write(`[PDIM] ${label}: already restored (no manifest, trusting sentinel) — skipping\n`);
        continue;
      } else {
        // SHA mismatch: capsule was updated (new deployment) — must re-extract
        process.stdout.write(
          `[PDIM] ${label}: capsule updated (sha256 changed) — re-extracting for fresh deployment...\n`
        );
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch (rmErr) {
          process.stderr.write(`[PDIM] ⚠️  Could not remove stale ${dir}: ${rmErr.message} — attempting extraction anyway\n`);
        }
      }
    } else {
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

    // Overwrite the sentinel with the capsule's manifest SHA256 so that
    // future startups can detect when the capsule has changed (new deployment)
    // and re-extract instead of reusing a stale node_modules.
    if (sentinel) {
      const sha = manifestSha256(manifestPath) || 'no-manifest';
      try {
        writeFileSync(sentinel, sha, 'utf8');
        process.stdout.write(`[PDIM] Sentinel updated: ${sentinel} = ${sha.slice(0, 16)}...\n`);
      } catch (writeErr) {
        process.stderr.write(`[PDIM] ⚠️  Could not update sentinel ${sentinel}: ${writeErr.message}\n`);
      }
    }
  } catch (err) {
    process.stderr.write(`[PDIM] ❌ Failed to restore ${capsule} (cmd: ${cmd}): ${err.message}\n`);
    process.exit(1);
  }
}

if (anyRestored) {
  process.stdout.write('[PDIM] All capsules restored — booting platform\n\n');
}
