import { pool } from '../db';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/defaults.js';
import { logger } from '../logger.js';

export class ConnectionGuard {
  static async checkCapacity(req: Request, res: Response, next: NextFunction) {
    try {
      // Check pool utilization
      const activeConnections = pool.totalCount;
      const maxPoolUtilization = config.monitoring.poolUtilizationThreshold / 100;
      const utilization = activeConnections / config.database.poolSize;

      if (utilization >= maxPoolUtilization) {
        logger.warn(
          `⚠️ Database pool near capacity: ${activeConnections}/${config.database.poolSize} connections`
        );

        return res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'The system is currently at capacity. Please try again in a few moments.',
          retryAfter: 30, // seconds
        });
      }

      next();
    } catch (error: unknown) {
      logger.error('Connection guard error:', error);
      next(); // Fail open to avoid blocking legitimate requests
    }
  }
}
