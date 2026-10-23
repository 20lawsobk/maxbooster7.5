import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runProductionStartupReadiness } from "./testing/production-readiness.mjs";
import { validateBuild } from "./build-contract.mjs";

export {
  readBuildInputs,
  writeBuildContract,
  finalizeBuildContractAfterPublicVariantRemoval,
} from "./build-contract.mjs";
export { validateBuild };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const startupReadinessReport = await runProductionStartupReadiness({
      root,
      env: process.env,
      nodeVersion: process.version,
      validateBuild,
    });
    for (const check of startupReadinessReport.checks) {
      console.log(`[ProductionReadiness] ${check.status} ${check.id} (${check.durationMs}ms): ${check.evidence}`);
    }
    if (!startupReadinessReport.ready) {
      const failed = startupReadinessReport.checks
        .filter(check => check.status !== "PASS")
        .map(check => check.id);
      throw new Error(`Production startup blocked by readiness checks: ${failed.join(", ")}`);
    }
    console.log("[ProductionReadiness] READY; starting the validated production handoff");
    const port = process.env.PORT ?? "5000";
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("PORT must be an integer from 1 to 65535");
    // Reuse the production application handoff, including Python activation,
    // Rust sidecar and diffusion gateway. Only the capsule executive is skipped:
    // npm builds operate on already installed, unpacked dependencies.
    const child = spawn("bash", ["-c", 'source scripts/port-contract.sh; exec bash start.sh --executive-application'], {
      cwd: root, stdio: "inherit", detached: true,
      env: { ...process.env, NODE_ENV: "production", PORT: port, DEPLOY_NODE_BIN: process.execPath, DEPLOY_BOOT_STUB_PID: "" },
    });
    let readiness;
    const stop = signal => {
      if (readiness && readiness.exitCode === null && readiness.signalCode === null) {
        readiness.kill(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
      }
      if (!child.pid) return;
      try { process.kill(-child.pid, signal); }
      catch (error) { if (error.code !== "ESRCH") console.error(error.message); }
    };
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(signal));
    child.on("error", error => { console.error(error.message); process.exitCode = 1; });
    child.on("exit", (code, signal) => { stop("SIGTERM"); process.exitCode = code ?? (signal ? 1 : 0); });
    readiness = spawn(process.execPath,
      ["scripts/wait-configured-ports.mjs", "--timeout-ms=300000"], {
        cwd: root,
        stdio: "inherit",
        env: { ...process.env, NODE_ENV: "production" },
      });
    const readinessCode = await new Promise(resolve => {
      let settled = false;
      const finish = code => {
        if (settled) return;
        settled = true;
        resolve(code);
      };
      readiness.once("error", error => {
        console.error(`[PortReadiness] could not start verification: ${error.message}`);
        finish(1);
      });
      readiness.once("exit", code => finish(code ?? 1));
      child.once("exit", () => {
        if (readiness.exitCode === null) {
          readiness.kill("SIGTERM");
          finish(1);
        }
      });
    });
    if (readinessCode !== 0) {
      console.error("[ProductionStart] configured listeners failed readiness verification");
      stop("SIGTERM");
      process.exitCode = 1;
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
