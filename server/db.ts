import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from '@shared/schema';
import { config } from './config/defaults.js';
import { createHash } from 'crypto';
import { logger } from './logger.js';

neonConfig.webSocketConstructor = ws;

if (!config.database.url) {
  throw new Error('DATABASE_URL must be set. Did you forget to provision a database?');
}

// Database Query Telemetry with bounded ring buffer (O(1) memory, O(1) updates)
// NOTE: Current implementation scales to ~1M QPM. For multi-billion QPM (10B users):
// - Increase sampling tiers to 1-in-10k/100k
// - Scale ring buffer size with sample rate OR use per-tier reservoirs
// - Target: <1000 writes/sec overhead, preserve 15-min window fidelity
interface QueryRecord {
  timestamp: number;
  sqlHash: string; // Only store hash for security
  duration: number;
}

class QueryTelemetry {
  private ringBuffer: QueryRecord[] = [];
  private bufferIndex: number = 0;
  private readonly maxSize = 1000; // Bounded to 1000 queries max

  // Running aggregates for O(1) calculations
  private lifetimeTotal = 0;
  private lifetimeSlow = 0;
  private runningSum = 0;
  private slowestEver: { sqlHash: string; duration: number } | null = null;

  // Sampling for high-QPS scenarios (store 1 in N queries)
  private sampleRate = 1; // Start with 100% sampling
  private queriesSinceLastSample = 0;
  private trackingStartTime = Date.now(); // Fixed timestamp for QPS calculation

  private hashSql(sql: string): string {
    // Cryptographic hash for SQL identification - prevents collision spoofing
    const hash = createHash('sha256').update(sql).digest('hex');
    return `sql_${hash.substring(0, 16)}`; // First 16 chars of SHA-256
  }

  recordQuery(sql: string, duration: number): void {
    const now = Date.now();
    const sqlHash = this.hashSql(sql);

    // Update running aggregates (always track for accurate lifetime stats)
    this.lifetimeTotal++;
    this.runningSum += duration;

    if (duration > 100) {
      this.lifetimeSlow++;
      const isDev = process.env.NODE_ENV === 'development';
      const sqlPreview = isDev ? sql.substring(0, 200).replace(/\s+/g, ' ') : '';
      logger.warn(
        `⚠️ Slow query detected (${duration}ms):`,
        sqlHash,
        isDev ? `\n   SQL: ${sqlPreview}...` : ''
      );
    }

    // Track slowest query
    if (!this.slowestEver || duration > this.slowestEver.duration) {
      this.slowestEver = { sqlHash, duration };
    }

    // Adaptive sampling: At high QPS, sample queries instead of storing all
    // This keeps memory bounded while preserving statistical accuracy
    this.queriesSinceLastSample++;

    // Auto-adjust sample rate based on QPS (every 10,000 queries)
    if (this.lifetimeTotal % 10000 === 0) {
      const elapsedMs = Math.max(1, Date.now() - this.trackingStartTime);
      const avgQueriesPerMinute = (this.lifetimeTotal / elapsedMs) * 60000;

      if (avgQueriesPerMinute > 1000000) {
        // >1M QPM = extremely high load
        this.sampleRate = 1000; // Sample 1 in 1000 queries
      } else if (avgQueriesPerMinute > 100000) {
        // >100K QPM = very high load
        this.sampleRate = 100; // Sample 1 in 100 queries
      } else if (avgQueriesPerMinute > 10000) {
        // >10K QPM = high load
        this.sampleRate = 10; // Sample 1 in 10 queries
      } else if (avgQueriesPerMinute > 1000) {
        // >1K QPM = medium load
        this.sampleRate = 5; // Sample 1 in 5 queries
      } else {
        this.sampleRate = 1; // Sample all queries at low load
      }
    }

    // Add to ring buffer with sampling (overwrites oldest when full)
    if (this.queriesSinceLastSample >= this.sampleRate) {
      this.ringBuffer[this.bufferIndex] = { timestamp: now, sqlHash, duration };
      this.bufferIndex = (this.bufferIndex + 1) % this.maxSize;
      this.queriesSinceLastSample = 0;
    }
  }

  getMetrics() {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes

    // Filter recent queries from ring buffer
    const recentQueries = this.ringBuffer.filter(
      (q) => q && q.timestamp && now - q.timestamp < windowMs
    );

    if (recentQueries.length === 0) {
      return {
        windowedQueries: 0,
        windowedSlow: 0,
        p95Latency: 0,
        windowedAverage: 0,
        lifetimeTotal: this.lifetimeTotal,
        lifetimeSlow: this.lifetimeSlow,
        lifetimeAverage:
          this.lifetimeTotal > 0
            ? Math.round((this.runningSum / this.lifetimeTotal) * 100) / 100
            : 0,
        slowestQuery: this.slowestEver,
        lastRefresh: new Date().toISOString(),
        windowMinutes: 15,
      };
    }

    // Calculate windowed metrics
    const windowedSlow = recentQueries.filter((q) => q.duration > 100).length;
    const durations = recentQueries.map((q) => q.duration).sort((a, b) => a - b);
    const p95Index = Math.floor(durations.length * 0.95);
    const p95Latency = durations[p95Index] || 0;
    const windowedAverage = durations.reduce((sum, d) => sum + d, 0) / durations.length;

    return {
      windowedQueries: recentQueries.length,
      windowedSlow,
      p95Latency: Math.round(p95Latency * 100) / 100,
      windowedAverage: Math.round(windowedAverage * 100) / 100,
      lifetimeTotal: this.lifetimeTotal,
      lifetimeSlow: this.lifetimeSlow,
      lifetimeAverage:
        this.lifetimeTotal > 0 ? Math.round((this.runningSum / this.lifetimeTotal) * 100) / 100 : 0,
      slowestQuery: this.slowestEver,
      lastRefresh: new Date().toISOString(),
      windowMinutes: 15,
    };
  }
}

const queryTelemetry = new QueryTelemetry();

// Export telemetry accessor
export function getQueryTelemetry() {
  return queryTelemetry.getMetrics();
}

// Instrumented Pool that measures actual query execution time
class InstrumentedPool extends Pool {
  async query(...args: unknown[]): Promise<any> {
    const startTime = Date.now();
    const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text || 'unknown';

    try {
      const result = await super.query(...args);
      const duration = Date.now() - startTime;
      queryTelemetry.recordQuery(sql, duration);
      return result;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      queryTelemetry.recordQuery(sql, duration);
      throw error;
    }
  }
}

// Configure connection pool for optimal performance and scalability
export const pool = new InstrumentedPool({
  connectionString: config.database.url,
  max: config.database.poolSize,
  idleTimeoutMillis: config.database.idleTimeout,
  connectionTimeoutMillis: config.database.connectionTimeout,
});

export const db = drizzle(pool, { schema });
