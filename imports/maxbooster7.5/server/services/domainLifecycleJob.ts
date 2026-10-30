/**
 * Domain Lifecycle Job
 *
 * Runs on a schedule to enforce time-based domain state transitions and
 * trigger renewals. Mirrors the nightly operations a real registrar backend
 * would perform automatically.
 *
 * Transitions managed:
 *
 *   active / platform_managed  → expiring_soon   (≤ 30 days to expiry)
 *   expiring_soon               → auto-renew OR grace (if billing OK, renew; else enter grace)
 *   grace                       → expired         (> 30 days past expiry with no renewal)
 *   expired                     → [DNS zone removed]
 *
 * Also sends in-app / email notifications for:
 *   - 30-day expiry warning
 *   - 7-day expiry warning
 *   - Auto-renewal confirmation
 *   - Renewal failure
 */

import { pool } from "../db.js";
import { logger } from "../logger.js";
import { getRegistrarProvider } from "./registrar/index.js";
import { emitDomainEvent } from "./domainPolicyEngine.js";

const GRACE_PERIOD_DAYS = 30;

// ── Main lifecycle check ──────────────────────────────────────────────────────

export async function runDomainLifecycleChecks(): Promise<void> {
  const now = new Date();
  const in30d = new Date(now);
  in30d?.setDate(in30d?.getDate() + 30);
  const in7d = new Date(now);
  in7d?.setDate(in7d?.getDate() + 7);
  const ago30d = new Date(now);
  ago30d?.setDate(ago30d?.getDate() - GRACE_PERIOD_DAYS);

  logger.info({ now }, "[DomainLifecycle] starting lifecycle checks");

  await Promise.allSettled([
    _markExpiringSoon(now, in30d),
    _autoRenewDueSoon(now, in7d),
    _enterGracePeriod(now),
    _expireGraceDomains(ago30d),
    _cleanUpExpiredZones(),
  ]);

  logger.info("[DomainLifecycle] lifecycle checks complete");
}

// ── Step 1: active → expiring_soon ───────────────────────────────────────────

async function _markExpiringSoon(now: Date, threshold: Date): Promise<void> {
  const { rowCount } = (await pool?.query(
    `UPDATE claimed_domains
     SET status = 'expiring_soon', updated_at = NOW()
     WHERE status IN ('active', 'platform_managed')
       AND expires_at IS NOT NULL
       AND expires_at > $1
       AND expires_at <= $2`,
    [now, threshold],
  )) ?? {};

  if (rowCount && rowCount > 0) {
    logger.info({ count: rowCount }, "[DomainLifecycle] marked expiring_soon");

    // Emit events for each affected domain
    const { rows } = (await pool?.query(
      `SELECT id, user_id, domain, expires_at
       FROM claimed_domains
       WHERE status = 'expiring_soon'
         AND expires_at > $1 AND expires_at <= $2`,
      [now, threshold],
    )) ?? {};
    for (const row of rows) {
      await emitDomainEvent(
        "DomainExpiringSoon",
        row?.id,
        row?.user_id,
        row?.domain,
        { expiresAt: row.expires_at },
      );
    }
  }
}

// ── Step 2: auto-renew domains expiring within 7 days ────────────────────────

async function _autoRenewDueSoon(now: Date, threshold: Date): Promise<void> {
  const { rows } = (await pool?.query(
    `SELECT id, user_id, domain, expires_at, auto_renew
     FROM claimed_domains
     WHERE status IN ('active', 'expiring_soon')
       AND auto_renew = true
       AND expires_at IS NOT NULL
       AND expires_at > $1
       AND expires_at <= $2
       AND registrar_name = 'maxbooster'`, // only internally-managed domains
    [now, threshold],
  )) ?? {};

  for (const row of rows) {
    try {
      const result = await getRegistrarProvider().renewDomain(row?.domain, 1);

      await emitDomainEvent("DomainRenewed", row?.id, row?.user_id, row?.domain, {
        newExpiresAt: result.expiresAt,
        years: 1,
        automatic: true,
      });

      logger.info(
        { domain: row.domain, newExpiry: result.expiresAt },
        "[DomainLifecycle] auto-renewed",
      );
    } catch (e) {
      logger.warn(
        { domain: row.domain, err: (e as Error).message },
        "[DomainLifecycle] auto-renewal failed",
      );
      // If renewal fails, domain will naturally transition to grace on next run
    }
  }
}

// ── Step 3: expired → grace ───────────────────────────────────────────────────

async function _enterGracePeriod(now: Date): Promise<void> {
  const { rowCount } = (await pool?.query(
    `UPDATE claimed_domains
     SET status = 'grace', updated_at = NOW()
     WHERE status IN ('active', 'expiring_soon', 'non_renewing')
       AND expires_at IS NOT NULL
       AND expires_at <= $1`,
    [now],
  )) ?? {};

  if (rowCount && rowCount > 0) {
    logger.info(
      { count: rowCount },
      "[DomainLifecycle] domains entered grace period (DNS still live)",
    );

    const { rows } = (await pool?.query(
      `SELECT id, user_id, domain FROM claimed_domains WHERE status = 'grace' AND expires_at <= $1`,
      [now],
    )) ?? {};
    for (const row of rows) {
      await emitDomainEvent(
        "DomainEnteredGrace",
        row?.id,
        row?.user_id,
        row?.domain,
        { gracePeriodDays: GRACE_PERIOD_DAYS },
      );
    }
  }
}

// ── Step 4: grace past 30 days → expired ──────────────────────────────────────

async function _expireGraceDomains(graceThreshold: Date): Promise<void> {
  const { rows } = (await pool?.query(
    `UPDATE claimed_domains
     SET status = 'expired', auto_renew = false, updated_at = NOW()
     WHERE status = 'grace'
       AND expires_at IS NOT NULL
       AND expires_at <= $1
     RETURNING id, user_id, domain`,
    [graceThreshold],
  )) ?? {};

  for (const row of rows) {
    await emitDomainEvent("DomainExpired", row?.id, row?.user_id, row?.domain, {
      graceExpiredAt: graceThreshold,
    });
    logger.info(
      { domain: row.domain },
      "[DomainLifecycle] domain fully expired after grace period",
    );
  }
}

// ── Step 5: remove DNS zones for expired domains ──────────────────────────────

async function _cleanUpExpiredZones(): Promise<void> {
  const { rows } = (await pool?.query(
    `SELECT cd.domain
     FROM claimed_domains cd
     JOIN dns_zones dz ON dz.domain = cd.domain
     WHERE cd.status = 'expired'`,
  )) ?? {};

  for (const row of rows) {
    try {
      await pool.query(`DELETE FROM dns_zones WHERE domain = $1`, [row?.domain]);
      logger.info(
        { domain: row.domain },
        "[DomainLifecycle] removed DNS zone for expired domain",
      );
    } catch (e) {
      logger.warn(
        { domain: row.domain, err: (e as Error).message },
        "[DomainLifecycle] DNS zone removal failed (non-fatal)",
      );
    }
  }
}

// ── Scheduler integration ─────────────────────────────────────────────────────

let _lifecycleTimer: NodeJS.Timeout | null = null;

/**
 * Start the domain lifecycle job on a 6-hour interval.
 * Also runs once immediately on startup.
 */
export function startDomainLifecycleJob(): void {
  if (_lifecycleTimer) return;

  const INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

  // Run once shortly after startup (stagger by 2 minutes to not block boot)
  setTimeout(
    async () => {
      try {
        await runDomainLifecycleChecks();
      } catch (e) {
        logger.warn({ err: (e as Error).message }, "[DomainLifecycle] startup run failed");
      }
    },
    2 * 60 * 1000,
  );

  _lifecycleTimer = setInterval(async () => {
    try {
      await runDomainLifecycleChecks();
    } catch (e) {
      logger.warn({ err: (e as Error).message }, "[DomainLifecycle] scheduled run failed");
    }
  }, INTERVAL_MS);

  logger.info(
    { intervalHours: 6 },
    "[DomainLifecycle] lifecycle job scheduled",
  );
}

export function stopDomainLifecycleJob(): void {
  if (_lifecycleTimer) {
    clearInterval(_lifecycleTimer);
    _lifecycleTimer = null;
  }
}
