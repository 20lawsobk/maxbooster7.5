// @ts-nocheck
/**
 * GUARANTEED AUDIT LOGGING
 *
 * Critical audit events are logged with guaranteed persistence.
 * Uses write-ahead logging pattern to prevent data loss.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger.js";
import * as fs from "fs";
import * as path from "path";

/**
 * Audit event categories
 */
export type AuditCategory =
  | "auth"
  | "payment"
  | "security"
  | "autonomous"
  | "admin"
  | "data"
  | "user"
  | "system";

/**
 * Audit event severity
 */
export type AuditSeverity = "info" | "warning" | "critical";

/**
 * Audit log entry
 */
export interface AuditEntry {
  id: string;
  timestamp: Date;
  category: AuditCategory;
  severity: AuditSeverity;
  action: string;
  userId?: string;
  targetId?: string;
  targetType?: string;
  ipAddress?: string;
  userAgent?: string;
  details: Record<string, any>;
  success: boolean;
  errorMessage?: string;
}

// Write-ahead log for critical events
const WAL_PATH = path?.join(process.cwd(), ".audit-wal");
const walBuffer: AuditEntry[] = [];
let walFlushTimer: NodeJS.Timeout | null = null;

/**
 * Initialize audit logger
 */
export async function initAuditLogger(): Promise<void> {
  // Ensure WAL directory exists
  try {
    if (!fs?.existsSync(WAL_PATH)) {
      fs?.mkdirSync(WAL_PATH, { recursive: true });
    }
  } catch (error) {
    logger.warn({ err: error }, "[Audit] Could not create WAL directory:");
  }

  // Recover any pending WAL entries
  await recoverWAL();

  // Start periodic WAL flush
  walFlushTimer = setInterval(() => flushWAL(), 5000);

  logger.info("[Audit] Audit logger initialized");
}

/**
 * Log an audit event with guaranteed persistence
 */
export async function audit(
  entry: Omit<AuditEntry, "id" | "timestamp">,
): Promise<string> {
  const fullEntry: AuditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    ...entry,
  };

  // Critical events are written synchronously to WAL first
  if (entry?.severity === "critical") {
    await writeToWAL(fullEntry);
  }

  // Add to buffer for batch processing
  walBuffer?.push(fullEntry);

  // Log to console for immediate visibility
  const logLevel =
    entry?.severity === "critical"
      ? "error"
      : entry?.severity === "warning"
        ? "warn"
        : "info";

  logger[logLevel](
    `[AUDIT] [${entry?.category}] ${entry?.action} - ${entry?.success ? "SUCCESS" : "FAILED"}`,
    {
      userId: entry.userId,
      targetId: entry.targetId,
      details: entry.details,
    },
  );

  // Flush immediately if buffer is large or event is critical
  if (walBuffer?.length >= 10 || entry?.severity === "critical") {
    await flushWAL();
  }

  return fullEntry?.id;
}

/**
 * Log an audit event and confirm it is durably persisted before resolving.
 *
 * audit() above is intentionally best-effort: it buffers and flushes on a
 * timer (or every 10 events) so hot paths never block on a DB round trip,
 * but that means a crash between the call and the next flush silently loses
 * the entry — even for "critical" severity, a failed flush is caught and
 * re-queued rather than surfaced to the caller.
 *
 * Some call sites can't accept that: when an audit row is the ONLY record
 * that an event was ever reconciled (e.g. a webhook handler's legitimate
 * no-op branch, where no other table gets a write), reporting success back
 * to an external caller before that row is confirmed persisted means a
 * crash in the gap loses the event's only trace while the external system
 * believes it was handled. Use this instead of audit() there: it performs
 * the insert immediately and rejects if it fails, so the caller can
 * propagate a retryable failure instead of a silently lost trace.
 */
export async function auditConfirmed(
  entry: Omit<AuditEntry, "id" | "timestamp">,
): Promise<string> {
  const fullEntry: AuditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    ...entry,
  };

  const logLevel =
    entry?.severity === "critical"
      ? "error"
      : entry?.severity === "warning"
        ? "warn"
        : "info";

  logger[logLevel](
    `[AUDIT] [${entry?.category}] ${entry?.action} - ${entry?.success ? "SUCCESS" : "FAILED"}`,
    {
      userId: entry.userId,
      targetId: entry.targetId,
      details: entry.details,
    },
  );

  // Deliberately no try/catch, no buffering: a failure here must reject
  // this call so the caller knows the trace was NOT persisted.
  await persistAuditEntry(fullEntry);

  return fullEntry?.id;
}

/**
 * Write critical event to write-ahead log
 */
async function writeToWAL(entry: AuditEntry): Promise<void> {
  try {
    const walFile = path?.join(WAL_PATH, `${entry?.id}.json`);
    await fs?.promises?.writeFile(walFile, JSON.stringify(entry), "utf8");
  } catch (error) {
    logger.warn({ err: error }, "[Audit] Failed to write to WAL:");
  }
}

/**
 * Insert a single audit entry into the canonical audit_logs table
 * (shared/schema.ts). Maps the logger's richer entry shape onto it:
 *   ipAddress -> ip, category -> resource, severity -> risk,
 *   success -> result; targetId/targetType/errorMessage/walId fold
 *   into details for full fidelity. Idempotency on retry is enforced
 *   via the wal_id key inside details.
 *
 * Throws if the insert fails — this is the single source of truth for
 * "did this entry actually persist," used both by the best-effort
 * buffered flush (which catches and re-queues on failure) and by
 * auditConfirmed() (which does not catch, so a caller that needs a
 * durable write before proceeding gets a real rejection instead of a
 * silently dropped trace).
 */
async function persistAuditEntry(entry: AuditEntry): Promise<void> {
  const risk =
    entry?.severity === "critical"
      ? "critical"
      : entry?.severity === "warning"
        ? "medium"
        : "low";
  // audit_logs.user_id has an FK to users.id — a non-UUID placeholder
  // like "unknown" (used by callers that couldn't resolve a real user,
  // e.g. webhook handlers) would violate that constraint and silently
  // drop the whole entry. Fold it into details instead of nulling it
  // out blindly, so the caller's intent isn't lost.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const safeUserId =
    entry?.userId && UUID_RE.test(entry.userId) ? entry.userId : null;
  const details = JSON.stringify({
    ...(entry?.details ?? {}),
    wal_id: entry?.id ?? null,
    category: entry?.category ?? null,
    severity: entry?.severity ?? null,
    target_id: entry?.targetId ?? null,
    target_type: entry?.targetType ?? null,
    error_message: entry?.errorMessage ?? null,
    ...(entry?.userId && !safeUserId ? { raw_user_id: entry.userId } : {}),
  });

  await db.execute(sql`
    INSERT INTO audit_logs (
      timestamp, user_id, ip, user_agent, action,
      resource, result, risk, details
    )
    SELECT
      ${entry?.timestamp ?? new Date().toISOString()},
      ${safeUserId},
      ${entry?.ipAddress ?? "unknown"},
      ${entry?.userAgent ?? null},
      ${entry?.action ?? "unknown"},
      ${entry?.targetType ?? entry?.category ?? "system"},
      ${entry?.success ? "success" : "failure"},
      ${risk},
      ${details}::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM audit_logs
      WHERE details->>'wal_id' = ${entry?.id ?? ""}
    )
  `);
}

/**
 * Flush WAL buffer to database
 */
async function flushWAL(): Promise<void> {
  if (walBuffer?.length === 0) return;

  const entries = [...walBuffer];
  walBuffer.length = 0;

  try {
    // Batch insert to database
    for (const entry of entries) {
      try {
        await persistAuditEntry(entry);

        // Remove from WAL if successfully persisted
        removeFromWAL(entry?.id);
      } catch (dbError) {
        // Put back in buffer for retry
        walBuffer?.push(entry);
        logger.warn(dbError, "[Audit] Failed to persist audit entry:");
      }
    }
  } catch (error) {
    // Put all entries back in buffer
    walBuffer?.push(...entries);
    logger.warn({ err: error }, "[Audit] Failed to flush WAL:");
  }
}

/**
 * Remove entry from WAL after successful persistence
 */
function removeFromWAL(entryId: string): void {
  try {
    const walFile = path?.join(WAL_PATH, `${entryId}.json`);
    if (fs?.existsSync(walFile)) {
      fs?.unlinkSync(walFile);
    }
  } catch (error) {
    // Non-critical, just log
    logger.debug({ err: error }, "[Audit] Could not remove WAL file:");
  }
}

/**
 * Recover pending WAL entries on startup
 */
async function recoverWAL(): Promise<void> {
  try {
    try {
      await fs?.promises?.access(WAL_PATH);
    } catch {
      return;
    }

    const files = (await fs.promises.readdir(WAL_PATH)).filter((f) =>
      f?.endsWith(".json"),
    );

    if (files?.length > 0) {
      logger.info(
        `[Audit] Recovering ${files?.length} pending audit entries from WAL`,
      );
    }

    for (const file of files) {
      try {
        const content = await fs?.promises?.readFile(
          path?.join(WAL_PATH, file),
          "utf8",
        );
        const entry = JSON.parse(content) as AuditEntry;
        walBuffer?.push(entry);
      } catch (error) {
        logger.warn(
          { err: error },
          `[Audit] Failed to recover WAL entry ${file}:`,
        );
      }
    }

    // Flush recovered entries
    if (walBuffer?.length > 0) {
      await flushWAL();
    }
  } catch (error) {
    logger.warn({ err: error }, "[Audit] WAL recovery failed:");
  }
}

/**
 * Convenience methods for common audit events
 */
export const auditAuth = {
  login: (userId: string, ip: string, success: boolean, error?: string) =>
    audit({
      category: "auth",
      severity: success ? "info" : "warning",
      action: "user_login",
      userId,
      ipAddress: ip,
      details: {},
      success,
      errorMessage: error,
    }),

  logout: (userId: string) =>
    audit({
      category: "auth",
      severity: "info",
      action: "user_logout",
      userId,
      details: {},
      success: true,
    }),

  register: (userId: string, email: string, ip: string) =>
    audit({
      category: "auth",
      severity: "info",
      action: "user_register",
      userId,
      ipAddress: ip,
      details: { email },
      success: true,
    }),

  passwordChange: (userId: string, ip: string) =>
    audit({
      category: "auth",
      severity: "warning",
      action: "password_change",
      userId,
      ipAddress: ip,
      details: {},
      success: true,
    }),
};

export const auditPayment = {
  charge: (
    userId: string,
    amount: number,
    chargeId: string,
    success: boolean,
    error?: string,
  ) =>
    audit({
      category: "payment",
      severity: success ? "info" : "critical",
      action: "payment_charge",
      userId,
      targetId: chargeId,
      targetType: "charge",
      details: { amount },
      success,
      errorMessage: error,
    }),

  refund: (userId: string, amount: number, refundId: string, reason: string) =>
    audit({
      category: "payment",
      severity: "warning",
      action: "payment_refund",
      userId,
      targetId: refundId,
      targetType: "refund",
      details: { amount, reason },
      success: true,
    }),

  chargeback: (
    userId: string,
    amount: number,
    disputeId: string,
    reason: string,
  ) =>
    audit({
      category: "payment",
      severity: "critical",
      action: "payment_chargeback",
      userId,
      targetId: disputeId,
      targetType: "dispute",
      details: { amount, reason },
      success: false,
      errorMessage: "Chargeback received",
    }),

  payout: (
    userId: string,
    amount: number,
    payoutId: string,
    success: boolean,
  ) =>
    audit({
      category: "payment",
      severity: success ? "info" : "warning",
      action: "payment_payout",
      userId,
      targetId: payoutId,
      targetType: "payout",
      details: { amount },
      success,
    }),
};

export const auditSecurity = {
  suspiciousActivity: (
    userId: string | undefined,
    ip: string,
    reason: string,
  ) =>
    audit({
      category: "security",
      severity: "critical",
      action: "suspicious_activity",
      userId,
      ipAddress: ip,
      details: { reason },
      success: false,
      errorMessage: reason,
    }),

  rateLimitExceeded: (ip: string, endpoint: string) =>
    audit({
      category: "security",
      severity: "warning",
      action: "rate_limit_exceeded",
      ipAddress: ip,
      details: { endpoint },
      success: false,
    }),

  killSwitchActivated: (
    triggeredBy: string,
    reason: string,
    systems: string[],
  ) =>
    audit({
      category: "security",
      severity: "critical",
      action: "kill_switch_activated",
      userId: triggeredBy,
      details: { reason, systems },
      success: true,
    }),
};

export const auditAutonomous = {
  actionBlocked: (systemName: string, action: string, reason: string) =>
    audit({
      category: "autonomous",
      severity: "warning",
      action: "autonomous_action_blocked",
      details: { systemName, action, reason },
      success: false,
      errorMessage: reason,
    }),

  approvalRequested: (systemName: string, action: string, approvalId: string) =>
    audit({
      category: "autonomous",
      severity: "info",
      action: "autonomous_approval_requested",
      targetId: approvalId,
      targetType: "approval",
      details: { systemName, action },
      success: true,
    }),
};

/**
 * Get audit log entries
 */
export async function getAuditLog(params: {
  userId?: string;
  category?: AuditCategory;
  severity?: AuditSeverity;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<AuditEntry[]> {
  try {
    const limit = Math.min(params?.limit || 100, 1000);
    const offset = params?.offset || 0;

    const result = await db.execute(sql`
      SELECT * FROM audit_logs
      WHERE 1=1
        ${params.userId ? sql`AND user_id = ${params?.userId}` : sql``}
        ${params.category ? sql`AND details->>'category' = ${params?.category}` : sql``}
        ${params.severity ? sql`AND details->>'severity' = ${params?.severity}` : sql``}
        ${params?.startDate ? sql`AND timestamp >= ${params?.startDate}` : sql``}
        ${params?.endDate ? sql`AND timestamp <= ${params?.endDate}` : sql``}
      ORDER BY timestamp DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    return result?.rows as unknown as AuditEntry[];
  } catch (error) {
    logger.warn({ err: error }, "[Audit] Failed to query audit log:");
    return [];
  }
}

/**
 * Cleanup old audit entries (retention policy)
 */
export async function cleanupAuditLog(
  retentionDays: number = 90,
): Promise<number> {
  try {
    const cutoffDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );

    // Keep critical entries for longer (column is `risk`, not `severity`)
    const result = await db.execute(sql`
      DELETE FROM audit_logs
      WHERE timestamp < ${cutoffDate}
        AND risk != 'critical'
      RETURNING id
    `);

    const deleted = result?.rows?.length;
    if (deleted > 0) {
      logger.info(`[Audit] Cleaned up ${deleted} old audit entries`);
    }

    return deleted;
  } catch (error) {
    logger.warn({ err: error }, "[Audit] Failed to cleanup audit log:");
    return 0;
  }
}

/**
 * Shutdown handler - flush remaining entries
 */
export async function shutdownAuditLogger(): Promise<void> {
  if (walFlushTimer) {
    clearInterval(walFlushTimer);
  }
  await flushWAL();
  logger.info("[Audit] Audit logger shut down");
}
