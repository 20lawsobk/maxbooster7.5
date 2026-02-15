/**
 * APM Monitoring & Performance Tracking
 * 
 * Provides comprehensive application monitoring with custom metrics
 * Compatible with New Relic, Datadog, or custom monitoring solutions
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

/**
 * Custom metrics interface for APM integration
 */
export interface CustomMetrics {
  // Business Metrics
  trackPayment(amount: number, currency: string, status: 'success' | 'failed'): void;
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
  trackPayment(amount: number, currency: string, status: 'success' | 'failed'): void {
    this.increment(`payment.${status}.count`);
    this.increment(`payment.${status}.amount.${currency}`, amount);
    logger.info('💰 Payment tracked', { amount, currency, status });
  }
  
  trackSocialPost(platform: string, success: boolean): void {
    const status = success ? 'success' : 'failed';
    this.increment(`social.${platform}.${status}`);
    logger.info('📱 Social post tracked', { platform, success });
  }
  
  trackDistribution(dsp: string, status: string): void {
    this.increment(`distribution.${dsp}.${status}`);
    logger.info('🎵 Distribution tracked', { dsp, status });
  }
  
  trackMarketplaceSale(amount: number, type: string): void {
    this.increment(`marketplace.${type}.count`);
    this.increment(`marketplace.${type}.amount`, amount);
    logger.info('🛍️ Marketplace sale tracked', { amount, type });
  }
  
  // Performance Metrics
  trackDatabaseQuery(queryTime: number, queryType: string): void {
    this.increment(`database.${queryType}.count`);
    if (queryTime > 1000) {
      logger.warn('⚠️ Slow database query', { queryTime, queryType });
    }
  }
  
  trackAPICall(endpoint: string, duration: number, statusCode: number): void {
    this.increment(`api.${endpoint}.count`);
    this.increment(`api.status.${statusCode}`);
    if (duration > 5000) {
      logger.warn('⚠️ Slow API call', { endpoint, duration, statusCode });
    }
  }
  
  trackCacheHit(cacheType: string, hit: boolean): void {
    const status = hit ? 'hit' : 'miss';
    this.increment(`cache.${cacheType}.${status}`);
  }
  
  // User Metrics
  trackUserSignup(tier: string): void {
    this.increment(`user.signup.${tier}`);
    logger.info('👤 User signup tracked', { tier });
  }
  
  trackUserLogin(method: string): void {
    this.increment(`user.login.${method}`);
    logger.info('🔐 User login tracked', { method });
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
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  
  // Track response
  res.on('finish', () => {
    const duration = Date.now() - start;
    const endpoint = req.route?.path || req.path;
    
    metrics.trackAPICall(endpoint, duration, res.statusCode);
    
    // Log slow requests
    if (duration > 3000) {
      logger.warn('🐌 Slow request', {
        method: req.method,
        endpoint,
        duration,
        statusCode: res.statusCode,
      });
    }
  });
  
  next();
}

/**
 * Health check endpoint for monitoring systems
 */
export function getHealthStatus(): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  metrics: Record<string, number>;
} {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  
  // Determine health status
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (heapUsedMB > 1024) {
    status = 'degraded';
  }
  if (heapUsedMB > 2048) {
    status = 'unhealthy';
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
 * newrelic.recordMetric('Custom/Payment/Success', amount);
 * newrelic.setTransactionName(req.path);
 */

/**
 * Datadog Integration (if installed)
 * 
 * Install: npm install dd-trace
 * 
 * Usage:
 * import tracer from 'dd-trace';
 * tracer.init();
 * 
 * const span = tracer.startSpan('payment.process');
 * span.setTag('amount', amount);
 * span.finish();
 */

logger.info('📊 Monitoring system initialized');
