import { logger } from '../logger.js';
import fs from 'fs/promises';
import path from 'path';

interface MetricsSnapshot {
  timestamp: Date;
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    redisLatency: number;
  };
  aiCache: {
    socialUtilization: number;
    advertisingUtilization: number;
  };
  system: {
    memoryMB: number;
    uptime: number;
    cpuPercent: number;
  };
}

export class MetricsCollector {
  private snapshots: MetricsSnapshot[] = [];
  private maxSnapshots = 2880;
  private metricsDir = 'metrics-baseline';

  async collectSnapshot(
    queueMetrics: any,
    aiMetrics: any,
    systemMetrics: any
  ): Promise<MetricsSnapshot> {
    const snapshot: MetricsSnapshot = {
      timestamp: new Date(),
      queue: {
        waiting: queueMetrics?.waiting || 0,
        active: queueMetrics?.active || 0,
        completed: queueMetrics?.completed || 0,
        failed: queueMetrics?.failed || 0,
        redisLatency: queueMetrics?.redisLatency || 0,
      },
      aiCache: {
        socialUtilization: parseFloat(aiMetrics?.social?.utilizationPercent || '0'),
        advertisingUtilization: parseFloat(aiMetrics?.advertising?.utilizationPercent || '0'),
      },
      system: {
        memoryMB: systemMetrics?.memoryMB || 0,
        uptime: systemMetrics?.uptime || 0,
        cpuPercent: systemMetrics?.cpuPercent || 0,
      },
    };

    this.snapshots.push(snapshot);

    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  async saveBaseline(name: string = 'baseline'): Promise<string> {
    try {
      await fs.mkdir(this.metricsDir, { recursive: true });

      const filename = `${name}-${new Date().toISOString().replace(/:/g, '-')}.json`;
      const filepath = path.join(this.metricsDir, filename);

      const baseline = {
        name,
        generatedAt: new Date().toISOString(),
        duration: this.calculateDuration(),
        summary: this.calculateSummary(),
        snapshots: this.snapshots,
      };

      await fs.writeFile(filepath, JSON.stringify(baseline, null, 2));
      logger.info(`✅ Baseline metrics saved: ${filepath}`);

      return filepath;
    } catch (error) {
      logger.error('Failed to save baseline metrics:', error);
      throw error;
    }
  }

  private calculateDuration(): string {
    if (this.snapshots.length < 2) return '0 minutes';

    const first = this.snapshots[0].timestamp.getTime();
    const last = this.snapshots[this.snapshots.length - 1].timestamp.getTime();
    const durationMs = last - first;

    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes} minutes`;
  }

  private calculateSummary() {
    if (this.snapshots.length === 0) {
      return {
        queue: { avgWaiting: 0, avgLatency: 0, totalFailed: 0 },
        aiCache: { avgSocialUtil: 0, avgAdUtil: 0 },
        system: { avgMemoryMB: 0, maxMemoryMB: 0 },
      };
    }

    const queueWaiting = this.snapshots.map(s => s.queue.waiting);
    const queueLatency = this.snapshots.map(s => s.queue.redisLatency);
    const queueFailed = this.snapshots.map(s => s.queue.failed);
    const socialUtil = this.snapshots.map(s => s.aiCache.socialUtilization);
    const adUtil = this.snapshots.map(s => s.aiCache.advertisingUtilization);
    const memory = this.snapshots.map(s => s.system.memoryMB);

    return {
      queue: {
        avgWaiting: this.avg(queueWaiting),
        avgLatency: this.avg(queueLatency),
        totalFailed: Math.max(...queueFailed),
      },
      aiCache: {
        avgSocialUtil: this.avg(socialUtil),
        avgAdUtil: this.avg(adUtil),
      },
      system: {
        avgMemoryMB: this.avg(memory),
        maxMemoryMB: Math.max(...memory),
      },
    };
  }

  private avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2));
  }

  getRecentSnapshots(count: number = 100): MetricsSnapshot[] {
    return this.snapshots.slice(-count);
  }

  getDashboardData() {
    const recent = this.getRecentSnapshots(60);

    return {
      current: this.snapshots[this.snapshots.length - 1] || null,
      last60Minutes: recent,
      summary: this.calculateSummary(),
      trends: this.calculateTrends(recent),
    };
  }

  private calculateTrends(snapshots: MetricsSnapshot[]) {
    if (snapshots.length < 2) {
      return {
        memory: 'stable',
        queueBacklog: 'stable',
        redisLatency: 'stable',
      };
    }

    const firstHalf = snapshots.slice(0, Math.floor(snapshots.length / 2));
    const secondHalf = snapshots.slice(Math.floor(snapshots.length / 2));

    const memoryTrend = this.compareTrend(
      this.avg(firstHalf.map(s => s.system.memoryMB)),
      this.avg(secondHalf.map(s => s.system.memoryMB))
    );

    const queueTrend = this.compareTrend(
      this.avg(firstHalf.map(s => s.queue.waiting)),
      this.avg(secondHalf.map(s => s.queue.waiting))
    );

    const latencyTrend = this.compareTrend(
      this.avg(firstHalf.map(s => s.queue.redisLatency)),
      this.avg(secondHalf.map(s => s.queue.redisLatency))
    );

    return {
      memory: memoryTrend,
      queueBacklog: queueTrend,
      redisLatency: latencyTrend,
    };
  }

  private compareTrend(first: number, second: number): string {
    const change = ((second - first) / first) * 100;

    if (Math.abs(change) < 5) return 'stable';
    if (change > 0) return 'increasing';
    return 'decreasing';
  }

  clearSnapshots(): void {
    this.snapshots = [];
    logger.info('Metrics snapshots cleared');
  }
}

export const metricsCollector = new MetricsCollector();
