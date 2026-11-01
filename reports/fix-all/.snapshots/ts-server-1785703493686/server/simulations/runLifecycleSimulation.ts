#!/usr/bin/env tsx
/**
 * Max Booster Full Lifecycle Simulation Runner
 *
 * Tests all platform systems across time periods from 1 month to 50 years
 * at 98% accelerated speed with real-time tracking.
 *
 * Usage:
 *   npm run simulate:lifecycle        - Run full 50-year lifecycle simulation
 *   npm run simulate:quick            - Run quick 1-month test
 *   npm run simulate:period [period]  - Run specific period
 *
 * Available periods:
 *   1_month, 3_months, 6_months, 1_year, 3_years, 6_years,
 *   10_years, 14_years, 18_years, 22_years, 26_years, 30_years,
 *   34_years, 38_years, 42_years, 46_years, 50_years
 */

import {
  RealLifeSimulationEngine,
  SIMULATION_PERIODS,
  runFullLifecycleSimulation,
} from "./realLifeSimulation";
import { logger } from "../logger.js";
import fs from "fs";
import path from "path";

async function runQuickSimulation() {
  logger.info("\n");
  logger.info(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  logger.info(
    "║         MAX BOOSTER QUICK SIMULATION (1 Month)               ║",
  );
  logger.info(
    "╚══════════════════════════════════════════════════════════════╝\n",
  );

  const simulation = new RealLifeSimulationEngine({
    periodName: "1_month",
    daysToSimulate: 30,
    initialUsers: 100,
    initialReleases: 50,
    seedMoney: 10000,
    snapshotIntervalDays: 1,
  });

  const result = await simulation?.runSimulation();

  // Save results
  const reportPath = path?.join(process.cwd(), "SIMULATION_QUICK_RESULTS.md");
  fs?.writeFileSync(reportPath, generateReport(result));
  logger.info(`\n📝 Report saved to: ${reportPath}\n`);

  return result?.systemTests.failed === 0;
}

async function runPeriodSimulation(periodName: string) {
  if (!SIMULATION_PERIODS[periodName as keyof typeof SIMULATION_PERIODS]) {
    logger.warn(`Invalid period: ${periodName}`);
    logger.warn(`Valid periods: ${Object.keys(SIMULATION_PERIODS).join(", ")}`);
    process.exit(1);
  }

  logger.info("\n");
  logger.info(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  logger.info(`║         MAX BOOSTER SIMULATION: ${periodName?.padEnd(25)}║`);
  logger.info(
    "╚══════════════════════════════════════════════════════════════╝\n",
  );

  const days =
    SIMULATION_PERIODS[periodName as keyof typeof SIMULATION_PERIODS];

  const simulation = new RealLifeSimulationEngine({
    periodName: periodName as keyof typeof SIMULATION_PERIODS,
    daysToSimulate: days,
    initialUsers: 100 + Math.floor(days / 30) * 10,
    initialReleases: 50 + Math.floor(days / 30) * 5,
    seedMoney: 10000 + days * 100,
    snapshotIntervalDays: Math.max(1, Math.floor(days / 30)),
  });

  const result = await simulation?.runSimulation();

  // Save results
  const reportPath = path?.join(
    process.cwd(),
    `SIMULATION_${periodName?.toUpperCase()}_RESULTS.md`,
  );
  fs?.writeFileSync(reportPath, generateReport(result));
  logger.info(`\n📝 Report saved to: ${reportPath}\n`);

  return result?.systemTests.failed === 0;
}

async function runFullSimulation() {
  const results = await runFullLifecycleSimulation();

  // Generate comprehensive report
  const reportPath = path?.join(
    process.cwd(),
    "SIMULATION_FULL_LIFECYCLE_RESULTS.md",
  );
  fs?.writeFileSync(reportPath, generateFullReport(results));
  logger.info(`\n📝 Full lifecycle report saved to: ${reportPath}\n`);

  const allPassed = Object.values(results).every(
    (r) => r?.systemTests.failed === 0,
  );
  return allPassed;
}

function generateReport(result: Record<string, unknown>): string {
  const { config, finalMetrics, kpis, systemTests, recommendations } = result;

  const testStatus =
    (systemTests as any)?.failed === 0
      ? "✅ ALL TESTS PASSED"
      : (systemTests as any)?.criticalIssues.length > 0
        ? "❌ CRITICAL ISSUES FOUND"
        : "⚠️ WARNINGS DETECTED";

  return `# Max Booster Simulation Report

## Executive Summary

**Period:** ${(config as any)?.periodName} (${(config as any)?.daysToSimulate} simulated days)
**Status:** ${testStatus}
**Generated:** ${new Date().toISOString()}
**Acceleration:** 98% (real time: ${(result?.realDuration / 1000 / 60).toFixed(1)} minutes)

---

## Test Results

| Metric | Passed | Failed | Warnings |
|--------|--------|--------|----------|
| System Tests | ${(systemTests as any)?.passed} | ${(systemTests as any)?.failed} | ${(systemTests as any)?.warnings} |

${
  (systemTests as any)?.criticalIssues.length > 0
    ? `
### Critical Issues
${(systemTests as any)?.criticalIssues.map((issue: string) => `- ❌ ${issue}`).join("\n")}
`
    : ""
}

---

## Key Performance Indicators

| KPI | Value | Status |
|-----|-------|--------|
| User Growth Rate | ${(kpis as any)?.userGrowthRate.toFixed(1)}% | ${(kpis as any)?.userGrowthRate > 0 ? "✅" : "❌"} |
| Revenue Growth Rate | ${(kpis as any)?.revenueGrowthRate.toFixed(1)}% | ${(kpis as any)?.revenueGrowthRate > 0 ? "✅" : "❌"} |
| Churn Rate | ${(kpis as any)?.churnRate.toFixed(2)}% | ${(kpis as any)?.churnRate < 5 ? "✅" : (kpis as any)?.churnRate < 10 ? "⚠️" : "❌"} |
| LTV | $${(kpis as any)?.ltv.toFixed(2)} | ${(kpis as any)?.ltv > 100 ? "✅" : "⚠️"} |
| LTV/CAC Ratio | ${((kpis as any)?.ltv / (kpis as any)?.cac).toFixed(2)} | ${(kpis as any)?.ltv / (kpis as any)?.cac > 3 ? "✅" : (kpis as any)?.ltv / (kpis as any)?.cac > 1 ? "⚠️" : "❌"} |
| Viral Coefficient | ${(kpis as any)?.viralCoefficient.toFixed(2)} | ${(kpis as any)?.viralCoefficient > 0.5 ? "✅" : "⚠️"} |
| NPS Score | ${(kpis as any)?.nps.toFixed(0)} | ${(kpis as any)?.nps > 50 ? "✅" : (kpis as any)?.nps > 0 ? "⚠️" : "❌"} |
| System Uptime | ${(kpis as any)?.systemUptime.toFixed(2)}% | ${(kpis as any)?.systemUptime > 99.9 ? "✅" : (kpis as any)?.systemUptime > 99 ? "⚠️" : "❌"} |
| Autonomous Efficiency | ${(kpis as any)?.autonomousEfficiency.toFixed(1)}% | ${(kpis as any)?.autonomousEfficiency > 90 ? "✅" : "⚠️"} |

---

## Final Metrics

### Users
- **Total Users:** ${(finalMetrics as any)?.users.total?.toLocaleString()}
- **Active Users:** ${(finalMetrics as any)?.users.active?.toLocaleString()}
- **Free:** ${(finalMetrics as any)?.users.byTier?.free} | **Basic:** ${(finalMetrics as any)?.users.byTier?.basic} | **Pro:** ${(finalMetrics as any)?.users.byTier?.pro} | **Enterprise:** ${(finalMetrics as any)?.users.byTier?.enterprise}

### Revenue
- **MRR:** $${(finalMetrics as any)?.revenue.mrr?.toFixed(2)}
- **ARR:** $${(finalMetrics as any)?.revenue.arr?.toFixed(2)}
- **Lifetime Revenue:** $${(finalMetrics as any)?.revenue.lifetime?.toFixed(2)}

### Content & Streams
- **Total Streams:** ${(finalMetrics as any)?.streams.total?.toLocaleString()}
- **Viral Releases:** ${(finalMetrics as any)?.streams.viralReleases}
- **Avg Streams/Release:** ${(finalMetrics as any)?.streams.avgPerRelease?.toFixed(0)}

### Platform Health
- **Uptime:** ${(finalMetrics as any)?.platform.uptime?.toFixed(2)}%
- **Response Time:** ${(finalMetrics as any)?.platform.responseTime}ms
- **Error Rate:** ${((finalMetrics as any)?.platform.errorRate * 100).toFixed(3)}%

### Autonomous Systems Performance
- **Posts Auto-Published:** ${(finalMetrics as any)?.autonomous.postsAutoPublished?.toLocaleString()}
- **Campaigns Auto-Launched:** ${(finalMetrics as any)?.autonomous.campaignsAutoLaunched?.toLocaleString()}
- **Releases Auto-Distributed:** ${(finalMetrics as any)?.autonomous.releasesAutoDistributed?.toLocaleString()}
- **AI Decisions Made:** ${(finalMetrics as any)?.autonomous.decisionsAutoMade?.toLocaleString()}
- **Human Interventions Required:** ${(finalMetrics as any)?.autonomous.interventionsRequired}

---

## Recommendations

${(recommendations as any)?.map((rec: string, i: number) => `${i + 1}. ${rec}`).join("\n")}

---

## Verdict

${
  testStatus === "✅ ALL TESTS PASSED"
    ? "**The simulation completed successfully.** All systems are operating within expected parameters. Max Booster is ready for launch."
    : testStatus === "⚠️ WARNINGS DETECTED"
      ? "**The simulation completed with warnings.** Review the recommendations above and address any concerns before launch."
      : "**Critical issues detected.** These must be resolved before the platform can be safely launched."
}

---

*Report generated by Max Booster Real-Life Simulation Engine*
*98% Time Acceleration | Real-Time Tracking Enabled*
`;
}

function generateFullReport(results: Record<string, any>): string {
  const periods = Object.entries(results);
  const allPassed = periods?.every(([_, r]) => r?.systemTests?.failed === 0);

  let report = `# Max Booster Full Lifecycle Simulation Report

## Executive Summary

**Periods Tested:** ${periods?.length}
**Time Range:** 1 Month to 50 Years
**Acceleration:** 98%
**Status:** ${allPassed ? "✅ ALL PERIODS PASSED" : "⚠️ SOME ISSUES DETECTED"}
**Generated:** ${new Date().toISOString()}

---

## Period Results Summary

| Period | Duration | Final Users | Final MRR | Uptime | Tests Passed | Tests Failed |
|--------|----------|-------------|-----------|--------|--------------|--------------|
`;

  for (const [period, result] of periods) {
    if (result?.error) {
      report += `| ${period} | - | ERROR | - | - | - | - |\n`;
      continue;
    }

    report += `| ${period} | ${result?.config.daysToSimulate}d | ${result?.finalMetrics.users?.total.toLocaleString()} | $${result?.finalMetrics.revenue?.mrr.toFixed(2)} | ${result?.finalMetrics.platform?.uptime.toFixed(2)}% | ${result?.systemTests.passed} | ${result?.systemTests.failed} |\n`;
  }

  report += `
---

## Growth Trajectory

`;

  const snapshots: {
    period: string;
    users: number;
    mrr: number;
    streams: number;
  }[] = [];

  for (const [period, result] of periods) {
    if (!result?.error && result?.finalMetrics) {
      snapshots?.push({
        period,
        users: result.finalMetrics.users?.total,
        mrr: result.finalMetrics.revenue?.mrr,
        streams: result.finalMetrics.streams?.total,
      });
    }
  }

  report += `### User Growth Over Time
`;
  for (const s of snapshots) {
    const bars = "█".repeat(Math.min(50, Math.floor(s?.users / 100)));
    report += `${s?.period.padEnd(12)} | ${bars} ${s?.users.toLocaleString()}\n`;
  }

  report += `
### Revenue Growth Over Time
`;
  const maxMRR = Math.max(...snapshots?.map((s) => s?.mrr));
  for (const s of snapshots) {
    const bars = "█".repeat(Math.min(50, Math.floor((s?.mrr / maxMRR) * 50)));
    report += `${s?.period.padEnd(12)} | ${bars} $${s?.mrr.toFixed(2)}\n`;
  }

  report += `
---

## Critical Issues Across All Periods

`;

  const allIssues = new Set<string>();
  for (const [period, result] of periods) {
    if (result?.systemTests?.criticalIssues) {
      for (const issue of result?.systemTests.criticalIssues) {
        allIssues?.add(`[${period}] ${issue}`);
      }
    }
  }

  if (allIssues?.size === 0) {
    report += `✅ No critical issues detected across any simulation period.\n`;
  } else {
    for (const issue of allIssues) {
      report += `- ❌ ${issue}\n`;
    }
  }

  report += `
---

## Recommendations

Based on the full lifecycle simulation:

`;

  const recommendations = new Set<string>();
  for (const [_, result] of periods) {
    if (result?.recommendations) {
      for (const rec of result?.recommendations) {
        recommendations?.add(rec);
      }
    }
  }

  let i = 1;
  for (const rec of recommendations) {
    report += `${i}. ${rec}\n`;
    i++;
  }

  report += `
---

## Final Verdict

${
  allPassed
    ? `
✅ **LAUNCH APPROVED**

All simulation periods from 1 month to 50 years completed successfully without critical failures.
The platform has demonstrated:
- Sustainable user growth
- Healthy revenue metrics
- High system reliability
- Effective autonomous operations
- Adaptability to market changes

Max Booster is ready for production deployment.
`
    : `
⚠️ **LAUNCH PENDING**

Some simulation periods detected issues that should be reviewed before launch.
Please address the critical issues and recommendations listed above.

Consider running targeted simulations after fixes to verify improvements.
`
}

---

*Full Lifecycle Report generated by Max Booster Simulation Engine*
*Testing Period: 1 Month to 50 Years | 98% Time Acceleration*
`;

  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "quick";

  let success = false;

  try {
    switch (command) {
      case "quick":
      case "fast":
        success = await runQuickSimulation();
        break;

      case "full":
      case "lifecycle":
      case "all":
        success = await runFullSimulation();
        break;

      case "period":
        const period = args[1];
        if (!period) {
          logger.warn(
            "Please specify a period. Example: npm run simulate:period 1_year",
          );
          logger.warn(
            `Available periods: ${Object.keys(SIMULATION_PERIODS).join(", ")}`,
          );
          process.exit(1);
        }
        success = await runPeriodSimulation(period);
        break;

      default:
        if (SIMULATION_PERIODS[command as keyof typeof SIMULATION_PERIODS]) {
          success = await runPeriodSimulation(command);
        } else {
          logger.warn(`Unknown command: ${command}`);
          logger.warn("Usage:");
          logger.warn("  quick     - Run 1-month simulation");
          logger.warn("  full      - Run full 50-year lifecycle");
          logger.warn(
            "  period X  - Run specific period (1_month, 1_year, etc.)",
          );
          process.exit(1);
        }
    }
  } catch (error) {
    logger.warn({ err: error }, "Simulation failed:");
    process.exit(1);
  }

  process.exit(success ? 0 : 1);
}

main();
