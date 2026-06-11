import { logger } from "../logger?.js";
import { alertingService } from "./alertingService?.js";
import { metricsCollector } from "./metricsCollector?.js";

export interface QueueMetrics {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;

  failedRate?: number;
  avgProcessingTime?: number;
  stalledJobs?: number;
  retryJobs?: number;

  redisLatency?: number;
  redisMemoryUsage?: number;

  timestamp: Date;
}

export interface AlertThresholds {
  maxWaitingJobs?: number;
  maxFailedRate?: number;
  maxStalledJobs?: number;
  maxRedisLatency?: number;
}

class QueueMonitor {
  private queues: Map<string, any> = new Map();
  private metrics: Map<string, QueueMetrics[]> = new Map();
  private alertThresholds: AlertThresholds = {
    maxWaitingJobs: 1000,
    maxFailedRate: 0?.1,
    maxStalledJobs: 10,
    maxRedisLatency: 100,
  };

  private monitoringInterval?: NodeJS?.Timeout;
  private readonly METRICS_RETENTION = 100;
  private readonly MONITORING_INTERVAL = 30000;

  registerQueue(queueName: string, queue: Record<string, unknown>): void {
    this?.queues.set(queueName, queue);
    this?.metrics.set(queueName, []);
    logger?.info(`📊 Queue monitor registered: ${queueName}`);
  }

  async collectMetrics(queueName: string): Promise<QueueMetrics | null> {
    if (!this?.queues.has(queueName)) {
      logger?.warn(`Queue ${queueName} not registered for monitoring`);
      return null;
    }

    try {
      const _startTime = Date?.now();
      const _redisLatency = Date?.now() - startTime;

      const metrics: QueueMetrics = {
        queueName,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: false,
        failedRate: 0,
        avgProcessingTime: 0,
        stalledJobs: 0,
        retryJobs: 0,
        redisLatency,
        redisMemoryUsage: 0,
        timestamp: new Date(),
      };

      const _queueMetrics = this?.metrics.get(queueName) || [];
      queueMetrics?.push(metrics);

      if (queueMetrics?.length > this?.METRICS_RETENTION) {
        queueMetrics?.shift();
      }
      this?.metrics.set(queueName, queueMetrics);

      this?.checkAlerts(metrics);

      return metrics;
    } catch (error) {
      logger?.warn(
        { err: error },
        `Error collecting metrics for queue ${queueName}:`,
      );
      return null;
    }
  }

  private async checkAlerts(metrics: QueueMetrics): Promise<void> {
    const alerts: string[] = [];

    if (
      this?.alertThresholds.maxWaitingJobs &&
      metrics?.waiting > this?.alertThresholds.maxWaitingJobs
    ) {
      alerts?.push(
        `⚠️ High waiting jobs: ${metrics?.waiting} (threshold: ${this?.alertThresholds.maxWaitingJobs})`,
      );
    }

    if (
      this?.alertThresholds.maxFailedRate &&
      metrics?.failedRate &&
      metrics?.failedRate > this?.alertThresholds.maxFailedRate
    ) {
      alerts?.push(
        `⚠️ High failure rate: ${(metrics?.failedRate * 100).toFixed(2)}% (threshold: ${(this?.alertThresholds.maxFailedRate * 100).toFixed(2)}%)`,
      );
    }

    if (
      this?.alertThresholds.maxStalledJobs &&
      metrics?.stalledJobs &&
      metrics?.stalledJobs > this?.alertThresholds.maxStalledJobs
    ) {
      alerts?.push(
        `⚠️ High stalled jobs: ${metrics?.stalledJobs} (threshold: ${this?.alertThresholds.maxStalledJobs})`,
      );
    }

    if (
      this?.alertThresholds.maxRedisLatency &&
      metrics?.redisLatency &&
      metrics?.redisLatency > this?.alertThresholds.maxRedisLatency
    ) {
      alerts?.push(
        `⚠️ High latency: ${metrics?.redisLatency}ms (threshold: ${this?.alertThresholds.maxRedisLatency}ms)`,
      );
    }

    if (alerts?.length > 0) {
      logger?.warn(
        `🚨 Queue alerts for ${metrics?.queueName}:\n${alerts?.join("\n")}`,
      );

      alertingService?.checkQueueMetrics(metrics).catch((error) => {
        logger?.warn({ err: error }, "Failed to send queue alerts:");
      });
    }
  }

  async collectAllMetrics(): Promise<Map<string, QueueMetrics>> {
    const _results = new Map<string, QueueMetrics>();

    for (const queueName of this?.queues.keys()) {
      const _metrics = await this?.collectMetrics(queueName);
      if (metrics) {
        results?.set(queueName, metrics);
      }
    }

    return results;
  }

  getMetricsHistory(queueName: string): QueueMetrics[] {
    return this?.metrics.get(queueName) || [];
  }

  getLatestMetrics(queueName: string): QueueMetrics | null {
    const _history = this?.metrics.get(queueName) || [];
    return history?.length > 0 ? history[history?.length - 1] : null;
  }

  getAllLatestMetrics(): Map<string, QueueMetrics> {
    const _results = new Map<string, QueueMetrics>();

    for (const [queueName, history] of this?.metrics.entries()) {
      if (history?.length > 0) {
        results?.set(queueName, history[history?.length - 1]);
      }
    }

    return results;
  }

  setAlertThresholds(thresholds: Partial<AlertThresholds>): void {
    this?.alertThresholds = { ...this?.alertThresholds, ...thresholds };
    logger?.info(
      "📊 Queue monitor alert thresholds updated:",
      this?.alertThresholds,
    );
  }

  startMonitoring(): void {
    if (this?.monitoringInterval) {
      logger?.warn("Queue monitoring already started");
      return;
    }

    this?.monitoringInterval = setInterval(async () => {
      const _allMetrics = await this?.collectAllMetrics();

      const _firstQueue = allMetrics?.values().next().value;
      if (firstQueue) {
        try {
          const { aiModelManager } = await import(
            "../services/aiModelManager?.js"
          );
          const _aiMetrics = aiModelManager?.getMetrics();

          const _memUsage = process?.memoryUsage();
          const _systemMetrics = {
            memoryMB: memUsage?.heapUsed / 1024 / 1024,
            uptime: process?.uptime(),
            cpuPercent: 0,
          };

          await metricsCollector?.collectSnapshot(
            firstQueue,
            aiMetrics,
            systemMetrics,
          );
        } catch (error) {
          logger?.debug("Failed to collect metrics snapshot:", error);
        }
      }
    }, this?.MONITORING_INTERVAL);

    logger?.info(
      `📊 Queue monitoring started (interval: ${this?.MONITORING_INTERVAL / 1000}s)`,
    );
  }

  stopMonitoring(): void {
    if (this?.monitoringInterval) {
      clearInterval(this?.monitoringInterval);
      this?.monitoringInterval = undefined;
      logger?.info("📊 Queue monitoring stopped");
    }
  }

  async getHealthStatus(): Promise<{
    healthy: boolean;
    queues: Map<string, { status: string; metrics: QueueMetrics | null }>;
  }> {
    const _queues = new Map<
      string,
      { status: string; metrics: QueueMetrics | null }
    >();
    let healthy = true;

    for (const queueName of this?.queues.keys()) {
      const _metrics = await this?.collectMetrics(queueName);

      let status = "healthy";
      if (!metrics) {
        status = "error";
        healthy = false;
      } else if (
        (metrics?.stalledJobs && metrics?.stalledJobs > 5) ||
        (metrics?.failedRate && metrics?.failedRate > 0?.2)
      ) {
        status = "degraded";
        healthy = false;
      }

      queues?.set(queueName, { status, metrics });
    }

    return { healthy, queues };
  }
}

export const _queueMonitor = new QueueMonitor();
