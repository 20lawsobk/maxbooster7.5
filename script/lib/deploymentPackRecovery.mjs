/**
 * Build-only undo journal for the destructive capsulePack API.
 * Only Node builtins are used: invoke this BEFORE npm/tsx on build reentry.
 * Publishing backups live outside the uploaded workspace, in build-container
 * /tmp. Local simulations retain their workspace-local recovery directory.
 * These support reentry in the same build container, not container replacement.
 * They are not runtime payload and must never enter the app-remainder capsule.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export const RECOVERY_HELPER_PATH = "script/lib/deploymentPackRecovery.mjs";
const TRANSACTION_PATH = ".deployment-pack-state/transaction";
const DIRECTORIES = ["python_runtime", "node_modules", "external/maxcore", "external/pdim"];

function safeRelative(value) {
  if (
    typeof value !== "string" || !value || value.includes("\\") ||
    value.includes("\0") || path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value.split("/").some((part) => part === "." || part === "..") ||
    value === ".deployment-pack-state" || value.startsWith(".deployment-pack-state/") ||
    value === ".git" || value.startsWith(".git/")
  ) {
    throw new Error(`Invalid deployment pack recovery path: ${String(value)}`);
  }
  return value;
}

function assertRealParents(root, relative) {
  let current = root;
  for (const segment of relative.split("/").slice(0, -1)) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
      throw new Error(`Unsafe recovery parent: ${current}`);
    }
  }
}

// This is an explicit destructive-build declaration, not platform attestation.
// Only the publishing entry point supplies it. Never export it in dev settings.
export function isPublishingEnvironment(env = process.env, root = process.cwd()) {
  return env.DEPLOY_PACK === "1" && env.PUBLISH_PAYLOAD_CLEANUP === "1" &&
    env.PUBLISH_BUILD_ROOT === path.resolve(root);
}

export function assertBuildContext(root, env = process.env) {
  if ((env.PUBLISH_BUILD_ROOT !== undefined || env.PUBLISH_PAYLOAD_CLEANUP === "1") &&
      !isPublishingEnvironment(env, root)) {
    throw new Error("Publishing authorization refused: requires DEPLOY_PACK=1 AND root-scoped publishing entry point; no recovery/build mutations were authorized");
  }
}

export function deploymentPackStateDirectory(root, env = process.env) {
  root = path.resolve(root);
  assertBuildContext(root, env);
  if (!isPublishingEnvironment(env, root)) return path.join(root, TRANSACTION_PATH);
  if (fs.realpathSync(root) !== root) throw new Error("Publishing root must not be a symlink");
  const identity = createHash("sha256").update(root).digest("hex");
  const directory = path.join("/tmp", `maxbooster-build-recovery-${identity}`);
  if (directory === root || directory.startsWith(`${root}${path.sep}`)) {
    throw new Error("Publishing recovery must be outside the uploaded workspace");
  }
  const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink() ||
      (process.getuid && stat.uid !== process.getuid()))) {
    throw new Error("Unsafe publishing recovery directory");
  }
  return directory;
}

function transactionDirectory(root) {
  assertRealParents(root, `${TRANSACTION_PATH}/journal.json`);
  const directory = deploymentPackStateDirectory(root);
  const legacy = path.join(root, TRANSACTION_PATH);
  // A local simulation must not start a second transaction while an external
  // publishing snapshot for the same root awaits recovery.
  const publishing = path.join("/tmp", `maxbooster-build-recovery-${createHash("sha256").update(root).digest("hex")}`);
  if (directory === legacy && fs.existsSync(publishing)) {
    throw new Error("Publishing recovery exists for this root; use the publishing entry point, not a local simulation");
  }
  // A prior workspace-local journal must be recovered, never silently removed
  // by payload cleanup. Do not guess which transaction wins if both exist.
  if (directory !== legacy && fs.existsSync(legacy)) {
    if (fs.existsSync(directory)) throw new Error("Conflicting local and publishing recovery journals");
    return legacy;
  }
  return directory;
}

function writeJournal(directory, journal) {
  const temporary = path.join(directory, "journal.json.next");
  const fd = fs.openSync(temporary, "w", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(journal));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, path.join(directory, "journal.json"));
  const parent = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(parent);
  } finally {
    fs.closeSync(parent);
  }
}

function copy(root, source, destination, merge = false) {
  // GNU cp preserves modes/symlinks and uses cheap CoW clones where available.
  // On non-CoW filesystems this requires enough disk for a real backup.
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  execFileSync("cp", [
    "-a", "--reflink=auto", ...(merge ? ["--no-clobber"] : []),
    "--", source, destination,
  ], { cwd: root, stdio: "inherit" });
}

function copyFile(source, destination) {
  const stat = fs.lstatSync(source);
  if (!stat.isFile()) throw new Error(`Recovery source is not a regular file: ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_FICLONE);
  fs.chmodSync(destination, stat.mode);
  fs.utimesSync(destination, stat.atime, stat.mtime);
}

function processIdentity(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    // comm is parenthesized and may contain spaces/parentheses.
    const startTicks = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    return `${fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()}:${startTicks}`;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ESRCH") return null;
    throw error;
  }
}

function ownerIsRunning(pid, identity) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) return false;
  if (identity && processIdentity(pid) !== identity) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

export function recoverDeploymentPack(root) {
  root = path.resolve(root);
  const directory = transactionDirectory(root);
  const journalPath = path.join(directory, "journal.json");
  if (!fs.existsSync(directory)) return false;
  if (!fs.existsSync(journalPath)) {
    // Never guess which unknown backup is safe to delete.
    throw new Error(`Deployment pack recovery journal missing in ${directory}; preserve this directory and recover the source tree manually`);
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  if (
    journal.schemaVersion !== 1 || journal.root !== root ||
    !["preparing", "active", "packed"].includes(journal.phase) ||
    !Array.isArray(journal.directories) || !Array.isArray(journal.members)
  ) {
    throw new Error("Invalid deployment pack recovery journal; refusing destructive cleanup");
  }
  if (ownerIsRunning(journal.ownerPid, journal.ownerIdentity)) {
    throw new Error(`Deployment packing owner ${journal.ownerPid} is still running; concurrent builds are not supported`);
  }
  for (const dir of journal.directories) {
    if (!DIRECTORIES.includes(dir)) throw new Error(`Invalid recovery directory: ${dir}`);
  }
  for (const member of journal.members) safeRelative(member);
  if (journal.phase !== "preparing") {
    // Validate EVERY backup before mutating the destination.
    for (const relative of [...journal.directories, ...journal.members]) {
      const backup = path.join(directory, "sources", relative);
      assertRealParents(path.join(directory, "sources"), relative);
      if (!fs.lstatSync(backup, { throwIfNoEntry: false })) {
        throw new Error(`Deployment pack recovery backup missing: ${relative}`);
      }
      assertRealParents(root, relative);
      if (journal.directories.includes(relative)) {
        const destination = fs.lstatSync(path.join(root, relative), { throwIfNoEntry: false });
        if (destination && (!destination.isDirectory() || destination.isSymbolicLink())) {
          throw new Error(`Unsafe recovery directory destination: ${relative}`);
        }
      }
    }
    console.log("==> Recovering build inputs from interrupted/completed capsule packing...");
    for (const dir of journal.directories) {
      const destination = path.join(root, dir);
      const stat = fs.lstatSync(destination, { throwIfNoEntry: false });
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
        throw new Error(`Unsafe recovery directory destination: ${dir}`);
      }
      fs.mkdirSync(destination, { recursive: true });
      copy(root, `${path.join(directory, "sources", dir)}/.`, destination, true);
    }
    for (const member of journal.members) {
      // Never replace an edit/new install made after packing; validation runs
      // again in build.ts and must reject changed checkpoints/dependencies.
      if (!fs.lstatSync(path.join(root, member), { throwIfNoEntry: false })) {
        copyFile(path.join(directory, "sources", member), path.join(root, member));
      }
    }
  }
  // Preparing means no pack was allowed to start. Active/packed is removed
  // only after all copies succeeded; a crash in recovery is safe to retry.
  fs.rmSync(directory, { recursive: true });
  return true;
}

export function beginDeploymentPack(root) {
  root = path.resolve(root);
  const directory = transactionDirectory(root);
  if (fs.existsSync(directory)) {
    throw new Error("Previous deployment pack transaction must be recovered before a new pack");
  }
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  // Atomic claim: two build processes must not share/overwrite an undo log.
  fs.mkdirSync(directory, { mode: 0o700 });
  const journal = {
    schemaVersion: 1, root, ownerPid: process.pid,
    ownerIdentity: processIdentity(process.pid), phase: "preparing",
    directories: DIRECTORIES.filter((dir) => fs.existsSync(path.join(root, dir))),
    members: [],
  };
  writeJournal(directory, journal);
  for (const dir of journal.directories) {
    assertRealParents(root, dir);
    copy(root, path.join(root, dir), path.join(directory, "sources", dir));
  }
  journal.phase = "active";
  writeJournal(directory, journal);
  return {
    preserveMembers(members) {
      const selected = [...new Set(members.map(safeRelative))];
      for (const member of selected) {
        assertRealParents(root, member);
        if (!fs.lstatSync(path.join(root, member)).isFile()) {
          throw new Error(`App recovery member is not a regular file: ${member}`);
        }
        copyFile(path.join(root, member), path.join(directory, "sources", member));
      }
      journal.members = selected;
      writeJournal(directory, journal);
    },
    complete() {
      journal.phase = "packed";
      // Keep undo data for the NEXT build, even after a successful size gate.
      writeJournal(directory, journal);
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!["--recover", "--publish-disposable-copy"].includes(process.argv[2]) || process.argv.length > 4) {
    console.error("Usage: node script/lib/deploymentPackRecovery.mjs --recover [root] | --publish-disposable-copy <root>");
    process.exitCode = 1;
  } else {
    try {
      const root = path.resolve(process.argv[3] || process.cwd());
      if (process.argv[2] === "--publish-disposable-copy") {
        // Explicit CLI consent applies only to the copy containing this helper,
        // from that copy's cwd. Reject inherited/mismatched declarations first.
        const helperRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
        if (!process.argv[3] || root !== helperRoot || root !== process.cwd() ||
            fs.realpathSync(root) !== root) {
          throw new Error("Publishing entry point requires its own real root and matching cwd");
        }
        if (process.env.PUBLISH_BUILD_ROOT !== undefined ||
            process.env.PUBLISH_PAYLOAD_CLEANUP !== undefined ||
            process.env.DEPLOY_PACK !== undefined) {
          throw new Error("Ambiguous inherited build authorization; workspace left unchanged");
        }
        Object.assign(process.env, {
          DEPLOY_PACK: "1", PUBLISH_PAYLOAD_CLEANUP: "1", PUBLISH_BUILD_ROOT: root,
        });
      }
      assertBuildContext(root);
      recoverDeploymentPack(root);
      if (process.argv[2] === "--publish-disposable-copy") {
        execFileSync("npm", ["run", "build"], { cwd: root, env: process.env, stdio: "inherit" });
      }
    } catch (error) {
      console.error("Deployment build recovery failed:", error.message);
      process.exitCode = 1;
    }
  }
}