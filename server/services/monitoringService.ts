// @ts-nocheck
import { securityService } from "./securityService";
import { logger } from "../logger.js";

// ── Response-time ring buffer ─────────────────────────────────────────────
// Maintains the last BUFFER_SIZE response times (milliseconds) in a circular
// buffer.  getStats() only considers samples from the last WINDOW_MS so
// percentiles reflect recent behaviour, not stale data from startup.

const BUFFER_SIZE = 10_000;
const WINDOW_MS   = 5 * 60 * 1_000; // 5 minutes

class ResponseTimeRingBuffer {
  private readonly buf: Float64Array;
  private readonly ts:  Float64Array; // insertion timestamps (epoch ms)
  private head  = 0;                  // next write position
  private count = 0;                  // entries written (capped at BUFFER_SIZE)

  constructor(private readonly size = BUFFER_SIZE) {
    this.buf = new Float64Array(size);
    this.ts  = new Float64Array(size);
  }

  /** Record a response time sample (call from request middleware). */
  record(ms: number): void {
    this.buf[this.head] = ms;
    this.ts[this.head]  = Date.now();
    this.head           = (this.head + 1) % this.size;
    if (this.count < this.size) this.count++;
  }

  /**
   * Return the entries that fall within the sliding window.
   * We walk backward from the newest entry; because insertions are
   * chronological, the first entry we encounter that is outside the window
   * means all earlier entries are even older — safe early-exit.
   */
  private windowSamples(): Float64Array {
    const total  = Math.min(this.count, this.size);
    if (total === 0) return new Float64Array(0);
    const cutoff  = Date.now() - WINDOW_MS;
    const samples: number[] = [];
    for (let i = 0; i < total; i++) {
      const idx = (this.head - 1 - i + this.size) % this.size;
      if (this.ts[idx] < cutoff) break;      // oldest in window reached
      samples.push(this.buf[idx]);
    }
    // Sort ascending for percentile calculation
    const arr = new Float64Array(samples);
    arr.sort(); // TypedArray.sort() is numeric by default
    return arr;
  }

  /** Return a specific percentile (0–100) from the sliding window. */
  getPercentile(p: number): number {
    const arr = this.windowSamples();
    if (arr.length === 0) return 0;
    const idx = Math.min(
      Math.ceil((p / 100) * arr.length) - 1,
      arr.length - 1,
    );
    return arr[Math.max(0, idx)];
  }

  /** Return a full stats object for the sliding window. */
  getStats(): {
    avg: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    count: number;
  } {
    const arr = this.windowSamples();
    const n   = arr.length;
    if (n === 0) return { avg: 0, p95: 0, p99: 0, min: 0, max: 0, count: 0 };
    let sum = 0;
    for (let i = 0; i < n; i++) sum += arr[i];
    return {
      avg:   sum / n,
      p95:   arr[Math.min(Math.ceil(0.95 * n) - 1, n - 1)],
      p99:   arr[Math.min(Math.ceil(0.99 * n) - 1, n - 1)],
      min:   arr[0],
      max:   arr[n - 1],
      count: n,
    };
  }
}

/** Singleton tracker shared across the process. */
export const responseTimeTracker = new ResponseTimeRingBuffer();

export interface SystemMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface Alert {
  id: string;
  metric: string;
  threshold: number;
  currentValue: number;
  severity: "low" | "medium" | "high";
  message: string;
  createdAt: Date;
}

export class MonitoringService {
  private metrics: Map<string, SystemMetric[]> = new Map();
  private alerts: Alert[] = [];
  private thresholds: Map<string, { value: number; severity: string }> =
    new Map();

  constructor() {
    // Set default thresholds
    this.thresholds.set("cpu_usage", { value: 80, severity: "high" });
    this.thresholds.set("memory_usage", { value: 85, severity: "high" });
    this.thresholds.set("error_rate", { value: 5, severity: "medium" });
    this.thresholds.set("response_time", { value: 1000, severity: "medium" });
  }

  /**
   * Run all health checks
   */
  async runHealthChecks(): Promise<{
    overall: "healthy" | "degraded" | "down";
    services: unknown[];
  }> {
    try {
      const services = ["database", "stripe", "storage", "api"];
      const healthChecks = await Promise?.all(
        services?.map((service) => securityService?.checkHealth(service)),
      );

      // Determine overall health
      let overall: "healthy" | "degraded" | "down" = "healthy";

      if (healthChecks?.some((check) => check?.status === "down")) {
        overall = "down";
      } else if (healthChecks?.some((check) => check?.status === "degraded")) {
        overall = "degraded";
      }

      return {
        overall,
        services: healthChecks,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error running health checks:");
      throw new Error("Failed to run health checks");
    }
  }

  /**
   * Check specific service health
   */
  async checkServiceHealth(service: string): Promise<unknown> {
    try {
      return await securityService?.checkHealth(service);
    } catch (error: unknown) {
      logger.warn({ err: error }, `Error checking ${service} health:`);
      throw new Error(`Failed to check ${service} health`);
    }
  }

  /**
   * Track a metric
   */
  async trackMetric(
    name: string,
    value: number,
    unit: string = "",
    tags?: Record<string, string>,
  ): Promise<void> {
    try {
      const metric: SystemMetric = {
        name,
        value,
        unit,
        timestamp: new Date(),
        tags,
      };

      if (!this.metrics.has(name)) {
        this.metrics.set(name, []);
      }

      const metricList = this.metrics.get(name)!;
      metricList?.push(metric);

      // Keep only last 1000 metrics per type
      if (metricList?.length > 1000) {
        metricList?.shift();
      }

      // Check threshold
      await this.checkThreshold(name, value);
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error tracking metric:");
    }
  }

  /**
   * Get metrics for a specific name
   */
  async getMetrics(
    name: string,
    timeRange?: { start: Date; end: Date },
  ): Promise<SystemMetric[]> {
    try {
      let metrics = this.metrics.get(name) || [];

      if (timeRange) {
        metrics = metrics?.filter(
          (m) => m?.timestamp >= timeRange?.start && m?.timestamp <= timeRange?.end,
        );
      }

      return metrics;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching metrics:");
      throw new Error("Failed to fetch metrics");
    }
  }

  /**
   * Check if metric exceeds threshold
   */
  private async checkThreshold(metric: string, value: number): Promise<void> {
    const threshold = this.thresholds.get(metric);
    if (!threshold) return;

    if (value >= threshold?.value) {
      const alert: Alert = {
        id: `alert_${Date?.now()}`,
        metric,
        threshold: threshold.value,
        currentValue: value,
        severity: threshold.severity as unknown as Record<string, unknown>,
        message: `${metric} exceeded threshold: ${value} >= ${threshold?.value}`,
        createdAt: new Date(),
      };

      this.alerts.push(alert);

      // Create security incident for high severity
      if (threshold?.severity === "high") {
        await securityService?.createIncident(
          "high",
          `High ${metric} detected`,
          `${metric} is at ${value}, exceeding threshold of ${threshold?.value}`,
        );
      }

      // In production, send notifications
      logger.warn(`ALERT: ${alert?.message}`);
    }
  }

  /**
   * Set custom threshold for a metric
   */
  async setThreshold(
    metric: string,
    value: number,
    severity: "low" | "medium" | "high",
  ): Promise<void> {
    this.thresholds.set(metric, { value, severity });
  }

  /**
   * Get all active alerts
   */
  async getAlerts(filters?: {
    severity?: string;
    metric?: string;
    limit?: number;
  }): Promise<Alert[]> {
    let alerts = [...this.alerts];

    if (filters?.severity) {
      alerts = alerts?.filter((a) => a?.severity === filters?.severity);
    }

    if (filters?.metric) {
      alerts = alerts?.filter((a) => a?.metric === filters?.metric);
    }

    // Sort by creation date descending
    alerts?.sort((a, b) => b?.createdAt.getTime() - a?.createdAt.getTime());

    if (filters?.limit) {
      alerts = alerts?.slice(0, filters?.limit);
    }

    return alerts;
  }

  /**
   * Get system performance summary
   */
  async getPerformanceSummary(): Promise<{
    uptime: number;
    requests: { total: number; successRate: number; avgResponseTime: number };
    resources: { cpu: number; memory: number; disk: number };
    errors: { total: number; rate: number };
  }> {
    try {
      const systemMetrics = await securityService?.getSystemMetrics();

      // Calculate request metrics
      const requestMetrics = await this.getMetrics("requests");
      const errorMetrics = await this.getMetrics("errors");

      const totalRequests = requestMetrics?.reduce((sum, m) => sum + m?.value, 0);
      const totalErrors = errorMetrics?.reduce((sum, m) => sum + m?.value, 0);
      const successRate =
        totalRequests > 0
          ? ((totalRequests - totalErrors) / (totalRequests || 1)) * 100
          : 100;

      // Calculate average response time
      const responseTimeMetrics = await this.getMetrics("response_time");
      const avgResponseTime =
        responseTimeMetrics?.length > 0
          ? responseTimeMetrics?.reduce((sum, m) => sum + m?.value, 0) /
            responseTimeMetrics?.length
          : 0;

      return {
        uptime: systemMetrics.uptime,
        requests: {
          total: totalRequests,
          successRate,
          avgResponseTime,
        },
        resources: {
          cpu: 0, // Would be calculated from CPU metrics
          memory: systemMetrics.memory.percentage,
          disk: 0, // Would be calculated from disk metrics
        },
        errors: {
          total: totalErrors,
          rate: totalRequests > 0 ? (totalErrors / (totalRequests || 1)) * 100 : 0,
        },
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error fetching performance summary:");
      throw new Error("Failed to fetch performance summary");
    }
  }

  /**
   * Get API endpoint statistics
   */
  async getEndpointStats(): Promise<
    Array<{
      endpoint: string;
      requests: number;
      errors: number;
      avgResponseTime: number;
      p95ResponseTime: number;
    }>
  > {
    // In production, this would aggregate from middleware logs
    return [];
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(intervalMs: number = 60000): void {
    setInterval(async () => {
      try {
        // Collect system metrics
        const systemMetrics = await securityService?.getSystemMetrics();
        await this.trackMetric(
          "memory_usage",
          systemMetrics?.memory.percentage,
          "%",
        );
        await this.trackMetric("uptime", systemMetrics?.uptime, "s");

        // Run health checks
        const health = await this.runHealthChecks();
        await this.trackMetric(
          "health_status",
          health?.overall === "healthy" ? 1 : 0,
        );
      } catch (error: unknown) {
        logger.warn({ err: error }, "Error in monitoring loop:");
      }
    }, intervalMs);
  }
}

export const monitoringService = new MonitoringService();
