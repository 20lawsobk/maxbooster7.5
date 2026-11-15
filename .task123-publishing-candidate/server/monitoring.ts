/**
 * APM Monitoring & Performance Tracking
 *
 * Provides comprehensive application monitoring with custom metrics
 * Compatible with New Relic, Datadog, or custom monitoring solutions
 */

import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger.js";
import { responseTimeTracker, endpointLatencyRegistry } from "./services/monitoringService.js";

/**
 * Custom metrics interface for APM integration
 */
export interface CustomMetrics {
  // Business Metrics
  trackPayment(
    amount: number,
    currency: string,
    status: "success" | "failed",
  ): void;
  trackSocialPost(platform: string, success: boolean): void;
  trackDistribution(dsp: string, status: string): void;
  trackMarketplaceSale(amount: number, type: string): void;

  // Performance Metrics
  trackDatabaseQuery(queryTime: number, queryType: string): void;
  trackAPICall(endpoint: string, duration: number, statusCode: number): void;
  trackCacheHit(cacheType: string, hit: boolean): void;

  // User Metrics
  trackUserSignup(tier: string): void;
  trackUserLogin(method: string): void;
  trackFeatureUsage(feature: string): void;
}

/**
 * In-memory metrics collector (replace with APM provider)
 */
class MetricsCollector implements CustomMetrics {
  private metrics: Map<string, number> = new Map();

  private increment(key: string, value: number = 1): void {
    const current = this.metrics.get(key) || 0;
    this.metrics.set(key, current + value);
  }

  // Business Metrics
  trackPayment(
    amount: number,
    currency: string,
    status: "success" | "failed",
  ): void {
    this.increment(`payment.${status}.count`);
    this.increment(`payment.${status}.amount.${currency}`, amount);
    logger.info({ amount, currency, status }, "💰 Payment tracked");
  }

  trackSocialPost(platform: string, success: boolean): void {
    const status = success ? "success" : "failed";
    this.increment(`social.${platform}.${status}`);
    logger.info({ platform, success }, "📱 Social post tracked");
  }

  trackDistribution(dsp: string, status: string): void {
    this.increment(`distribution.${dsp}.${status}`);
    logger.info({ dsp, status }, "🎵 Distribution tracked");
  }

  trackMarketplaceSale(amount: number, type: string): void {
    this.increment(`marketplace.${type}.count`);
    this.increment(`marketplace.${type}.amount`, amount);
    logger.info({ amount, type }, "🛍️ Marketplace sale tracked");
  }

  // Performance Metrics
  trackDatabaseQuery(queryTime: number, queryType: string): void {
    this.increment(`database.${queryType}.count`);
    if (queryTime > 1000) {
      logger.warn({ queryTime, queryType }, "⚠️ Slow database query");
    }
  }

  trackAPICall(endpoint: string, duration: number, statusCode: number): void {
    this.increment(`api.${endpoint}.count`);
    this.increment(`api.status.${statusCode}`);
    if (duration > 5000) {
      logger.warn({ endpoint, duration, statusCode }, "⚠️ Slow API call");
    }
  }

  trackCacheHit(cacheType: string, hit: boolean): void {
    const status = hit ? "hit" : "miss";
    this.increment(`cache.${cacheType}.${status}`);
  }

  // User Metrics
  trackUserSignup(tier: string): void {
    this.increment(`user.signup.${tier}`);
    logger.info({ tier }, "👤 User signup tracked");
  }

  trackUserLogin(method: string): void {
    this.increment(`user.login.${method}`);
    logger.info({ method }, "🔐 User login tracked");
  }

  trackFeatureUsage(feature: string): void {
    this.increment(`feature.${feature}`);
  }

  /**
   * Get all collected metrics
   */
  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }

  /**
   * Reset metrics (useful for testing)
   */
  reset(): void {
    this.metrics.clear();
  }
}

// Singleton instance
export const metrics = new MetricsCollector();

/**
 * Express middleware for automatic request tracking
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date?.now();

  // Track response
  res.on("finish", () => {
    const duration = Date?.now() - start;
    const endpoint = req.route?.path || req.path;

    metrics?.trackAPICall(endpoint, duration, res.statusCode);
    responseTimeTracker.record(duration);
    endpointLatencyRegistry.record(`${req.method} ${endpoint}`, duration);

    // Log slow requests and bump Prometheus counter (>5 s threshold)
    if (duration > 3000) {
      logger.warn({
        method: req.method,
        endpoint,
        duration,
        statusCode: res.statusCode,
      }, "🐌 Slow request");
    }
    if (duration > 5000) {
      // Lazy import avoids circular-dep risk at module-load time.
      import("./routes/prometheus.js")
        .then(({ slowRequestsTotal }) => {
          slowRequestsTotal.inc({ method: req.method, route: endpoint });
        })
        .catch(() => { /* prom registry not yet loaded — non-fatal */ });
    }
  });

  next();
}

/**
 * Health check endpoint for monitoring systems
 */
export function getHealthStatus(): {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  metrics: Record<string, number>;
} {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage?.heapUsed / 1024 / 1024;

  // Determine health status
  let status: "healthy" | "degraded" | "unhealthy" = "healthy";
  if (heapUsedMB > 1024) {
    status = "degraded";
  }
  if (heapUsedMB > 2048) {
    status = "unhealthy";
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: memUsage,
    metrics: metrics.getMetrics(),
  };
}

/**
 * New Relic Integration (if installed)
 *
 * Install: npm install newrelic
 *
 * Usage:
 * import newrelic from 'newrelic';
 *
 * newrelic?.recordMetric('Custom/Payment/Success', amount);
 * newrelic?.setTransactionName(req.path);
 */

/**
 * Datadog Integration (if installed)
 *
 * Install: npm install dd-trace
 *
 * Usage:
 * import tracer from 'dd-trace';
 * tracer?.init();
 *
 * const span = tracer?.startSpan('payment.process');
 * span?.setTag('amount', amount);
 * span?.finish();
 */

logger.info("📊 Monitoring system initialized");
