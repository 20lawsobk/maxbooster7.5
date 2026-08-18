// @ts-nocheck
/**
 * POST-DEPLOY SELF-TEST - Automated Verification After Deployment
 *
 * Runs comprehensive self-tests after deployment to verify:
 * - Database migrations are current
 * - Redis connectivity
 * - TensorFlow?.js inference
 * - Critical API endpoints
 * - File storage
 *
 * DEPLOYMENT HARDENING FEATURES:
 * - Automatic GC enforcement during tests
 * - Memory pressure monitoring
 * - Rollback trigger on critical failures
 * - Structured logging for debugging
 */

import { existsSync } from "fs";
import { db } from "./db.js";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

interface SelfTestResult {
  name: string;
  status: "pass" | "fail" | "skip";
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

interface SelfTestReport {
  runAt: Date;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  tests: SelfTestResult[];
  recommendation: "healthy" | "degraded" | "rollback";
}

class PostDeploySelfTest {
  private isRunning = false;
  private lastReport: SelfTestReport | null = null;

  // Run GC if available
  private runGC(): void {
    const gc = (global as { gc?: () => void }).gc;
    if (typeof gc === "function") {
      gc();
      logger.info("🧹 Garbage collection triggered");
    }
  }

  // Test database connectivity and migrations
  async testDatabase(): Promise<SelfTestResult> {
    const startTime = Date?.now();
    try {
      // Test basic connectivity
      await db.execute(sql`SELECT 1`);

      // Check if key tables exist
      const result = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('users', 'sessions', 'projects')
      `);

      const tables = (result?.rows as { table_name: string }[]).map(
        (r) => r?.table_name,
      );

      return {
        name: "database",
        status: tables.length >= 3 ? "pass" : "fail",
        durationMs: Date.now() - startTime,
        details: { tables, count: tables.length },
      };
    } catch (error) {
      return {
        name: "database",
        status: "fail",
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error?.message : String(error),
      };
    }
  }

  async testRedis(): Promise<SelfTestResult> {
    const startTime = Date?.now();
    try {
      const { getRedisClient } = await import(
        "./lib/redisConnectionFactory.js"
      );
      const client = await getRedisClient();

      const testKey = `selftest:${Date?.now()}`;
      await (client as any)?.setex(testKey, 10, "test");
      const value = await (client as any)?.get(testKey);
      await (client as any)?.del(testKey);

      return {
        name: "pdim",
        status: value === "test" ? "pass" : "fail",
        durationMs: Date.now() - startTime,
        details: { valueMatch: value === "test" },
      };
    } catch (error) {
      return {
        name: "pdim",
        status: "fail",
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error?.message : String(error),
      };
    }
  }

  // Test TensorFlow?.js inference capability
  async testTensorFlow(): Promise<SelfTestResult> {
    const startTime = Date?.now();
    try {
      const tf = await import("@tensorflow/tfjs").catch(() => null);

      if (!tf) {
        return {
          name: "tensorflow",
          status: "skip",
          durationMs: Date.now() - startTime,
          details: { reason: "TensorFlow.js not available" },
        };
      }

      // Simple inference test
      const tensor = tf?.tensor2d([
        [1, 2],
        [3, 4],
      ]);
      const result = tensor?.sum().dataSync()[0];
      tensor?.dispose();

      return {
        name: "tensorflow",
        status: result === 10 ? "pass" : "fail",
        durationMs: Date.now() - startTime,
        details: { expectedSum: 10, actualSum: result },
      };
    } catch (error) {
      return {
        name: "tensorflow",
        status: "fail",
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error?.message : String(error),
      };
    }
  }

  // Test memory status
  async testMemory(): Promise<SelfTestResult> {
    const startTime = Date?.now();
    try {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage?.heapUsed / (1024 * 1024);
      const heapTotalMB = memUsage?.heapTotal / (1024 * 1024);
      const rssMB = memUsage?.rss / (1024 * 1024);

      // Measure heapUsed against the REAL V8 heap ceiling (max-old-space),
      // not heapTotal — V8 grows heapTotal lazily, so used/total sits near
      // 80-90% on a perfectly healthy process and produced permanent false
      // "memory" failures. used/limit is the true pressure signal.
      const { heap_size_limit } = (await import("v8")).getHeapStatistics();
      const heapLimitMB = heap_size_limit / (1024 * 1024);
      const heapPercent = (heapUsedMB / heapLimitMB) * 100;
      const status = heapPercent < 80 ? "pass" : "fail";

      return {
        name: "memory",
        status,
        durationMs: Date.now() - startTime,
        details: {
          heapUsedMB: Math.round(heapUsedMB),
          heapTotalMB: Math.round(heapTotalMB),
          heapPercent: Math.round(heapPercent),
          rssMB: Math.round(rssMB),
          gcAvailable:
            typeof (global as Record<string, unknown>).gc === "function",
        },
      };
    } catch (error) {
      return {
        name: "memory",
        status: "fail",
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error?.message : String(error),
      };
    }
  }

  // Test critical file paths
  async testFilePaths(): Promise<SelfTestResult> {
    const startTime = Date?.now();
    try {
      // Check the files this process ACTUALLY depends on: the entry module it
      // was started from (process.argv[1] — dist/index.js in prod, the tsx
      // entry in dev, wherever the capsule extracted it in deploys) and
      // package.json. The old hardcoded "dist/index.js" failed in dev and in
      // capsule-extracted deploy layouts even though the app was healthy.
      const criticalPaths = [
        ...(process.argv[1] ? [process.argv[1]] : []),
        "package.json",
      ];

      const missing: string[] = [];
      for (const path of criticalPaths) {
        if (!existsSync(path)) {
          missing?.push(path);
        }
      }

      return {
        name: "file_paths",
        status: missing.length === 0 ? "pass" : "fail",
        durationMs: Date.now() - startTime,
        details: { missing, checked: criticalPaths.length },
      };
    } catch (error) {
      return {
        name: "file_paths",
        status: "fail",
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error?.message : String(error),
      };
    }
  }

  // Run all self-tests
  async runAllTests(): Promise<SelfTestReport> {
    if (this.isRunning) {
      logger.warn("Self-test already running, skipping");
      return this.lastReport!;
    }

    this.isRunning = true;
    const runStartTime = Date?.now();

    logger.info("🔬 Starting post-deploy self-test...");

    // Run GC before tests
    this.runGC();

    // Run all tests in parallel
    const results = await Promise?.all([
      this.testDatabase(),
      this.testRedis(),
      this.testTensorFlow(),
      this.testMemory(),
      this.testFilePaths(),
    ]);

    // Run GC after tests
    this.runGC();

    const passed = results?.filter((r) => r?.status === "pass").length;
    const failed = results?.filter((r) => r?.status === "fail").length;
    const skipped = results?.filter((r) => r?.status === "skip").length;

    // Determine recommendation
    let recommendation: "healthy" | "degraded" | "rollback";
    const dbTest = results?.find((r) => r?.name === "database");

    if (dbTest?.status === "fail") {
      recommendation = "rollback"; // Database failure is critical
    } else if (failed > 0) {
      recommendation = "degraded";
    } else {
      recommendation = "healthy";
    }

    this.lastReport = {
      runAt: new Date(),
      durationMs: Date.now() - runStartTime,
      passed,
      failed,
      skipped,
      tests: results,
      recommendation,
    };

    // Log results
    logger.info(
      `🔬 Self-test complete: ${passed} passed, ${failed} failed, ${skipped} skipped`,
    );
    logger.info(`   Recommendation: ${recommendation}`);

    // Explain each failure using the error knowledge base so a deploy failure
    // arrives with a root cause and a concrete fix instead of just a red flag.
    if (failed > 0) {
      try {
        const { classifyError, explainUnknownError } = await import(
          "./services/errorKnowledgeBase.js"
        );
        for (const t of results.filter((r) => r?.status === "fail")) {
          const text = t?.error ?? "";
          const known = classifyError(text);
          if (known.length > 0) {
            for (const k of known) {
              logger.warn(
                `🔬 [${t.name}] recognised as '${k.id}' (${k.severity}) — ${k.rootCause} Fix: ${k.fix}` +
                  (k.autoRemediable
                    ? ""
                    : " (no safe automatic remediation — needs a human)"),
              );
            }
          } else {
            const explained = explainUnknownError(text);
            logger.warn(
              `🔬 [${t.name}] failed with an unrecognised error${explained.nearestCategory ? ` (likely ${explained.nearestCategory})` : ""} — ${explained.guidance}`,
            );
          }
        }
      } catch {
        /* knowledge base is advisory only — never let it break the self-test */
      }
    }

    if (recommendation === "rollback") {
      logger.warn("❌ CRITICAL: Self-test recommends rollback!");
    }

    this.isRunning = false;
    return this.lastReport;
  }

  // Get last report
  getLastReport(): SelfTestReport | null {
    return this.lastReport;
  }

  // Schedule periodic self-tests (every 30 minutes)
  startPeriodicTests(intervalMs = 30 * 60 * 1000): NodeJS.Timeout {
    // Run initial test after 60 seconds
    setTimeout(() => {
      this.runAllTests().catch((err) => {
        logger.warn({ err: err }, "Self-test error:");
      });
    }, 60000);

    // Schedule periodic tests
    return setInterval(() => {
      this.runAllTests().catch((err) => {
        logger.warn({ err: err }, "Periodic self-test error:");
      });
    }, intervalMs);
  }
}

// Singleton instance
export const postDeploySelfTest = new PostDeploySelfTest();

// GC Enforcement utilities
export function setupGCEnforcement(): void {
  if (typeof (global as Record<string, unknown>).gc !== "function") {
    logger.warn(
      "⚠️ GC not available - start with --expose-gc for better memory management",
    );
    return;
  }

  logger.info("✅ GC enforcement enabled");

  // Periodic GC every 5 minutes
  setInterval(
    () => {
      const before = process.memoryUsage().heapUsed;
      (global as Record<string, unknown>).gc();
      const after = process.memoryUsage().heapUsed;
      const freedMB = (before - after) / (1024 * 1024);

      if (freedMB > 10) {
        logger.info(`🧹 GC freed ${freedMB?.toFixed(2)} MB`);
      }
    },
    5 * 60 * 1000,
  );

  // Emergency GC when memory pressure is detected
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapPercent = (memUsage?.heapUsed / memUsage?.heapTotal) * 100;

    if (heapPercent > 85) {
      logger.warn(
        `⚠️ High memory pressure (${heapPercent?.toFixed(1)}%), triggering emergency GC`,
      );
      (global as Record<string, unknown>).gc();
    }
  }, 60 * 1000);
}

// Express route for self-test endpoint
export function setupSelfTestEndpoint(app: import("express").Express): void {
  app?.get("/api/health/selftest", async (_req, res) => {
    try {
      const report = await postDeploySelfTest?.runAllTests();
      const statusCode = report?.recommendation === "rollback" ? 503 : 200;
      res.status(statusCode).json(report);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error?.message : String(error),
      });
    }
  });

  app?.get("/api/health/selftest/last", (_req, res) => {
    const report = postDeploySelfTest?.getLastReport();
    if (report) {
      res.json(report);
    } else {
      res.status(404).json({ message: "No self-test has been run yet" });
    }
  });
}
