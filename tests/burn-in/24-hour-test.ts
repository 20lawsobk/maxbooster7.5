import { logger } from '../../server/logger.js';
import { FeatureValidators } from './feature-validators.js';

interface FeatureValidationSnapshot {
  timestamp: Date;
  totalTests: number;
  passed: number;
  failed: number;
  successRate: number;
  failedTests: Array<{ category: string; testName: string; error?: string }>;
}

interface BurnInMetrics {
  startTime: Date;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  queueHealthChecks: number;
  aiModelChecks: number;
  systemHealthChecks: number;
  featureValidations: number;
  errors: Array<{ timestamp: Date; error: string }>;
  memorySnapshots: Array<{ timestamp: Date; heapUsed: number; rss: number }>;
  queueMetrics: Array<{ timestamp: Date; redisLatency: number; waiting: number; failed: number }>;
  featureValidationSnapshots: FeatureValidationSnapshot[];
}

class BurnInTest {
  private metrics: BurnInMetrics;
  private isRunning = false;
  private baseUrl = 'http://localhost:5000';
  private intervalMinutes = 0.625;
  private featureValidationIntervalMinutes = 15;
  private featureValidators: FeatureValidators;
  private cycleCount = 0;

  constructor() {
    this.metrics = {
      startTime: new Date(),
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      queueHealthChecks: 0,
      aiModelChecks: 0,
      systemHealthChecks: 0,
      featureValidations: 0,
      errors: [],
      memorySnapshots: [],
      queueMetrics: [],
      featureValidationSnapshots: [],
    };
    this.featureValidators = new FeatureValidators();
  }

  /**
   * Wait for the server to be ready before starting tests
   * Retries with exponential backoff up to 30 seconds
   */
  async waitForServer(maxWaitMs = 30000): Promise<void> {
    const startTime = Date.now();
    let attempt = 0;
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await fetch(`${this.baseUrl}/api/monitoring/system-health`);
        if (response.ok) {
          return; // Server is ready
        }
      } catch (error) {
        // Server not ready yet
      }
      
      attempt++;
      const delay = Math.min(1000 * Math.pow(1.5, attempt), 5000); // Exponential backoff, max 5s
      logger.info(`⏳ Server not ready, retrying in ${Math.round(delay)}ms (attempt ${attempt})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    logger.warn('⚠️ Server may not be fully ready, proceeding with tests anyway');
  }

  async makeRequest(url: string, description: string, retries = 3): Promise<boolean> {
    this.metrics.totalRequests++;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url);
        
        if (response.status === 429) {
          if (attempt < retries) {
            const retryAfter = response.headers.get('retry-after');
            const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
            logger.warn(`⏳ Rate limited on ${description}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
            continue;
          }
          throw new Error(`HTTP 429 (Rate Limited after ${retries} retries)`);
        }
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        this.metrics.successfulRequests++;
        logger.info(`✅ Burn-in test: ${description} - OK`);
        return true;
      } catch (error) {
        if (attempt === retries) {
          this.metrics.failedRequests++;
          const errorMsg = `${description}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          this.metrics.errors.push({ timestamp: new Date(), error: errorMsg });
          logger.error(`❌ Burn-in test: ${errorMsg}`);
          return false;
        }
      }
    }
    
    return false;
  }

  async checkQueueHealth(): Promise<void> {
    this.metrics.queueHealthChecks++;
    const success = await this.makeRequest(
      `${this.baseUrl}/api/monitoring/queue-health`,
      'Queue Health Check'
    );

    if (success) {
      try {
        const response = await fetch(`${this.baseUrl}/api/monitoring/queue-metrics`);
        const data = await response.json();
        if (data.metrics && data.metrics.length > 0) {
          const queueData = data.metrics[0];
          this.metrics.queueMetrics.push({
            timestamp: new Date(),
            redisLatency: queueData.redisLatency || 0,
            waiting: queueData.waiting || 0,
            failed: queueData.failed || 0,
          });
          
          if (this.metrics.queueMetrics.length > 150) {
            this.metrics.queueMetrics = this.metrics.queueMetrics.slice(-150);
          }
        }
      } catch (error) {
        logger.warn('Failed to capture queue metrics detail');
      }
    }
  }

  async checkAIModels(): Promise<void> {
    this.metrics.aiModelChecks++;
    await this.makeRequest(
      `${this.baseUrl}/api/monitoring/ai-models`,
      'AI Model Telemetry Check'
    );
  }

  async checkSystemHealth(): Promise<void> {
    this.metrics.systemHealthChecks++;
    await this.makeRequest(
      `${this.baseUrl}/api/monitoring/system-health`,
      'System Health Check'
    );
  }

  captureMemorySnapshot(): void {
    const memUsage = process.memoryUsage();
    this.metrics.memorySnapshots.push({
      timestamp: new Date(),
      heapUsed: memUsage.heapUsed,
      rss: memUsage.rss,
    });
    
    if (this.metrics.memorySnapshots.length > 150) {
      this.metrics.memorySnapshots = this.metrics.memorySnapshots.slice(-150);
    }
  }

  limitArraySizes(): void {
    if (this.metrics.errors.length > 50) {
      this.metrics.errors = this.metrics.errors.slice(-50);
    }
    if (this.metrics.queueMetrics.length > 150) {
      this.metrics.queueMetrics = this.metrics.queueMetrics.slice(-150);
    }
    if (this.metrics.memorySnapshots.length > 150) {
      this.metrics.memorySnapshots = this.metrics.memorySnapshots.slice(-150);
    }
    if (this.metrics.featureValidationSnapshots.length > 10) {
      this.metrics.featureValidationSnapshots = this.metrics.featureValidationSnapshots.slice(-10);
    }
  }

  async runFeatureValidation(): Promise<void> {
    this.metrics.featureValidations++;
    logger.info('🔍 Running comprehensive feature validation...');

    try {
      const validationResults = await this.featureValidators.validateAllFeatures();

      const failedTests = validationResults.results
        .filter((r) => !r.passed)
        .map((r) => ({
          category: r.category,
          testName: r.testName,
          error: r.error,
        }));

      this.metrics.featureValidationSnapshots.push({
        timestamp: new Date(),
        totalTests: validationResults.totalTests,
        passed: validationResults.passed,
        failed: validationResults.failed,
        successRate: validationResults.successRate,
        failedTests,
      });

      if (validationResults.successRate >= 95) {
        logger.info(
          `✅ Feature validation passed: ${validationResults.passed}/${validationResults.totalTests} tests (${validationResults.successRate.toFixed(1)}%)`
        );
      } else {
        logger.warn(
          `⚠️ Feature validation completed with issues: ${validationResults.failed} failures`
        );
        failedTests.forEach((test) => {
          logger.warn(`   - ${test.category}: ${test.testName} - ${test.error}`);
        });
      }
    } catch (error) {
      logger.error('❌ Feature validation failed:', error);
      this.metrics.errors.push({
        timestamp: new Date(),
        error: `Feature validation error: ${error instanceof Error ? error.message : 'Unknown'}`,
      });
    }
  }

  async runHealthCheckCycle(): Promise<void> {
    this.cycleCount++;
    logger.info(`🔄 Running burn-in test cycle #${this.cycleCount}...`);
    
    await Promise.all([
      this.checkQueueHealth(),
      this.checkAIModels(),
      this.checkSystemHealth(),
    ]);

    this.captureMemorySnapshot();
    this.limitArraySizes();

    const cyclesPerFeatureValidation = this.featureValidationIntervalMinutes / this.intervalMinutes;
    if (this.cycleCount % cyclesPerFeatureValidation === 0) {
      await this.runFeatureValidation();
    }

    this.printCurrentStatus();
  }

  printCurrentStatus(): void {
    const runtime = (Date.now() - this.metrics.startTime.getTime()) / 1000 / 60 / 60;
    const successRate = this.metrics.totalRequests > 0
      ? ((this.metrics.successfulRequests / this.metrics.totalRequests) * 100).toFixed(2)
      : '0';

    const latestMemory = this.metrics.memorySnapshots[this.metrics.memorySnapshots.length - 1];
    const memoryMB = latestMemory ? (latestMemory.heapUsed / 1024 / 1024).toFixed(2) : '0';

    const latestFeatureValidation = this.metrics.featureValidationSnapshots[
      this.metrics.featureValidationSnapshots.length - 1
    ];
    const featureStatus = latestFeatureValidation
      ? `${latestFeatureValidation.passed}/${latestFeatureValidation.totalTests} (${latestFeatureValidation.successRate.toFixed(1)}%)`
      : 'Pending...';

    logger.info(`
╔═══════════════════════════════════════════════════════════════╗
║      3-HOUR COMPREHENSIVE BURN-IN TEST - STATUS REPORT        ║
╠═══════════════════════════════════════════════════════════════╣
║ Runtime:          ${runtime.toFixed(2)} hours / 3 hours                   ║
║ Infrastructure Tests:                                         ║
║   Total Requests:   ${this.metrics.totalRequests}                                    ║
║   Success Rate:     ${successRate}%                                 ║
║   Failed:           ${this.metrics.failedRequests}                                    ║
║   Memory Usage:     ${memoryMB} MB                              ║
║                                                               ║
║ Stability Checks (every 0.625 min):                        ║
║   - Queue Health:    ${this.metrics.queueHealthChecks} checks                       ║
║   - AI Models:       ${this.metrics.aiModelChecks} checks                       ║
║   - System Health:   ${this.metrics.systemHealthChecks} checks                       ║
║                                                               ║
║ Feature Validation (every 15 min):                           ║
║   - Validations:     ${this.metrics.featureValidations} completed                   ║
║   - Latest Result:   ${featureStatus}           ║
║                                                               ║
║ Recent Errors:    ${this.metrics.errors.slice(-3).length} (last 3 shown)            ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    if (this.metrics.errors.length > 0) {
      logger.warn('Recent errors:');
      this.metrics.errors.slice(-3).forEach((err) => {
        logger.warn(`  - [${err.timestamp.toISOString()}] ${err.error}`);
      });
    }
  }

  printFinalReport(): void {
    const totalRuntime = (Date.now() - this.metrics.startTime.getTime()) / 1000 / 60 / 60;
    const successRate = ((this.metrics.successfulRequests / this.metrics.totalRequests) * 100).toFixed(2);

    const memoryGrowth = this.analyzeMemoryGrowth();
    const queuePerformance = this.analyzeQueuePerformance();
    const featurePerformance = this.analyzeFeatureValidation();

    logger.info(`
╔═══════════════════════════════════════════════════════════════╗
║      3-HOUR COMPREHENSIVE BURN-IN TEST - FINAL REPORT         ║
╠═══════════════════════════════════════════════════════════════╣
║ Start Time:       ${this.metrics.startTime.toISOString()}       ║
║ End Time:         ${new Date().toISOString()}       ║
║ Total Runtime:    ${totalRuntime.toFixed(2)} hours                           ║
║                                                               ║
║ INFRASTRUCTURE STABILITY (144 checks):                        ║
║   Total Requests:     ${this.metrics.totalRequests}                              ║
║   Successful:         ${this.metrics.successfulRequests} (${successRate}%)                    ║
║   Failed:             ${this.metrics.failedRequests}                              ║
║                                                               ║
║ MEMORY ANALYSIS:                                              ║
║   Initial Heap:       ${memoryGrowth.initial} MB                      ║
║   Final Heap:         ${memoryGrowth.final} MB                      ║
║   Growth:             ${memoryGrowth.growth} MB (${memoryGrowth.growthPercent}%)         ║
║   Status:             ${memoryGrowth.status}                          ║
║                                                               ║
║ QUEUE PERFORMANCE:                                            ║
║   Avg Redis Latency:  ${queuePerformance.avgLatency} ms                     ║
║   Max Redis Latency:  ${queuePerformance.maxLatency} ms                     ║
║   Total Failed Jobs:  ${queuePerformance.totalFailed}                              ║
║   Status:             ${queuePerformance.status}                          ║
║                                                               ║
║ FEATURE VALIDATION (6 comprehensive checks):                 ║
║   Total Validations:  ${this.metrics.featureValidations}                              ║
║   Avg Success Rate:   ${featurePerformance.avgSuccessRate}%                    ║
║   Total Tests Run:    ${featurePerformance.totalTests}                            ║
║   Total Passed:       ${featurePerformance.totalPassed}                            ║
║   Total Failed:       ${featurePerformance.totalFailed}                              ║
║   Status:             ${featurePerformance.status}                          ║
║                                                               ║
║ ERRORS ENCOUNTERED:   ${this.metrics.errors.length}                              ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    if (this.metrics.errors.length > 0) {
      logger.warn('\n📋 ERROR SUMMARY:');
      this.metrics.errors.forEach((err) => {
        logger.warn(`  - [${err.timestamp.toISOString()}] ${err.error}`);
      });
    }

    if (featurePerformance.failedCategories.length > 0) {
      logger.warn('\n⚠️ FEATURE VALIDATION FAILURES:');
      featurePerformance.failedCategories.forEach((failure) => {
        logger.warn(`  - ${failure.category}: ${failure.testName}`);
        if (failure.error) {
          logger.warn(`    Error: ${failure.error}`);
        }
      });
    }

    const verdict = this.getVerdict(successRate, memoryGrowth, queuePerformance, featurePerformance);
    logger.info(`\n${verdict}`);
  }

  analyzeMemoryGrowth() {
    if (this.metrics.memorySnapshots.length === 0) {
      return { initial: 0, final: 0, growth: 0, growthPercent: '0.00', status: 'No data' };
    }

    const initial = this.metrics.memorySnapshots[0].heapUsed / 1024 / 1024;
    const final = this.metrics.memorySnapshots[this.metrics.memorySnapshots.length - 1].heapUsed / 1024 / 1024;
    const growth = final - initial;
    const growthPercent = ((growth / initial) * 100).toFixed(2);

    let status = '✅ HEALTHY';
    if (growth > 500) {
      status = '⚠️ POTENTIAL LEAK';
    } else if (growth > 200) {
      status = '⚠️ HIGH GROWTH';
    }

    return {
      initial: initial.toFixed(2),
      final: final.toFixed(2),
      growth: growth.toFixed(2),
      growthPercent,
      status,
    };
  }

  analyzeQueuePerformance() {
    if (this.metrics.queueMetrics.length === 0) {
      return { avgLatency: 0, maxLatency: 0, totalFailed: 0, status: 'No data' };
    }

    const latencies = this.metrics.queueMetrics.map(m => m.redisLatency);
    const avgLatency = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);
    const maxLatency = Math.max(...latencies);
    const totalFailed = this.metrics.queueMetrics[this.metrics.queueMetrics.length - 1].failed;

    let status = '✅ HEALTHY';
    if (maxLatency > 100) {
      status = '⚠️ HIGH LATENCY';
    } else if (totalFailed > 50) {
      status = '⚠️ HIGH FAILURES';
    }

    return {
      avgLatency,
      maxLatency,
      totalFailed,
      status,
    };
  }

  analyzeFeatureValidation() {
    if (this.metrics.featureValidationSnapshots.length === 0) {
      return {
        avgSuccessRate: '0.00',
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0,
        status: 'No data',
        failedCategories: [],
      };
    }

    const allSnapshots = this.metrics.featureValidationSnapshots;
    const avgSuccessRate = (
      allSnapshots.reduce((sum, snap) => sum + snap.successRate, 0) / allSnapshots.length
    ).toFixed(2);

    const totalTests = allSnapshots.reduce((sum, snap) => sum + snap.totalTests, 0);
    const totalPassed = allSnapshots.reduce((sum, snap) => sum + snap.passed, 0);
    const totalFailed = allSnapshots.reduce((sum, snap) => sum + snap.failed, 0);

    const failedCategories: Array<{ category: string; testName: string; error?: string }> = [];
    allSnapshots.forEach((snap) => {
      snap.failedTests.forEach((test) => {
        if (!failedCategories.find((f) => f.category === test.category && f.testName === test.testName)) {
          failedCategories.push(test);
        }
      });
    });

    let status = '✅ HEALTHY';
    const rate = parseFloat(avgSuccessRate);
    if (rate < 95) {
      status = '❌ FAILING';
    } else if (rate < 99) {
      status = '⚠️ DEGRADED';
    }

    return {
      avgSuccessRate,
      totalTests,
      totalPassed,
      totalFailed,
      status,
      failedCategories,
    };
  }

  getVerdict(successRate: string, memoryGrowth: any, queuePerformance: any, featurePerformance: any): string {
    const rate = parseFloat(successRate);
    const featureRate = parseFloat(featurePerformance.avgSuccessRate);

    const allHealthy =
      rate >= 99.9 &&
      memoryGrowth.status === '✅ HEALTHY' &&
      queuePerformance.status === '✅ HEALTHY' &&
      featurePerformance.status === '✅ HEALTHY';

    const mostlyHealthy =
      rate >= 95 &&
      featureRate >= 95 &&
      memoryGrowth.status !== '⚠️ POTENTIAL LEAK' &&
      queuePerformance.status !== '⚠️ HIGH FAILURES';

    if (allHealthy) {
      return `
╔═══════════════════════════════════════════════════════════════╗
║                    ✅ VERDICT: PASS                           ║
║                                                               ║
║  The platform successfully completed the 3-hour               ║
║  comprehensive burn-in test with excellent metrics:           ║
║                                                               ║
║  ✅ Infrastructure Stability: ${rate}%                         ║
║  ✅ Feature Validation: ${featureRate}%                         ║
║  ✅ Memory: ${memoryGrowth.status}                                   ║
║  ✅ Queue: ${queuePerformance.status}                                   ║
║                                                               ║
║  The system is PRODUCTION-READY for deployment.               ║
╚═══════════════════════════════════════════════════════════════╝`;
    } else if (mostlyHealthy) {
      return `
╔═══════════════════════════════════════════════════════════════╗
║                 ⚠️ VERDICT: CONDITIONAL PASS                  ║
║                                                               ║
║  The platform completed the burn-in test with some issues:    ║
║                                                               ║
║  Infrastructure Stability: ${rate}%                            ║
║  Feature Validation: ${featureRate}%                            ║
║  Memory: ${memoryGrowth.status}                                      ║
║  Queue: ${queuePerformance.status}                                      ║
║  Features: ${featurePerformance.status}                                 ║
║                                                               ║
║  Review warnings before production deployment.                ║
╚═══════════════════════════════════════════════════════════════╝`;
    } else {
      return `
╔═══════════════════════════════════════════════════════════════╗
║                    ❌ VERDICT: FAIL                           ║
║                                                               ║
║  The platform encountered significant issues:                 ║
║                                                               ║
║  Infrastructure: ${rate}% (Need ≥99.9%)                        ║
║  Features: ${featureRate}% (Need ≥99%)                          ║
║  Memory: ${memoryGrowth.status}                                      ║
║  Queue: ${queuePerformance.status}                                      ║
║                                                               ║
║  DO NOT deploy to production until issues are resolved.       ║
╚═══════════════════════════════════════════════════════════════╝`;
    }
  }

  async start(): Promise<void> {
    this.isRunning = true;
    logger.info(`
╔═══════════════════════════════════════════════════════════════╗
║   STARTING 3-HOUR COMPREHENSIVE BURN-IN TEST                  ║
╠═══════════════════════════════════════════════════════════════╣
║  This test validates ALL Max Booster Platform features:       ║
║                                                               ║
║  TIER 1: Infrastructure Stability (every 0.625 min)          ║
║    - Queue health and Redis performance                       ║
║    - AI model cache behavior                                  ║
║    - System health metrics                                    ║
║    - Memory usage trends                                      ║
║    → 144 stability checks over 3 hours                        ║
║                                                               ║
║  TIER 2: Feature Validation (every 15 min)                   ║
║    ✓ Authentication & Users                                   ║
║    ✓ Payment System (Stripe)                                  ║
║    ✓ Advertisement System (Zero-Cost AI)                      ║
║    ✓ Social Media Auto-Posting (8 platforms)                  ║
║    ✓ Music Distribution (LabelGrid)                           ║
║    ✓ Marketplace (BeatStars clone)                            ║
║    ✓ Studio/DAW                                               ║
║    ✓ Analytics & AI                                           ║
║    ✓ Infrastructure (Storage, Email, DB, Redis)               ║
║    → 6 comprehensive feature validations                      ║
║                                                               ║
║  Press Ctrl+C to stop the test early (not recommended).       ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    // Wait for server to be fully ready before starting tests
    logger.info('⏳ Waiting for server to be ready...');
    await this.waitForServer();
    logger.info('✅ Server is ready, starting burn-in tests');

    await this.runHealthCheckCycle();

    const intervalMs = this.intervalMinutes * 60 * 1000;
    setInterval(async () => {
      if (this.isRunning) {
        await this.runHealthCheckCycle();
      }
    }, intervalMs);

    setTimeout(() => {
      this.stop();
    }, 3 * 60 * 60 * 1000);
  }

  stop(): void {
    this.isRunning = false;
    logger.info('🛑 Stopping 3-hour burn-in test...');
    this.printFinalReport();
    process.exit(0);
  }
}

const burnInTest = new BurnInTest();

process.on('SIGINT', () => {
  logger.info('\n⚠️ Received interrupt signal...');
  burnInTest.stop();
});

burnInTest.start().catch((error) => {
  logger.error('Fatal error in burn-in test:', error);
  process.exit(1);
});
