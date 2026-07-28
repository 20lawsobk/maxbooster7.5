/**
 * Max Booster — Monthly GeoIP Database Refresh
 *
 * Schedules a cron job (1st of each month at 03:15 UTC) that:
 *   1. Runs scripts/download-geodb.sh to fetch the latest MaxMind GeoLite2 database
 *   2. On success, hot-swaps the in-memory mmdb reader without a server restart
 *   3. Logs the outcome (success size / error message)
 *
 * The download script uses MAXMIND_ACCOUNT_ID + MAXMIND_LICENSE_KEY from env.
 * If either is missing the script exits 1 and we log a warning — GeoDNS keeps
 * serving the previous (stale) database rather than crashing.
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import { logger } from "../logger.js";
import { reloadGeoReader } from "./geoDns.js";
import { isSchedulerLeader } from "./autonomousJobScheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, "../../scripts/download-geodb.sh");

/** Run the download script and return stdout on success or throw on failure. */
async function runDownloadScript(): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const proc = spawn("bash", [SCRIPT_PATH], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    // Spawn-level errors (e.g. bash not found, ENOENT on script)
    proc.on("error", (err) => {
      settle(() => reject(new Error(`download-geodb.sh spawn error: ${err.message}`)));
    });

    // Hard 5-minute timeout — download + extract should finish well within that
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      settle(() => reject(new Error("download-geodb.sh timed out after 5 minutes")));
    }, 5 * 60 * 1000);

    proc.on("close", (code, signal) => {
      if (signal) {
        settle(() => reject(new Error(`download-geodb.sh killed by signal ${signal}`)));
      } else if (code === 0) {
        settle(() => resolve(stdout.trim()));
      } else {
        settle(() => reject(new Error(`download-geodb.sh exited ${code}: ${stderr.trim()}`)));
      }
    });
  });
}

/** Download fresh database and hot-swap the in-process reader. */
export async function refreshGeoDb(): Promise<void> {
  logger.info("[GeoDNS] Monthly refresh starting — downloading latest MaxMind database...");
  try {
    const out = await runDownloadScript();
    logger.info(`[GeoDNS] Download succeeded:\n${out}`);

    const swapped = await reloadGeoReader();
    if (swapped) {
      logger.info("[GeoDNS] Monthly refresh complete — database hot-swapped ✅");
    } else {
      logger.warn("[GeoDNS] Monthly refresh: download OK but hot-swap failed — restart to pick up new file");
    }
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "[GeoDNS] Monthly refresh FAILED — continuing with existing database",
    );
  }
}

/**
 * Start the monthly refresh cron.
 * Fires at 03:15 UTC on the 1st of every month.
 * Only the scheduler leader runs the actual download — all other workers skip
 * to prevent concurrent file replacement and duplicate MaxMind API calls.
 * Call once at server startup.
 */
export function startGeoDbRefreshCron(): void {
  // '15 3 1 * *' = 03:15 UTC on the 1st of each month
  cron.schedule("15 3 1 * *", () => {
    if (!isSchedulerLeader()) {
      logger.info("[GeoDNS] Monthly refresh tick — not scheduler leader, skipping");
      return;
    }
    refreshGeoDb().catch((err) => {
      logger.warn("[GeoDNS] Uncaught error in monthly refresh:", err?.message);
    });
  }, { timezone: "UTC" });

  logger.info("[GeoDNS] Monthly database refresh cron scheduled (1st of month, 03:15 UTC)");
}
