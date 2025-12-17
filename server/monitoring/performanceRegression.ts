import { logger } from '../logger.js';
import { metricsCollector } from './metricsCollector.js';
import fs from 'fs/promises';
import path from 'path';

interface RegressionCheck {
  metric: string;
  baseline: number;
  current: number;
  threshold: number;
  regressed: boolean;
  percentChange: number;
}

export class PerformanceRegressionDetector {
  private baselineDir = 'metrics-baseline';
  private thresholds = {
    redisLatency: 20,
    memory: 15,
    queueBacklog: 50,
  };

  async detectRegression(baselineName: string = 'latest'): Promise<{
    hasRegression: boolean;
    checks: RegressionCheck[];
  }> {
    try {
      const baseline = await this.loadBaseline(baselineName);
      const current = metricsCollector.getDashboardData();

      const checks: RegressionCheck[] = [];

      checks.push(this.checkMetric(
        'Redis Latency',
        baseline.summary.queue.avgLatency,
        current.summary.queue.avgLatency,
        this.thresholds.redisLatency
      ));

      checks.push(this.checkMetric(
        'Memory Usage',
        baseline.summary.system.avgMemoryMB,
        current.summary.system.avgMemoryMB,
        this.thresholds.memory
      ));

      checks.push(this.checkMetric(
        'Queue Backlog',
        baseline.summary.queue.avgWaiting,
        current.summary.queue.avgWaiting,
        this.thresholds.queueBacklog
      ));

      const hasRegression = checks.some(c => c.regressed);

      this.printReport(checks, hasRegression);

      return { hasRegression, checks };
    } catch (error) {
      logger.error('Failed to detect performance regression:', error);
      throw error;
    }
  }

  private checkMetric(
    metric: string,
    baseline: number,
    current: number,
    threshold: number
  ): RegressionCheck {
    const percentChange = ((current - baseline) / baseline) * 100;
    const regressed = percentChange > threshold;

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
    const files = await fs.readdir(this.baselineDir);
    let targetFile: string;

    if (name === 'latest') {
      const baselineFiles = files.filter(f => f.endsWith('.json'));
      baselineFiles.sort().reverse();
      targetFile = baselineFiles[0];
    } else {
      targetFile = files.find(f => f.startsWith(name)) || '';
    }

    if (!targetFile) {
      throw new Error('No baseline found');
    }

    const filepath = path.join(this.baselineDir, targetFile);
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content);
  }

  private printReport(checks: RegressionCheck[], hasRegression: boolean): void {
    console.log('\n' + '═'.repeat(70));
    console.log('          PERFORMANCE REGRESSION ANALYSIS');
    console.log('═'.repeat(70) + '\n');

    for (const check of checks) {
      const icon = check.regressed ? '❌' : '✅';
      const arrow = check.percentChange > 0 ? '↑' : '↓';

      console.log(`${icon} ${check.metric}`);
      console.log(`   Baseline: ${check.baseline.toFixed(2)}`);
      console.log(`   Current:  ${check.current.toFixed(2)}`);
      console.log(`   Change:   ${arrow} ${Math.abs(check.percentChange).toFixed(1)}% (threshold: ${check.threshold}%)`);
      console.log('');
    }

    console.log('═'.repeat(70));

    if (!hasRegression) {
      console.log('                 ✅ NO REGRESSION DETECTED');
      console.log('');
      console.log('  Performance is within acceptable thresholds.');
    } else {
      console.log('                 ❌ REGRESSION DETECTED');
      console.log('');
      console.log('  Performance has degraded beyond acceptable thresholds.');
      console.log('  Review and optimize before deploying.');
    }

    console.log('═'.repeat(70) + '\n');
  }
}

export const regressionDetector = new PerformanceRegressionDetector();
