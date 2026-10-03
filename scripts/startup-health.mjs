import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function probeJson(port, pathname, timeoutMs = 1000) {
  return new Promise(resolve => {
    const req = http.get({ host: "127.0.0.1", port, path: pathname }, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => {
        body += chunk;
        if (body.length > 128 * 1024) req.destroy(new Error("Oversized health response"));
      });
      res.on("error", () => resolve(null));
      res.on("end", () => {
        if (res.statusCode !== 200) return resolve(null);
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    // Absolute request deadline, including a server that trickles response bytes.
    const timer = setTimeout(() => req.destroy(new Error("Health request deadline")), timeoutMs);
    req.on("close", () => clearTimeout(timer));
    req.on("error", () => resolve(null));
  });
}

export async function waitForStartup({ mode, port, pid, timeoutMs, intervalMs = 200 }) {
  if (!["gateway", "application"].includes(mode) ||
      !Number.isInteger(port) || port < 1 || port > 65535 ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0 ||
      (pid !== undefined && (!Number.isInteger(pid) || pid < 1))) throw new Error("Invalid startup probe options");
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (pid) {
      try { process.kill(pid, 0); }
      catch (error) {
        if (error.code === "ESRCH") throw new Error(`${mode} process exited before readiness`);
        throw error;
      }
    }
    const requestBudget = Math.max(1, Math.min(1000, deadline - performance.now()));
    if (mode === "gateway") {
      const result = await probeJson(port, "/health", requestBudget);
      if (result?.gateway === "maxcore-diffusion-gateway" && result.status === "healthy") return;
    } else {
      const [boot, ready] = await Promise.all([
        probeJson(port, "/api/boot-status", requestBudget),
        probeJson(port, "/api/ready", requestBudget),
      ]);
      if (boot?.ready === true && ready?.status === "ok" && ready.unifiedAwareness?.ready === true) return;
    }
    await delay(Math.max(1, Math.min(intervalMs, deadline - performance.now())));
  }
  throw new Error(`${mode} did not become ready within ${timeoutMs}ms`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  const started = Number(process.env.STARTUP_STARTED_AT_MS || Date.now());
  try {
    await waitForStartup({
      mode, port: Number(process.argv[3]), pid: process.argv[4] ? Number(process.argv[4]) : undefined,
      timeoutMs: mode === "gateway" ? 30_000 : 900_000,
      intervalMs: mode === "gateway" ? 100 : 1000,
    });
    console.log(`[deployment-timing] ${mode}-ready: ${((Date.now() - started) / 1000).toFixed(3)}s since startup`);
  } catch (error) {
    console.error(`[startup] ${error.message}`);
    process.exitCode = 1;
  }
}