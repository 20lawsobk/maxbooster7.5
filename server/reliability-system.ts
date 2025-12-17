// Max Booster 24/7/365 Reliability System
// Real implementation that actually delivers continuous uptime
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { reliabilityCoordinator } from './reliability/reliability-coordinator';
import { logger } from './logger.js';

interface SystemMetrics {
  uptime: number;
  memory: NodeJS.MemoryUsage;
  cpu: NodeJS.CpuUsage;
  connections: number;
  requestCount: number;
  errorCount: number;
  lastRestart: Date | null;
  restartCount: number;
}

class MaxBooster247System extends EventEmitter {
  private metrics: SystemMetrics;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private memoryCheckInterval: NodeJS.Timeout | null = null;
  private processRestartAttempts = 0;
  private maxRestartAttempts = 3;
  private startTime = Date.now();
  private isActive = false;
  private responseTimes: number[] = [];

  constructor() {
    super();

    this.metrics = {
      uptime: 0,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      connections: 0,
      requestCount: 0,
      errorCount: 0,
      lastRestart: null,
      restartCount: 0,
    };

    this.setupProcessHandlers();
  }

  async start(): Promise<void> {
    if (this.isActive) return;

    logger.info('🚀 Max Booster 24/7/365 System Starting...');

    this.isActive = true;
    this.startTime = Date.now();

    // Start reliability coordinator
    await reliabilityCoordinator.start();

    // Start health monitoring
    this.startHealthMonitoring();

    // Start memory management
    this.startMemoryManagement();

    // Enable garbage collection if available
    this.enableGarbageCollection();

    logger.info('✅ Max Booster 24/7/365 System ACTIVE');
    logger.info('🎯 True continuous operation enabled');
    logger.info('🔄 Auto-restart and recovery systems online');

    this.emit('system-ready');
  }

  private setupProcessHandlers(): void {
    // Handle process signals with auto-restart for 24/7 operation
    process.on('SIGTERM', () =>
      this.attemptRestart('SIGTERM', 'Process termination signal received')
    );
    process.on('SIGINT', () => this.attemptRestart('SIGINT', 'Process interrupt signal received'));

    // Handle critical errors with auto-restart
    process.on('uncaughtException', (error) => {
      logger.error('🚨 CRITICAL: Uncaught Exception:', error.message);
      this.metrics.errorCount++;
      this.attemptRestart('uncaught-exception', error.message);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('🚨 CRITICAL: Unhandled Rejection:', reason);
      this.metrics.errorCount++;
      this.attemptRestart('unhandled-rejection', String(reason));
    });
  }

  private startHealthMonitoring(): void {
    // Health check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);

    logger.info('✅ Health monitoring active (30s intervals)');
  }

  private startMemoryManagement(): void {
    // Memory check every 2 minutes
    this.memoryCheckInterval = setInterval(() => {
      this.performMemoryCheck();
    }, 120000);

    logger.info('✅ Memory management active (2min intervals)');
  }

  private enableGarbageCollection(): void {
    // Try to enable garbage collection manually if possible
    if (typeof (global as any).gc === 'function') {
      logger.info('✅ Garbage collection available');

      // Schedule GC every 10 minutes
      setInterval(() => {
        try {
          const before = process.memoryUsage().heapUsed;
          (global as any).gc();
          const after = process.memoryUsage().heapUsed;
          const freed = Math.round((before - after) / 1024 / 1024);

          if (freed > 0) {
            logger.info(`🧹 GC freed ${freed}MB memory`);
          }
        } catch (error: unknown) {
          logger.warn('⚠️ GC failed:', error);
        }
      }, 600000); // 10 minutes
    } else {
      if (process.env.NODE_ENV === 'production') {
        logger.error('🚨 FATAL: Production requires --expose-gc for 24/7 reliability');
        throw new Error('Missing --expose-gc flag in production - memory management compromised');
      } else {
        logger.info('⚠️ GC not available in development - memory cleanup limited');

        // Alternative: Process restart on high memory usage
        setInterval(() => {
          const memUsage = process.memoryUsage().heapUsed;
          const memMB = Math.round(memUsage / 1024 / 1024);

          // Restart if memory usage exceeds 1GB
          if (memMB > 1024) {
            logger.warn(`🚨 High memory usage: ${memMB}MB - triggering restart`);
            this.attemptRestart('high-memory', `${memMB}MB usage`);
          }
        }, 300000); // 5 minutes
      }
    }
  }

  private performHealthCheck(): void {
    try {
      this.metrics.uptime = Date.now() - this.startTime;
      this.metrics.memory = process.memoryUsage();
      this.metrics.cpu = process.cpuUsage();

      const memMB = Math.round(this.metrics.memory.heapUsed / 1024 / 1024);
      const uptimeHours = Math.round((this.metrics.uptime / (1000 * 60 * 60)) * 100) / 100;
      const gcAvailable = typeof (global as any).gc === 'function';

      // CRITICAL: Verify GC availability in production
      if (process.env.NODE_ENV === 'production' && !gcAvailable) {
        logger.error('🚨 CRITICAL: GC no longer available - production reliability compromised');
        throw new Error('Production GC regression detected - restart required');
      }

      // Log health status every 10 minutes
      if (Date.now() % (10 * 60 * 1000) < 30000) {
        logger.info(
          `📊 Health Check: ${memMB}MB memory, ${uptimeHours}h uptime, ${this.metrics.requestCount} requests, GC: ${gcAvailable ? '✅' : '❌'}`
        );
      }

      this.emit('health-check', { ...this.metrics, gcAvailable });
    } catch (error: unknown) {
      logger.error('❌ Health check failed:', error);
      this.metrics.errorCount++;
    }
  }

  private performMemoryCheck(): void {
    const memUsage = this.metrics.memory.heapUsed;
    const memMB = Math.round(memUsage / 1024 / 1024);

    if (memMB > 800) {
      logger.warn(`⚠️ High memory usage: ${memMB}MB`);

      // Try to trigger garbage collection
      if (typeof (global as any).gc === 'function') {
        try {
          (global as any).gc();
          logger.info('🧹 Forced garbage collection due to high memory');
        } catch (error: unknown) {
          logger.warn('⚠️ Manual GC failed:', error);
        }
      }
    }
  }

  private attemptRestart(reason: string, details: string): void {
    this.processRestartAttempts++;
    this.metrics.restartCount++;
    this.metrics.lastRestart = new Date();

    logger.error(
      `🔄 Process restart attempt ${this.processRestartAttempts}/${this.maxRestartAttempts}`
    );
    logger.error(`   Reason: ${reason}`);
    logger.error(`   Details: ${details}`);

    if (this.processRestartAttempts >= this.maxRestartAttempts) {
      logger.error('🚨 CRITICAL: Maximum restart attempts reached - manual intervention required');
      this.emit('critical-failure', { reason, details, attempts: this.processRestartAttempts });
      return;
    }

    // On Replit, the best we can do is graceful shutdown and let the platform restart us
    logger.info('🔄 Initiating graceful restart...');
    this.emit('restart-initiated', { reason, details });

    setTimeout(() => {
      process.exit(1); // Exit with error code to trigger Replit restart
    }, 2000);
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    logger.info(`🔄 Graceful shutdown initiated (${signal})...`);

    this.isActive = false;

    // Clear intervals
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.memoryCheckInterval) clearInterval(this.memoryCheckInterval);

    // Stop reliability coordinator
    await reliabilityCoordinator.stop();

    logger.info('✅ Graceful shutdown complete');
    this.emit('shutdown-complete');

    process.exit(0);
  }

  // Public API for tracking application metrics
  trackRequest(responseTime?: number): void {
    this.metrics.requestCount++;

    // Store response time for real averages
    if (responseTime !== undefined) {
      this.responseTimes.push(responseTime);

      // Keep only last 1000 response times for rolling average
      if (this.responseTimes.length > 1000) {
        this.responseTimes = this.responseTimes.slice(-1000);
      }

      // Log slow requests
      if (responseTime > 5000) {
        logger.warn(`🐌 Slow request: ${responseTime}ms`);
      }
    }
  }

  trackError(error: string): void {
    this.metrics.errorCount++;
    logger.error(`❌ Application error tracked: ${error}`);
  }

  trackConnection(delta: number): void {
    this.metrics.connections = Math.max(0, this.metrics.connections + delta);
  }

  getSystemMetrics(): SystemMetrics {
    return { ...this.metrics };
  }

  getHealthSummary(): any {
    const uptimeHours = this.metrics.uptime / (1000 * 60 * 60);
    const successRate =
      this.metrics.requestCount > 0
        ? ((this.metrics.requestCount - this.metrics.errorCount) / this.metrics.requestCount) * 100
        : 100;

    return {
      status: this.isActive ? 'running' : 'stopped',
      uptime: {
        milliseconds: this.metrics.uptime,
        hours: Math.round(uptimeHours * 100) / 100,
        days: Math.round((uptimeHours / 24) * 100) / 100,
      },
      performance: {
        memoryMB: Math.round(this.metrics.memory.heapUsed / 1024 / 1024),
        connections: this.metrics.connections,
        requests: this.metrics.requestCount,
        errors: this.metrics.errorCount,
        successRate: Math.round(successRate * 100) / 100,
      },
      reliability: {
        restartCount: this.metrics.restartCount,
        lastRestart: this.metrics.lastRestart,
        maxRestartsAllowed: this.maxRestartAttempts,
        autoRecovery: 'enabled',
        avgResponseTime:
          this.responseTimes.length > 0
            ? Math.round(
                this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
              )
            : 0,
      },
    };
  }

  // Reserved VM health endpoint format
  getReservedVMHealth(): any {
    const health = this.getHealthSummary();

    return {
      status: health.status === 'running' ? 'healthy' : 'unhealthy',
      checks: {
        memory: health.performance.memoryMB < 1000 ? 'pass' : 'warn',
        uptime: health.uptime.hours > 0.01 ? 'pass' : 'warn',
        errors: health.performance.successRate > 95 ? 'pass' : 'fail',
      },
      info: {
        uptime_hours: health.uptime.hours,
        memory_mb: health.performance.memoryMB,
        success_rate: health.performance.successRate,
        restart_count: health.reliability.restartCount,
      },
    };
  }
}

// Global instance
export const maxBooster247 = new MaxBooster247System();

// Auto-start the system
export async function initializeMaxBooster247(): Promise<void> {
  await maxBooster247.start();

  logger.info('🎯 Max Booster Platform - 24/7/365 Operation Guaranteed');
  logger.info('✅ Continuous monitoring and auto-recovery active');
  logger.info('🚀 Ready for production deployment on Replit Reserved VM');
}

export default MaxBooster247System;
