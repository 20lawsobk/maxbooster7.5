import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";

// Only the pure production function is compiled. Never import the supervisor,
// application DB/config, model, providers, or actual subprocess services.
const supervisor = fs.readFileSync("server/services/maxcoreLocalSupervisor.ts", "utf8");
const resourceSource = supervisor.match(
  /export function maxcoreResourceEnv\([\s\S]*?\n\}/,
)[0].replace("export function", "function");
const resourceEnv = vm.runInNewContext(
  transformSync(resourceSource + "\nmaxcoreResourceEnv;", { loader: "ts" }).code,
);

test("nested Node allocation includes primary/launcher and removes inherited heap override", () => {
  const env = resourceEnv(
    { workerCount: 2, workerHeapMB: 614, maxcorePrimaryHeapMB: 153, pythonThreads: 1 },
    '--enable-source-maps --max-old-space-size="8192" --max_old_space_size 9000',
  );
  assert.equal(env.NODE_CLUSTER_WORKERS, "2");
  assert.equal(env.NODE_OPTIONS, "--enable-source-maps --max-old-space-size=76");
  assert.equal(env.MAXCORE_NODE_WORKER_HEAP_MB, "614");
  assert.ok(76 * 2 <= 153);
  const nested = fs.readFileSync("external/maxcore/artifacts/api-server/src/index.ts", "utf8");
  assert.ok(nested.includes('process.env["MAXCORE_NODE_WORKER_HEAP_MB"]'));
  assert.ok(nested.includes("cluster.setupPrimary({"));
});

test("all child BLAS/OpenMP and nested libuv pools are capped", () => {
  const env = resourceEnv({ workerCount: 1, workerHeapMB: 400, maxcorePrimaryHeapMB: 153, pythonThreads: 1 });
  for (const key of ["UVICORN_WORKERS", "MAXCORE_NUM_STREAMS", "UV_THREADPOOL_SIZE", "OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS",
    "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS",
    "BLIS_NUM_THREADS", "OMP_THREAD_LIMIT", "OMP_MAX_ACTIVE_LEVELS"]) {
    assert.equal(env[key], "1", key);
  }
  assert.ok(supervisor.includes("...resourceEnv,"));
  assert.ok(supervisor.includes("computeHyperGpuSizing(nodeSizing.pythonThreads)"));
});

test("insufficient nested-process memory fails explicitly", () => {
  assert.throws(() => resourceEnv({ workerCount: 8, workerHeapMB: 1, maxcorePrimaryHeapMB: 1 }), /cannot fund/);
});

test("actual nested primary setup supplies allocated worker heap without changing lifecycle", () => {
  const nested = fs.readFileSync("external/maxcore/artifacts/api-server/src/index.ts", "utf8");
  const block = nested.slice(nested.indexOf('  const workerHeap = process.env["MAXCORE_NODE_WORKER_HEAP_MB"]'),
    nested.indexOf("  console.log(", nested.indexOf("if (cluster.isPrimary)")));
  let settings;
  const context = { process: { env: { MAXCORE_NODE_WORKER_HEAP_MB: "857" },
    execArgv: ["--import=tsx", "--max-old-space-size=76"] },
    cluster: { setupPrimary: value => { settings = value; } } };
  const code = transformSync(block, { loader: "ts" }).code;
  vm.runInNewContext(code, context);
  assert.deepEqual(Array.from(settings.execArgv), ["--import=tsx", "--max-old-space-size=857"]);
  context.process.env.MAXCORE_NODE_WORKER_HEAP_MB = "invalid";
  assert.throws(() => vm.runInNewContext(code, { ...context }), /positive integer/);
});

test("A/B variant method contains no local transforms, fabricated scores or dead alternate result", () => {
  const source = fs.readFileSync("server/services/aiContentService.ts", "utf8");
  const method = source.slice(source.indexOf("  async generateABVariants("),
    source.indexOf("\n  /**\n   * Main content generation method"));
  assert.ok(method.includes("generateSocialDirect("));
  assert.ok(method.includes("predictedPerformance: null"));
  for (const forbidden of ["Math.random", "applyTone", "confidence: 0.9", "variantResults", "toneMap"]) {
    assert.ok(!method.includes(forbidden), forbidden);
  }
});