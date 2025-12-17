import { Queue } from 'bullmq';
import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisConnectionFactory.js';
import { alertingService } from './alertingService.js';
import { metricsCollector } from './metricsCollector.js';

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
  private queues: Map<string, Queue> = new Map();
  private metrics: Map<string, QueueMetrics[]> = new Map();
  private alertThresholds: AlertThresholds = {
    maxWaitingJobs: 1000,
    maxFailedRate: 0.1,
    maxStalledJobs: 10,
    maxRedisLatency: 100,
  };
  
  private monitoringInterval?: NodeJS.Timeout;
  private readonly METRICS_RETENTION = 100;
  private readonly MONITORING_INTERVAL = 30000;

  registerQueue(queueName: string, queue: Queue): void {
    this.queues.set(queueName, queue);
    this.metrics.set(queueName, []);
    logger.info(`📊 Queue monitor registered: ${queueName}`);
  }

  async collectMetrics(queueName: string): Promise<QueueMetrics | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      logger.warn(`Queue ${queueName} not registered for monitoring`);
      return null;
    }

    try {
      // Measure Redis latency through queue operations (more reliable than client.ping)
      const startTime = Date.now();
      
      const [
        waitingCount,
        activeCount,
        completedCount,
        failedCount,
        delayedCount,
        isPaused,
      ] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.isPaused(),
      ]);
      
      const redisLatency = Date.now() - startTime;

      const failedJobs = await queue.getFailed(0, 99);
      const stalledJobs = failedJobs.filter(
        (job) => job.failedReason?.includes('stalled') || job.attemptsMade > 1
      );

      const retryJobs = failedJobs.filter(
        (job) => job.attemptsMade > 0 && job.attemptsMade < (job.opts?.attempts || 3)
      );

      const recentJobs = await queue.getCompleted(0, 99);
      let avgProcessingTime = 0;
      if (recentJobs.length > 0) {
        const totalTime = recentJobs.reduce((sum, job) => {
          if (job.processedOn && job.finishedOn) {
            return sum + (job.finishedOn - job.processedOn);
          }
          return sum;
        }, 0);
        avgProcessingTime = totalTime / recentJobs.length;
      }

      const totalJobs = completedCount + failedCount || 1;
      const failedRate = failedCount / totalJobs;

      // Redis memory usage - set to 0 as we can't reliably get this from all Redis client types
      const redisMemoryUsage = 0;

      const metrics: QueueMetrics = {
        queueName,
        waiting: waitingCount,
        active: activeCount,
        completed: completedCount,
        failed: failedCount,
        delayed: delayedCount,
        paused: isPaused,
        failedRate,
        avgProcessingTime,
        stalledJobs: stalledJobs.length,
        retryJobs: retryJobs.length,
        redisLatency,
        redisMemoryUsage,
        timestamp: new Date(),
      };

      const queueMetrics = this.metrics.get(queueName) || [];
      queueMetrics.push(metrics);
      
      if (queueMetrics.length > this.METRICS_RETENTION) {
        queueMetrics.shift();
      }
      this.metrics.set(queueName, queueMetrics);

      this.checkAlerts(metrics);

      return metrics;
    } catch (error) {
      logger.error(`Error collecting metrics for queue ${queueName}:`, error);
      return null;
    }
  }

  private async checkAlerts(metrics: QueueMetrics): Promise<void> {
    const alerts: string[] = [];

    if (
      this.alertThresholds.maxWaitingJobs &&
      metrics.waiting > this.alertThresholds.maxWaitingJobs
    ) {
      alerts.push(
        `⚠️ High waiting jobs: ${metrics.waiting} (threshold: ${this.alertThresholds.maxWaitingJobs})`
      );
    }

    if (
      this.alertThresholds.maxFailedRate &&
      metrics.failedRate &&
      metrics.failedRate > this.alertThresholds.maxFailedRate
    ) {
      alerts.push(
        `⚠️ High failure rate: ${(metrics.failedRate * 100).toFixed(2)}% (threshold: ${(this.alertThresholds.maxFailedRate * 100).toFixed(2)}%)`
      );
    }

    if (
      this.alertThresholds.maxStalledJobs &&
      metrics.stalledJobs &&
      metrics.stalledJobs > this.alertThresholds.maxStalledJobs
    ) {
      alerts.push(
        `⚠️ High stalled jobs: ${metrics.stalledJobs} (threshold: ${this.alertThresholds.maxStalledJobs})`
      );
    }

    if (
      this.alertThresholds.maxRedisLatency &&
      metrics.redisLatency &&
      metrics.redisLatency > this.alertThresholds.maxRedisLatency
    ) {
      alerts.push(
        `⚠️ High Redis latency: ${metrics.redisLatency}ms (threshold: ${this.alertThresholds.maxRedisLatency}ms)`
      );
    }

    if (alerts.length > 0) {
      logger.warn(`🚨 Queue alerts for ${metrics.queueName}:\n${alerts.join('\n')}`);
      
      // Send alerts via alerting service (async, fire and forget)
      alertingService.checkQueueMetrics(metrics).catch((error) => {
        logger.error('Failed to send queue alerts:', error);
      });
    }
  }

  async collectAllMetrics(): Promise<Map<string, QueueMetrics>> {
    const results = new Map<string, QueueMetrics>();
    
    for (const queueName of this.queues.keys()) {
      const metrics = await this.collectMetrics(queueName);
      if (metrics) {
        results.set(queueName, metrics);
      }
    }
    
    return results;
  }

  getMetricsHistory(queueName: string): QueueMetrics[] {
    return this.metrics.get(queueName) || [];
  }

  getLatestMetrics(queueName: string): QueueMetrics | null {
    const history = this.metrics.get(queueName) || [];
    return history.length > 0 ? history[history.length - 1] : null;
  }

  getAllLatestMetrics(): Map<string, QueueMetrics> {
    const results = new Map<string, QueueMetrics>();
    
    for (const [queueName, history] of this.metrics.entries()) {
      if (history.length > 0) {
        results.set(queueName, history[history.length - 1]);
      }
    }
    
    return results;
  }

  setAlertThresholds(thresholds: Partial<AlertThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
    logger.info('📊 Queue monitor alert thresholds updated:', this.alertThresholds);
  }

  startMonitoring(): void {
    if (this.monitoringInterval) {
      logger.warn('Queue monitoring already started');
      return;
    }

    this.monitoringInterval = setInterval(async () => {
      const allMetrics = await this.collectAllMetrics();
      
      // Collect metrics snapshot for dashboard/baseline
      const firstQueue = allMetrics.values().next().value;
      if (firstQueue) {
        try {
          // Get AI model metrics
          const { aiModelManager } = await import('../services/aiModelManager.js');
          const aiMetrics = aiModelManager.getMetrics();
          
          // Get system metrics
          const memUsage = process.memoryUsage();
          const systemMetrics = {
            memoryMB: memUsage.heapUsed / 1024 / 1024,
            uptime: process.uptime(),
            cpuPercent: 0, // Could add cpu-usage package for this
          };
          
          // Store snapshot
          await metricsCollector.collectSnapshot(firstQueue, aiMetrics, systemMetrics);
        } catch (error) {
          logger.debug('Failed to collect metrics snapshot:', error);
        }
      }
    }, this.MONITORING_INTERVAL);

    logger.info(
      `📊 Queue monitoring started (interval: ${this.MONITORING_INTERVAL / 1000}s)`
    );
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      logger.info('📊 Queue monitoring stopped');
    }
  }

  async getHealthStatus(): Promise<{
    healthy: boolean;
    queues: Map<string, { status: string; metrics: QueueMetrics | null }>;
  }> {
    const queues = new Map<string, { status: string; metrics: QueueMetrics | null }>();
    let healthy = true;

    for (const queueName of this.queues.keys()) {
      const metrics = await this.collectMetrics(queueName);
      
      let status = 'healthy';
      if (!metrics) {
        status = 'error';
        healthy = false;
      } else if (
        (metrics.stalledJobs && metrics.stalledJobs > 5) ||
        (metrics.failedRate && metrics.failedRate > 0.2)
      ) {
        status = 'degraded';
        healthy = false;
      }
      
      queues.set(queueName, { status, metrics });
    }

    return { healthy, queues };
  }
}

export const queueMonitor = new QueueMonitor();
