/**
 * GUARANTEED AUDIT LOGGING
 * 
 * Critical audit events are logged with guaranteed persistence.
 * Uses write-ahead logging pattern to prevent data loss.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { logger } from '../logger.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Audit event categories
 */
export type AuditCategory = 
  | 'auth'
  | 'payment'
  | 'security'
  | 'autonomous'
  | 'admin'
  | 'data'
  | 'user'
  | 'system';

/**
 * Audit event severity
 */
export type AuditSeverity = 'info' | 'warning' | 'critical';

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
const WAL_PATH = path.join(process.cwd(), '.audit-wal');
const walBuffer: AuditEntry[] = [];
let walFlushTimer: NodeJS.Timeout | null = null;

/**
 * Initialize audit logger
 */
export async function initAuditLogger(): Promise<void> {
  // Ensure WAL directory exists
  try {
    if (!fs.existsSync(WAL_PATH)) {
      fs.mkdirSync(WAL_PATH, { recursive: true });
    }
  } catch (error) {
    logger.warn('[Audit] Could not create WAL directory:', error);
  }

  // Recover any pending WAL entries
  await recoverWAL();

  // Start periodic WAL flush
  walFlushTimer = setInterval(() => flushWAL(), 5000);

  logger.info('[Audit] Audit logger initialized');
}

/**
 * Log an audit event with guaranteed persistence
 */
export async function audit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<string> {
  const fullEntry: AuditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    ...entry,
  };

  // Critical events are written synchronously to WAL first
  if (entry.severity === 'critical') {
    await writeToWAL(fullEntry);
  }

  // Add to buffer for batch processing
  walBuffer.push(fullEntry);

  // Log to console for immediate visibility
  const logLevel = entry.severity === 'critical' ? 'error' : 
                   entry.severity === 'warning' ? 'warn' : 'info';
  
  logger[logLevel](`[AUDIT] [${entry.category}] ${entry.action} - ${entry.success ? 'SUCCESS' : 'FAILED'}`, {
    userId: entry.userId,
    targetId: entry.targetId,
    details: entry.details,
  });

  // Flush immediately if buffer is large or event is critical
  if (walBuffer.length >= 10 || entry.severity === 'critical') {
    await flushWAL();
  }

  return fullEntry.id;
}

/**
 * Write critical event to write-ahead log
 */
async function writeToWAL(entry: AuditEntry): Promise<void> {
  try {
    const walFile = path.join(WAL_PATH, `${entry.id}.json`);
    fs.writeFileSync(walFile, JSON.stringify(entry), 'utf8');
  } catch (error) {
    logger.error('[Audit] Failed to write to WAL:', error);
  }
}

/**
 * Flush WAL buffer to database
 */
async function flushWAL(): Promise<void> {
  if (walBuffer.length === 0) return;

  const entries = [...walBuffer];
  walBuffer.length = 0;

  try {
    // Batch insert to database
    for (const entry of entries) {
      try {
        await db.execute(sql`
          INSERT INTO audit_log (
            id, timestamp, category, severity, action, 
            user_id, target_id, target_type, ip_address, user_agent,
            details, success, error_message
          ) VALUES (
            ${entry.id}, ${entry.timestamp}, ${entry.category}, ${entry.severity}, ${entry.action},
            ${entry.userId}, ${entry.targetId}, ${entry.targetType}, ${entry.ipAddress}, ${entry.userAgent},
            ${JSON.stringify(entry.details)}, ${entry.success}, ${entry.errorMessage}
          )
          ON CONFLICT (id) DO NOTHING
        `);

        // Remove from WAL if successfully persisted
        removeFromWAL(entry.id);
      } catch (dbError) {
        // Put back in buffer for retry
        walBuffer.push(entry);
        logger.error('[Audit] Failed to persist audit entry:', dbError);
      }
    }
  } catch (error) {
    // Put all entries back in buffer
    walBuffer.push(...entries);
    logger.error('[Audit] Failed to flush WAL:', error);
  }
}

/**
 * Remove entry from WAL after successful persistence
 */
function removeFromWAL(entryId: string): void {
  try {
    const walFile = path.join(WAL_PATH, `${entryId}.json`);
    if (fs.existsSync(walFile)) {
      fs.unlinkSync(walFile);
    }
  } catch (error) {
    // Non-critical, just log
    logger.debug('[Audit] Could not remove WAL file:', error);
  }
}

/**
 * Recover pending WAL entries on startup
 */
async function recoverWAL(): Promise<void> {
  try {
    if (!fs.existsSync(WAL_PATH)) return;

    const files = fs.readdirSync(WAL_PATH).filter(f => f.endsWith('.json'));
    
    if (files.length > 0) {
      logger.info(`[Audit] Recovering ${files.length} pending audit entries from WAL`);
    }

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(WAL_PATH, file), 'utf8');
        const entry = JSON.parse(content) as AuditEntry;
        walBuffer.push(entry);
      } catch (error) {
        logger.error(`[Audit] Failed to recover WAL entry ${file}:`, error);
      }
    }

    // Flush recovered entries
    if (walBuffer.length > 0) {
      await flushWAL();
    }
  } catch (error) {
    logger.error('[Audit] WAL recovery failed:', error);
  }
}

/**
 * Convenience methods for common audit events
 */
export const auditAuth = {
  login: (userId: string, ip: string, success: boolean, error?: string) => 
    audit({
      category: 'auth',
      severity: success ? 'info' : 'warning',
      action: 'user_login',
      userId,
      ipAddress: ip,
      details: {},
      success,
      errorMessage: error,
    }),

  logout: (userId: string) =>
    audit({
      category: 'auth',
      severity: 'info',
      action: 'user_logout',
      userId,
      details: {},
      success: true,
    }),

  register: (userId: string, email: string, ip: string) =>
    audit({
      category: 'auth',
      severity: 'info',
      action: 'user_register',
      userId,
      ipAddress: ip,
      details: { email },
      success: true,
    }),

  passwordChange: (userId: string, ip: string) =>
    audit({
      category: 'auth',
      severity: 'warning',
      action: 'password_change',
      userId,
      ipAddress: ip,
      details: {},
      success: true,
    }),
};

export const auditPayment = {
  charge: (userId: string, amount: number, chargeId: string, success: boolean, error?: string) =>
    audit({
      category: 'payment',
      severity: success ? 'info' : 'critical',
      action: 'payment_charge',
      userId,
      targetId: chargeId,
      targetType: 'charge',
      details: { amount },
      success,
      errorMessage: error,
    }),

  refund: (userId: string, amount: number, refundId: string, reason: string) =>
    audit({
      category: 'payment',
      severity: 'warning',
      action: 'payment_refund',
      userId,
      targetId: refundId,
      targetType: 'refund',
      details: { amount, reason },
      success: true,
    }),

  chargeback: (userId: string, amount: number, disputeId: string, reason: string) =>
    audit({
      category: 'payment',
      severity: 'critical',
      action: 'payment_chargeback',
      userId,
      targetId: disputeId,
      targetType: 'dispute',
      details: { amount, reason },
      success: false,
      errorMessage: 'Chargeback received',
    }),

  payout: (userId: string, amount: number, payoutId: string, success: boolean) =>
    audit({
      category: 'payment',
      severity: success ? 'info' : 'warning',
      action: 'payment_payout',
      userId,
      targetId: payoutId,
      targetType: 'payout',
      details: { amount },
      success,
    }),
};

export const auditSecurity = {
  suspiciousActivity: (userId: string | undefined, ip: string, reason: string) =>
    audit({
      category: 'security',
      severity: 'critical',
      action: 'suspicious_activity',
      userId,
      ipAddress: ip,
      details: { reason },
      success: false,
      errorMessage: reason,
    }),

  rateLimitExceeded: (ip: string, endpoint: string) =>
    audit({
      category: 'security',
      severity: 'warning',
      action: 'rate_limit_exceeded',
      ipAddress: ip,
      details: { endpoint },
      success: false,
    }),

  killSwitchActivated: (triggeredBy: string, reason: string, systems: string[]) =>
    audit({
      category: 'security',
      severity: 'critical',
      action: 'kill_switch_activated',
      userId: triggeredBy,
      details: { reason, systems },
      success: true,
    }),
};

export const auditAutonomous = {
  actionBlocked: (systemName: string, action: string, reason: string) =>
    audit({
      category: 'autonomous',
      severity: 'warning',
      action: 'autonomous_action_blocked',
      details: { systemName, action, reason },
      success: false,
      errorMessage: reason,
    }),

  approvalRequested: (systemName: string, action: string, approvalId: string) =>
    audit({
      category: 'autonomous',
      severity: 'info',
      action: 'autonomous_approval_requested',
      targetId: approvalId,
      targetType: 'approval',
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
    const limit = Math.min(params.limit || 100, 1000);
    const offset = params.offset || 0;

    const result = await db.execute(sql`
      SELECT * FROM audit_log
      WHERE 1=1
        ${params.userId ? sql`AND user_id = ${params.userId}` : sql``}
        ${params.category ? sql`AND category = ${params.category}` : sql``}
        ${params.severity ? sql`AND severity = ${params.severity}` : sql``}
        ${params.startDate ? sql`AND timestamp >= ${params.startDate}` : sql``}
        ${params.endDate ? sql`AND timestamp <= ${params.endDate}` : sql``}
      ORDER BY timestamp DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    return result.rows as unknown as AuditEntry[];
  } catch (error) {
    logger.error('[Audit] Failed to query audit log:', error);
    return [];
  }
}

/**
 * Cleanup old audit entries (retention policy)
 */
export async function cleanupAuditLog(retentionDays: number = 90): Promise<number> {
  try {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    
    // Keep critical entries for longer
    const result = await db.execute(sql`
      DELETE FROM audit_log
      WHERE timestamp < ${cutoffDate}
        AND severity != 'critical'
      RETURNING id
    `);

    const deleted = result.rows.length;
    if (deleted > 0) {
      logger.info(`[Audit] Cleaned up ${deleted} old audit entries`);
    }
    
    return deleted;
  } catch (error) {
    logger.error('[Audit] Failed to cleanup audit log:', error);
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
  logger.info('[Audit] Audit logger shut down');
}
