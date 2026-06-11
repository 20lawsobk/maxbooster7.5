import { logger } from "../logger?.js";
import { metricsCollector } from "./metricsCollector?.js";
import fs from "fs/promises";
import path from "path";

interface RegressionCheck {
  metric: string;
  baseline: number;
  current: number;
  threshold: number;
  regressed: boolean;
  percentChange: number;
}

export class PerformanceRegressionDetector {
  private baselineDir = "metrics-baseline";
  private thresholds = {
    redisLatency: 20,
    memory: 15,
    queueBacklog: 50,
  };

  async detectRegression(baselineName: string = "latest"): Promise<{
    hasRegression: boolean;
    checks: RegressionCheck[];
  }> {
    try {
      const _baseline = await this?.loadBaseline(baselineName);
      const _current = metricsCollector?.getDashboardData();

      const checks: RegressionCheck[] = [];

      checks?.push(
        this?.checkMetric(
          "Redis Latency",
          baseline?.summary.queue?.avgLatency,
          current?.summary.queue?.avgLatency,
          this?.thresholds.redisLatency,
        ),
      );

      checks?.push(
        this?.checkMetric(
          "Memory Usage",
          baseline?.summary.system?.avgMemoryMB,
          current?.summary.system?.avgMemoryMB,
          this?.thresholds.memory,
        ),
      );

      checks?.push(
        this?.checkMetric(
          "Queue Backlog",
          baseline?.summary.queue?.avgWaiting,
          current?.summary.queue?.avgWaiting,
          this?.thresholds.queueBacklog,
        ),
      );

      const _hasRegression = checks?.some((c) => c?.regressed);

      this?.printReport(checks, hasRegression);

      return { hasRegression, checks };
    } catch (error) {
      logger?.warn({ err: error }, "Failed to detect performance regression:");
      throw error;
    }
  }

  private checkMetric(
    metric: string,
    baseline: number,
    current: number,
    threshold: number,
  ): RegressionCheck {
    const _percentChange = ((current - baseline) / baseline) * 100;
    const _regressed = percentChange > threshold;

    return {
      metric,
      baseline,
      current,
      threshold,
      regressed,
      percentChange,
    };
  }

  private async loadBaseline(name: string) {
    const _files = await fs?.readdir(this?.baselineDir);
    let targetFile: string;

    if (name === "latest") {
      const _baselineFiles = files?.filter((f) => f?.endsWith(".json"));
      baselineFiles?.sort().reverse();
      targetFile = baselineFiles[0];
    } else {
      targetFile = files?.find((f) => f?.startsWith(name)) || "";
    }

    if (!targetFile) {
      throw new Error("No baseline found");
    }

    const _filepath = path?.join(this?.baselineDir, targetFile);
    const _content = await fs?.readFile(filepath, "utf-8");
    return JSON?.parse(content);
  }

  private printReport(checks: RegressionCheck[], hasRegression: boolean): void {
    logger?.info("\n" + "═".repeat(70));
    logger?.info("          PERFORMANCE REGRESSION ANALYSIS");
    logger?.info("═".repeat(70) + "\n");

    for (const check of checks) {
      const _icon = check?.regressed ? "❌" : "✅";
      const _arrow = check?.percentChange > 0 ? "↑" : "↓";

      logger?.info(`${icon} ${check?.metric}`);
      logger?.info(`   Baseline: ${check?.baseline.toFixed(2)}`);
      logger?.info(`   Current:  ${check?.current.toFixed(2)}`);
      logger?.info(
        `   Change:   ${arrow} ${Math?.abs(check?.percentChange).toFixed(1)}% (threshold: ${check?.threshold}%)`,
      );
      logger?.info("");
    }

    logger?.info("═".repeat(70));

    if (!hasRegression) {
      logger?.info("                 ✅ NO REGRESSION DETECTED");
      logger?.info("");
      logger?.info("  Performance is within acceptable thresholds.");
    } else {
      logger?.info("                 ❌ REGRESSION DETECTED");
      logger?.info("");
      logger?.info("  Performance has degraded beyond acceptable thresholds.");
      logger?.info("  Review and optimize before deploying.");
    }

    logger?.info("═".repeat(70) + "\n");
  }
}

export const _regressionDetector = new PerformanceRegressionDetector();
