import { Queue } from 'bullmq';
import { logger } from '../logger.js';
import { EventEmitter } from 'events';

interface BackpressureConfig {
  maxQueueSize: number;
  maxMemoryMB: number;
  checkIntervalMs: number;
}

interface BackpressureStatus {
  active: boolean;
  reason?: 'queue_size' | 'memory_limit' | 'manual';
  queueSize?: number;
  memoryUsageMB?: number;
  timestamp: number;
}

export class QueueBackpressureManager extends EventEmitter {
  private config: BackpressureConfig;
  private backpressureActive: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private queues: Map<string, Queue> = new Map();

  constructor(config?: Partial<BackpressureConfig>) {
    super();

    this.config = {
      maxQueueSize: config?.maxQueueSize || 1000,
      maxMemoryMB: config?.maxMemoryMB || 1200,
      checkIntervalMs: config?.checkIntervalMs || 30000,
    };

    logger.info('🚦 Queue Backpressure Manager initialized');
    logger.info(`   Max Queue Size: ${this.config.maxQueueSize}`);
    logger.info(`   Max Memory: ${this.config.maxMemoryMB}MB`);
  }

  registerQueue(name: string, queue: Queue): void {
    this.queues.set(name, queue);
    logger.info(`📊 Registered queue for backpressure monitoring: ${name}`);
  }

  start(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    logger.info('🚦 Starting backpressure monitoring...');

    this.monitoringInterval = setInterval(() => {
      this.checkBackpressure();
    }, this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info('🛑 Stopped backpressure monitoring');
  }

  private async checkBackpressure(): Promise<void> {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    
    let shouldActivate = false;
    let activationReason: 'queue_size' | 'memory_limit' | 'manual' = 'memory_limit';
    let maxQueueSize = 0;

    if (heapUsedMB > this.config.maxMemoryMB) {
      shouldActivate = true;
      activationReason = 'memory_limit';
    }

    for (const [name, queue] of this.queues.entries()) {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'delayed');
        const totalJobs = (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0);

        if (totalJobs > this.config.maxQueueSize) {
          shouldActivate = true;
          activationReason = 'queue_size';
          maxQueueSize = Math.max(maxQueueSize, totalJobs);
        }
      } catch (error) {
        logger.error(`Error checking queue ${name}:`, error);
      }
    }

    if (shouldActivate && !this.backpressureActive) {
      if (activationReason === 'memory_limit') {
        logger.warn(`⚠️  BACKPRESSURE ACTIVATED: Memory usage ${heapUsedMB.toFixed(0)}MB exceeds limit ${this.config.maxMemoryMB}MB`);
      } else {
        logger.warn(`⚠️  BACKPRESSURE ACTIVATED: Queue size ${maxQueueSize} exceeds limit ${this.config.maxQueueSize}`);
      }
      await this.activateBackpressure(activationReason, heapUsedMB, maxQueueSize);
    }

    if (!shouldActivate && this.backpressureActive) {
      logger.info('✅ BACKPRESSURE DEACTIVATED: System within limits');
      await this.deactivateBackpressure();
    }
  }

  private async activateBackpressure(
    reason: 'queue_size' | 'memory_limit' | 'manual',
    memoryUsageMB?: number,
    queueSize?: number
  ): Promise<void> {
    const pauseSuccess = await this.pauseAllQueues();

    if (pauseSuccess) {
      this.backpressureActive = true;

      const status: BackpressureStatus = {
        active: true,
        reason,
        memoryUsageMB,
        queueSize,
        timestamp: Date.now(),
      };

      this.emit('backpressure:activated', status);
    } else {
      logger.error('❌ Failed to pause queues - backpressure NOT activated, will retry on next interval');
    }
  }

  private async deactivateBackpressure(): Promise<void> {
    const resumeSuccess = await this.resumeAllQueues();

    if (resumeSuccess) {
      this.backpressureActive = false;

      const status: BackpressureStatus = {
        active: false,
        timestamp: Date.now(),
      };

      this.emit('backpressure:deactivated', status);
    } else {
      logger.error('❌ Failed to resume queues - backpressure remains active');
    }
  }

  private async pauseAllQueues(): Promise<boolean> {
    const pausePromises = Array.from(this.queues.entries()).map(async ([name, queue]) => {
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await queue.pause();
          logger.info(`⏸️  Paused queue: ${name}`);
          return true;
        } catch (error) {
          if (attempt === maxRetries) {
            logger.error(`❌ Failed to pause queue ${name} after ${maxRetries} attempts:`, error);
            return false;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
      return false;
    });

    const results = await Promise.all(pausePromises);
    return results.every((success) => success);
  }

  private async resumeAllQueues(): Promise<boolean> {
    const resumePromises = Array.from(this.queues.entries()).map(async ([name, queue]) => {
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await queue.resume();
          logger.info(`▶️  Resumed queue: ${name}`);
          return true;
        } catch (error) {
          if (attempt === maxRetries) {
            logger.error(`❌ Failed to resume queue ${name} after ${maxRetries} attempts:`, error);
            return false;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
      return false;
    });

    const results = await Promise.all(resumePromises);
    return results.every((success) => success);
  }

  isBackpressureActive(): boolean {
    return this.backpressureActive;
  }

  async getStatus(): Promise<BackpressureStatus> {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;

    return {
      active: this.backpressureActive,
      memoryUsageMB: heapUsedMB,
      timestamp: Date.now(),
    };
  }

  async forceBackpressure(): Promise<void> {
    logger.warn('⚠️  MANUAL BACKPRESSURE ACTIVATION');
    await this.activateBackpressure('manual');
  }

  async releaseBackpressure(): Promise<void> {
    logger.info('ℹ️  MANUAL BACKPRESSURE RELEASE');
    await this.deactivateBackpressure();
  }
}

export const queueBackpressure = new QueueBackpressureManager({
  maxQueueSize: 1000,
  maxMemoryMB: 1200,
  checkIntervalMs: 30000,
});
