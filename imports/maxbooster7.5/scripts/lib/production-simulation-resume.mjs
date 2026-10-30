import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const STAGES = ["copy", "build", "size", "restore", "startup"];
export const SIMULATION_CAPSULES = Object.freeze([
  "node_modules", "app_remainder", "python_runtime", "external_maxcore", "external_pdim",
]);
const RESTORED_SENTINELS = [
  "node_modules/.pdim-restored", ".pdim-restored-app-remainder",
  "python_runtime/.pdim-restored-py", "external/maxcore/.pdim-restored-maxcore",
  "external/pdim/.pdim-restored-pdim",
];

function inside(parent, child) {
  const rel = relative(parent, child);
  return rel !== "" && rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
}

function fail(message) {
  throw new Error(`Production simulation resume refused: ${message}. Preserved run was not modified; use --new for a fresh run or --cleanup to remove it.`);
}

function required(path, base, directory = false) {
  let actual;
  let info;
  try {
    actual = realpathSync(path);
    info = statSync(path);
  } catch {
    fail(`missing or dangling required ${directory ? "directory" : "artifact"} ${path}`);
  }
  if (!inside(base, actual)) fail(`required path escapes workspace: ${path}`);
  if (directory ? !info.isDirectory() : !info.isFile() || info.size === 0) {
    fail(`invalid required ${directory ? "directory" : "artifact"} ${path}`);
  }
  return actual;
}

// Read-only preflight. In particular, do not repair ephemeral app/log links
// with mkdir, and do not require raw source files consumed by deploy packing.
export function validateSimulationResume({ state, report, runsRoot, cleanup = false }) {
  if (!state || typeof state.runId !== "string" || !/^[A-Za-z0-9_-]+$/.test(state.runId)
    || typeof state.workspace !== "string" || !isAbsolute(state.workspace)) {
    fail("missing or invalid durable state");
  }
  const workspace = resolve(state.workspace);
  if (!inside(resolve(runsRoot), workspace)) fail(`workspace is outside the durable runs directory: ${workspace}`);
  // Cleanup can remove a missing workspace or its dangling symlink, without
  // following app/log links or demanding artifacts which were already lost.
  if (cleanup) {
    let info;
    try { info = lstatSync(workspace); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (info && !info.isSymbolicLink()) required(workspace, realpathSync(runsRoot), true);
    return { workspace, copyRoot: join(workspace, "app"), logsRoot: join(workspace, "logs") };
  }
  const realWorkspace = required(workspace, realpathSync(runsRoot), true);
  const copyRoot = join(workspace, "app");
  const logsRoot = join(workspace, "logs");
  required(copyRoot, realWorkspace, true);
  required(logsRoot, realWorkspace, true);
  // Scratch can be recreated, but an existing escaping scratch link cannot
  // be allowed to redirect subsequent writes.
  try {
    lstatSync(join(workspace, "transient"));
    required(join(workspace, "transient"), realWorkspace, true);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (state.copyRoot && resolve(state.copyRoot) !== copyRoot) fail("state copyRoot does not match workspace/app");
  if (!report || report.runId !== state.runId) fail("missing or mismatched durable report");
  const completed = report.completedStages || [];
  if (!Array.isArray(completed) || !Array.isArray(state.completed)
    || [...new Set(completed)].sort().join() !== [...new Set(state.completed)].sort().join()
    || completed.some((stage) => !STAGES.includes(stage))) {
    fail("state/report completed stages disagree or are invalid");
  }
  const selected = new Set();
  const need = (path) => {
    required(join(copyRoot, path), realWorkspace);
    selected.add(path);
  };
  const packed = completed.some((stage) => ["build", "size", "restore", "startup"].includes(stage))
    || (() => {
      for (const path of [join(copyRoot, "app_remainder.pdim"), join(workspace, "phased-build-complete.json")]) {
        try { lstatSync(path); return true; } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      return false;
    })();
  if (packed) {
    // These survive destructive packing. package.json, script/build.ts and
    // the copy sentinel may now be inside app_remainder, not loose files.
    need("start.sh");
    need("dist/pdim-restore.mjs");
    need(".node_bin/node");
    need("scripts/boot-stub-server.mjs");
    need("scripts/port-contract.sh");
    need("scripts/check-port-contract.ts");
    for (const capsule of SIMULATION_CAPSULES) {
      need(`${capsule}.pdim`);
      need(`${capsule}.manifest.json`);
      let manifest;
      try { manifest = JSON.parse(readFileSync(join(copyRoot, `${capsule}.manifest.json`), "utf8")); } catch {
        fail(`invalid required manifest ${capsule}.manifest.json`);
      }
      if (!/^[a-f0-9]{64}$/i.test(manifest.sha256 || "")) fail(`invalid required manifest checksum ${capsule}.manifest.json`);
    }
  } else if (completed.includes("copy")) {
    need(".simulation-copy-complete");
    for (const path of new Set([
      "package.json", "script/build.ts", "start.sh", "dist/pdim-restore.mjs",
      ...(report.copyIntegrity?.checked || []).map((entry) => entry.path),
      ...(report.configValidation?.checked || []).map((entry) => entry.path),
    ])) need(path);
  }
  if (completed.includes("restore") || completed.includes("startup")) {
    for (const [index, sentinel] of RESTORED_SENTINELS.entries()) {
      need(sentinel);
      let manifest;
      try { manifest = JSON.parse(readFileSync(join(copyRoot, `${SIMULATION_CAPSULES[index]}.manifest.json`), "utf8")); } catch {
        fail(`invalid manifest for restored sentinel ${sentinel}`);
      }
      if (!/^[a-f0-9]{64}$/i.test(manifest.sha256 || "")
        || readFileSync(join(copyRoot, sentinel), "utf8").trim() !== manifest.sha256) {
        fail(`stale restored sentinel ${sentinel}`);
      }
    }
    for (const path of [
      "dist/index.mjs", "dist/cluster.mjs", "dist/gateway.mjs", "dist/compute-sizing.mjs",
      "dist/retained-pdim-recovery-worker.mjs", "dist/public/index.html",
      "node_modules/tsx/package.json", "python_runtime/bin/python3.12",
      "external/maxcore/artifacts/ai-training-server/server.py",
      "external/pdim/artifacts/api-server/src/index.ts",
    ]) need(path);
  }
  return { workspace, copyRoot, logsRoot, requiredArtifacts: [...selected] };
}