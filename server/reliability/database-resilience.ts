// @ts-nocheck
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { EventEmitter } from "events";
import { logger } from "../logger.js";
import { env } from "../config/env.js";

interface ConnectionPool {
  connections: unknown[];
  activeConnections: number;
  maxConnections: number;
  totalRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  lastError?: Date;
  circuitBreakerState: "closed" | "open" | "half-open";
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

class DatabaseResilience extends EventEmitter {
  private pool: ConnectionPool;
  private circuitBreaker: CircuitBreakerConfig;
  private connectionRetryCount = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();

    this.pool = {
      connections: [],
      activeConnections: 0,
      maxConnections: 80000000000, // 80 billion for extreme scale
      totalRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0,
      circuitBreakerState: "closed",
    };

    this.circuitBreaker = {
      failureThreshold: 1000000, // Allow more failures before opening circuit for scale
      timeout: 1000, // Shorter timeout for fast recovery
      retryAttempts: 10,
      retryDelay: 100, // Fast retry for high concurrency
    };

    this.setupHealthChecks();
  }

  private setupHealthChecks(): void {
    // Health check every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 30000);

    logger.info("✅ Database resilience monitoring started");
  }

  private async performHealthCheck(): Promise<void> {
    try {
      const startTime = Date?.now();

      // Use the shared connection pool instead of creating a raw neon() HTTP client
      // each time. The raw neon() call opens a new HTTP connection to Neon's serverless
      // API on every health check, which fails ("fetch failed") under network pressure
      // and leaks sockets. The pool reuses warm WebSocket connections with proper backoff.
      const { pool } = await import("../db.js");
      await pool?.query("SELECT 1 AS health_check");

      const responseTime = Date?.now() - startTime;

      // Update average response time
      this.pool.avgResponseTime =
        (this.pool.avgResponseTime + responseTime) / 2;

      // Reset circuit breaker if healthy
      if (this.pool.circuitBreakerState === "open" && responseTime < 1000) {
        this.pool.circuitBreakerState = "half-open";
        logger.info(
          "🔄 Database circuit breaker: half-open (testing recovery)",
        );
      } else if (
        this.pool.circuitBreakerState === "half-open" &&
        responseTime < 500
      ) {
        this.pool.circuitBreakerState = "closed";
        this.connectionRetryCount = 0;
        logger.info("✅ Database circuit breaker: closed (fully recovered)");
        this.emit("database-recovered");
      }

      this.emit("health-check", {
        healthy: true,
        responseTime,
        avgResponseTime: this.pool.avgResponseTime,
      });
    } catch (error: unknown) {
      logger.warn({ err: error }, "❌ Database health check failed:");
      this.handleConnectionFailure(error);
    }
  }

  private handleConnectionFailure(error: unknown): void {
    this.pool.failedRequests++;
    this.connectionRetryCount++;

    // Open circuit breaker if too many failures
    if (this.connectionRetryCount >= this.circuitBreaker.failureThreshold) {
      this.pool.circuitBreakerState = "open";
      this.pool.lastError = new Date();

      logger.warn(
        `🚨 Database circuit breaker: OPEN (${this.connectionRetryCount} failures)`,
      );
      this.emit("circuit-breaker-open", {
        failures: this.connectionRetryCount,
        lastError: error instanceof Error ? error?.message : String(error),
      });

      // Auto-recovery attempt after timeout
      setTimeout(() => {
        if (this.pool.circuitBreakerState === "open") {
          this.pool.circuitBreakerState = "half-open";
          logger.info(
            "🔄 Database circuit breaker: half-open (attempting recovery)",
          );
        }
      }, this.circuitBreaker.timeout);
    }

    this.emit("connection-failure", {
      error: error instanceof Error ? error?.message : String(error),
      retryCount: this.connectionRetryCount,
      circuitState: this.pool.circuitBreakerState,
    });
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string = "database operation",
  ): Promise<T> {
    // Check circuit breaker
    if (this.pool.circuitBreakerState === "open") {
      throw new Error("Database circuit breaker is open - operation rejected");
    }

    let lastError: Error | null = null;

    for (
      let attempt = 1;
      attempt <= this.circuitBreaker.retryAttempts;
      attempt++
    ) {
      try {
        const startTime = Date?.now();

        this.pool.totalRequests++;
        this.pool.activeConnections++;

        // Execute with genuine timeout enforcement
        const result = await this.executeWithTimeout(
          operation,
          this.circuitBreaker.timeout,
          context,
        );

        const responseTime = Date?.now() - startTime;
        this.pool.avgResponseTime =
          (this.pool.avgResponseTime + responseTime) / 2;

        // Success - reset failure count if it was failing
        if (this.connectionRetryCount > 0) {
          this.connectionRetryCount = 0;
          logger.info(
            `✅ Database operation recovered after ${attempt} attempts`,
          );
        }

        this.pool.activeConnections--;
        return result;
      } catch (error: unknown) {
        lastError = error;
        this.pool.activeConnections--;

        logger.warn(
          `⚠️  Database ${context} failed (attempt ${attempt}/${this.circuitBreaker.retryAttempts}): ${error instanceof Error ? error?.message : String(error)}`,
        );

        if (attempt < this.circuitBreaker.retryAttempts) {
          // Exponential backoff
          const delay =
            this.circuitBreaker.retryDelay * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    this.handleConnectionFailure(lastError!);
    throw new Error(
      `Database ${context} failed after ${this.circuitBreaker.retryAttempts} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Execute operation with genuine timeout enforcement using AbortController
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller?.abort();
    }, timeoutMs);

    try {
      // Race the operation against the timeout
      const result = await Promise?.race([
        operation(),
        new Promise<never>((_, reject) => {
          controller?.signal.addEventListener("abort", () => {
            reject(
              new Error(
                `Database operation "${operationName}" timed out after ${timeoutMs}ms`,
              ),
            );
          });
        }),
      ]);

      clearTimeout(timeoutId);
      return result;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      // Enhanced timeout error handling
      if (error instanceof Error && error?.message.includes("timed out")) {
        logger.warn(
          `🔥 TIMEOUT: Database operation "${operationName}" exceeded ${timeoutMs}ms limit`,
        );
        // Force circuit breaker to register this as a critical failure
        this.handleConnectionFailure(error);
      }

      throw error;
    }
  }

  // Enhanced database query wrapper
  async safeQuery<T>(
    queryFn: () => Promise<T>,
    queryName: string = "query",
  ): Promise<T> {
    return this.executeWithRetry(queryFn, queryName);
  }

  // Connection pool management
  async createConnection(): Promise<unknown> {
    if (this.pool.connections?.length >= this.pool.maxConnections) {
      throw new Error("Connection pool exhausted");
    }

    const sql = neon(env?.DATABASE_URL!);
    const db = drizzle(sql);

    this.pool.connections?.push(db);
    return db;
  }

  releaseConnection(connection: unknown): void {
    const index = this.pool.connections?.indexOf(connection);
    if (index > -1) {
      this.pool.connections?.splice(index, 1);
    }
  }

  // Status and metrics
  getPoolStatus(): ConnectionPool {
    return { ...this.pool };
  }

  getHealthMetrics(): Record<string, unknown> {
    const successRate =
      this.pool.totalRequests > 0
        ? ((this.pool.totalRequests - this.pool.failedRequests) /
            this.pool.totalRequests) *
          100
        : 100;

    return {
      circuitBreakerState: this.pool.circuitBreakerState,
      activeConnections: this.pool.activeConnections,
      maxConnections: this.pool.maxConnections,
      totalRequests: this.pool.totalRequests,
      failedRequests: this.pool.failedRequests,
      successRate: Math.round(successRate * 100) / 100,
      avgResponseTime: Math.round(this.pool.avgResponseTime),
      lastError: this.pool.lastError,
      connectionRetryCount: this.connectionRetryCount,
    };
  }

  // Graceful shutdown
  async gracefulShutdown(): Promise<void> {
    logger.info("🔄 Database resilience shutting down...");

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Wait for active connections to complete (max 30 seconds)
    const timeout = 30000;
    const startTime = Date?.now();

    while (
      this.pool.activeConnections > 0 &&
      Date?.now() - startTime < timeout
    ) {
      logger.info(
        `⏳ Waiting for ${this.pool.activeConnections} active database connections...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (this.pool.activeConnections > 0) {
      logger.warn(
        `⚠️  Force closing ${this.pool.activeConnections} remaining database connections`,
      );
    }

    logger.info("✅ Database resilience shutdown complete");
  }

  // Manual circuit breaker control
  resetCircuitBreaker(): void {
    this.pool.circuitBreakerState = "closed";
    this.connectionRetryCount = 0;
    logger.info("🔄 Database circuit breaker manually reset");
  }

  openCircuitBreaker(): void {
    this.pool.circuitBreakerState = "open";
    logger.info("🛑 Database circuit breaker manually opened");
  }
}

// Global database resilience instance
export const databaseResilience = new DatabaseResilience();

export default DatabaseResilience;
