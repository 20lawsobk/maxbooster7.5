import { Request, Response, Router } from 'express';
import os from 'os';
import { logger } from '../logger.js';
import { distributedCache } from './distributedCache.js';
import { circuitBreakerRegistry } from './circuitBreaker.js';

interface ScalingMetrics {
  cpu: {
    usage: number;
    count: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
    heapUsed: number;
    heapTotal: number;
  };
  requests: {
    activeConnections: number;
    requestsPerSecond: number;
    averageLatency: number;
    errorRate: number;
  };
  cache: {
    hitRate: string;
    size: number;
    mode: string;
  };
  circuitBreakers: Record<string, any>;
  scaling: {
    shouldScaleUp: boolean;
    shouldScaleDown: boolean;
    recommendedReplicas: number;
    reason: string;
  };
}

interface ScalingConfig {
  cpuThresholdUp: number;
  cpuThresholdDown: number;
  memoryThresholdUp: number;
  memoryThresholdDown: number;
  latencyThresholdMs: number;
  errorRateThreshold: number;
  minReplicas: number;
  maxReplicas: number;
  cooldownSeconds: number;
}

class AutoScalingManager {
  private static instance: AutoScalingManager;
  private config: ScalingConfig;
  private requestMetrics = {
    totalRequests: 0,
    totalLatency: 0,
    totalErrors: 0,
    windowStart: Date.now(),
    activeConnections: 0,
  };
  private lastScaleAction: number = 0;
  private currentReplicas: number = 1;

  private constructor() {
    this.config = {
      cpuThresholdUp: parseFloat(process.env.SCALE_CPU_UP || '70'),
      cpuThresholdDown: parseFloat(process.env.SCALE_CPU_DOWN || '30'),
      memoryThresholdUp: parseFloat(process.env.SCALE_MEMORY_UP || '80'),
      memoryThresholdDown: parseFloat(process.env.SCALE_MEMORY_DOWN || '40'),
      latencyThresholdMs: parseInt(process.env.SCALE_LATENCY_THRESHOLD || '1000'),
      errorRateThreshold: parseFloat(process.env.SCALE_ERROR_RATE || '5'),
      minReplicas: parseInt(process.env.SCALE_MIN_REPLICAS || '1'),
      maxReplicas: parseInt(process.env.SCALE_MAX_REPLICAS || '100'),
      cooldownSeconds: parseInt(process.env.SCALE_COOLDOWN || '300'),
    };
  }

  static getInstance(): AutoScalingManager {
    if (!AutoScalingManager.instance) {
      AutoScalingManager.instance = new AutoScalingManager();
    }
    return AutoScalingManager.instance;
  }

  recordRequest(latencyMs: number, isError: boolean): void {
    this.requestMetrics.totalRequests++;
    this.requestMetrics.totalLatency += latencyMs;
    if (isError) {
      this.requestMetrics.totalErrors++;
    }
  }

  incrementConnections(): void {
    this.requestMetrics.activeConnections++;
  }

  decrementConnections(): void {
    this.requestMetrics.activeConnections = Math.max(0, this.requestMetrics.activeConnections - 1);
  }

  getMetrics(): ScalingMetrics {
    const cpuUsage = this.getCpuUsage();
    const memoryInfo = this.getMemoryInfo();
    const requestStats = this.getRequestStats();
    const cacheStats = distributedCache.getStats();
    const circuitBreakers = circuitBreakerRegistry.getAllStats();
    const scalingDecision = this.calculateScalingDecision(cpuUsage, memoryInfo, requestStats);

    return {
      cpu: {
        usage: cpuUsage,
        count: os.cpus().length,
        loadAverage: os.loadavg(),
      },
      memory: memoryInfo,
      requests: requestStats,
      cache: cacheStats,
      circuitBreakers,
      scaling: scalingDecision,
    };
  }

  private getCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    return ((1 - totalIdle / totalTick) * 100);
  }

  private getMemoryInfo(): ScalingMetrics['memory'] {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const heapUsed = process.memoryUsage().heapUsed;
    const heapTotal = process.memoryUsage().heapTotal;

    return {
      used: usedMem,
      total: totalMem,
      percentage: (usedMem / totalMem) * 100,
      heapUsed,
      heapTotal,
    };
  }

  private getRequestStats(): ScalingMetrics['requests'] {
    const windowMs = Date.now() - this.requestMetrics.windowStart;
    const windowSeconds = windowMs / 1000;
    
    const rps = windowSeconds > 0 ? this.requestMetrics.totalRequests / windowSeconds : 0;
    const avgLatency = this.requestMetrics.totalRequests > 0 
      ? this.requestMetrics.totalLatency / this.requestMetrics.totalRequests 
      : 0;
    const errorRate = this.requestMetrics.totalRequests > 0
      ? (this.requestMetrics.totalErrors / this.requestMetrics.totalRequests) * 100
      : 0;

    if (windowMs > 60000) {
      this.requestMetrics.totalRequests = 0;
      this.requestMetrics.totalLatency = 0;
      this.requestMetrics.totalErrors = 0;
      this.requestMetrics.windowStart = Date.now();
    }

    return {
      activeConnections: this.requestMetrics.activeConnections,
      requestsPerSecond: Math.round(rps * 100) / 100,
      averageLatency: Math.round(avgLatency),
      errorRate: Math.round(errorRate * 100) / 100,
    };
  }

  private calculateScalingDecision(
    cpuUsage: number,
    memoryInfo: ScalingMetrics['memory'],
    requestStats: ScalingMetrics['requests']
  ): ScalingMetrics['scaling'] {
    const now = Date.now();
    const cooldownActive = (now - this.lastScaleAction) < this.config.cooldownSeconds * 1000;

    let shouldScaleUp = false;
    let shouldScaleDown = false;
    let reason = 'Stable';

    if (cpuUsage > this.config.cpuThresholdUp) {
      shouldScaleUp = true;
      reason = `CPU usage ${cpuUsage.toFixed(1)}% exceeds threshold ${this.config.cpuThresholdUp}%`;
    } else if (memoryInfo.percentage > this.config.memoryThresholdUp) {
      shouldScaleUp = true;
      reason = `Memory usage ${memoryInfo.percentage.toFixed(1)}% exceeds threshold ${this.config.memoryThresholdUp}%`;
    } else if (requestStats.averageLatency > this.config.latencyThresholdMs) {
      shouldScaleUp = true;
      reason = `Average latency ${requestStats.averageLatency}ms exceeds threshold ${this.config.latencyThresholdMs}ms`;
    } else if (requestStats.errorRate > this.config.errorRateThreshold) {
      shouldScaleUp = true;
      reason = `Error rate ${requestStats.errorRate}% exceeds threshold ${this.config.errorRateThreshold}%`;
    } else if (cpuUsage < this.config.cpuThresholdDown && memoryInfo.percentage < this.config.memoryThresholdDown) {
      shouldScaleDown = this.currentReplicas > this.config.minReplicas;
      reason = shouldScaleDown ? 'Low resource utilization' : 'At minimum replicas';
    }

    if (cooldownActive) {
      shouldScaleUp = false;
      shouldScaleDown = false;
      reason = `Cooldown active (${Math.ceil((this.config.cooldownSeconds * 1000 - (now - this.lastScaleAction)) / 1000)}s remaining)`;
    }

    let recommendedReplicas = this.currentReplicas;
    if (shouldScaleUp) {
      recommendedReplicas = Math.min(this.currentReplicas * 2, this.config.maxReplicas);
    } else if (shouldScaleDown) {
      recommendedReplicas = Math.max(Math.ceil(this.currentReplicas / 2), this.config.minReplicas);
    }

    return {
      shouldScaleUp,
      shouldScaleDown,
      recommendedReplicas,
      reason,
    };
  }

  setCurrentReplicas(count: number): void {
    this.currentReplicas = count;
  }

  recordScaleAction(): void {
    this.lastScaleAction = Date.now();
  }

  getConfig(): ScalingConfig {
    return { ...this.config };
  }
}

export const autoScalingManager = AutoScalingManager.getInstance();

export const scalingMetricsRouter = Router();

scalingMetricsRouter.get('/metrics', (req: Request, res: Response) => {
  try {
    const metrics = autoScalingManager.getMetrics();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      instanceId: process.env.INSTANCE_ID || 'primary',
      metrics,
    });
  } catch (error) {
    logger.error('Error fetching scaling metrics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch metrics' });
  }
});

scalingMetricsRouter.get('/health/detailed', (req: Request, res: Response) => {
  try {
    const metrics = autoScalingManager.getMetrics();
    const isHealthy = 
      metrics.cpu.usage < 90 &&
      metrics.memory.percentage < 95 &&
      metrics.requests.errorRate < 10;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        cpu: metrics.cpu.usage < 90 ? 'pass' : 'fail',
        memory: metrics.memory.percentage < 95 ? 'pass' : 'fail',
        errorRate: metrics.requests.errorRate < 10 ? 'pass' : 'fail',
      },
      metrics: {
        cpuUsage: `${metrics.cpu.usage.toFixed(1)}%`,
        memoryUsage: `${metrics.memory.percentage.toFixed(1)}%`,
        requestsPerSecond: metrics.requests.requestsPerSecond,
        averageLatency: `${metrics.requests.averageLatency}ms`,
        errorRate: `${metrics.requests.errorRate}%`,
      },
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: 'Health check failed' });
  }
});

scalingMetricsRouter.get('/ready', (req: Request, res: Response) => {
  res.status(200).json({ ready: true, timestamp: new Date().toISOString() });
});

scalingMetricsRouter.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ alive: true, uptime: process.uptime() });
});
