import fs from "node:fs";
import {DEDICATED_DEPLOYMENT_LIMITS} from "./capacity.mjs";

const DEADLINES_SECONDS = Object.freeze({
  cleanup: 600,
  node: 180,
  diffusion: 180,
  dependencies: 900,
  rust: 600,
  python: 360,
  strip: 300,
  packer: 120,
  assets: 120,
  app_capsule: 900,
  prune: 600,
  pack_node: 600,
  pack_python: 600,
  pack_maxcore: 600,
  pack_pdim: 600,
  pack_app_remainder: 600,
  source: 600,
  remainder: 600,
  finalize: 180,
});

const ELASTIC_TASKS = new Set([
  "cleanup",
  "dependencies",
  "rust",
  "app_capsule",
  "pack_node",
  "pack_python",
  "pack_maxcore",
  "pack_pdim",
  "pack_app_remainder",
  "source",
  "remainder",
]);

const RETRYABLE_CAPSULE_TASKS = new Set([
  // app_capsule writes a uniquely named capsule and publishes its cache marker
  // only after checksum verification, so an isolated child interruption can
  // retry without accepting partial output. Executive-level cancellation still
  // aborts the whole plan and is never retried.
  "app_capsule",
  "pack_node",
  "pack_python",
  "pack_maxcore",
  "pack_pdim",
  "pack_app_remainder",
]);

function buildTask(id, deps = [], memoryMB = 256, cpu = 1, io = 1) {
  return {
    id,
    deps,
    memoryMB,
    cpu,
    io,
    // These are executor reservations for concurrency admission, not OS memory
    // limits; live cgroup availability remains the final admission check.
    toolchainBudget: true,
    timeoutMs: DEADLINES_SECONDS[id] * 1000,
    command: "bash",
    args: ["build.sh", "--executive-task", id],

    ...(ELASTIC_TASKS.has(id) ? {
      elasticCPU: true,
      maxCPU: DEDICATED_DEPLOYMENT_LIMITS.cpus,
    } : {}),

    // These stages must continue to commit verified capsules atomically.
    // Executive-level cancellation is never retried.
    ...(RETRYABLE_CAPSULE_TASKS.has(id) ? {
      maxRetries: 1,
      retryOnSignals: ["SIGTERM", "SIGHUP"],
      retryBackoffMs: 1500,
    } : {}),
  };
}

export function buildPlan() {
  return [
    buildTask("node", [], 128),

    // Provisioning must finish before workspace cache cleanup.
    buildTask("cleanup", ["node"], 128, 1, 2),

    buildTask("diffusion", ["cleanup"], 128),

    buildTask(
      "dependencies",
      ["cleanup", "diffusion"],
      8192,
      1,
    ),

    buildTask("rust", ["cleanup"], 8192, 1),
    buildTask("python", ["cleanup"], 2048, 2),

    // The updated build script defers actual stripping until prune.
    buildTask("strip", ["dependencies"], 128),
    buildTask("packer", ["dependencies"], 256),
    buildTask("assets", ["dependencies"], 128),

    // Finish every source reader/preparation step before destructive packing.
    buildTask("app_capsule", [
      "dependencies",
      "strip",
      "packer",
      "assets",
      "rust",
      "node",
      "diffusion",
      "python",
    ], 8192, 2),

    // Capture the scattered runtime payload while all source/build inputs
    // still exist; later packing phases may remove those trees.
    buildTask("pack_app_remainder", ["app_capsule"], 1536, 1, 2),

    // Now includes npm prune and security audits, so reserve more memory.
    buildTask("prune", ["app_capsule", "packer", "pack_app_remainder"], 768),

    // Each archive is CPU-elastic up to the machine ceiling. I/O reservations
    // admit at most two heavy packers together, so the executive divides the
    // available CPU budget between them and gives a lone packer the full share.
    buildTask("pack_node", ["prune"], 1536, 1, 2),
    buildTask("pack_python", ["pack_app_remainder"], 1536, 1, 2),
    buildTask("pack_maxcore", ["pack_app_remainder"], 1536, 1, 2),
    buildTask("pack_pdim", ["pack_app_remainder"], 1536, 1, 2),

    buildTask("source", [
      "assets",
      "rust",
      "pack_node",
      "pack_python",
      "pack_maxcore",
      "pack_pdim",
      "pack_app_remainder",
    ], 1536),

    buildTask("remainder", ["source"], 1536),
    buildTask("finalize", ["remainder"], 128),
  ];
}

export function startPlan(node) {
  const restoreData =
    fs.existsSync("dist/deployment/runtime-data-required") ||
    fs.existsSync("dist/deployment/runtime-data-backup.json");

  const definitions = [
    [
      "restore-app",
      "app_remainder.pdim",
      "app_remainder.manifest.json",
      ".",
      ".pdim-restored-app",
    ],
    [
      "restore-node",
      "node_modules.pdim",
      "node_modules.manifest.json",
      "node_modules",
      ".pdim-restored",
    ],
    [
      "restore-python",
      "python_runtime.pdim",
      "python_runtime.manifest.json",
      "python_runtime",
      ".pdim-restored-py",
    ],
    [
      "restore-maxcore",
      "external_maxcore.pdim",
      "external_maxcore.manifest.json",
      "external/maxcore",
      ".pdim-restored-maxcore",
    ],
    [
      "restore-pdim",
      "external_pdim.pdim",
      "external_pdim.manifest.json",
      "external/pdim",
      ".pdim-restored-pdim",
    ],
  ];

  return [
    ...definitions.map(([id, ...args]) => ({
      id,
      deps: [],
      cpu: 1,
      io: 1,
      memoryMB: 256,
      command: node,
      args: ["dist/deployment/restore-one.mjs", ...args],
    })),

    ...(restoreData ? [{
      id: "restore-data",
      deps: ["restore-node"],
      cpu: 1,
      io: 1,
      memoryMB: 256,
      timeoutMs: 900000,
      command: node,
      args: ["dist/deployment/restore-runtime-data.mjs"],
    }] : []),

    {
      id: "application",
      deps: [
        ...definitions.map(([id]) => id),
        ...(restoreData ? ["restore-data"] : []),
      ],
      cpu: 1,
      io: 0,
      memoryMB: 512,
      command: "bash",
      args: ["start.sh", "--executive-application"],
      application: true,
    },
  ];
}