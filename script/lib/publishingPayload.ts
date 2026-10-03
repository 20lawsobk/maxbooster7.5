import fs from "node:fs";
import path from "node:path";
import ignore from "ignore";
import { DEPLOYMENT_CONTROL_FILES } from "./deploymentControlFiles.js";
import {
  isPublishingEnvironment,
  RECOVERY_HELPER_PATH,
  assertBuildContext,
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
  for (const relative of excluded) {
    // rm of a link unlinks the entry; it does not recurse into its target.
    fs.rmSync(path.join(root, relative), { recursive: true, force: true });
  }
  const measurement = measurePublishingPayload(root, options.dockerignore);
  const remainingExcluded = scan(root, options.dockerignore).excluded;
  if (remainingExcluded.length) {
    throw new Error(`Excluded publishing entries survived cleanup: ${remainingExcluded.join(", ")}`);
  }
  return { removedPaths: excluded, measurement };
}