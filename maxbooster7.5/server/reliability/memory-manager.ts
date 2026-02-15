import { EventEmitter } from 'events';
import { config } from '../config/defaults.js';
import { logger } from '../logger.js';

interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  timestamp: number;
}

interface MemoryThresholds {
  warning: number;
  critical: number;
  forceGC: number;
}

interface LeakDetection {
  enabled: boolean;
  samples: MemoryMetrics[];
  sampleSize: number;
  growthThreshold: number; // MB per minute
}

class MemoryManager extends EventEmitter {
  private metrics: MemoryMetrics[] = [];
  private maxMetrics = 1440; // 24 hours at 1-minute intervals
  private monitoringInterval: NodeJS.Timeout | null = null;
  private gcInterval: NodeJS.Timeout | null = null;

  private thresholds: MemoryThresholds;

  private leakDetection: LeakDetection = {
    enabled: true,
    samples: [],
    sampleSize: 10, // Last 10 minutes
    growthThreshold: 10, // 10MB per minute growth = potential leak
  };

  private cleanupTasks: (() => void)[] = [];

  constructor() {
    super();

    // Use absolute thresholds to avoid false positives in development
    // In production, these can be adjusted via environment variables
    const nodeEnv = process.env.NODE_ENV || 'development';
    const isProduction = nodeEnv === 'production';

    // Set sensible absolute minimums (MB converted to bytes)
    const absoluteWarningMB = isProduction ? 768 : 1024; // 768MB prod, 1GB dev
    const absoluteCriticalMB = isProduction ? 1024 : 1536; // 1GB prod, 1.5GB dev

    const warningThreshold = absoluteWarningMB * 1024 * 1024;
    const criticalThreshold = absoluteCriticalMB * 1024 * 1024;

    this.thresholds = {
      warning: warningThreshold,
      critical: criticalThreshold,
      forceGC: Math.floor((warningThreshold + criticalThreshold) / 2),
    };

    logger.info(
      `🧠 Memory thresholds: Warning=${absoluteWarningMB}MB, Critical=${absoluteCriticalMB}MB (${nodeEnv})`
    );

    this.collectInitialMetrics();
  }

  start(intervalMs: number = 60000): void {
    logger.info('🧠 Starting 24/7 Memory Manager...');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }

    // Main monitoring loop
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.analyzeMemoryUsage();
      this.detectMemoryLeaks();
      this.performCleanup();
    }, intervalMs);

    // Garbage collection schedule (every 5 minutes)
    this.gcInterval = setInterval(
      () => {
        this.scheduleGarbageCollection();
      },
      5 * 60 * 1000
    );

    logger.info('✅ Memory manager started - continuous monitoring enabled');
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }

    logger.info('🛑 Memory manager stopped');
  }

  private collectInitialMetrics(): void {
    const usage = process.memoryUsage();
    this.metrics.push({
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      arrayBuffers: usage.arrayBuffers,
      timestamp: Date.now(),
    });
  }

  private collectMetrics(): void {
    const usage = process.memoryUsage();
    const metric: MemoryMetrics = {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      arrayBuffers: usage.arrayBuffers,
      timestamp: Date.now(),
    };

    this.metrics.unshift(metric);

    // Limit metrics array size
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(0, this.maxMetrics);
    }

    // Update leak detection samples
    if (this.leakDetection.enabled) {
      this.leakDetection.samples.unshift(metric);
      if (this.leakDetection.samples.length > this.leakDetection.sampleSize) {
        this.leakDetection.samples = this.leakDetection.samples.slice(
          0,
          this.leakDetection.sampleSize
        );
      }
    }
  }

  private analyzeMemoryUsage(): void {
    const current = this.metrics[0];
    if (!current) return;

    const heapUsedMB = Math.round(current.heapUsed / 1024 / 1024);
    const rssMB = Math.round(current.rss / 1024 / 1024);

    // Check thresholds
    if (current.heapUsed > this.thresholds.critical) {
      logger.error(`🚨 CRITICAL: Memory usage ${heapUsedMB}MB exceeds critical threshold`);
      this.emit('memory-critical', {
        heapUsedMB,
        rssMB,
        threshold: Math.round(this.thresholds.critical / 1024 / 1024),
      });

      // Force immediate cleanup and GC
      this.forceGarbageCollection();
      this.performEmergencyCleanup();
    } else if (current.heapUsed > this.thresholds.warning) {
      logger.warn(`⚠️  Memory usage ${heapUsedMB}MB exceeds warning threshold`);
      this.emit('memory-warning', {
        heapUsedMB,
        rssMB,
        threshold: Math.round(this.thresholds.warning / 1024 / 1024),
      });
    } else {
      // Log normal status every 10 minutes
      if (this.metrics.length % 10 === 0) {
        logger.info(`✅ Memory: ${heapUsedMB}MB heap, ${rssMB}MB RSS`);
      }
    }

    // Trigger GC if approaching limit
    if (current.heapUsed > this.thresholds.forceGC) {
      this.scheduleGarbageCollection();
    }
  }

  private detectMemoryLeaks(): void {
    if (!this.leakDetection.enabled || this.leakDetection.samples.length < 3) {
      return;
    }

    const samples = this.leakDetection.samples;
    const latest = samples[0];
    const oldest = samples[samples.length - 1];

    const timeDiffMinutes = (latest.timestamp - oldest.timestamp) / (1000 * 60);
    const memoryGrowthMB = (latest.heapUsed - oldest.heapUsed) / (1024 * 1024);

    if (timeDiffMinutes > 0) {
      const growthRate = memoryGrowthMB / timeDiffMinutes;

      if (growthRate > this.leakDetection.growthThreshold) {
        logger.warn(`🚨 MEMORY LEAK DETECTED: ${growthRate.toFixed(2)}MB/min growth rate`);
        this.emit('memory-leak-detected', {
          growthRate: growthRate.toFixed(2),
          threshold: this.leakDetection.growthThreshold,
          timespan: timeDiffMinutes.toFixed(1),
          currentUsageMB: Math.round(latest.heapUsed / 1024 / 1024),
        });

        // Trigger aggressive cleanup
        this.performEmergencyCleanup();
      }
    }
  }

  scheduleGarbageCollection(): void {
    if ((global as any).gc) {
      const beforeMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

      logger.info('🧹 Scheduling garbage collection...');
      (global as any).gc();

      const afterMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const freedMB = beforeMB - afterMB;

      if (freedMB > 0) {
        logger.info(`✅ Garbage collection freed ${freedMB}MB (${beforeMB}MB → ${afterMB}MB)`);
      }

      this.emit('garbage-collection', {
        beforeMB,
        afterMB,
        freedMB,
      });
    } else {
      logger.warn('⚠️  Garbage collection not available (start with --expose-gc)');
    }
  }

  private forceGarbageCollection(): void {
    logger.info('🚨 FORCING immediate garbage collection due to critical memory usage');
    this.scheduleGarbageCollection();
  }

  private performCleanup(): void {
    // Run registered cleanup tasks
    this.cleanupTasks.forEach((task, index) => {
      try {
        task();
      } catch (error: unknown) {
        logger.warn(`⚠️  Cleanup task ${index} failed:`, error);
      }
    });

    // Clear old metrics beyond retention period
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(0, this.maxMetrics);
    }
  }

  private performEmergencyCleanup(): void {
    logger.info('🚨 Performing emergency memory cleanup...');

    // Clear caches that might be holding memory
    if ((global as any).memoryCache) {
      (global as any).memoryCache.clear();
      logger.info('🧹 Cleared global memory cache');
    }

    // Force multiple GC cycles
    for (let i = 0; i < 3; i++) {
      setTimeout(() => this.scheduleGarbageCollection(), i * 1000);
    }

    this.emit('emergency-cleanup');
  }

  // Public API methods
  getCurrentUsage(): MemoryMetrics {
    return (
      this.metrics[0] || {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0,
        arrayBuffers: 0,
        timestamp: Date.now(),
      }
    );
  }

  getUsageHistory(minutes: number = 60): MemoryMetrics[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.metrics.filter((m) => m.timestamp > cutoff);
  }

  getMemorySummary(): any {
    const current = this.getCurrentUsage();
    const history = this.getUsageHistory(60);

    const avgHeapUsed = history.reduce((sum, m) => sum + m.heapUsed, 0) / history.length;
    const maxHeapUsed = Math.max(...history.map((m) => m.heapUsed));

    return {
      current: {
        heapUsedMB: Math.round(current.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(current.heapTotal / 1024 / 1024),
        rssMB: Math.round(current.rss / 1024 / 1024),
      },
      trend: {
        avgHeapUsedMB: Math.round(avgHeapUsed / 1024 / 1024),
        maxHeapUsedMB: Math.round(maxHeapUsed / 1024 / 1024),
      },
      thresholds: {
        warningMB: Math.round(this.thresholds.warning / 1024 / 1024),
        criticalMB: Math.round(this.thresholds.critical / 1024 / 1024),
      },
      leakDetection: {
        enabled: this.leakDetection.enabled,
        samplesCollected: this.leakDetection.samples.length,
      },
    };
  }

  // Allow external cleanup task registration
  registerCleanupTask(task: () => void): void {
    this.cleanupTasks.push(task);
  }

  // Configuration methods
  setThresholds(thresholds: Partial<MemoryThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    logger.info('🔧 Memory thresholds updated:', {
      warningMB: Math.round(this.thresholds.warning / 1024 / 1024),
      criticalMB: Math.round(this.thresholds.critical / 1024 / 1024),
    });
  }

  enableLeakDetection(enabled: boolean): void {
    this.leakDetection.enabled = enabled;
    logger.info(`🔧 Memory leak detection ${enabled ? 'enabled' : 'disabled'}`);
  }

  async gracefulShutdown(): Promise<void> {
    logger.info('🔄 Memory manager shutting down...');

    this.stop();

    // Final cleanup
    this.performCleanup();
    this.scheduleGarbageCollection();

    logger.info('✅ Memory manager shutdown complete');
  }
}

// Global memory manager instance
export const memoryManager = new MemoryManager();

export default MemoryManager;
