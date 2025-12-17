/**
 * STARTUP PROBES - Staged Readiness System
 * 
 * Implements staged health probes for Replit Reserved VM deployment:
 * - /health - Always responds immediately (liveness)
 * - /ready - Only responds after all critical systems are ready
 * - /startup - Verbose status with phase details
 * 
 * DEPLOYMENT HARDENING FEATURES:
 * - Database connection with retry (5 attempts, jitter)
 * - Redis connection with fallback to memory store
 * - TensorFlow.js initialization with timeout
 * - Circuit breaker pattern for external services
 */

import { db } from './db.js';
import { sql } from 'drizzle-orm';
import { logger } from './logger.js';

interface ProbeStatus {
  name: string;
  status: 'pending' | 'checking' | 'ready' | 'failed' | 'degraded';
  lastCheck: Date | null;
  error?: string;
  latencyMs?: number;
}

interface StartupStatus {
  phase: 'initializing' | 'connecting' | 'ready' | 'degraded' | 'failed';
  startTime: Date;
  readyTime: Date | null;
  probes: Record<string, ProbeStatus>;
  deploymentPhases?: unknown;
}

class StartupProbeManager {
  private status: StartupStatus;
  private readyResolvers: Array<() => void> = [];
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.status = {
      phase: 'initializing',
      startTime: new Date(),
      readyTime: null,
      probes: {
        database: { name: 'PostgreSQL Database', status: 'pending', lastCheck: null },
        redis: { name: 'Redis Cache', status: 'pending', lastCheck: null },
        tensorflow: { name: 'TensorFlow.js', status: 'pending', lastCheck: null },
      },
    };

    // Load deployment phases from capsule loader if available
    if (process.env.DEPLOYMENT_PHASES) {
      try {
        this.status.deploymentPhases = JSON.parse(process.env.DEPLOYMENT_PHASES);
      } catch {
        // Ignore parse errors
      }
    }
  }

  // Check database connection with retry
  async checkDatabase(maxRetries = 5): Promise<boolean> {
    this.status.probes.database.status = 'checking';
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      try {
        await db.execute(sql`SELECT 1`);
        this.status.probes.database.status = 'ready';
        this.status.probes.database.lastCheck = new Date();
        this.status.probes.database.latencyMs = Date.now() - startTime;
        this.status.probes.database.error = undefined;
        logger.info(`✅ Database probe ready (attempt ${attempt}, ${this.status.probes.database.latencyMs}ms)`);
        return true;
      } catch (error) {
        const jitter = Math.random() * 1000; // 0-1000ms jitter
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1) + jitter, 30000);
        
        this.status.probes.database.error = error instanceof Error ? error.message : String(error);
        this.status.probes.database.lastCheck = new Date();
        
        logger.warn(`⚠️ Database probe failed (attempt ${attempt}/${maxRetries}): ${this.status.probes.database.error}`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }
    
    this.status.probes.database.status = 'failed';
    logger.error('❌ Database probe exhausted all retries');
    return false;
  }

  // Check Redis connection with fallback
  async checkRedis(): Promise<boolean> {
    this.status.probes.redis.status = 'checking';
    const startTime = Date.now();
    
    try {
      // Import Redis client dynamically to avoid circular dependencies
      const { getRedisClient } = await import('./lib/redisConnectionFactory.js');
      const redis = await getRedisClient();
      
      if (!redis) {
        // No Redis configured - this is OK, we use memory fallback
        this.status.probes.redis.status = 'degraded';
        this.status.probes.redis.lastCheck = new Date();
        this.status.probes.redis.error = 'Using memory fallback (REDIS_URL not configured)';
        logger.warn('⚠️ Redis probe: Using memory fallback');
        return true; // Degraded but functional
      }
      
      await redis.ping();
      this.status.probes.redis.status = 'ready';
      this.status.probes.redis.lastCheck = new Date();
      this.status.probes.redis.latencyMs = Date.now() - startTime;
      this.status.probes.redis.error = undefined;
      logger.info(`✅ Redis probe ready (${this.status.probes.redis.latencyMs}ms)`);
      return true;
    } catch (error) {
      this.status.probes.redis.status = 'degraded';
      this.status.probes.redis.lastCheck = new Date();
      this.status.probes.redis.error = error instanceof Error ? error.message : String(error);
      logger.warn(`⚠️ Redis probe failed, using memory fallback: ${this.status.probes.redis.error}`);
      return true; // Degraded but functional
    }
  }

  // Check TensorFlow.js initialization with timeout
  async checkTensorFlow(timeoutMs = 30000): Promise<boolean> {
    this.status.probes.tensorflow.status = 'checking';
    const startTime = Date.now();
    
    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => {
        this.status.probes.tensorflow.status = 'degraded';
        this.status.probes.tensorflow.lastCheck = new Date();
        this.status.probes.tensorflow.error = `Initialization timed out after ${timeoutMs}ms`;
        logger.warn(`⚠️ TensorFlow probe: ${this.status.probes.tensorflow.error}`);
        resolve(true); // Degraded but we continue
      }, timeoutMs);
      
      try {
        // TensorFlow is initialized during content analysis module load
        // Just check if it's available
        const tf = await import('@tensorflow/tfjs-node').catch(() => null);
        
        clearTimeout(timeout);
        
        if (tf) {
          this.status.probes.tensorflow.status = 'ready';
          this.status.probes.tensorflow.lastCheck = new Date();
          this.status.probes.tensorflow.latencyMs = Date.now() - startTime;
          this.status.probes.tensorflow.error = undefined;
          logger.info(`✅ TensorFlow probe ready (${this.status.probes.tensorflow.latencyMs}ms)`);
        } else {
          this.status.probes.tensorflow.status = 'degraded';
          this.status.probes.tensorflow.lastCheck = new Date();
          this.status.probes.tensorflow.error = 'TensorFlow.js not available';
          logger.warn('⚠️ TensorFlow probe: Not available, AI features limited');
        }
        resolve(true);
      } catch (error) {
        clearTimeout(timeout);
        this.status.probes.tensorflow.status = 'degraded';
        this.status.probes.tensorflow.lastCheck = new Date();
        this.status.probes.tensorflow.error = error instanceof Error ? error.message : String(error);
        logger.warn(`⚠️ TensorFlow probe failed: ${this.status.probes.tensorflow.error}`);
        resolve(true); // Degraded but we continue
      }
    });
  }

  // Run all probes and determine overall readiness
  async runAllProbes(): Promise<boolean> {
    this.status.phase = 'connecting';
    
    logger.info('🔍 Running startup probes...');
    
    // Run probes in parallel
    const [dbReady, redisReady, tfReady] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkTensorFlow(),
    ]);
    
    // Determine overall status
    const allProbes = Object.values(this.status.probes);
    const failedCount = allProbes.filter(p => p.status === 'failed').length;
    const degradedCount = allProbes.filter(p => p.status === 'degraded').length;
    
    if (failedCount > 0) {
      // Critical failure - database is required
      if (this.status.probes.database.status === 'failed') {
        this.status.phase = 'failed';
        logger.error('❌ Startup failed: Database connection required');
        return false;
      }
    }
    
    if (degradedCount > 0) {
      this.status.phase = 'degraded';
      logger.warn(`⚠️ Startup completed in degraded mode (${degradedCount} probe(s) degraded)`);
    } else {
      this.status.phase = 'ready';
      logger.info('✅ All startup probes passed');
    }
    
    this.status.readyTime = new Date();
    
    // Notify waiting handlers
    for (const resolver of this.readyResolvers) {
      resolver();
    }
    this.readyResolvers = [];
    
    return true;
  }

  // Wait for readiness (for routes that need to wait)
  waitForReady(): Promise<void> {
    if (this.isReady()) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.readyResolvers.push(resolve);
    });
  }

  // Check if system is ready
  isReady(): boolean {
    return this.status.phase === 'ready' || this.status.phase === 'degraded';
  }

  // Get full status for /startup endpoint
  getStatus(): StartupStatus {
    return { ...this.status };
  }

  // Get uptime in seconds
  getUptimeSeconds(): number {
    return (Date.now() - this.status.startTime.getTime()) / 1000;
  }

  // Cleanup
  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// Singleton instance
export const startupProbes = new StartupProbeManager();

// Express middleware to add startup endpoints
export function setupStartupEndpoints(app: import('express').Express): void {
  // /health - Always responds (liveness probe)
  // This is already defined in index.ts, but we ensure it exists
  
  // /startup - Verbose startup status
  app.get('/startup', (_req, res) => {
    const status = startupProbes.getStatus();
    const httpStatus = status.phase === 'failed' ? 503 : 200;
    
    res.status(httpStatus).json({
      ...status,
      uptime: startupProbes.getUptimeSeconds(),
      timestamp: new Date().toISOString(),
    });
  });

  // Override /ready to use probe status
  app.get('/ready', (_req, res) => {
    if (startupProbes.isReady()) {
      res.status(200).json({
        status: 'ready',
        phase: startupProbes.getStatus().phase,
        uptime: startupProbes.getUptimeSeconds(),
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        phase: startupProbes.getStatus().phase,
        probes: startupProbes.getStatus().probes,
        timestamp: new Date().toISOString(),
      });
    }
  });
}
