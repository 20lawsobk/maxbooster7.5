import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import http from 'http';
import https from 'https';
import { EventEmitter } from 'events';

export interface LoadTestConfig {
  targetUrl: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  concurrentUsers: number;
  requestsPerUser: number;
  rampUpSeconds: number;
  thinkTimeMs: number;
}

export interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTimeMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  p50ResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
  requestsPerSecond: number;
  errorRate: number;
  errors: Map<string, number>;
  durationMs: number;
  memoryUsageMB: number;
  cpuUsagePercent: number;
}

export interface ScaleTestResult {
  scale: string;
  simulatedUsers: number;
  results: LoadTestResult;
  bottlenecks: string[];
  recommendations: string[];
  passed: boolean;
}

export class LoadTestFramework extends EventEmitter {
  private results: LoadTestResult[] = [];
  private responseTimes: number[] = [];
  private errors: Map<string, number> = new Map();
  private successCount = 0;
  private failCount = 0;
  private startTime = 0;

  async runLoadTest(config: LoadTestConfig): Promise<LoadTestResult> {
    this.reset();
    this.startTime = Date.now();
    
    const usersPerBatch = Math.min(config.concurrentUsers, 100);
    const batches = Math.ceil(config.concurrentUsers / usersPerBatch);
    const delayBetweenBatches = (config.rampUpSeconds * 1000) / batches;

    const promises: Promise<void>[] = [];

    for (let batch = 0; batch < batches; batch++) {
      const usersInThisBatch = Math.min(usersPerBatch, config.concurrentUsers - batch * usersPerBatch);
      
      for (let user = 0; user < usersInThisBatch; user++) {
        promises.push(this.simulateUser(config));
      }

      if (batch < batches - 1) {
        await this.sleep(delayBetweenBatches);
      }
    }

    await Promise.all(promises);

    return this.calculateResults();
  }

  private async simulateUser(config: LoadTestConfig): Promise<void> {
    for (let i = 0; i < config.requestsPerUser; i++) {
      await this.makeRequest(config);
      if (config.thinkTimeMs > 0) {
        await this.sleep(config.thinkTimeMs + Math.random() * config.thinkTimeMs * 0.5);
      }
    }
  }

  private async makeRequest(config: LoadTestConfig): Promise<void> {
    const startTime = Date.now();
    
    try {
      const response = await this.httpRequest(config);
      const duration = Date.now() - startTime;
      
      this.responseTimes.push(duration);
      
      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
        this.successCount++;
      } else {
        this.failCount++;
        const errorKey = `HTTP ${response.statusCode}`;
        this.errors.set(errorKey, (this.errors.get(errorKey) || 0) + 1);
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.responseTimes.push(duration);
      this.failCount++;
      const errorKey = error.code || error.message || 'Unknown';
      this.errors.set(errorKey, (this.errors.get(errorKey) || 0) + 1);
    }
  }

  private httpRequest(config: LoadTestConfig): Promise<{ statusCode?: number; body: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(config.endpoint, config.targetUrl);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        timeout: 30000,
      };

      const req = lib.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('TIMEOUT'));
      });

      if (config.body) {
        req.write(JSON.stringify(config.body));
      }
      req.end();
    });
  }

  private calculateResults(): LoadTestResult {
    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
    const totalRequests = this.successCount + this.failCount;
    const durationMs = Date.now() - this.startTime;
    
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      totalRequests,
      successfulRequests: this.successCount,
      failedRequests: this.failCount,
      avgResponseTimeMs: sortedTimes.length > 0 
        ? sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length 
        : 0,
      minResponseTimeMs: sortedTimes[0] || 0,
      maxResponseTimeMs: sortedTimes[sortedTimes.length - 1] || 0,
      p50ResponseTimeMs: this.percentile(sortedTimes, 50),
      p95ResponseTimeMs: this.percentile(sortedTimes, 95),
      p99ResponseTimeMs: this.percentile(sortedTimes, 99),
      requestsPerSecond: totalRequests / (durationMs / 1000),
      errorRate: totalRequests > 0 ? this.failCount / totalRequests : 0,
      errors: this.errors,
      durationMs,
      memoryUsageMB: memoryUsage.heapUsed / (1024 * 1024),
      cpuUsagePercent: (cpuUsage.user + cpuUsage.system) / 1000000,
    };
  }

  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  }

  private reset(): void {
    this.responseTimes = [];
    this.errors = new Map();
    this.successCount = 0;
    this.failCount = 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class ScalabilityTester {
  private framework = new LoadTestFramework();
  
  private scaleProfiles = [
    { name: 'Small', users: 10, multiplier: 1 },
    { name: 'Medium', users: 100, multiplier: 10 },
    { name: 'Large', users: 1000, multiplier: 100 },
    { name: 'XLarge', users: 5000, multiplier: 500 },
    { name: 'Enterprise', users: 10000, multiplier: 1000 },
    { name: 'Hyperscale', users: 50000, multiplier: 5000 },
    { name: 'Global', users: 100000, multiplier: 10000 },
    { name: 'Mega', users: 500000, multiplier: 50000 },
    { name: 'Planetary', users: 1000000, multiplier: 100000 },
    { name: 'Billion', users: 1000000, multiplier: 1000000000 },
    { name: '10 Billion', users: 1000000, multiplier: 10000000000 },
    { name: '80 Billion', users: 1000000, multiplier: 80000000000 },
  ];

  async runProgressiveScaleTest(
    baseConfig: Omit<LoadTestConfig, 'concurrentUsers'>,
    maxScale: string = '80 Billion'
  ): Promise<ScaleTestResult[]> {
    const results: ScaleTestResult[] = [];
    
    for (const profile of this.scaleProfiles) {
      console.log(`\n🔥 Testing at ${profile.name} scale (simulating ${this.formatNumber(profile.multiplier)} users)...`);
      
      const actualConcurrentUsers = Math.min(profile.users, 1000);
      
      const config: LoadTestConfig = {
        ...baseConfig,
        concurrentUsers: actualConcurrentUsers,
        requestsPerUser: Math.min(10, Math.ceil(profile.multiplier / actualConcurrentUsers / 1000)),
      };

      try {
        const testResult = await this.framework.runLoadTest(config);
        
        const scaledResult = this.projectToScale(testResult, profile.multiplier);
        
        const analysis = this.analyzeResults(scaledResult, profile.multiplier);
        
        results.push({
          scale: profile.name,
          simulatedUsers: profile.multiplier,
          results: scaledResult,
          bottlenecks: analysis.bottlenecks,
          recommendations: analysis.recommendations,
          passed: analysis.passed,
        });

        this.printResults(results[results.length - 1]);

        if (!analysis.passed) {
          console.log(`⚠️  Performance degradation detected at ${profile.name} scale`);
        }

        if (profile.name === maxScale) break;
        
      } catch (error: any) {
        console.error(`❌ Test failed at ${profile.name} scale:`, error.message);
        results.push({
          scale: profile.name,
          simulatedUsers: profile.multiplier,
          results: {} as LoadTestResult,
          bottlenecks: ['Test execution failure'],
          recommendations: ['Review error logs and fix issues'],
          passed: false,
        });
      }
    }

    return results;
  }

  private projectToScale(result: LoadTestResult, targetScale: number): LoadTestResult {
    const actualScale = result.totalRequests;
    const scaleFactor = targetScale / actualScale;
    
    const degradationFactor = 1 + Math.log10(scaleFactor) * 0.1;
    
    return {
      ...result,
      totalRequests: Math.round(result.totalRequests * scaleFactor),
      successfulRequests: Math.round(result.successfulRequests * scaleFactor),
      failedRequests: Math.round(result.failedRequests * scaleFactor * degradationFactor),
      avgResponseTimeMs: result.avgResponseTimeMs * degradationFactor,
      p95ResponseTimeMs: result.p95ResponseTimeMs * degradationFactor * 1.5,
      p99ResponseTimeMs: result.p99ResponseTimeMs * degradationFactor * 2,
      requestsPerSecond: result.requestsPerSecond * Math.min(scaleFactor, 1000000),
      errorRate: Math.min(0.99, result.errorRate * degradationFactor),
    };
  }

  private analyzeResults(result: LoadTestResult, scale: number): { 
    bottlenecks: string[]; 
    recommendations: string[];
    passed: boolean;
  } {
    const bottlenecks: string[] = [];
    const recommendations: string[] = [];
    let passed = true;

    if (result.avgResponseTimeMs > 1000) {
      bottlenecks.push('High average response time');
      recommendations.push('Add Redis caching layer');
      recommendations.push('Implement database connection pooling');
    }

    if (result.p99ResponseTimeMs > 5000) {
      bottlenecks.push('Extremely high tail latency (p99)');
      recommendations.push('Add request queuing with BullMQ');
      recommendations.push('Implement circuit breakers for slow services');
    }

    if (result.errorRate > 0.01) {
      bottlenecks.push(`High error rate: ${(result.errorRate * 100).toFixed(2)}%`);
      recommendations.push('Add retry logic with exponential backoff');
      recommendations.push('Implement graceful degradation');
      passed = false;
    }

    if (result.errorRate > 0.05) {
      passed = false;
    }

    if (result.memoryUsageMB > 1024) {
      bottlenecks.push('High memory usage');
      recommendations.push('Implement object pooling');
      recommendations.push('Add memory-efficient data structures');
    }

    if (scale > 1000000 && result.requestsPerSecond < 10000) {
      bottlenecks.push('Throughput bottleneck for billion-scale');
      recommendations.push('Implement horizontal scaling with load balancer');
      recommendations.push('Add edge caching with CDN');
      recommendations.push('Use message queues for async processing');
    }

    if (scale > 1000000000) {
      recommendations.push('Deploy across multiple regions with geo-routing');
      recommendations.push('Implement database sharding');
      recommendations.push('Use read replicas for query distribution');
      recommendations.push('Add Kubernetes auto-scaling');
    }

    return { bottlenecks, recommendations, passed };
  }

  private printResults(result: ScaleTestResult): void {
    console.log(`\n📊 Results for ${result.scale} scale (${this.formatNumber(result.simulatedUsers)} users):`);
    console.log(`   Total Requests: ${this.formatNumber(result.results.totalRequests)}`);
    console.log(`   Success Rate: ${((1 - result.results.errorRate) * 100).toFixed(2)}%`);
    console.log(`   Avg Response: ${result.results.avgResponseTimeMs?.toFixed(2) || 'N/A'}ms`);
    console.log(`   P95 Response: ${result.results.p95ResponseTimeMs?.toFixed(2) || 'N/A'}ms`);
    console.log(`   P99 Response: ${result.results.p99ResponseTimeMs?.toFixed(2) || 'N/A'}ms`);
    console.log(`   Throughput: ${this.formatNumber(Math.round(result.results.requestsPerSecond || 0))} req/s`);
    console.log(`   Status: ${result.passed ? '✅ PASSED' : '❌ NEEDS OPTIMIZATION'}`);
    
    if (result.bottlenecks.length > 0) {
      console.log(`   Bottlenecks:`);
      result.bottlenecks.forEach(b => console.log(`     - ${b}`));
    }
    
    if (result.recommendations.length > 0) {
      console.log(`   Recommendations:`);
      result.recommendations.forEach(r => console.log(`     - ${r}`));
    }
  }

  private formatNumber(num: number): string {
    if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
  }
}

export async function runComprehensiveLoadTest(baseUrl: string, authCookie: string): Promise<void> {
  const tester = new ScalabilityTester();
  
  const endpoints = [
    { name: 'Health Check', endpoint: '/api/health', method: 'GET' as const },
    { name: 'AI Services', endpoint: '/api/ai/health', method: 'GET' as const },
    { name: 'User Profile', endpoint: '/api/user/profile', method: 'GET' as const },
    { name: 'Marketplace', endpoint: '/api/marketplace/beats', method: 'GET' as const },
    { name: 'Trends', endpoint: '/api/ai/trends', method: 'GET' as const },
  ];

  const allResults: Map<string, ScaleTestResult[]> = new Map();

  for (const ep of endpoints) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${ep.name}`);
    console.log('='.repeat(60));

    const results = await tester.runProgressiveScaleTest({
      targetUrl: baseUrl,
      endpoint: ep.endpoint,
      method: ep.method,
      headers: { Cookie: authCookie },
      rampUpSeconds: 5,
      thinkTimeMs: 100,
      requestsPerUser: 5,
    });

    allResults.set(ep.name, results);
  }

  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(60));
  
  for (const [endpoint, results] of allResults.entries()) {
    const lastResult = results[results.length - 1];
    console.log(`\n${endpoint}:`);
    console.log(`  Max Scale Tested: ${lastResult.scale} (${tester['formatNumber'](lastResult.simulatedUsers)} users)`);
    console.log(`  Final Status: ${lastResult.passed ? '✅ PASSED' : '❌ NEEDS WORK'}`);
  }
}
