"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server/cluster.ts
var import_cluster = __toESM(require("cluster"), 1);
var import_os = __toESM(require("os"), 1);
var import_path = __toESM(require("path"), 1);
var import_http = __toESM(require("http"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_zlib = __toESM(require("zlib"), 1);
var import_url = require("url");
var import_module = require("module");
var import_child_process = require("child_process");
var import_meta = {};
(function startBoosterstate() {
  const _env = process.env;
  _env["NODE_ENV"] = _env["NODE_ENV"] || "production";
  _env["UV_THREADPOOL_SIZE"] = _env["UV_THREADPOOL_SIZE"] || "8";
  _env["TF_NUM_INTEROP_THREADS"] = _env["TF_NUM_INTEROP_THREADS"] || "2";
  _env["TF_NUM_INTRAOP_THREADS"] = _env["TF_NUM_INTRAOP_THREADS"] || "2";
  const binCandidates = [
    import_path.default.join(process.cwd(), "bin", "boosterstate"),
    import_path.default.join(process.cwd(), "boosterstate", "target", "release", "boosterstate")
  ];
  const bin = binCandidates.find((p) => import_fs.default.existsSync(p)) ?? "";
  if (!bin) {
    console.log("[Cluster] boosterstate binary not found \u2014 skipping sidecar startup");
    return;
  }
  const already = (0, import_child_process.spawnSync)("pgrep", ["-x", "boosterstate"], { stdio: "ignore" }).status === 0;
  if (already) {
    console.log("[Cluster] boosterstate already running");
    return;
  }
  const probe = (0, import_child_process.spawnSync)(bin, ["--version"], {
    timeout: 300,
    // killed after 300 ms if binary starts (server mode)
    stdio: "ignore",
    killSignal: "SIGKILL"
  });
  const isEnoent = probe.error && probe.error.code === "ENOENT";
  if (isEnoent) {
    console.warn(
      "[Cluster] boosterstate binary cannot execute on this host (ELF interpreter not found \u2014 binary was built for a different NixOS/glibc). Continuing without sidecar."
    );
    return;
  }
  const sidecarPort = process.env.BOOSTERSTATE_SIDECAR_PORT || "9877";
  const sidecarEnv = { ...process.env, BOOSTERSTATE_PORT: sidecarPort };
  const proc = (0, import_child_process.spawn)(bin, [], { detached: true, stdio: "ignore", env: sidecarEnv });
  proc.on("error", (err) => {
    console.warn(`[Cluster] boosterstate sidecar error after start (${err.message}) \u2014 server will run without it`);
  });
  proc.unref();
  console.log("[Cluster] boosterstate sidecar started \u2014 waiting 2 s for init");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2e3);
})();
(function compressAssetsAtStartup() {
  const COMPRESSIBLE = /\.(js|css|svg|html|json|txt|xml|webmanifest)$/;
  const assetsDir = import_path.default.join(process.cwd(), "dist", "public", "assets");
  if (!import_fs.default.existsSync(assetsDir)) return;
  function compressDir(dir) {
    let count = 0;
    for (const entry of import_fs.default.readdirSync(dir, { withFileTypes: true })) {
      const full = import_path.default.join(dir, entry.name);
      if (entry.isDirectory()) {
        count += compressDir(full);
        continue;
      }
      if (!COMPRESSIBLE.test(entry.name)) continue;
      if (entry.name.endsWith(".br") || entry.name.endsWith(".gz")) continue;
      try {
        const src = import_fs.default.readFileSync(full);
        if (!import_fs.default.existsSync(full + ".br")) {
          const br = import_zlib.default.brotliCompressSync(src, {
            params: { [import_zlib.default.constants.BROTLI_PARAM_QUALITY]: 6 }
          });
          import_fs.default.writeFileSync(full + ".br", br);
          count++;
        }
        if (!import_fs.default.existsSync(full + ".gz")) {
          const gz = import_zlib.default.gzipSync(src, { level: 9 });
          import_fs.default.writeFileSync(full + ".gz", gz);
          count++;
        }
      } catch {
      }
    }
    return count;
  }
  try {
    const compressed = compressDir(assetsDir);
    if (compressed > 0) console.log(`[Cluster] Asset pre-compression complete \u2014 ${compressed} file(s) written`);
  } catch (err) {
    console.warn("[Cluster] Asset pre-compression skipped:", err.message);
  }
})();
var __metaUrl = import_meta?.url;
var __filename = __metaUrl ? (0, import_url.fileURLToPath)(__metaUrl) : import_path.default.resolve(process.argv[1] ?? "");
var __dirname = import_path.default.dirname(__filename);
var require2 = (0, import_module.createRequire)(__metaUrl ?? "file://" + __filename);
var ENABLE_CLUSTER = !!process.env.REPLIT_DEPLOYMENT || process.env.ENABLE_CLUSTER === "true";
var DISABLE_CLUSTER = process.env.DISABLE_CLUSTER === "true";
if (!ENABLE_CLUSTER || DISABLE_CLUSTER) {
  const appEntry = import_path.default.join(__dirname, "index.cjs");
  require2(appEntry);
} else {
  let primaryShutdown = function(signal) {
    console.log(`[Cluster] Primary received ${signal} \u2014 draining ${Object.keys(import_cluster.default.workers ?? {}).length} worker(s)`);
    const hardExit = setTimeout(() => {
      console.error("[Cluster] Primary hard timeout \u2014 forcing exit");
      process.exit(0);
    }, 25e3);
    hardExit.unref();
    const workers = Object.values(import_cluster.default.workers ?? {}).filter(Boolean);
    workers.forEach((w) => {
      try {
        w.process.kill("SIGTERM");
      } catch {
      }
    });
    let remaining = workers.length;
    if (remaining === 0) {
      clearTimeout(hardExit);
      process.exit(0);
      return;
    }
    import_cluster.default.on("exit", () => {
      remaining--;
      if (remaining <= 0) {
        console.log("[Cluster] All workers exited \u2014 primary shutting down");
        clearTimeout(hardExit);
        process.exit(0);
      }
    });
  };
  primaryShutdown2 = primaryShutdown;
  const numCPUs = import_os.default.cpus().length;
  const freeMemGB = import_os.default.freemem() / 1024 ** 3;
  const totalMemGB = import_os.default.totalmem() / 1024 ** 3;
  const isDeployment = !!process.env.REPLIT_DEPLOYMENT;
  const memPerWorkerGB = isDeployment ? 4.5 : 6;
  const workerHeapMB = isDeployment ? 4096 : 3072;
  const cpuLimit = Math.max(1, numCPUs - 1);
  const memLimit = Math.max(1, Math.floor(freeMemGB / memPerWorkerGB));
  const envOverride = process.env.CLUSTER_WORKERS ? parseInt(process.env.CLUSTER_WORKERS, 10) : null;
  const workerCount = envOverride && envOverride > 0 ? envOverride : Math.min(cpuLimit, memLimit);
  const workerScript = import_path.default.join(__dirname, "index.cjs");
  import_cluster.default.setupPrimary({
    exec: workerScript,
    execArgv: [`--max-old-space-size=${workerHeapMB}`]
  });
  console.log(
    `[Cluster] Primary ${process.pid} \u2014 forking ${workerCount} workers (CPUs: ${numCPUs}, total RAM: ${totalMemGB.toFixed(1)} GB, free: ${freeMemGB.toFixed(1)} GB, ${memPerWorkerGB} GB/worker, heap/worker: ${workerHeapMB} MB, cpu-limit: ${cpuLimit}, mem-limit: ${memLimit})` + (isDeployment ? ` [Deployed VM \u2014 ${numCPUs} vCPU]` : "")
  );
  const primaryPort = parseInt(process.env.PORT || "5000", 10);
  const HEALTH_PATHS = /* @__PURE__ */ new Set(["/", "/health", "/api/health", "/api/ping"]);
  const primaryHealthServer = import_http.default.createServer((req, res) => {
    const url = (req.url ?? "").split("?")[0];
    if (HEALTH_PATHS.has(url)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", pid: process.pid, role: "primary", ts: Date.now() }));
    } else {
      res.writeHead(503, { "Content-Type": "application/json", "Retry-After": "2" });
      res.end(JSON.stringify({ status: "starting", message: "Workers initializing \u2014 retry in 2s" }));
    }
  });
  primaryHealthServer.listen({ port: primaryPort, host: "0.0.0.0", reusePort: true }, () => {
    console.log(`[Cluster] Primary health server on :${primaryPort} (pid=${process.pid}) \u2014 workers starting`);
  });
  const workerEnvMap = /* @__PURE__ */ new Map();
  for (let i = 0; i < workerCount; i++) {
    setTimeout(() => {
      const env = {
        PDIM_CLUSTER_WORKERS: String(workerCount),
        CLUSTER_WORKER_ID: String(i)
      };
      const w = import_cluster.default.fork(env);
      workerEnvMap.set(w.id, env);
    }, i * 300);
  }
  const workerRestartTimes = [];
  const MAX_RESTARTS_PER_MINUTE = 10;
  const BACKOFF_DELAY_MS = 3e4;
  import_cluster.default.on("exit", (worker, code, signal) => {
    const reason = signal ? `signal=${signal}` : `code=${code}`;
    console.error(`[Cluster] Worker ${worker.process.pid} exited (${reason}) \u2014 restarting`);
    const savedEnv = workerEnvMap.get(worker.id);
    workerEnvMap.delete(worker.id);
    const spawnReplacement = () => {
      const w = import_cluster.default.fork(savedEnv);
      if (savedEnv) workerEnvMap.set(w.id, savedEnv);
    };
    const now = Date.now();
    while (workerRestartTimes.length > 0 && workerRestartTimes[0] < now - 6e4) {
      workerRestartTimes.shift();
    }
    if (workerRestartTimes.length >= MAX_RESTARTS_PER_MINUTE) {
      console.error(
        `[Cluster] Crash-loop detected: ${workerRestartTimes.length} restarts in last 60s \u2014 backing off ${BACKOFF_DELAY_MS / 1e3}s before next fork`
      );
      setTimeout(spawnReplacement, BACKOFF_DELAY_MS);
    } else {
      workerRestartTimes.push(now);
      setTimeout(spawnReplacement, 500);
    }
  });
  let workersOnline = 0;
  let primaryPortReleased = false;
  import_cluster.default.on("online", (worker) => {
    console.log(`[Cluster] Worker ${worker.process.pid} online`);
    workersOnline++;
    if (workersOnline >= workerCount && !primaryPortReleased) {
      primaryPortReleased = true;
      primaryHealthServer.close(() => {
        console.log("[Cluster] Primary port released \u2014 all traffic now served by workers");
      });
    }
  });
  process.on("SIGTERM", () => primaryShutdown("SIGTERM"));
  process.on("SIGINT", () => primaryShutdown("SIGINT"));
  let rollingRestartInProgress = false;
  import_cluster.default.on("message", (_worker, message) => {
    if (!message || typeof message !== "object") return;
    const msg = message;
    if (msg.type !== "SILENT_RELOAD") return;
    if (rollingRestartInProgress) {
      console.log("[Cluster] Rolling restart already in progress \u2014 ignoring duplicate SILENT_RELOAD");
      return;
    }
    const reason = msg.reason ?? "unknown";
    console.log(`[Cluster] SILENT_RELOAD received (reason=${reason}) \u2014 beginning rolling restart`);
    rollingRestartInProgress = true;
    const workerList = Object.values(import_cluster.default.workers ?? {}).filter(Boolean);
    let index = 0;
    const restartNext = () => {
      if (index >= workerList.length) {
        console.log("[Cluster] Rolling restart complete \u2014 all workers running new code");
        rollingRestartInProgress = false;
        return;
      }
      const target = workerList[index++];
      if (!target || target.isDead()) {
        restartNext();
        return;
      }
      const replacement = import_cluster.default.fork();
      replacement.once("listening", () => {
        console.log(`[Cluster] Replacement worker ${replacement.process.pid} ready \u2014 retiring old worker ${target.process.pid}`);
        target.disconnect();
        const forceKill = setTimeout(() => target.kill(), 1e4);
        target.once("exit", () => {
          clearTimeout(forceKill);
          restartNext();
        });
      });
    };
    restartNext();
  });
}
var primaryShutdown2;
