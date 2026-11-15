/**
 * BUILD DEPLOYMENT CAPSULE
 *
 * Packages this app's own SOURCE tree into a portable, checksummed Pocket
 * Dimension "capsule" using the imported PDIM server's platform-capsule
 * engine (external/pdim/artifacts/api-server/src/pocket-dimension). Every
 * included file is content-addressed, deduplicated, compressed, and hashed;
 * the resulting manifest can be verified byte-for-byte after the fact.
 *
 * This is a distinct mechanism from build.sh's `.pdim` tar capsules (which
 * exist purely to shrink the deployed image and are restored automatically
 * on first boot via dist/pdim-restore.mjs). This script instead produces a
 * self-describing, portable snapshot of the app's OWN codebase — the same
 * pattern the PDIM server uses to give each end user an isolated, checksummed
 * storage pocket, applied to the app itself.
 *
 * SOURCE-ONLY, not a ready-to-run bundle: node_modules and dist are excluded
 * (huge, and fully reproducible), so the manifest's startCommand records the
 * real install+build+start sequence, not a shortcut that would fail against
 * an extracted capsule.
 *
 * Security: never bundles secrets. Combines (a) this app's own .gitignore —
 * the project's existing definition of what must never travel with source —
 * with (b) a hardcoded denylist of credential-shaped filenames, independent
 * of .gitignore accuracy. After building, the manifest is re-read and
 * scanned against that same denylist as a fail-loud safety net; see
 * tests/unit/capsule-builder-excludes-secrets.test.ts for the regression test.
 *
 * Usage:
 *   npx tsx script/build-capsule.ts [version]
 *
 * Output:
 *   A pocket dimension named `capsule-<version>-<timestamp>` under
 *   ./pocket-dimensions/ (this app's own PDIM storage root), containing:
 *     - files/<relative path>   — every packaged source file
 *     - manifest.json           — file list with per-file sha256 + type
 *     - metadata.json           — capsule identity, sizes, checksums
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  PlatformCapsuleBuilder,
  PlatformCapsuleLoader,
} from "../external/pdim/artifacts/api-server/src/pocket-dimension/platform-capsule.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Directories that are never part of a *runnable* copy of this app: build
// artifacts/caches, generated or user-uploaded data, and anything build.sh's
// own `.pdim` tar step already owns. Matched by exact directory name (or
// suffix), not full path.
//
// NOTE: `external/maxcore` is intentionally NOT excluded — the app's default
// configuration runs MaxCore as a local supervised subsystem
// (maxcoreLocalSupervisor) that requires external/maxcore/artifacts/api-server
// to exist on disk; a capsule missing it cannot boot the default config.
// `external/pdim` (the vendored PDIM server, and incidentally the very engine
// this script imports to build the capsule) is excluded: nothing at app
// runtime imports it — only this build tool does, and that tool must already
// be present on any machine that would extract/build a capsule anyway.
const APP_EXCLUDE_PATTERNS = [
  "pdim", // external/pdim only — no other directory in this repo is named "pdim"
  "attached_assets",
  "screenshots",
  "reports",
  "logs",
  ".cache",
  ".local",
  ".audit-wal",
  ".capsule-temp",
  ".pytest_cache",
  ".pythonlibs",
  ".config",
  ".upm",
  ".node_bin_dir",
  ".cloudflared",
  "python_runtime",
  "target", // Rust build output (boosterstate sidecar); source travels, rebuilt output does not
  "node_modules.pdim",
  "python_runtime.pdim",
  "source.pdim",
];

// Hardcoded, fail-closed secret/credential denylist. Independent of
// .gitignore accuracy — even if .gitignore is ever edited to stop excluding
// one of these, the capsule builder must still refuse to package it.
// Kept in sync with PlatformCapsuleBuilder's own DEFAULT_EXCLUDE.
const SECRET_DENYLIST_PATTERNS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.crt",
  "*.p12",
  "*.pfx",
  "*.keystore",
  "id_rsa*",
  "id_ed25519*",
  "*.gpg",
  "service-account*.json",
  "credentials*.json",
  "secrets*.json",
  ".netrc",
  ".git-credentials",
  ".npmrc", // may embed a registry auth token
  ".ssh",
];

function globToRegExp(pattern: string): RegExp {
  const source =
    "(^|/)" +
    pattern
      .split(/([*?])/g)
      .map((part) => {
        if (part === "*") return "[^/]*";
        if (part === "?") return "[^/]";
        return part.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      })
      .join("") +
    "(/|$)";
  return new RegExp(source);
}

const secretMatchers = SECRET_DENYLIST_PATTERNS.map(globToRegExp);

function isSecretLikePath(relativePath: string): boolean {
  return secretMatchers.some((re) => re.test(relativePath));
}

/** Turn this app's own .gitignore into extra exclude patterns for the
 * capsule builder. Best-effort and deliberately conservative: negation
 * (`!`), comment/blank lines, and — critically — any pattern that contains a
 * `/` are skipped entirely. Gitignore patterns with a slash are scoped to a
 * specific directory (e.g. `public/*.png`, `bin/*`); the builder only matches
 * bare segment names anywhere in the tree, so naively taking the basename of
 * a scoped pattern turns `bin/*` into a global `*` that would exclude every
 * file, or `public/*.png` into a global `*.png` that would drop unrelated
 * source assets. Only slash-free lines are already directory-agnostic in
 * gitignore semantics, so only those are safe to reuse as global excludes. */
async function excludesFromGitignore(root: string): Promise<string[]> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(root, ".gitignore"), "utf-8");
  } catch {
    return [];
  }
  const patterns = new Set<string>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!"))
      continue;
    if (trimmed.includes("/")) continue; // directory-scoped — unsafe to globalize
    if (trimmed === "*") continue; // never allow a catch-all through
    patterns.add(trimmed);
  }
  return Array.from(patterns);
}

async function main() {
  const version = process.argv[2] ?? new Date().toISOString().slice(0, 10);

  console.log(`[build-capsule] Packaging ${projectRoot} as v${version}...`);

  const gitignoreExcludes = await excludesFromGitignore(projectRoot);
  const excludePatterns = [
    ...APP_EXCLUDE_PATTERNS,
    ...SECRET_DENYLIST_PATTERNS,
    ...gitignoreExcludes,
  ];

  const builder = new PlatformCapsuleBuilder(projectRoot);
  const metadata = await builder.build({
    version,
    platformName: "Max Booster App",
    description: `Max Booster app source capsule v${version}`,
    // This is a SOURCE-ONLY capsule (node_modules/dist excluded), so the
    // truthful restore contract requires install+build before start — it
    // cannot be launched directly against the extracted files.
    entryPoint: "server/index.ts",
    startCommand: "npm install && npm run build && npm run start",
    environment: {
      NODE_ENV: "production",
    },
    encrypt: false,
    excludePatterns,
  });

  console.log(
    `[build-capsule] Built ${metadata.id}: ${metadata.contents.totalFiles} files, ` +
      `${(metadata.contents.totalSize / 1024 / 1024).toFixed(1)} MB -> ` +
      `${(metadata.contents.compressedSize / 1024 / 1024).toFixed(1)} MB ` +
      `(${metadata.contents.compressionRatio.toFixed(2)}x)`,
  );

  console.log(`[build-capsule] Verifying capsule integrity...`);
  const loader = new PlatformCapsuleLoader();
  await loader.load(metadata.id);
  const ok = await loader.verify();
  if (!ok) {
    throw new Error(
      `Capsule ${metadata.id} FAILED verification — a file hash did not match the manifest`,
    );
  }
  console.log(
    `[build-capsule] ✅ Verified: all ${metadata.contents.totalFiles} files match their manifest checksums`,
  );

  // Fail-loud safety net: independent of the exclude patterns above, scan
  // the actual manifest for anything credential-shaped before declaring
  // success. This catches drift between the exclude list and reality rather
  // than silently shipping a capsule with secrets in it.
  const manifest = loader.getManifest();
  const leaked = (manifest?.files ?? [])
    .map((f) => f.path)
    .filter(isSecretLikePath);
  if (leaked.length > 0) {
    throw new Error(
      `[build-capsule] SECURITY: capsule ${metadata.id} contains ${leaked.length} ` +
        `credential-shaped file(s) that must never be packaged: ${leaked.join(", ")}. ` +
        `Delete pocket-dimensions/${metadata.id} and fix the exclude patterns before retrying.`,
    );
  }
  console.log(
    `[build-capsule] ✅ Secret scan clean: no credential-shaped files in the manifest`,
  );

  console.log(`[build-capsule] Capsule id: ${metadata.id}`);
}

main().catch((err) => {
  console.error("[build-capsule] FAILED:", err);
  process.exit(1);
});
