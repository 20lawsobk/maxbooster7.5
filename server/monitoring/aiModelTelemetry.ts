import { logger } from '../logger.js';

export interface ModelCacheMetrics {
  socialAutopilot: {
    currentSize: number;
    maxSize: number;
    totalLoads: number;
    totalEvictions: number;
    cacheHitRate: number;
    avgLoadTime: number;
    lastEvictionTime?: Date;
  };
  advertisingAutopilot: {
    currentSize: number;
    maxSize: number;
    totalLoads: number;
    totalEvictions: number;
    cacheHitRate: number;
    avgLoadTime: number;
    lastEvictionTime?: Date;
  };
  memory: {
    usedMB: number;
    estimatedModelSizeMB: number;
    totalEstimatedMB: number;
  };
  timestamp: Date;
}

export interface ModelLoadEvent {
  userId: string;
  modelType: 'social' | 'advertising';
  loadTimeMs: number;
  cacheHit: boolean;
  timestamp: Date;
}

export interface ModelEvictionEvent {
  userId: string;
  modelType: 'social' | 'advertising';
  reason: 'lru' | 'manual' | 'timeout';
  idleTimeMs: number;
  timestamp: Date;
}

class AIModelTelemetry {
  private loadEvents: ModelLoadEvent[] = [];
  private evictionEvents: ModelEvictionEvent[] = [];
  private metricsHistory: ModelCacheMetrics[] = [];
  
  private readonly MAX_EVENT_HISTORY = 1000;
  private readonly METRICS_RETENTION = 100;

  recordModelLoad(event: ModelLoadEvent): void {
    this.loadEvents.push(event);
    
    if (this.loadEvents.length > this.MAX_EVENT_HISTORY) {
      this.loadEvents.shift();
    }

    if (event.loadTimeMs > 1000) {
      logger.warn(
        `⚠️ Slow AI model load: ${event.modelType} for user ${event.userId} took ${event.loadTimeMs}ms`
      );
    }
  }

  recordModelEviction(event: ModelEvictionEvent): void {
    this.evictionEvents.push(event);
    
    if (this.evictionEvents.length > this.MAX_EVENT_HISTORY) {
      this.evictionEvents.shift();
    }

    logger.info(
      `🗑️ AI model evicted: ${event.modelType} for user ${event.userId} (idle: ${(event.idleTimeMs / 1000).toFixed(0)}s, reason: ${event.reason})`
    );
  }

  captureMetrics(
    socialCache: Map<string, any>,
    advertisingCache: Map<string, any>,
    socialMaxSize: number,
    advertisingMaxSize: number
  ): ModelCacheMetrics {
    const recentLoads = this.loadEvents.filter(
      (e) => Date.now() - e.timestamp.getTime() < 300000
    );
    
    const socialLoads = recentLoads.filter((e) => e.modelType === 'social');
    const advertisingLoads = recentLoads.filter((e) => e.modelType === 'advertising');
    
    const socialHits = socialLoads.filter((e) => e.cacheHit).length;
    const advertisingHits = advertisingLoads.filter((e) => e.cacheHit).length;
    
    const socialHitRate = socialLoads.length > 0 ? socialHits / socialLoads.length : 0;
    const advertisingHitRate =
      advertisingLoads.length > 0 ? advertisingHits / advertisingLoads.length : 0;
    
    const socialAvgLoadTime =
      socialLoads.length > 0
        ? socialLoads.reduce((sum, e) => sum + e.loadTimeMs, 0) / socialLoads.length
        : 0;
    const advertisingAvgLoadTime =
      advertisingLoads.length > 0
        ? advertisingLoads.reduce((sum, e) => sum + e.loadTimeMs, 0) / advertisingLoads.length
        : 0;

    const recentEvictions = this.evictionEvents.filter(
      (e) => Date.now() - e.timestamp.getTime() < 300000
    );
    
    const socialEvictions = recentEvictions.filter((e) => e.modelType === 'social');
    const advertisingEvictions = recentEvictions.filter(
      (e) => e.modelType === 'advertising'
    );

    const estimatedModelSizeMB = 50;
    const totalModels = socialCache.size + advertisingCache.size;
    
    const usedMemory = process.memoryUsage();
    const usedMB = Math.round(usedMemory.heapUsed / 1024 / 1024);

    const metrics: ModelCacheMetrics = {
      socialAutopilot: {
        currentSize: socialCache.size,
        maxSize: socialMaxSize,
        totalLoads: this.loadEvents.filter((e) => e.modelType === 'social').length,
        totalEvictions: this.evictionEvents.filter((e) => e.modelType === 'social').length,
        cacheHitRate: socialHitRate,
        avgLoadTime: socialAvgLoadTime,
        lastEvictionTime:
          socialEvictions.length > 0 ? socialEvictions[socialEvictions.length - 1].timestamp : undefined,
      },
      advertisingAutopilot: {
        currentSize: advertisingCache.size,
        maxSize: advertisingMaxSize,
        totalLoads: this.loadEvents.filter((e) => e.modelType === 'advertising').length,
        totalEvictions: this.evictionEvents.filter((e) => e.modelType === 'advertising')
          .length,
        cacheHitRate: advertisingHitRate,
        avgLoadTime: advertisingAvgLoadTime,
        lastEvictionTime:
          advertisingEvictions.length > 0
            ? advertisingEvictions[advertisingEvictions.length - 1].timestamp
            : undefined,
      },
      memory: {
        usedMB,
        estimatedModelSizeMB,
        totalEstimatedMB: totalModels * estimatedModelSizeMB,
      },
      timestamp: new Date(),
    };

    this.metricsHistory.push(metrics);
    
    if (this.metricsHistory.length > this.METRICS_RETENTION) {
      this.metricsHistory.shift();
    }

    this.checkAlerts(metrics);

    return metrics;
  }

  private checkAlerts(metrics: ModelCacheMetrics): void {
    const alerts: string[] = [];

    if (metrics.socialAutopilot.currentSize >= metrics.socialAutopilot.maxSize * 0.9) {
      alerts.push(
        `⚠️ Social autopilot cache near capacity: ${metrics.socialAutopilot.currentSize}/${metrics.socialAutopilot.maxSize}`
      );
    }

    if (
      metrics.advertisingAutopilot.currentSize >=
      metrics.advertisingAutopilot.maxSize * 0.9
    ) {
      alerts.push(
        `⚠️ Advertising autopilot cache near capacity: ${metrics.advertisingAutopilot.currentSize}/${metrics.advertisingAutopilot.maxSize}`
      );
    }

    if (metrics.socialAutopilot.cacheHitRate < 0.5 && metrics.socialAutopilot.totalLoads > 20) {
      alerts.push(
        `⚠️ Low social autopilot cache hit rate: ${(metrics.socialAutopilot.cacheHitRate * 100).toFixed(1)}%`
      );
    }

    if (
      metrics.advertisingAutopilot.cacheHitRate < 0.5 &&
      metrics.advertisingAutopilot.totalLoads > 20
    ) {
      alerts.push(
        `⚠️ Low advertising autopilot cache hit rate: ${(metrics.advertisingAutopilot.cacheHitRate * 100).toFixed(1)}%`
      );
    }

    if (metrics.memory.totalEstimatedMB > 2000) {
      alerts.push(
        `⚠️ High estimated AI model memory usage: ${metrics.memory.totalEstimatedMB}MB`
      );
    }

    if (alerts.length > 0) {
      logger.warn(`🚨 AI Model Cache alerts:\n${alerts.join('\n')}`);
    }
  }

  getLatestMetrics(): ModelCacheMetrics | null {
    return this.metricsHistory.length > 0
      ? this.metricsHistory[this.metricsHistory.length - 1]
      : null;
  }

  getMetricsHistory(): ModelCacheMetrics[] {
    return this.metricsHistory;
  }

  getRecentLoadEvents(limit: number = 100): ModelLoadEvent[] {
    return this.loadEvents.slice(-limit);
  }

  getRecentEvictionEvents(limit: number = 100): ModelEvictionEvent[] {
    return this.evictionEvents.slice(-limit);
  }

  getSummary(): {
    totalLoads: number;
    totalEvictions: number;
    avgCacheHitRate: number;
    avgLoadTime: number;
  } {
    const allLoads = this.loadEvents;
    const cacheHits = allLoads.filter((e) => e.cacheHit).length;
    const avgLoadTime =
      allLoads.length > 0
        ? allLoads.reduce((sum, e) => sum + e.loadTimeMs, 0) / allLoads.length
        : 0;

    return {
      totalLoads: allLoads.length,
      totalEvictions: this.evictionEvents.length,
      avgCacheHitRate: allLoads.length > 0 ? cacheHits / allLoads.length : 0,
      avgLoadTime,
    };
  }
}

export const aiModelTelemetry = new AIModelTelemetry();
