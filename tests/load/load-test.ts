import { logger } from '../../server/logger.js';

interface LoadTestConfig {
  duration: number;
  concurrentUsers: number;
  rampUpTime: number;
  endpoints: Array<{
    path: string;
    method: 'GET' | 'POST';
    weight: number;
    body?: any;
  }>;
}

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  errors: Array<{ endpoint: string; error: string; count: number }>;
}

class LoadTester {
  private config: LoadTestConfig;
  private results: LoadTestResult;
  private responseTimes: number[] = [];
  private startTime: number = 0;
  private activeRequests: number = 0;

  constructor(config: LoadTestConfig) {
    this.config = config;
    this.results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      requestsPerSecond: 0,
      errors: [],
    };
  }

  async run(): Promise<LoadTestResult> {
    logger.info(`
╔═══════════════════════════════════════════════════════════════╗
║                    LOAD TEST STARTING                         ║
╠═══════════════════════════════════════════════════════════════╣
║  Duration:         ${this.config.duration}s                                   ║
║  Concurrent Users: ${this.config.concurrentUsers}                                     ║
║  Ramp-up Time:     ${this.config.rampUpTime}s                                   ║
║  Endpoints:        ${this.config.endpoints.length}                                      ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    this.startTime = Date.now();
    const endTime = this.startTime + (this.config.duration * 1000);

    const userIntervals: NodeJS.Timeout[] = [];

    for (let i = 0; i < this.config.concurrentUsers; i++) {
      const delay = (this.config.rampUpTime * 1000 * i) / this.config.concurrentUsers;

      setTimeout(() => {
        const interval = setInterval(async () => {
          if (Date.now() >= endTime) {
            clearInterval(interval);
            return;
          }

          await this.makeRequest();
        }, 1000);

        userIntervals.push(interval);
      }, delay);
    }

    await new Promise(resolve => setTimeout(resolve, this.config.duration * 1000 + this.config.rampUpTime * 1000));

    userIntervals.forEach(interval => clearInterval(interval));

    while (this.activeRequests > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return this.generateResults();
  }

  private async makeRequest(): Promise<void> {
    this.activeRequests++;
    const endpoint = this.selectEndpoint();

    const requestStart = Date.now();

    try {
      const response = await fetch(`http://localhost:5000${endpoint.path}`, {
        method: endpoint.method,
        headers: endpoint.body ? { 'Content-Type': 'application/json' } : {},
        body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
      });

      const responseTime = Date.now() - requestStart;
      this.responseTimes.push(responseTime);

      this.results.totalRequests++;

      if (response.ok) {
        this.results.successfulRequests++;
      } else {
        this.results.failedRequests++;
        this.recordError(endpoint.path, `HTTP ${response.status}`);
      }

      this.results.minResponseTime = Math.min(this.results.minResponseTime, responseTime);
      this.results.maxResponseTime = Math.max(this.results.maxResponseTime, responseTime);
    } catch (error) {
      this.results.totalRequests++;
      this.results.failedRequests++;
      this.recordError(endpoint.path, error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.activeRequests--;
    }
  }

  private selectEndpoint() {
    const totalWeight = this.config.endpoints.reduce((sum, ep) => sum + ep.weight, 0);
    let random = Math.random() * totalWeight;

    for (const endpoint of this.config.endpoints) {
      random -= endpoint.weight;
      if (random <= 0) {
        return endpoint;
      }
    }

    return this.config.endpoints[0];
  }

  private recordError(endpoint: string, error: string): void {
    const existing = this.results.errors.find(e => e.endpoint === endpoint && e.error === error);
    if (existing) {
      existing.count++;
    } else {
      this.results.errors.push({ endpoint, error, count: 1 });
    }
  }

  private generateResults(): LoadTestResult {
    const duration = (Date.now() - this.startTime) / 1000;

    this.results.avgResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
      : 0;

    this.results.requestsPerSecond = this.results.totalRequests / duration;

    logger.info(`
╔═══════════════════════════════════════════════════════════════╗
║                  LOAD TEST RESULTS                            ║
╠═══════════════════════════════════════════════════════════════╣
║  Total Requests:      ${this.results.totalRequests.toString().padEnd(35)}║
║  Successful:          ${this.results.successfulRequests.toString().padEnd(35)}║
║  Failed:              ${this.results.failedRequests.toString().padEnd(35)}║
║  Success Rate:        ${((this.results.successfulRequests / this.results.totalRequests) * 100).toFixed(2)}%${' '.repeat(31)}║
║                                                               ║
║  Avg Response Time:   ${this.results.avgResponseTime.toFixed(2)}ms${' '.repeat(31)}║
║  Min Response Time:   ${this.results.minResponseTime.toFixed(2)}ms${' '.repeat(31)}║
║  Max Response Time:   ${this.results.maxResponseTime.toFixed(2)}ms${' '.repeat(31)}║
║  Requests/Second:     ${this.results.requestsPerSecond.toFixed(2)}${' '.repeat(31)}║
╚═══════════════════════════════════════════════════════════════╝
    `);

    if (this.results.errors.length > 0) {
      logger.warn('\nERRORS ENCOUNTERED:');
      for (const error of this.results.errors.slice(0, 10)) {
        logger.warn(`  ${error.endpoint}: ${error.error} (${error.count}x)`);
      }
    }

    const verdict = this.getVerdict();
    logger.info(`\n${verdict}\n`);

    return this.results;
  }

  private getVerdict(): string {
    const successRate = (this.results.successfulRequests / this.results.totalRequests) * 100;

    if (successRate >= 99.9 && this.results.avgResponseTime < 200) {
      return '✅ EXCELLENT - System handles load with excellent performance';
    } else if (successRate >= 99 && this.results.avgResponseTime < 500) {
      return '✅ GOOD - System handles load with acceptable performance';
    } else if (successRate >= 95) {
      return '⚠️ ACCEPTABLE - Some performance degradation under load';
    } else {
      return '❌ POOR - System struggles under load, optimization needed';
    }
  }
}

const defaultConfig: LoadTestConfig = {
  duration: 60,
  concurrentUsers: 50,
  rampUpTime: 10,
  endpoints: [
    { path: '/api/monitoring/system-health', method: 'GET', weight: 10 },
    { path: '/api/monitoring/queue-health', method: 'GET', weight: 10 },
    { path: '/api/monitoring/ai-models', method: 'GET', weight: 5 },
    { path: '/api/monitoring/dashboard', method: 'GET', weight: 5 },
    { path: '/api/auth/me', method: 'GET', weight: 20 },
  ],
};

const tester = new LoadTester(defaultConfig);
tester.run().then((results) => {
  const successRate = (results.successfulRequests / results.totalRequests) * 100;
  process.exit(successRate >= 95 ? 0 : 1);
}).catch((error) => {
  logger.error('Load test failed:', error);
  process.exit(1);
});
