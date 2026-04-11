/**
 * domainVerificationWorker
 *
 * Background interval worker that polls storefront_domains for rows in
 * 'pending' status and runs DNS TXT verification against each one.
 *
 * Lifecycle:
 *   start()  — begins the polling loop; safe to call once at boot
 *   stop()   — clears the interval (used in tests / graceful shutdown)
 *
 * The poll interval is intentionally coarse (60 s default) — DNS TTLs
 * are typically 300-3600 s so polling faster has no benefit.
 */

import { pool } from '../db.js';
import { verifyStorefrontDomain } from '../services/storefrontDnsService.js';
import { logger } from '../logger.js';

const POLL_INTERVAL_MS = parseInt(process.env.DOMAIN_VERIFY_INTERVAL_MS ?? '60000', 10);
const BATCH_SIZE = 20; // max domains to check per tick (avoids thundering-herd)

let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function runVerificationTick(): Promise<void> {
  let rows: Array<{ id: string; domain: string }> = [];

  try {
    const result = await pool.query<{ id: string; domain: string }>(
      `SELECT id, domain
       FROM storefront_domains
       WHERE status = 'pending'
         AND type   = 'custom_domain'
       ORDER BY created_at ASC
       LIMIT $1`,
      [BATCH_SIZE],
    );
    rows = result.rows;
  } catch (err) {
    logger.warn({ err }, '[domainVerify] failed to query pending domains');
    return;
  }

  if (rows.length === 0) return;

  logger.info({ count: rows.length }, '[domainVerify] checking pending domains');

  for (const { id, domain } of rows) {
    try {
      const result = await verifyStorefrontDomain(id);
      if (result === 'verified') {
        logger.info({ domain }, '[domainVerify] domain verified and activated');
      } else if (result === 'failed') {
        logger.warn({ domain }, '[domainVerify] domain verification permanently failed');
      }
      // 'pending' — still waiting; nothing to log
    } catch (err) {
      logger.warn({ err, domain }, '[domainVerify] error checking domain');
    }
  }
}

export function startDomainVerificationWorker(): void {
  if (intervalHandle) return; // already running

  // Run once immediately, then on interval
  runVerificationTick().catch(err =>
    logger.warn({ err }, '[domainVerify] initial tick error'),
  );

  intervalHandle = setInterval(() => {
    runVerificationTick().catch(err =>
      logger.warn({ err }, '[domainVerify] tick error'),
    );
  }, POLL_INTERVAL_MS);

  logger.info({ intervalMs: POLL_INTERVAL_MS }, '[domainVerify] worker started');
}

export function stopDomainVerificationWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('[domainVerify] worker stopped');
  }
}
