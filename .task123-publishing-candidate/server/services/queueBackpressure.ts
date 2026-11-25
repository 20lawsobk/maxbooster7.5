import { logger } from "../logger.js";
import { EventEmitter } from "events";

interface BackpressureConfig {
  maxQueueSize: number;
  maxMemoryMB: number;
  checkIntervalMs: number;
}

interface BackpressureStatus {
  active: boolean;
  reason?: "queue_size" | "memory_limit" | "manual";
  queueSize?: number;
  memoryUsageMB?: number;
  timestamp: number;
}

export class QueueBackpressureManager extends EventEmitter {
  private config: BackpressureConfig;
  private backpressureActive: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<BackpressureConfig>) {
    super();

    this.config = {
      maxQueueSize: config!.maxQueueSize || 1000,
      maxMemoryMB: config!.maxMemoryMB || 1200,
      checkIntervalMs: config!.checkIntervalMs || 30000,
    };

    logger.info("🚦 Queue Backpressure Manager initialized");
    logger.info(`   Max Memory: ${this.config.maxMemoryMB}MB`);
  }

  registerQueue(name: string, _queue: Record<string, unknown>): void {
    logger.info(`📊 Registered queue for backpressure monitoring: ${name}`);
  }

  start(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    logger.info("🚦 Starting backpressure monitoring...");

    this.monitoringInterval = setInterval(() => {
      this.checkBackpressure();
    }, this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info("🛑 Stopped backpressure monitoring");
  }

  private _checkInFlight = false;

  private async checkBackpressure(): Promise<void> {
    // Prevent overlapping checks when a check takes longer than the interval.
    if (this._checkInFlight) return;
    this._checkInFlight = true;
    try {
      await this._doCheckBackpressure();
    } finally {
      this._checkInFlight = false;
    }
  }

  private async _doCheckBackpressure(): Promise<void> {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage?.heapUsed / 1024 / 1024;

    let shouldActivate = false;

    if (heapUsedMB > this.config.maxMemoryMB) {
      shouldActivate = true;
    }

    if (shouldActivate && !this.backpressureActive) {
      logger.warn(
        `⚠️  BACKPRESSURE ACTIVATED: Memory usage ${heapUsedMB?.toFixed(0)}MB exceeds limit ${this.config.maxMemoryMB}MB`,
      );
      this.backpressureActive = true;

      const status: BackpressureStatus = {
        active: true,
        reason: "memory_limit",
        memoryUsageMB: heapUsedMB,
        timestamp: Date.now(),
      };

      this.emit("backpressure:activated", status);
    }

    if (!shouldActivate && this.backpressureActive) {
      logger.info("✅ BACKPRESSURE DEACTIVATED: System within limits");
      this.backpressureActive = false;

      const status: BackpressureStatus = {
        active: false,
        timestamp: Date.now(),
      };

      this.emit("backpressure:deactivated", status);
    }
  }

  isBackpressureActive(): boolean {
    return this.backpressureActive;
  }

  async canAcceptJob(
    _queueName?: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (this.backpressureActive) {
      return {
        allowed: false,
        reason: "Backpressure is active - system under load",
      };
    }

    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage?.heapUsed / 1024 / 1024;
    if (heapUsedMB > this.config.maxMemoryMB * 0.9) {
      return {
        allowed: false,
        reason: `Memory usage at ${heapUsedMB?.toFixed(0)}MB approaching limit`,
      };
    }

    return { allowed: true };
  }

  async addJobWithBackpressure<T>(
    queueName: string,
    addJobFn: () => Promise<T>,
  ): Promise<T> {
    const check = await this.canAcceptJob(queueName);

    if (!check?.allowed) {
      const error = new Error(`Job rejected: ${check?.reason}`);
      (error as unknown as Record<string, unknown>).code = "BACKPRESSURE_REJECTION";
      (error as unknown as Record<string, unknown>).retryAfter = 30;
      logger.warn(`🚫 Job rejected for queue ${queueName}: ${check?.reason}`);
      throw error;
    }

    return await addJobFn();
  }

  async getStatus(): Promise<
    BackpressureStatus & { queueStats?: Record<string, number> }
  > {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage?.heapUsed / 1024 / 1024;

    return {
      active: this.backpressureActive,
      memoryUsageMB: heapUsedMB,
      timestamp: Date.now(),
      queueStats: {},
    };
  }

  async forceBackpressure(): Promise<void> {
    logger.warn("⚠️  MANUAL BACKPRESSURE ACTIVATION");
    this.backpressureActive = true;

    const status: BackpressureStatus = {
      active: true,
      reason: "manual",
      timestamp: Date.now(),
    };

    this.emit("backpressure:activated", status);
  }

  async releaseBackpressure(): Promise<void> {
    logger.info("ℹ️  MANUAL BACKPRESSURE RELEASE");
    this.backpressureActive = false;

    const status: BackpressureStatus = {
      active: false,
      timestamp: Date.now(),
    };

    this.emit("backpressure:deactivated", status);
  }
}

export const queueBackpressure = new QueueBackpressureManager({
  maxQueueSize: 1000,
  maxMemoryMB: 1200,
  checkIntervalMs: 30000,
});
