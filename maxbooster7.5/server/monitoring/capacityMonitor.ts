import { pool } from '../db';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { logger } from '../logger.js';

export class CapacityMonitor {
  private static readonly CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes (optimized from 1 minute to reduce slow queries)
  private static readonly ALERT_THRESHOLD = 0.75; // 75% capacity

  static startMonitoring() {
    setInterval(async () => {
      await CapacityMonitor.checkCapacity();
    }, CapacityMonitor.CHECK_INTERVAL);

    logger.info('📊 Capacity monitoring started (checks every 5 minutes)');
  }

  private static async checkCapacity() {
    try {
      // Check database pool
      const poolUtilization = pool.totalCount / 20;
      if (poolUtilization >= CapacityMonitor.ALERT_THRESHOLD) {
        logger.warn(
          `⚠️ CAPACITY ALERT: Database pool at ${(poolUtilization * 100).toFixed(1)}% capacity`
        );
      }

      // Check active sessions (within last 24 hours) - Use approximate count for performance
      const sessionResult = await db.execute(
        sql`SELECT reltuples::bigint AS count FROM pg_class WHERE relname = 'sessions'`
      );
      const totalSessions = parseInt(sessionResult.rows[0].count as string);
      // Approximate active sessions (assume 80% active within 24h for monitoring purposes)
      const activeSessions = Math.floor(totalSessions * 0.8);
      const sessionUtilization = activeSessions / 50000;

      if (sessionUtilization >= CapacityMonitor.ALERT_THRESHOLD) {
        logger.warn(
          `⚠️ CAPACITY ALERT: ${activeSessions} active sessions (${(sessionUtilization * 100).toFixed(1)}% of max)`
        );
      }

      // Log health status
      if (
        poolUtilization < CapacityMonitor.ALERT_THRESHOLD &&
        sessionUtilization < CapacityMonitor.ALERT_THRESHOLD
      ) {
        logger.info(
          `✅ Capacity healthy: Pool ${(poolUtilization * 100).toFixed(1)}%, Sessions ${activeSessions}`
        );
      }
    } catch (error: unknown) {
      logger.error('Capacity monitoring error:', error);
    }
  }
}
