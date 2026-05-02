/**
 * domainVerificationWorker
 *
 * Background interval worker that polls storefront_domains for rows in
 * 'pending' or 'verification_failed' status and checks DNS propagation
 * using all four verification methods (NS, CNAME, A, TXT) via DoH.
 *
 * Modelled after how Vercel and Netlify continuously poll pending domains:
 *
 *   • Checks pending domains every minute.
 *   • Uses exponential-backoff skip for domains that have been failing
 *     repeatedly — after 60 failures it only retries once per hour.
 *   • Runs a full domain health sweep every 12 hours for active domains.
 *   • Gracefully no-ops if no pending domains exist (zero DB overhead).
 *
 * Lifecycle:
 *   startDomainVerificationWorker()  — begins the polling loop; safe to call once at boot
 *   stopDomainVerificationWorker()   — clears the interval (used in tests / graceful shutdown)
 */

import { pool } from '../db.js';
import { verifyStorefrontDomain, runDomainHealthSweep } from '../services/storefrontDnsService.js';
import { logger } from '../logger.js';

const POLL_INTERVAL_MS   = parseInt(process.env.DOMAIN_VERIFY_INTERVAL_MS ?? '60000', 10);
const BATCH_SIZE         = 20;   // max domains per tick — avoids thundering herd
const MAX_FAILURE_BACKOFF = 60;  // after N failures, back off to hourly retry
const BACKOFF_MODULO      = 60;  // tick count modulo for backed-off domains (1/hr at 1/min poll)
const HEALTH_SWEEP_TICKS  = 12 * 60; // 12-hour cadence in ticks

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;

/**
 * shouldCheckDomain — skip high-failure domains most ticks to avoid
 * hammering Cloudflare DoH for domains that will probably never verify.
 */
function shouldCheckDomain(failures: number): boolean {
  if (failures < MAX_FAILURE_BACKOFF) return true;
  return tickCount % BACKOFF_MODULO === 0;
}

async function runVerificationTick(): Promise<void> {
  tickCount++;

  // ── Pending domain checks ────────────────────────────────────────────────
  let rows: Array<{ id: string; domain: string; verification_failures: number }> = [];
  try {
    const result = await pool.query<{ id: string; domain: string; verification_failures: number }>(
      `SELECT id, domain, COALESCE(verification_failures, 0) AS verification_failures
       FROM storefront_domains
       WHERE status IN ('pending', 'verification_failed')
         AND type = 'custom_domain'
       ORDER BY verification_failures ASC, updated_at ASC
       LIMIT $1`,
      [BATCH_SIZE],
    );
    rows = result.rows;
  } catch (err) {
    logger.warn({ err }, '[domainVerify] failed to query pending domains');
    return;
  }

  if (rows.length > 0) {
    logger.debug({ count: rows.length, tick: tickCount }, '[domainVerify] checking pending domains');
  }

  for (const { id, domain, verification_failures } of rows) {
    if (!shouldCheckDomain(verification_failures)) continue;

    try {
      const result = await verifyStorefrontDomain(id);
      if (result === 'verified') {
        logger.info({ domain }, '[domainVerify] ✅ domain verified and activated');
      } else if (result === 'failed') {
        logger.warn({ domain }, '[domainVerify] domain verification permanently failed');
      }
      // 'pending' — still waiting; nothing to log at info level
    } catch (err) {
      logger.warn({ err, domain }, '[domainVerify] error checking domain');
    }

    // Small gap between checks to avoid bursting DoH
    await new Promise(r => setTimeout(r, 250));
  }

  // ── Domain health sweep every 12 hours ───────────────────────────────────
  if (tickCount % HEALTH_SWEEP_TICKS === 0) {
    try {
      const result = await runDomainHealthSweep();
      logger.info(result, '[domainVerify] health sweep complete');
    } catch (err) {
      logger.warn({ err }, '[domainVerify] health sweep error (non-fatal)');
    }
  }
}

export function startDomainVerificationWorker(): void {
  if (intervalHandle) return; // already running

  // Run once immediately so freshly-added domains don't wait a full minute
  runVerificationTick().catch(err =>
    logger.warn({ err }, '[domainVerify] initial tick error'),
  );

  intervalHandle = setInterval(() => {
    runVerificationTick().catch(err =>
      logger.warn({ err }, '[domainVerify] tick error'),
    );
  }, POLL_INTERVAL_MS);

  // Unref so the worker doesn't prevent clean process shutdown
  if ((intervalHandle as Record<string, unknown>).unref) (intervalHandle as Record<string, unknown>).unref();

  logger.info(
    { intervalMs: POLL_INTERVAL_MS, batchSize: BATCH_SIZE },
    '[domainVerify] worker started (multi-method DoH verification)',
  );
}

export function stopDomainVerificationWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('[domainVerify] worker stopped');
  }
}

export function isDomainWorkerRunning(): boolean {
  return intervalHandle !== null;
}
