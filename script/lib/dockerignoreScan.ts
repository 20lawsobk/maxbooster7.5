/**
 * Computes "the rest of the app payload" — every file that would still ship
 * in the final deploy image after the four existing Extract & Boot capsules
 * (node_modules, python_runtime, external/maxcore, external/pdim) are packed
 * and removed, and that isn't part of the small pre-restore bootstrap set
 * start.sh needs before any capsule can be extracted.
 *
 * The deploy image's real contents are governed by .dockerignore, which the
 * Replit platform applies AFTER script/build.ts finishes. Reimplementing
 * .dockerignore's ~190 lines of patterns by hand (a second exclude list that
 * has to be kept in sync by memory) is exactly the kind of drift this file
 * avoids: it parses the real .dockerignore with the same gitignore-syntax
 * semantics Docker itself uses (via the `ignore` npm package, the same
 * matcher `git` and dockerignore parsers are commonly built on) and walks
 * the ACTUAL on-disk tree at build time — not `git ls-files` — so untracked
 * build output (dist/) and any untracked top-level cruft that .dockerignore
 * does not happen to exclude are measured exactly as the platform would ship
 * them, not approximated.
 */
import fs from "fs";
import path from "path";
import ignore from "ignore";
import { DEPLOYMENT_CONTROL_FILES } from "./deploymentControlFiles.js";

/**
 * Directories/files this scan must never report as "remaining" even though
 * .dockerignore does not exclude them — either because they are the
 * bootstrap set start.sh needs before any capsule restore can run, because
 * they're one of the four EXISTING capsules' own live output (already
 * handled by script/build.ts's other packCapsule() calls), or because they
 * are this new capsule's own output files (packing a capsule's own archive
 * into itself is meaningless). None of these are things .dockerignore is
 * expected to know about — they're specific to the Extract & Boot mechanism.
 */
export const BOOTSTRAP_AND_CAPSULE_OWN_PATHS = [
  ...DEPLOYMENT_CONTROL_FILES.map((file) => `/${file}`),
  "start.sh",
  ".node_bin",
  "scripts/boot-stub-server.mjs",
  "scripts/port-contract.sh",
  "scripts/check-port-contract.ts",
  "dist/pdim-restore.mjs",
  "dist/.db-indexes-ok",
  ".replit",
  ".git",
  // Existing capsules' own artifacts + the directories they pack (already
  // gone from disk by the time this scan runs in script/build.ts, since
  // this scan is invoked after those packCapsule() calls resolve — listed
  // anyway so the scan is correct even if invoked standalone/out of order).
  "node_modules",
  "python_runtime",
  "external/maxcore",
  "external/pdim",
  "node_modules.pdim",
  "node_modules.manifest.json",
  "python_runtime.pdim",
  "python_runtime.manifest.json",
  "external_maxcore.pdim",
  "external_maxcore.manifest.json",
  "external_pdim.pdim",
  "external_pdim.manifest.json",
];

/** This new capsule's own output — never allowed to include itself. */
export const APP_REMAINDER_CAPSULE_FILE = "app_remainder.pdim";
export const APP_REMAINDER_MANIFEST_FILE = "app_remainder.manifest.json";

function loadDockerignoreMatcher(root: string) {
  const dockerignorePath = path.join(root, ".dockerignore");
  const ig = ignore();
  if (fs.existsSync(dockerignorePath)) {
    ig.add(fs.readFileSync(dockerignorePath, "utf8"));
  }
  // .dockerignore itself doesn't need to list these (they're mechanism-
  // specific to Extract & Boot, not general "don't ship this" policy), but
  // the scan must never walk into them regardless.
  ig.add(BOOTSTRAP_AND_CAPSULE_OWN_PATHS);
  ig.add([APP_REMAINDER_CAPSULE_FILE, APP_REMAINDER_MANIFEST_FILE]);
  // Runtime-only lock/scratch files from a capsule restore never exist at
  // build time in a clean checkout, but guard anyway for safety when this
  // scan is run against a workspace that has actually booted before.
  ig.add([".pdim-restore.lock", "*.pdim-restore.lock", ".pdim-scratch-*"]);
  return ig;
}

/**
 * Walks `root` (excluding whatever the matcher above ignores) and returns
 * every real FILE (never directories — directories are structure, not
 * payload) that survives, as POSIX-style paths relative to `root`. Symlinks
 * are skipped rather than followed, matching tar's default behavior and
 * avoiding infinite loops on a cyclic link.
 */
export function computeRemainingAppMembers(root: string): string[] {
  const ig = loadDockerignoreMatcher(root);
  const results: string[] = [];

  function walk(relDir: string) {
    const absDir = path.join(root, relDir);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      // `ignore` expects POSIX separators and no leading "./".
      if (ig.ignores(relPath)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(relPath);
      } else if (entry.isFile()) {
        results.push(relPath);
      }
    }
  }

  walk("");
  return results;
}
