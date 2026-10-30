import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { logger } from "../logger.js";

let timer: ReturnType<typeof setInterval> | undefined;
let running = false;

/** Called by authorized profile progress routes; never exposes another user's work. */
export async function getCatalogDiscoveryJob(profileId: string, userId: string) {
  const result = await pool.query(
    `SELECT id, profile_id, state, attempts, created_at, updated_at, result, error
     FROM integration_catalog_jobs WHERE profile_id=$1 AND user_id=$2`, [profileId, userId],
  );
  return result.rows[0] ?? null;
}

export async function runCatalogDiscoveryJobs(): Promise<void> {
  if (running) return;
  running = true;
  const owner = randomUUID();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    const claimed = await pool.query(
      `UPDATE integration_catalog_jobs SET state='running', attempts=attempts+1,
         lease_owner=$1, lease_until=now()+interval '5 minutes', updated_at=now()
       WHERE id=(SELECT id FROM integration_catalog_jobs
         WHERE (state='pending' AND available_at<=now())
            OR (state='running' AND lease_until<now())
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING *`, [owner],
    );
    const job = claimed.rows[0];
    if (!job) return;
    // Existing catalog importer advisory locks/savepoints still protect duplicate writes.
    heartbeat = setInterval(() => {
      void pool.query(
        `UPDATE integration_catalog_jobs SET lease_until=now()+interval '5 minutes'
         WHERE id=$1 AND lease_owner=$2 AND state='running'`, [job.id, owner],
      ).catch(error => logger.error({ err: error }, "Catalog discovery lease renewal failed"));
    }, 60_000);
    heartbeat.unref();
    try {
      const { artistProfileService } = await import("./artistProfileService.js");
      const result = await artistProfileService.autoDiscover(job.profile_id, job.user_id);
      await pool.query(
        `UPDATE integration_catalog_jobs SET state='completed', result=$3::jsonb,
         lease_owner=NULL, lease_until=NULL, error=NULL, updated_at=now()
         WHERE id=$1 AND lease_owner=$2`, [job.id, owner, JSON.stringify(result)],
      );
    } catch (error) {
      await pool.query(
        `UPDATE integration_catalog_jobs SET state=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,
         available_at=now()+interval '5 minutes', lease_owner=NULL, lease_until=NULL,
         error=$3, updated_at=now() WHERE id=$1 AND lease_owner=$2`,
        [job.id, owner, error instanceof Error ? error.message : "Catalog discovery failed"],
      );
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    running = false;
  }
}

/** Lifecycle hook: call after database readiness, stop during graceful shutdown. */
export function startCatalogDiscoveryWorker() {
  if (timer) return;
  const tick = () => void runCatalogDiscoveryJobs().catch(error =>
    logger.error({ err: error }, "Catalog discovery worker failed"));
  timer = setInterval(tick, 30_000);
  timer.unref();
  tick();
}
export function stopCatalogDiscoveryWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}