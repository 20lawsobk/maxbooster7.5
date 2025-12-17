import { db } from '../db';
import { sql } from 'drizzle-orm';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/defaults.js';
import { logger } from '../logger.js';

export class SessionGuard {
  private static readonly CHECK_INTERVAL = 30000; // 30 seconds
  private static lastCheck = 0;
  private static cachedCount = 0;

  static async checkSessionCapacity(req: Request, res: Response, next: NextFunction) {
    try {
      const now = Date.now();

      // Only check every 30 seconds to avoid DB overhead
      if (now - SessionGuard.lastCheck > SessionGuard.CHECK_INTERVAL) {
        // Use pg_class statistics for instant approximate count (sub-millisecond)
        const result = await db.execute(
          sql`SELECT reltuples::bigint AS count FROM pg_class WHERE relname = 'sessions'`
        );
        SessionGuard.cachedCount = parseInt(result.rows[0].count as string);
        SessionGuard.lastCheck = now;
      }

      if (SessionGuard.cachedCount >= config.session.maxSessions) {
        logger.warn(`⚠️ Session capacity exceeded: ${SessionGuard.cachedCount} active sessions`);

        // For unauthenticated requests, reject with 503
        if (!req.isAuthenticated || !req.isAuthenticated()) {
          return res.status(503).json({
            error: 'Service temporarily unavailable',
            message:
              'The system has reached maximum capacity. New sessions cannot be created at this time.',
            retryAfter: 300, // 5 minutes
          });
        }
      }

      next();
    } catch (error: unknown) {
      logger.error('Session guard error:', error);
      next(); // Fail open
    }
  }
}
