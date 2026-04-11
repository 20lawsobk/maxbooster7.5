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
 *   - Directory already present → skip (already restored on a prior boot)
 *   - Capsule found, directory absent → verify checksum, extract, report timing
 *   - Extraction failure → exit(1) so the container never starts in a broken state
 */

import { execSync }        from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { createHash }      from 'crypto';

// ── Capsule registry ─────────────────────────────────────────────────────────
// Matches the directories packed by the _pdim_pack() function in build.sh.
const CAPSULES = [
  {
    capsule:  'node_modules.pdim',
    dir:      'node_modules',
    label:    'Production node_modules',
  },
  {
    capsule:  'python_runtime.pdim',
    dir:      'python_runtime',
    label:    'Portable Python 3.12 runtime',
  },
];

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

for (const { capsule, dir, label } of CAPSULES) {
  if (!existsSync(capsule)) continue; // no capsule → dev environment

  if (existsSync(dir)) {
    process.stdout.write(`[PDIM] ${label}: already present — skipping\n`);
    continue;
  }

  const manifestPath = capsule.replace(/\.pdim$/, '.manifest.json');
  const sizeMB = (statSync(capsule).size / 1024 / 1024).toFixed(1);

  process.stdout.write(
    `[PDIM] Restoring ${label} from capsule (${sizeMB} MB)...\n`
  );

  if (!verifyCapsule(capsule, manifestPath)) {
    process.stderr.write(`[PDIM] ❌ Integrity check failed — aborting startup\n`);
    process.exit(1);
  }

  const t0 = Date.now();
  try {
    execSync(`tar -xzf ${capsule}`, { stdio: 'inherit' });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`[PDIM] ✅ ${dir}/ restored in ${elapsed}s\n`);
    anyRestored = true;
  } catch (err) {
    process.stderr.write(
      `[PDIM] ❌ Failed to restore ${capsule}: ${err.message}\n`
    );
    process.exit(1);
  }
}

if (anyRestored) {
  process.stdout.write('[PDIM] All capsules restored — booting platform\n\n');
}
