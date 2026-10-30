import fs from "node:fs";
import path from "node:path";
import ignore from "ignore";
import { DEPLOYMENT_CONTROL_FILES } from "./deploymentControlFiles.js";
import {
  isPublishingEnvironment,
  RECOVERY_HELPER_PATH,
  assertBuildContext,
  removeBuildPaths,
} from "./deploymentPackRecovery.mjs";

/** Never treat a local DEPLOY_PACK simulation as a disposable publishing copy.
 * Platform docs only guarantee REPLIT_DEPLOYMENT on published apps, not builds.
 * Authorization is the explicit publishing entry point's exact root declaration.
 */
export function isDisposablePublishingCopy(env: NodeJS.ProcessEnv, root = process.cwd()): boolean {
  return isPublishingEnvironment(env, root);
}

/** Reject partial or mismatched declarations BEFORE recovery or build. */
export function assertPublishingCleanupExpectation(env: NodeJS.ProcessEnv, root = process.cwd()): void {
  assertBuildContext(root, env);
}

export const PROTECTED_PUBLISHING_PATHS = [
  ...DEPLOYMENT_CONTROL_FILES,
  "start.sh",
  ".node_bin",
  "scripts/boot-stub-server.mjs",
  "scripts/port-contract.sh",
  "scripts/check-port-contract.ts",
  "dist/pdim-restore.mjs",
  "dist/.db-indexes-ok",
  RECOVERY_HELPER_PATH,
  ...["node_modules", "python_runtime", "external_maxcore", "external_pdim", "app_remainder"]
    .flatMap((name) => [`${name}.pdim`, `${name}.manifest.json`]),
];

type Entry = { relative: string; stat: fs.Stats };
export type PayloadMeasurement = {
  totalBytes: number;
  byTopDir: Map<string, number>;
  entries: number;
};

function realRoot(root: string): string {
  const absolute = path.resolve(root);
  if (!fs.lstatSync(absolute).isDirectory() || fs.realpathSync(absolute) !== absolute) {
    throw new Error("Publishing payload root must be a real directory, not a symlink");
  }
  return absolute;
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) &&
    relative !== ".." && !path.isAbsolute(relative));
}

function scan(root: string, dockerignore: string) {
  const matcher = ignore().add(dockerignore);
  const excluded: string[] = [];
  const survivors: Entry[] = [];
  function walk(relative: string) {
    // No ignored subtree or symlink is ever traversed. Read failures propagate.
    for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
      const child = relative ? `${relative}/${name}` : name;
      const stat = fs.lstatSync(path.join(root, child));
      const matchPath = stat.isDirectory() ? `${child}/` : child;
      if (matcher.ignores(matchPath)) {
        excluded.push(child);
        continue;
      }
      if (!stat.isFile() && !stat.isDirectory() && !stat.isSymbolicLink()) {
        throw new Error(`Unsupported publishing payload entry: ${child}`);
      }
      survivors.push({ relative: child, stat });
      if (stat.isDirectory()) walk(child);
    }
  }
  walk("");
  return { excluded, survivors };
}

function coveredBy(relative: string, paths: string[]): boolean {
  return paths.some((candidate) =>
    relative === candidate || relative.startsWith(`${candidate}/`));
}

/** Failure-only diagnostics: names and entry types, never cached contents.
 * Do not traverse an excluded link or recursively inspect ignored trees.
 */
function describeCleanupSurvivor(root: string, relative: string, initiallyExcluded: string[]): string {
  const absolute = path.join(root, relative);
  const origin = initiallyExcluded.includes(relative)
    ? "was scheduled for removal"
    : "appeared after the initial scan";
  try {
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) return `${JSON.stringify(relative)}: symlink; ${origin}; target not inspected`;
    if (!stat.isDirectory()) return `${JSON.stringify(relative)}: file; ${stat.size} bytes; ${origin}`;
    const names: string[] = [];
    // Bound diagnostic work even if a writer has produced a large cache.
    const directory = fs.opendirSync(absolute);
    try {
      while (names.length < 9) {
        const entry = directory.readSync();
        if (!entry) break;
        names.push(JSON.stringify(entry.name) + (entry.isDirectory() ? "/" : entry.isSymbolicLink() ? " (symlink)" : ""));
      }
    } finally {
      directory.closeSync();
    }
    return `${JSON.stringify(relative)}: directory; ${origin}; immediate entries: ${
      names.slice(0, 8).join(", ") || "(empty)"
    }${names.length > 8 ? ", … (listing truncated)" : ""}`;
  } catch (cause) {
    // Diagnostics must not turn the original cleanup failure into success.
    const code = (cause as NodeJS.ErrnoException).code || "unknown I/O error";
    return `${JSON.stringify(relative)}: ${origin}; diagnostic read failed (${code})`;
  }
}

function validateSurvivingLinks(root: string, survivors: Entry[], excluded: string[]) {
  for (const { relative, stat } of survivors) {
    if (!stat.isSymbolicLink()) continue;
    let target: string;
    try {
      target = fs.realpathSync(path.join(root, relative));
    } catch (cause) {
      throw new Error(`Broken or cyclic publishing payload symlink: ${relative}`, { cause });
    }
    const lexicalTarget = path.resolve(path.dirname(path.join(root, relative)),
      fs.readlinkSync(path.join(root, relative)));
    if (!isInside(root, target) || !isInside(root, lexicalTarget)) {
      throw new Error(`External publishing payload symlink: ${relative}`);
    }
    if (coveredBy(path.relative(root, target).split(path.sep).join("/"), excluded) ||
      coveredBy(path.relative(root, lexicalTarget).split(path.sep).join("/"), excluded)) {
      throw new Error(`Publishing payload symlink targets an excluded entry: ${relative}`);
    }
  }
}

/** Read-only, real post-build tree measurement: no git index and no double counting
 * capsules/build output. Links contribute their own lstat size, never target bytes.
 */
export function measurePublishingPayload(root: string, dockerignore: string): PayloadMeasurement {
  root = realRoot(root);
  const { survivors, excluded } = scan(root, dockerignore);
  validateSurvivingLinks(root, survivors, excluded);
  return measureEntries(root, survivors);
}

function measureEntries(root: string, survivors: Entry[]): PayloadMeasurement {
  const byTopDir = new Map<string, number>();
  let totalBytes = fs.lstatSync(root).size;
  byTopDir.set("(root files)", totalBytes);
  for (const { relative, stat } of survivors) {
    const top = relative.includes("/") || stat.isDirectory()
      ? relative.split("/")[0] : "(root files)";
    totalBytes += stat.size;
    byTopDir.set(top, (byTopDir.get(top) ?? 0) + stat.size);
  }
  return { totalBytes, byTopDir, entries: survivors.length };
}

/** Read-only final assertion; late writers must fail, not trigger blind retries. */
export function assertPublishingPayloadClean(root: string, dockerignore: string): void {
  root = realRoot(root);
  const { excluded, survivors } = scan(root, dockerignore);
  validateSurvivingLinks(root, survivors, excluded);
  if (excluded.length) {
    throw new Error(`Excluded publishing entries appeared after finalization: ${excluded.join(", ")}`);
  }
}

/** User-authorized deletion applies ONLY to the explicitly declared publishing root.
 * All conflicts and surviving links are checked before the first deletion.
 * dockerignore is captured before remainder packing can remove the file itself.
 */
export function cleanPublishingPayload(options: {
  root: string;
  env: NodeJS.ProcessEnv;
  dockerignore: string;
  requiredPaths: string[];
}): { removedPaths: string[]; measurement: PayloadMeasurement } {
  if (!isDisposablePublishingCopy(options.env, options.root)) {
    throw new Error("Publishing cleanup refused: requires DEPLOY_PACK=1 AND root-scoped publishing entry point");
  }
  const root = realRoot(options.root);
  const { excluded, survivors } = scan(root, options.dockerignore);
  for (const relative of [...PROTECTED_PUBLISHING_PATHS, ...options.requiredPaths]) {
    if (!relative || path.posix.isAbsolute(relative) ||
      relative.includes("\\") || relative.split("/").some((part) => part === "." || part === "..")) {
      throw new Error(`Invalid protected publishing path: ${relative}`);
    }
    // Parent directories may be ignored; checking exclusions covers that too.
    const excludedParent = excluded.find((candidate) =>
      relative === candidate || relative.startsWith(`${candidate}/`));
    const survives = survivors.some((entry) => entry.relative === relative);
    if (excludedParent && (survives || fs.lstatSync(path.join(root, excludedParent), { throwIfNoEntry: false }))) {
      throw new Error(`.dockerignore conflicts with protected publishing path: ${relative} (excluded ${excludedParent})`);
    }
    if (options.requiredPaths.includes(relative) && !survives) {
      throw new Error(`Required publishing runtime path is missing: ${relative}`);
    }
  }
  // Recovery MUST be relocated outside this payload before cleanup. Never erase
  // an in-tree undo journal just because it happens to match .dockerignore.
  const legacyState = fs.lstatSync(path.join(root, ".deployment-pack-state"), { throwIfNoEntry: false });
  if (legacyState?.isDirectory() &&
    fs.lstatSync(path.join(root, ".deployment-pack-state/transaction"), { throwIfNoEntry: false })) {
    throw new Error("Deployment pack recovery state must be outside the publishing payload before cleanup");
  }
  validateSurvivingLinks(root, survivors, excluded);
  // Configuration removals can invalidate platform caches. Deleting .cache
  // first (alphabetical order) allows later .replit/.config removal to recreate
  // it. Finish input removals before taking the cache-deletion snapshot.
  const isCacheRoot = (relative: string) => path.posix.basename(relative) === ".cache";
  const removedPaths: string[] = [];
  const inputRemovals = excluded.filter((relative) => !isCacheRoot(relative));
  // All policy/link/protected-path validation above completes before deletion.
  // One native traversal per tree, without per-file JS syscall overhead.
  removeBuildPaths(inputRemovals.map(relative => path.join(root, relative)));
  removedPaths.push(...inputRemovals);
  const afterInputs = scan(root, options.dockerignore);
  validateSurvivingLinks(root, afterInputs.survivors, afterInputs.excluded);
  // Only policy-excluded caches are eligible, including caches first created
  // by input invalidation. This is a single dependency-ordered pass, not a
  // retry loop: a writer after this phase still fails below.
  const cacheRemovals = afterInputs.excluded.filter(isCacheRoot);
  removeBuildPaths(cacheRemovals.map(relative => path.join(root, relative)));
  removedPaths.push(...cacheRemovals);
  // Measure and verify the same snapshot, rather than walking every survivor
  // twice. The separate post-journal assertion still detects later writers.
  const final = scan(root, options.dockerignore);
  validateSurvivingLinks(root, final.survivors, final.excluded);
  const remainingExcluded = final.excluded;
  if (remainingExcluded.length) {
    const details = remainingExcluded.slice(0, 8)
      .map((relative) => describeCleanupSurvivor(root, relative, excluded));
    throw new Error(
      `Excluded publishing entries survived cleanup: ${remainingExcluded.join(", ")}\n` +
      details.join("\n") +
      "\nCleanup remains blocked. Identify and stop or relocate the writer before publishing; do not bypass this check.",
    );
  }
  return { removedPaths, measurement: measureEntries(root, final.survivors) };
}