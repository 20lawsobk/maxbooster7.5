#!/usr/bin/env node
/**
 * Preserve distinct August 2026 deployment entrypoints and documentation from
 * reachable Git refs without replacing the current production configuration.
 *
 * Default: report a dry run. Use --write once to materialize the archive.
 * Use --verify afterward to check archived checksums and active-file baselines.
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_ROOT = join(
  ROOT,
  "docs/archive/production-variants-2026-08",
);
const HISTORY_ROOT = join(ARCHIVE_ROOT, "history");
const START = "2026-08-01T00:00:00Z";
const END = "2026-09-01T00:00:00Z";

const CODE_PATHS = [
  "build.sh",
  "start.sh",
  "scripts/start-production.sh",
  "scripts/start-dev.sh",
  "script/build.ts",
  "script/build-capsule.ts",
  "scripts/deployment-autofix.mjs",
  "scripts/build-boosterstate.sh",
  "deploy-gcp.sh",
  "Dockerfile",
  "Dockerfile.prod",
  "docker/Dockerfile",
  "docker/docker-entrypoint.sh",
  "digital gpu/server/services/diffusion/start_api.sh",
  "external/maxcore/artifacts/ai-training-server/start.sh",
  "external/maxcore/scripts/start-production.sh",
  "artifacts/ai-training-server/start.sh",
  "Procfile",
  "package.json",
];

const DOCUMENT_PATHS = [
  "docs/DEPLOYMENT.md",
  "docs/PRODUCTION_GRADE_LAUNCH_BLUEPRINT.md",
  "PRODUCTION_READINESS.md",
  ".agents/memory/deploy-8gb-live-footprint.md",
  ".agents/memory/deploy-autofix-coverage-gaps.md",
  ".agents/memory/deploy-boot-stub-port-gap.md",
  ".agents/memory/deploy-runtime-helper-packaging.md",
  ".agents/memory/replit-nix-feeds-deploy-closure.md",
  ".agents/memory/capsule-compression-codec-choice.md",
];

const REPLIT_CONFIG_PATH = ".replit";

const ACTIVE_PATHS = [
  ".replit",
  "package.json",
  "build.sh",
  "start.sh",
  "scripts/start-production.sh",
  "scripts/start-production.mjs",
  "scripts/start-dev.sh",
  "Dockerfile",
  "Dockerfile.prod",
  "deploy-gcp.sh",
];

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: options.encoding ?? "buffer",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function getTrackedFileHashes() {
  const hashes = {};
  for (const relativePath of ACTIVE_PATHS) {
    const absolutePath = join(ROOT, relativePath);
    if (existsSync(absolutePath) && lstatSync(absolutePath).isFile()) {
      hashes[relativePath] = sha256(readFileSync(absolutePath));
    }
  }
  return hashes;
}

function extractDeploymentScripts(packageBytes) {
  const parsed = JSON.parse(packageBytes.toString("utf8"));
  const scripts = Object.fromEntries(
    Object.entries(parsed.scripts ?? {})
      .filter(([name]) =>
        /(?:^|:)(?:build|start|deploy|publish|release|prod|capsule)(?:$|:)|production/i.test(
          name,
        ),
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return Buffer.from(
    `${JSON.stringify(
      {
        source: "package.json script entries only",
        scripts,
      },
      null,
      2,
    )}\n`,
  );
}

function extractReplitDeploymentConfig(replitBytes) {
  const fields = {};
  let inDeploymentSection = false;
  for (const rawLine of replitBytes.toString("utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      inDeploymentSection = section[1] === "deployment";
      continue;
    }
    if (!inDeploymentSection || !line || line.startsWith("#")) continue;
    const entry = line.match(/^(deploymentTarget|build|run)\s*=\s*(.+)$/);
    if (entry) fields[entry[1]] = entry[2].trim();
  }
  if (Object.keys(fields).length === 0) return null;
  return Buffer.from(
    `${JSON.stringify(
      {
        source: ".replit [deployment] allowlisted fields only",
        fields,
      },
      null,
      2,
    )}\n`,
  );
}

const SENSITIVE_ASSIGNMENT =
  /^\s*(?:export\s+)?["']?[A-Z0-9_]*(?:API_KEY|ACCESS_KEY|PRIVATE_KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*["']?\s*[:=]\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^\s#,\]}]+))/im;
const PRIVATE_KEY_BLOCK =
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const CREDENTIAL_URL =
  /(?:postgres(?:ql)?|redis):\/\/[^/\s:@]+:[^/\s@]{6,}@/i;
const LITERAL_CREDENTIAL_ARGUMENT =
  /(?:^|[\s"'`])--?(?:api[-_]?key|access[-_]?token|token|secret|password)(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s"'`]+))/i;
const INLINE_ENV_CREDENTIAL =
  /\b[A-Z0-9_]*(?:API_KEY|ACCESS_KEY|PRIVATE_KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*\s*=\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^\s#,\]}]+))/i;
const SAFE_VALUE_PREFIX =
  /^(?:\$|%|process\.env|os\.(?:environ|getenv)|env\.|your[-_ ]|example[-_ ]|placeholder|change[-_ ]me|changeme|replace[-_ ])/i;

function hasEmbeddedSecret(bytes) {
  const text = bytes.toString("utf8");
  if (PRIVATE_KEY_BLOCK.test(text) || CREDENTIAL_URL.test(text)) return true;
  for (const pattern of [
    SENSITIVE_ASSIGNMENT,
    LITERAL_CREDENTIAL_ARGUMENT,
    INLINE_ENV_CREDENTIAL,
  ]) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = match.slice(1).find(Boolean)?.trim() ?? "";
    if (value.length >= 12 && !SAFE_VALUE_PREFIX.test(value)) return true;
  }
  return false;
}

function isPackageScriptsPath(relativePath) {
  return relativePath === "package.json";
}

function getAugustCommits() {
  const output = runGit(
    [
      "log",
      "--all",
      `--since=${START}`,
      `--until=${END}`,
      "--format=%H%x09%aI%x09%s",
    ],
    { encoding: "utf8" },
  );
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, authorDate, ...subjectParts] = line.split("\t");
      return {
        hash,
        authorDate,
        subject: subjectParts.join("\t"),
      };
    });
}

function scanAugustTrees(commits) {
  const sourcePaths = [
    ...new Set([...CODE_PATHS, ...DOCUMENT_PATHS, REPLIT_CONFIG_PATH]),
  ];
  const unique = new Map();
  const commitByHash = new Map(commits.map((commit) => [commit.hash, commit]));

  for (const commit of commits) {
    const tree = runGit([
      "ls-tree",
      "-r",
      "-z",
      "--full-tree",
      commit.hash,
      "--",
      ...sourcePaths,
    ]);
    for (const entry of tree.toString("utf8").split("\0").filter(Boolean)) {
      const tab = entry.indexOf("\t");
      if (tab < 0) continue;
      const [mode, type, objectId] = entry.slice(0, tab).split(" ");
      const relativePath = entry.slice(tab + 1);
      if (type !== "blob" || !sourcePaths.includes(relativePath)) continue;

      const key = `${relativePath}\0${objectId}`;
      if (!unique.has(key)) {
        unique.set(key, {
          relativePath,
          objectId,
          mode,
          observedAt: commitByHash.get(commit.hash),
        });
      }
    }
  }

  return [...unique.values()];
}

function classify(relativePath) {
  if (DOCUMENT_PATHS.includes(relativePath)) return "documentation";
  if (isPackageScriptsPath(relativePath)) return "npm-scripts";
  if (relativePath === REPLIT_CONFIG_PATH) return "launch-config";
  return "scripts-and-config";
}

function archiveName(relativePath, hash) {
  const extension = extname(relativePath);
  const stem = basename(relativePath, extension);
  return `${stem}--${hash.slice(0, 12)}${extension}`;
}

function archivedFilePath(archivePath) {
  const prefix = "history/";
  if (typeof archivePath !== "string" || !archivePath.startsWith(prefix)) {
    throw new Error("Manifest contains a path outside the archive.");
  }
  const absolutePath = resolve(HISTORY_ROOT, archivePath.slice(prefix.length));
  if (!absolutePath.startsWith(`${HISTORY_ROOT}${sep}`)) {
    throw new Error("Manifest path escapes the archive directory.");
  }
  return absolutePath;
}

function buildArchivePlan() {
  const commits = getAugustCommits();
  if (commits.length === 0) {
    throw new Error("No commits found in the August 2026 history window.");
  }

  const variants = [];
  const potentialSecrets = [];
  const emittedContent = new Set();
  for (const entry of scanAugustTrees(commits)) {
    const gitBytes = runGit(["cat-file", "blob", entry.objectId]);
    let bytes = gitBytes;
    if (isPackageScriptsPath(entry.relativePath)) {
      bytes = extractDeploymentScripts(gitBytes);
    } else if (entry.relativePath === REPLIT_CONFIG_PATH) {
      bytes = extractReplitDeploymentConfig(gitBytes);
      if (!bytes) continue;
    }
    if (hasEmbeddedSecret(bytes)) {
      potentialSecrets.push(entry.relativePath);
      continue;
    }
    const contentHash = sha256(bytes);
    const contentIdentity = `${entry.relativePath}\0${contentHash}`;
    if (emittedContent.has(contentIdentity)) continue;
    emittedContent.add(contentIdentity);
    const category = classify(entry.relativePath);
    const archivedPath =
      category === "npm-scripts"
        ? `history/npm-scripts/${archiveName(
            "package-scripts.json",
            contentHash,
          )}`
        : entry.relativePath === REPLIT_CONFIG_PATH
          ? `history/launch-config/${archiveName(
              "replit-deployment.json",
              contentHash,
            )}`
          : `history/${category}/${entry.relativePath}/${archiveName(
              entry.relativePath,
              contentHash,
            )}`;
    variants.push({
      sourcePath: entry.relativePath,
      archivedPath,
      category,
      gitBlobSha: entry.objectId,
      sha256: contentHash,
      bytes: bytes.length,
      originalMode: entry.mode,
      observedAtCommit: entry.observedAt,
      content: bytes,
    });
  }

  if (potentialSecrets.length > 0) {
    throw new Error(
      `Potential embedded credential detected in: ${[
        ...new Set(potentialSecrets),
      ].join(", ")}. No archive was written.`,
    );
  }

  variants.sort(
    (left, right) =>
      left.category.localeCompare(right.category) ||
      left.sourcePath.localeCompare(right.sourcePath) ||
      left.sha256.localeCompare(right.sha256),
  );
  return { commits, variants };
}

function serializeManifest(plan, activeFileHashes) {
  const files = plan.variants.map(({ content, ...metadata }) => metadata);
  return {
    schemaVersion: 1,
    historyWindow: { start: START, endExclusive: END },
    sourceRefs: "all refs present in this checkout at export time",
    commitCount: plan.commits.length,
    archivedVariantCount: files.length,
    activeFileHashes,
    files,
  };
}

function assertExistingArchiveCanExpand(plan) {
  const manifestPath = join(HISTORY_ROOT, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error("Refusing to replace an archive without its manifest.");
  }
  verifyArchive();
  const current = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (
    current.schemaVersion !== 1 ||
    current.historyWindow?.start !== START ||
    current.historyWindow?.endExclusive !== END
  ) {
    throw new Error("Existing archive is not a compatible August archive.");
  }
  const existingVariants = new Set(
    current.files.map((file) => `${file.sourcePath}\0${file.sha256}`),
  );
  const nextVariants = new Set(
    plan.variants.map((file) => `${file.sourcePath}\0${file.sha256}`),
  );
  const missing = [...existingVariants].filter((key) => !nextVariants.has(key));
  if (missing.length > 0) {
    throw new Error(
      "Refusing to rebuild because it would drop previously archived variants.",
    );
  }
}

function writeArchive(plan, { rebuild = false } = {}) {
  mkdirSync(ARCHIVE_ROOT, { recursive: true });
  const archiveExists = existsSync(HISTORY_ROOT);
  if (archiveExists && !rebuild) {
    throw new Error(
      `${HISTORY_ROOT} already exists. Refusing to overwrite an existing archive.`,
    );
  }
  if (archiveExists) assertExistingArchiveCanExpand(plan);

  const activeFileHashes = getTrackedFileHashes();
  const staging = mkdtempSync(join(ARCHIVE_ROOT, ".history-staging-"));
  const backup = join(ARCHIVE_ROOT, `.history-backup-${process.pid}`);
  try {
    const manifest = serializeManifest(plan, activeFileHashes);
    for (const variant of plan.variants) {
      const archiveRelativePath = relative(
        HISTORY_ROOT,
        archivedFilePath(variant.archivedPath),
      );
      const target = join(staging, archiveRelativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, variant.content, { flag: "wx", mode: 0o644 });
      chmodSync(target, 0o644);
    }
    writeFileSync(
      join(staging, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx", mode: 0o644 },
    );
    if (archiveExists) renameSync(HISTORY_ROOT, backup);
    try {
      renameSync(staging, HISTORY_ROOT);
    } catch (error) {
      if (archiveExists && existsSync(backup)) renameSync(backup, HISTORY_ROOT);
      throw error;
    }
    if (archiveExists) rmSync(backup, { recursive: true, force: true });
    console.log(
      `[archive] Wrote ${plan.variants.length} distinct historical variants from ${plan.commits.length} August commits.`,
    );
    console.log(
      `[archive] Current deployment files were left untouched; archived scripts have non-executable permissions.`,
    );
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function verifyArchive() {
  const manifestPath = join(HISTORY_ROOT, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error("No August archive manifest exists; run with --write first.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const failures = [];
  for (const file of manifest.files) {
    let path;
    try {
      path = archivedFilePath(file.archivedPath);
    } catch {
      failures.push("manifest contains an unsafe archive path");
      continue;
    }
    if (!existsSync(path)) {
      failures.push(`missing ${file.archivedPath}`);
      continue;
    }
    const stat = lstatSync(path);
    if (!stat.isFile()) {
      failures.push(`not a regular file ${file.archivedPath}`);
      continue;
    }
    const bytes = readFileSync(path);
    if (sha256(bytes) !== file.sha256) {
      failures.push(`checksum/type mismatch ${file.archivedPath}`);
    }
    if ((stat.mode & 0o111) !== 0) {
      failures.push(`historical script is executable ${file.archivedPath}`);
    }
  }

  const activeFileHashes = getTrackedFileHashes();
  const changedActiveFiles = Object.entries(manifest.activeFileHashes)
    .filter(([path, hash]) => activeFileHashes[path] !== hash)
    .map(([path]) => path);
  if (failures.length > 0) {
    throw new Error(`Archive verification failed: ${failures.join("; ")}`);
  }
  console.log(
    `[archive] Verified ${manifest.files.length} archived files against SHA-256.`,
  );
  if (changedActiveFiles.length > 0) {
    throw new Error(
      `Active files differ from the saved pre-archive baseline: ${changedActiveFiles.join(", ")}`,
    );
  }
  console.log("[archive] Active production files match their pre-archive hashes.");
}

function main() {
  const args = new Set(process.argv.slice(2));
  const modes = ["--write", "--rebuild", "--verify"].filter((mode) =>
    args.has(mode),
  );
  if (
    modes.length > 1 ||
    [...args].some(
      (arg) => !["--write", "--rebuild", "--verify"].includes(arg),
    )
  ) {
    throw new Error(
      "Usage: node scripts/archive-august-production-variants.mjs [--write|--rebuild|--verify]",
    );
  }
  const gitRoot = runGit(["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  if (resolve(gitRoot) !== ROOT) {
    throw new Error("Run this tool from the Max Booster repository checkout.");
  }
  if (args.has("--verify")) {
    verifyArchive();
    return;
  }

  const plan = buildArchivePlan();
  if (args.has("--write") || args.has("--rebuild")) {
    writeArchive(plan, { rebuild: args.has("--rebuild") });
    return;
  }

  const counts = plan.variants.reduce((groups, variant) => {
    (groups[variant.category] ??= []).push(variant);
    return groups;
  }, {});
  console.log(
    `[archive] Dry run: ${plan.commits.length} August commits; ${plan.variants.length} distinct versions.`,
  );
  for (const [category, files] of Object.entries(counts)) {
    console.log(`  ${category}: ${files.length}`);
  }
  console.log("Run with --write to create the additive archive.");
}

try {
  main();
} catch (error) {
  console.error(`[archive] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
