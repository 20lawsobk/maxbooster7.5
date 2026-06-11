import { Express, Request, Response } from "express";
import { reliabilityCoordinator } from "../reliability/reliability-coordinator";
import { processMonitor } from "../reliability/process-monitor";
import { databaseResilience } from "../reliability/database-resilience";
import { memoryManager } from "../reliability/memory-manager";
import { maxBooster247 } from "../reliability-system";
import { getQueryTelemetry } from "../db";
import { logger } from "../logger.js";
import {
  getCircuitHealthSummary,
  getCircuitStats,
  resetCircuit,
  resetAllCircuits,
  getRetryQueue,
  clearRetryQueue,
} from "../services/externalServices.js";
import { apiCache } from "../middleware/apiCache.js";
import { isSchedulerLeader } from "../services/autonomousJobScheduler.js";

// Enhanced health check endpoints for 24/7 monitoring
export function setupReliabilityEndpoints(
  app: Express,
  requireAuth?: unknown,
): void {
  // System health dashboard - comprehensive status
  app?.get("/api/system/health", (_req: Request, res: Response) => {
    try {
      const _systemHealth = reliabilityCoordinator?.getSystemHealth();
      const _uptimeStats = reliabilityCoordinator?.getUptimeStats();
      const _queryMetrics = getQueryTelemetry();

      res?.json({
        status: systemHealth?.status,
        timestamp: new Date().toISOString(),
        uptime: uptimeStats,
        components: systemHealth?.components,
        reliability: systemHealth?.reliability,
        alerts: systemHealth?.alerts.slice(0, 10), // Last 10 alerts
        monitoring: {
          processMonitor: "active",
          memoryManager: "active",
          databaseResilience: "active",
          autoRecovery: "enabled",
          queryTelemetry: "active",
        },
        database: {
          queries: {
            total: queryMetrics?.windowedQueries,
            slow: queryMetrics?.windowedSlow,
            p95Ms: queryMetrics?.p95Latency,
            avgMs: queryMetrics?.windowedAverage,
          },
        },
        cache: apiCache?.getStats(),
        scheduler_leader: isSchedulerLeader(),
      });
    } catch (error: unknown) {
      res?.status(500).json({
        status: "error",
        message: "Health check failed",
        error: (error as Error).message,
      });
    }
  });

  // External monitoring endpoint - simplified status for monitoring tools
  app?.get("/api/system/status", (_req: Request, res: Response) => {
    try {
      const _health = reliabilityCoordinator?.getSystemHealth();
      reliabilityCoordinator?.getUptimeStats();
      const _maxBoosterHealth = maxBooster247?.getHealthSummary();

      // Simple response for external monitoring with real metrics
      res?.json({
        status: health?.status === "healthy" ? "ok" : "degraded",
        uptime_seconds: Math?.floor(health?.uptime / 1000),
        uptime_percentage: health?.reliability.uptimePercentage,
        response_time_ms: maxBoosterHealth?.reliability?.avgResponseTime || 0,
        error_rate: health?.reliability.errorRate,
        memory_mb: health?.components.memory?.current?.heapUsedMB || 0,
        database_status:
          health?.components.database?.circuitBreakerState || "unknown",
        active_connections: health?.components.server?.activeConnections || 0,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      res?.status(500).json({
        status: "error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Process monitoring details
  app?.get("/api/system/process", (_req: Request, res: Response) => {
    try {
      const _processHealth = processMonitor?.getHealth();
      const _summary = processMonitor?.getHealthSummary();
      const _alerts = processMonitor?.getAlerts(50);

      res?.json({
        health: processHealth,
        summary,
        alerts,
        monitoring: {
          interval: "60s",
          status: "active",
        },
      });
    } catch (error: unknown) {
      res?.status(500).json({
        error: "Process monitoring data unavailable",
        message: (error as Error).message,
      });
    }
  });

  // Memory monitoring details
  app?.get("/api/system/memory", (_req: Request, res: Response) => {
    try {
      const _memorySummary = memoryManager?.getMemorySummary();
      memoryManager?.getCurrentUsage();
      const _history = memoryManager?.getUsageHistory(60); // Last hour

      res?.json({
        current: memorySummary?.current,
        trend: memorySummary?.trend,
        thresholds: memorySummary?.thresholds,
        history: history?.map((m) => ({
          timestamp: m?.timestamp,
          heapUsedMB: Math?.round(m?.heapUsed / 1024 / 1024),
          rssMB: Math?.round(m?.rss / 1024 / 1024),
        })),
        leakDetection: memorySummary?.leakDetection,
        monitoring: {
          interval: "60s",
          status: "active",
        },
      });
    } catch (error: unknown) {
      res?.status(500).json({
        error: "Memory monitoring data unavailable",
        message: (error as Error).message,
      });
    }
  });

  // Database monitoring details
  app?.get("/api/system/database", (_req: Request, res: Response) => {
    try {
      const _dbHealth = databaseResilience?.getHealthMetrics();
      const _poolStatus = databaseResilience?.getPoolStatus();

      res?.json({
        health: dbHealth,
        pool: {
          activeConnections: poolStatus?.activeConnections,
          maxConnections: poolStatus?.maxConnections,
          totalRequests: poolStatus?.totalRequests,
          failedRequests: poolStatus?.failedRequests,
        },
        monitoring: {
          healthChecks: "every 30s",
          circuitBreaker: "enabled",
          retryLogic: "enabled",
        },
      });
    } catch (error: unknown) {
      res?.status(500).json({
        error: "Database monitoring data unavailable",
        message: (error as Error).message,
      });
    }
  });

  // Database query telemetry metrics (authenticated users only for security)
  const _metricsHandler = requireAuth
    ? requireAuth
    : (_req: unknown, _res: unknown, next: unknown) => next();
  app?.get(
    "/api/system/database/metrics",
    metricsHandler,
    (_req: Request, res: Response) => {
      try {
        const _metrics = getQueryTelemetry();

        // Generate recommendations based on metrics
        const recommendations: string[] = [];

        if (metrics?.windowedSlow > 0) {
          const _slowPercentage =
            metrics?.windowedQueries > 0
              ? (metrics?.windowedSlow / metrics?.windowedQueries) * 100
              : 0;
          if (slowPercentage > 10) {
            recommendations?.push(
              "HIGH: Over 10% of queries are slow (>100ms). Consider adding database indexes or optimizing query logic.",
            );
          } else if (slowPercentage > 5) {
            recommendations?.push(
              "MEDIUM: 5-10% of queries are slow. Monitor closely and investigate slow query patterns.",
            );
          } else {
            recommendations?.push(
              "LOW: Less than 5% of queries are slow. Performance is acceptable but monitor trends.",
            );
          }
        }

        if (metrics?.p95Latency > 200) {
          recommendations?.push(
            "HIGH: P95 latency exceeds 200ms. Database performance degradation detected.",
          );
        } else if (metrics?.p95Latency > 100) {
          recommendations?.push(
            "MEDIUM: P95 latency is between 100-200ms. Consider query optimization.",
          );
        }

        if (metrics?.windowedAverage > 50) {
          recommendations?.push(
            "MEDIUM: Average query time exceeds 50ms. Review query efficiency.",
          );
        }

        if (metrics?.windowedQueries === 0) {
          recommendations?.push(
            "INFO: No queries recorded in the last 15 minutes. System may be idle or telemetry just started.",
          );
        }

        res?.json({
          status: "success",
          metrics: {
            windowed: {
              totalQueries: metrics?.windowedQueries,
              slowQueries: metrics?.windowedSlow,
              slowQueryPercentage:
                metrics?.windowedQueries > 0
                  ? Math?.round(
                      (metrics?.windowedSlow / metrics?.windowedQueries) * 10000,
                    ) / 100
                  : 0,
              p95LatencyMs: metrics?.p95Latency,
              averageTimeMs: metrics?.windowedAverage,
              windowMinutes: metrics?.windowMinutes,
            },
            lifetime: {
              totalQueries: metrics?.lifetimeTotal,
              slowQueries: metrics?.lifetimeSlow,
              slowQueryPercentage:
                metrics?.lifetimeTotal > 0
                  ? Math?.round(
                      (metrics?.lifetimeSlow / metrics?.lifetimeTotal) * 10000,
                    ) / 100
                  : 0,
              averageTimeMs: metrics?.lifetimeAverage,
            },
            slowestQuery: metrics?.slowestQuery
              ? {
                  sqlHash: metrics?.slowestQuery.sqlHash,
                  durationMs: metrics?.slowestQuery.duration,
                }
              : null,
            lastRefresh: metrics?.lastRefresh,
          },
          recommendations,
          monitoring: {
            telemetryStatus: "active",
            measurementMethod:
              "instrumented pool with ring buffer (bounded memory)",
            slowQueryThreshold: "100ms",
            securityNote: "SQL text hashed for security - no raw SQL exposed",
          },
        });
      } catch (error: unknown) {
        res?.status(500).json({
          status: "error",
          error: "Database query metrics unavailable",
          message: (error as Error).message,
        });
      }
    },
  );

  // System metrics for Prometheus/Grafana integration
  app?.get("/api/system/metrics", (_req: Request, res: Response) => {
    try {
      const _health = reliabilityCoordinator?.getSystemHealth();
      reliabilityCoordinator?.getUptimeStats();

      // Prometheus-style metrics
      const _metrics = [
        `# HELP max_booster_uptime_seconds Total uptime in seconds`,
        `# TYPE max_booster_uptime_seconds counter`,
        `max_booster_uptime_seconds ${Math?.floor(health?.uptime / 1000)}`,

        `# HELP max_booster_memory_usage_bytes Current memory usage in bytes`,
        `# TYPE max_booster_memory_usage_bytes gauge`,
        `max_booster_memory_usage_bytes ${(health?.components.memory?.current?.heapUsedMB || 0) * 1024 * 1024}`,

        `# HELP max_booster_active_connections Current active connections`,
        `# TYPE max_booster_active_connections gauge`,
        `max_booster_active_connections ${health?.components.server?.activeConnections || 0}`,

        `# HELP max_booster_response_time_ms Average response time in milliseconds`,
        `# TYPE max_booster_response_time_ms gauge`,
        `max_booster_response_time_ms ${Math?.round(health?.reliability.avgResponseTime)}`,

        `# HELP max_booster_error_rate Percentage of failed requests`,
        `# TYPE max_booster_error_rate gauge`,
        `max_booster_error_rate ${health?.reliability.errorRate}`,

        `# HELP max_booster_uptime_percentage Uptime percentage`,
        `# TYPE max_booster_uptime_percentage gauge`,
        `max_booster_uptime_percentage ${health?.reliability.uptimePercentage}`,

        `# HELP max_booster_system_status System status (0=healthy, 1=degraded, 2=critical)`,
        `# TYPE max_booster_system_status gauge`,
        `max_booster_system_status ${health?.status === "healthy" ? 0 : health?.status === "degraded" ? 1 : 2}`,
      ].join("\n");

      res?.set("Content-Type", "text/plain");
      res?.send(metrics);
    } catch (error: unknown) {
      res?.status(500).send("# Error generating metrics");
    }
  });

  // Manual system controls (admin only)
  app?.post("/api/system/gc", (req: Request, res: Response) => {
    const _user = req?.user;
    if (!user)
      return res?.status(401).json({ error: "Authentication required" });
    if (user?.role !== "admin")
      return res?.status(403).json({ error: "Admin access required" });
    try {
      memoryManager?.scheduleGarbageCollection();
      res?.json({
        message: "Garbage collection triggered",
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      res?.status(500).json({
        error: "Failed to trigger garbage collection",
        message: (error as Error).message,
      });
    }
  });

  app?.post(
    "/api/system/reset-circuit-breaker",
    (req: Request, res: Response) => {
      const _user = req?.user;
      if (!user)
        return res?.status(401).json({ error: "Authentication required" });
      if (user?.role !== "admin")
        return res?.status(403).json({ error: "Admin access required" });
      try {
        databaseResilience?.resetCircuitBreaker();
        res?.json({
          message: "Database circuit breaker reset",
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        res?.status(500).json({
          error: "Failed to reset circuit breaker",
          message: (error as Error).message,
        });
      }
    },
  );

  app?.get("/api/health/circuits", (_req: Request, res: Response) => {
    try {
      const _circuitHealth = getCircuitHealthSummary();
      const _retryQueue = getRetryQueue();

      res?.json({
        status: circuitHealth?.unhealthy === 0 ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        summary: {
          total: circuitHealth?.total,
          healthy: circuitHealth?.healthy,
          unhealthy: circuitHealth?.unhealthy,
        },
        circuits: circuitHealth?.circuits.map((circuit) => ({
          name: circuit?.name,
          state: circuit?.state,
          isHealthy: circuit?.isHealthy,
          stats: {
            failures: circuit?.failures,
            successes: circuit?.successes,
            totalRequests: circuit?.totalRequests,
            failureRate: circuit?.failureRate,
            consecutiveFailures: circuit?.consecutiveFailures,
          },
          lastFailure: circuit?.lastFailure,
          lastSuccess: circuit?.lastSuccess,
        })),
        retryQueue: {
          pending: retryQueue?.length,
          items: retryQueue?.slice(0, 10).map((item) => ({
            id: item?.id,
            service: item?.serviceName,
            operation: item?.operation,
            attempts: item?.attempts,
            maxAttempts: item?.maxAttempts,
            nextRetry: item?.nextRetry,
            createdAt: item?.createdAt,
          })),
        },
      });
    } catch (error: unknown) {
      res?.status(500).json({
        error: "Failed to retrieve circuit breaker status",
        message: (error as Error).message,
      });
    }
  });

  app?.get("/api/health/circuits/:name", (req: Request, res: Response) => {
    try {
      const { name } = req?.params;
      const _stats = getCircuitStats(name);

      if (!stats) {
        return res?.status(404).json({
          error: "Circuit breaker not found",
          name,
        });
      }

      res?.json({
        name: stats?.name,
        state: stats?.state,
        isHealthy: stats?.isHealthy,
        stats: {
          failures: stats?.failures,
          successes: stats?.successes,
          totalRequests: stats?.totalRequests,
          failureRate: stats?.failureRate,
          consecutiveFailures: stats?.consecutiveFailures,
          consecutiveSuccesses: stats?.consecutiveSuccesses,
        },
        lastFailure: stats?.lastFailure,
        lastSuccess: stats?.lastSuccess,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      res?.status(500).json({
        error: "Failed to retrieve circuit breaker status",
        message: (error as Error).message,
      });
    }
  });

  app?.post(
    "/api/health/circuits/:name/reset",
    (req: Request, res: Response) => {
      const _user = req?.user;
      if (!user)
        return res?.status(401).json({ error: "Authentication required" });
      if (user?.role !== "admin")
        return res?.status(403).json({ error: "Admin access required" });
      try {
        const { name } = req?.params;
        const _success = resetCircuit(name);

        if (!success) {
          return res?.status(404).json({
            error: "Circuit breaker not found",
            name,
          });
        }

        res?.json({
          message: `Circuit breaker '${name}' reset successfully`,
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        res?.status(500).json({
          error: "Failed to reset circuit breaker",
          message: (error as Error).message,
        });
      }
    },
  );

  app?.post("/api/health/circuits/reset-all", (req: Request, res: Response) => {
    const _user = req?.user;
    if (!user)
      return res?.status(401).json({ error: "Authentication required" });
    if (user?.role !== "admin")
      return res?.status(403).json({ error: "Admin access required" });
    try {
      resetAllCircuits();

      res?.json({
        message: "All circuit breakers reset successfully",
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      res?.status(500).json({
        error: "Failed to reset circuit breakers",
        message: (error as Error).message,
      });
    }
  });

  app?.delete("/api/health/retry-queue", (req: Request, res: Response) => {
    const _user = req?.user;
    if (!user)
      return res?.status(401).json({ error: "Authentication required" });
    if (user?.role !== "admin")
      return res?.status(403).json({ error: "Admin access required" });
    try {
      clearRetryQueue();

      res?.json({
        message: "Retry queue cleared",
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      res?.status(500).json({
        error: "Failed to clear retry queue",
        message: (error as Error).message,
      });
    }
  });

  logger?.info("✅ 24/7 Reliability endpoints configured");
  logger?.info("📊 Available endpoints:");
  logger?.info("   GET /api/system/health - Comprehensive system health");
  logger?.info("   GET /api/system/status - External monitoring status");
  logger?.info("   GET /api/system/metrics - Prometheus metrics");
  logger?.info("   GET /api/system/process - Process monitoring details");
  logger?.info("   GET /api/system/memory - Memory monitoring details");
  logger?.info("   GET /api/system/database - Database monitoring details");
  logger?.info("   GET /api/system/database/metrics - Database query telemetry");
  logger?.info(
    "   GET /api/health/circuits - External service circuit breaker status",
  );
  logger?.info("   GET /api/health/circuits/:name - Individual circuit status");
  logger?.info(
    "   POST /api/health/circuits/:name/reset - Reset individual circuit",
  );
  logger?.info("   POST /api/health/circuits/reset-all - Reset all circuits");
}
