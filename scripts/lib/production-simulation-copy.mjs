import fs from "node:fs";
import path from "node:path";

const EXCLUDED_TOP_LEVEL = new Set([
  ".git",
  ".prepared-release",
  ".deployment-pack-state",
  ".github",
  ".vscode",
  ".idea",
  ".replit",
  ".config",
  ".agents",
  ".capsule-temp",
  ".next",
  ".pythonlibs",
  ".pytest_cache",
  ".venv",
  "venv",
  "__pycache__",
  "ai_model",
  "android",
  "boosterstate-data",
  "boostersheets_db",
  "coverage",
  "data",
  "docs",
  "electron",
  "electron-out",
  "ios",
  "logs",
  "maxbooster7.5",
  "maxbooster_veo_music",
  "Max-Booster",
  "Max Booster final documentation",
  "AI training server",
  "attached_assets",
  "archive-capsules",
  ".cache",
  ".local",
  ".nyc_output",
  ".auditscratch",
  ".audit-wal",
  "pocket-dimensions",
  "pocket dimension storage tech",
  "playwright-report",
  "reports",
  "release",
  "services",
  "storybook-static",
  "test",
  "tests",
  "__tests__",
  "test-results",
  "uploads",
  "AI enhancements",
  "built-in plugins dsp",
  "awareness layer",
  "hardware",
  "VST",
  "VST3",
  "dist-installers",
  "dist-portable",
  "out",
  "artifacts",
]);

const MAXCORE_EXCLUDED_SUBTREES = [
  "artifacts/ai-training-server/ai_model/training_data",
  "artifacts/ai-training-server/ai_model/training/candidate_runs",
  "artifacts/ai-training-server/ai_model/training/live_learning_runs",
  "artifacts/ai-training-server/ai_model/training/live_candidate_admissions",
];

const EXCLUDED_SOURCE_SUBTREES = [
  "client/public/screenshots",
  "client/public/videos",
];

export const REQUIRED_SIMULATION_TEST_PATHS = Object.freeze([
  "tests/fixtures/pdim-recovery-cluster-fixture.ts",
  "tests/fixtures/retained-pdim-source-fixture-worker.ts",
  "tests/unit/maxcore-cluster-ownership.test.ts",
  "tests/unit/maxcore-python-launcher.test.ts",
  "tests/unit/compute-sizing-cpu-share.test.ts",
  "tests/unit/maxcore-readiness-gate.test.ts",
  "tests/unit/pdim-recovery-cluster-integration.test.ts",
  "tests/unit/pdim-recovery-operator.test.ts",
  "tests/unit/retained-pdim-recovery-simulation.test.ts",
  "tests/unit/toolost-runtime-config.test.ts",
]);

const EXCLUDED_CAPSULE_ROOT_CONFIG_NAMES = new Set([
  ".npmrc",
  "cookies.txt",
]);

function isWithin(relativePath, prefix) {
  return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

/**
 * Returns whether a workspace-relative path belongs in the disposable
 * production-build copy. Sensitive paths are rejected before lstat/copy;
 * nested package contents are otherwise kept intact.
 */
export function shouldCopyProductionSimulationPath(relativePath) {
  const normalized = toPosix(relativePath);
  if (!normalized || normalized === ".") return true;

  const parts = normalized.split("/");
  const basename = parts[parts.length - 1];
  if (parts[0] === "tests") {
    return REQUIRED_SIMULATION_TEST_PATHS.some(
      (requiredPath) =>
        requiredPath === normalized || requiredPath.startsWith(`${normalized}/`),
    );
  }
  if (EXCLUDED_TOP_LEVEL.has(parts[0])) return false;
  if (parts[0] === ".cloudflared") return false;
  if (EXCLUDED_SOURCE_SUBTREES.some((prefix) => isWithin(normalized, prefix))) {
    return false;
  }
  if (
    normalized.startsWith("dist/public/") &&
    (normalized.endsWith(".gz") || normalized.endsWith(".br"))
  ) {
    return false;
  }

  if (
    parts.length === 1 &&
    (basename.endsWith(".log") ||
      basename.endsWith(".pdim") ||
      basename.endsWith(".manifest.json") ||
      basename === ".npmrc" ||
      basename === "cookies.txt" ||
      basename === ".cloudflared" ||
      basename === ".env" ||
      basename.startsWith(".env."))
  ) {
    return false;
  }

  if (parts[0] !== "node_modules" && parts[0] !== "external" &&
    (basename === ".npmrc" ||
      basename === ".env" ||
      basename.startsWith(".env."))) {
    return false;
  }

  if (isWithin(normalized, "public/generated-content")) return false;
  if (isWithin(normalized, "dns-node/keys")) return false;

  const isCapsuleSource =
    parts[0] === "external" &&
    (parts[1] === "maxcore" || parts[1] === "pdim");
  if (!isCapsuleSource) return true;

  const subsystemPath = parts.slice(2).join("/");
  if (
    parts.length === 3 &&
    (EXCLUDED_CAPSULE_ROOT_CONFIG_NAMES.has(basename) ||
      basename === ".env" ||
      basename.startsWith(".env."))
  ) {
    return false;
  }
  if (
    subsystemPath === ".cloudflared" ||
    subsystemPath.startsWith(".cloudflared/")
  ) {
    return false;
  }

  if (parts[1] === "maxcore") {
    if (
      MAXCORE_EXCLUDED_SUBTREES.some((prefix) =>
        isWithin(subsystemPath, prefix),
      ) ||
      parts.slice(2).includes("__pycache__") ||
      basename.endsWith(".pyc") ||
      basename.endsWith(".pt") ||
      subsystemPath ===
        "artifacts/ai-training-server/ai_model/weights/model.corrupt"
    ) {
      // The serving checkpoint is materialized from the verified release
      // source after this broad copy; generated and candidate checkpoints
      // never enter the disposable tree.
      return false;
    }
  } else if (
    parts.slice(2).includes("__pycache__") ||
    basename.endsWith(".pyc")
  ) {
    return false;
  }

  return true;
}

function preserveModeAndTimes(destination, stat) {
  fs.chmodSync(destination, stat.mode & 0o7777);
  fs.utimesSync(destination, stat.atime, stat.mtime);
}

function copyDirectory(sourceRoot, destinationRoot, relativeDirectory, counts) {
  const sourceDirectory =
    relativeDirectory === ""
      ? sourceRoot
      : path.join(sourceRoot, ...relativeDirectory.split("/"));
  const destinationDirectory =
    relativeDirectory === ""
      ? destinationRoot
      : path.join(destinationRoot, ...relativeDirectory.split("/"));
  const directoryStat = fs.lstatSync(sourceDirectory);

  if (relativeDirectory !== "") {
    fs.mkdirSync(destinationDirectory, {
      mode: directoryStat.mode & 0o7777,
    });
    counts.directories += 1;
  }

  for (const entry of fs.readdirSync(sourceDirectory, {
    withFileTypes: true,
  })) {
    const childRelative =
      relativeDirectory === ""
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;

    // Decide before lstat or copying the entry. In particular, a denied
    // credential file is never opened or cloned into the simulation tree.
    if (!shouldCopyProductionSimulationPath(childRelative)) continue;

    const source = path.join(sourceDirectory, entry.name);
    const destination = path.join(destinationDirectory, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourceRoot, destinationRoot, childRelative, counts);
      continue;
    }

    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(source), destination);
      counts.symlinks += 1;
    } else if (stat.isFile()) {
      // COPYFILE_FICLONE requests a copy-on-write clone when supported and
      // falls back to an ordinary copy on filesystems that cannot reflink.
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_FICLONE);
      preserveModeAndTimes(destination, stat);
      counts.files += 1;
    } else {
      throw new Error(
        `unsupported production-simulation source entry: ${childRelative}`,
      );
    }
  }

  if (relativeDirectory !== "") {
    preserveModeAndTimes(destinationDirectory, directoryStat);
  }
}

export function copyProductionSimulationTree(sourceRoot, destinationRoot) {
  if (fs.readdirSync(destinationRoot).length !== 0) {
    throw new Error("production-simulation copy destination is not empty");
  }

  const counts = { directories: 0, files: 0, symlinks: 0 };
  copyDirectory(sourceRoot, destinationRoot, "", counts);
  return counts;
}