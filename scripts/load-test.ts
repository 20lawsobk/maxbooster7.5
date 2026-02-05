#!/usr/bin/env npx tsx
/**
 * LOAD & STRESS TEST SUITE
 * 
 * Tests Redis/system stability under load for production readiness.
 * Simulates concurrent users hitting critical endpoints.
 * 
 * Usage: npm run test:load
 */

import http from 'http';
import https from 'https';
import { performance } from 'perf_hooks';

interface TestResult {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  success: boolean;
  error?: string;
}

interface LoadTestReport {
  timestamp: string;
  duration: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
  endpointResults: Record<string, {
    requests: number;
    successes: number;
    failures: number;
    avgTime: number;
    errors: string[];
  }>;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  status: 'PASS' | 'WARN' | 'FAIL';
  issues: string[];
}

// Use localhost for load testing to bypass self-healing security middleware in development
// This allows testing server capacity without triggering DDoS protection
// In production, load tests should be run from a whitelisted IP
const BASE_URL = 'http://localhost:5000';

const ENDPOINTS = [
  { path: '/api/system/health', method: 'GET', critical: true, expectAuth: false },
  { path: '/api/system/status', method: 'GET', critical: true, expectAuth: false },
  { path: '/api/health/circuits', method: 'GET', critical: false, expectAuth: false },
  { path: '/', method: 'GET', critical: true, expectAuth: false },
  { path: '/api/auth/me', method: 'GET', critical: false, expectAuth: false },
];

const CONFIG = {
  concurrentUsers: 50,
  requestsPerUser: 20,
  rampUpTime: 5000,
  maxResponseTime: 2000,
  errorThreshold: 0.05,
  p95Threshold: 1500,
};

async function makeRequest(endpoint: typeof ENDPOINTS[0]): Promise<TestResult> {
  const startTime = performance.now();
  const url = `${BASE_URL}${endpoint.path}`;
  
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const req = protocol.request(url, {
      method: endpoint.method,
      timeout: 10000,
      headers: {
        'User-Agent': 'MaxBooster-LoadTest/1.0',
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const responseTime = performance.now() - startTime;
        const statusCode = res.statusCode || 0;
        const isSuccess = statusCode >= 200 && statusCode < 400;
        const isExpectedAuthResponse = endpoint.expectAuth && statusCode === 401;
        resolve({
          endpoint: endpoint.path,
          method: endpoint.method,
          statusCode,
          responseTime,
          success: isSuccess || isExpectedAuthResponse,
        });
      });
    });

    req.on('error', (error) => {
      const responseTime = performance.now() - startTime;
      resolve({
        endpoint: endpoint.path,
        method: endpoint.method,
        statusCode: 0,
        responseTime,
        success: false,
        error: error.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const responseTime = performance.now() - startTime;
      resolve({
        endpoint: endpoint.path,
        method: endpoint.method,
        statusCode: 0,
        responseTime,
        success: false,
        error: 'Request timeout',
      });
    });

    req.end();
  });
}

async function simulateUser(userId: number, results: TestResult[]): Promise<void> {
  for (let i = 0; i < CONFIG.requestsPerUser; i++) {
    const endpoint = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
    const result = await makeRequest(endpoint);
    results.push(result);
    await new Promise(r => setTimeout(r, Math.random() * 100));
  }
}

function calculatePercentile(arr: number[], percentile: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] || 0;
}

async function runLoadTest(): Promise<LoadTestReport> {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           MAX BOOSTER - LOAD & STRESS TEST                 ║');
  console.log('║           Redis/System Stability Verification              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`🎯 Target: ${BASE_URL}`);
  console.log(`👥 Concurrent Users: ${CONFIG.concurrentUsers}`);
  console.log(`📊 Requests per User: ${CONFIG.requestsPerUser}`);
  console.log(`⏱️  Total Expected Requests: ${CONFIG.concurrentUsers * CONFIG.requestsPerUser}`);
  console.log('');

  const results: TestResult[] = [];
  const startTime = performance.now();

  console.log('🚀 Starting ramp-up phase...');
  
  const userPromises: Promise<void>[] = [];
  const usersPerBatch = Math.ceil(CONFIG.concurrentUsers / 5);
  
  for (let batch = 0; batch < 5; batch++) {
    const batchStart = batch * usersPerBatch;
    const batchEnd = Math.min(batchStart + usersPerBatch, CONFIG.concurrentUsers);
    
    for (let userId = batchStart; userId < batchEnd; userId++) {
      userPromises.push(simulateUser(userId, results));
    }
    
    console.log(`   Batch ${batch + 1}/5: Users ${batchStart + 1}-${batchEnd} active`);
    await new Promise(r => setTimeout(r, CONFIG.rampUpTime / 5));
  }

  console.log('⏳ Waiting for all requests to complete...');
  await Promise.all(userPromises);

  const duration = performance.now() - startTime;
  const memoryUsage = process.memoryUsage();

  console.log('📊 Analyzing results...\n');

  const responseTimes = results.map(r => r.responseTime);
  const successfulRequests = results.filter(r => r.success).length;
  const failedRequests = results.filter(r => !r.success).length;

  const endpointResults: LoadTestReport['endpointResults'] = {};
  for (const result of results) {
    if (!endpointResults[result.endpoint]) {
      endpointResults[result.endpoint] = {
        requests: 0,
        successes: 0,
        failures: 0,
        avgTime: 0,
        errors: [],
      };
    }
    const ep = endpointResults[result.endpoint];
    ep.requests++;
    if (result.success) {
      ep.successes++;
    } else {
      ep.failures++;
      if (result.error && !ep.errors.includes(result.error)) {
        ep.errors.push(result.error);
      }
    }
    ep.avgTime = (ep.avgTime * (ep.requests - 1) + result.responseTime) / ep.requests;
  }

  const issues: string[] = [];
  const errorRate = failedRequests / results.length;
  const p95 = calculatePercentile(responseTimes, 95);
  const p99 = calculatePercentile(responseTimes, 99);
  const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

  if (errorRate > CONFIG.errorThreshold) {
    issues.push(`Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold of ${CONFIG.errorThreshold * 100}%`);
  }

  if (p95 > CONFIG.p95Threshold) {
    issues.push(`P95 response time ${p95.toFixed(0)}ms exceeds threshold of ${CONFIG.p95Threshold}ms`);
  }

  if (avgResponseTime > CONFIG.maxResponseTime) {
    issues.push(`Average response time ${avgResponseTime.toFixed(0)}ms exceeds threshold of ${CONFIG.maxResponseTime}ms`);
  }

  for (const [endpoint, data] of Object.entries(endpointResults)) {
    const epErrorRate = data.failures / data.requests;
    if (epErrorRate > 0.1) {
      issues.push(`Endpoint ${endpoint} has ${(epErrorRate * 100).toFixed(1)}% error rate`);
    }
  }

  let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
  if (issues.length > 0) {
    status = errorRate > 0.1 ? 'FAIL' : 'WARN';
  }

  const report: LoadTestReport = {
    timestamp: new Date().toISOString(),
    duration: duration / 1000,
    totalRequests: results.length,
    successfulRequests,
    failedRequests,
    avgResponseTime,
    minResponseTime: Math.min(...responseTimes),
    maxResponseTime: Math.max(...responseTimes),
    p95ResponseTime: p95,
    p99ResponseTime: p99,
    requestsPerSecond: results.length / (duration / 1000),
    errorRate,
    endpointResults,
    memoryUsage: {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      rss: memoryUsage.rss,
    },
    status,
    issues,
  };

  printReport(report);
  return report;
}

function printReport(report: LoadTestReport): void {
  console.log('════════════════════════════════════════════════════════════');
  console.log('                    LOAD TEST RESULTS                       ');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`📅 Timestamp: ${report.timestamp}`);
  console.log(`⏱️  Duration: ${report.duration.toFixed(2)}s`);
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│                   REQUEST STATISTICS                     │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│  Total Requests:     ${String(report.totalRequests).padStart(8)}                        │`);
  console.log(`│  Successful:         ${String(report.successfulRequests).padStart(8)}  (${(100 - report.errorRate * 100).toFixed(1)}%)             │`);
  console.log(`│  Failed:             ${String(report.failedRequests).padStart(8)}  (${(report.errorRate * 100).toFixed(1)}%)              │`);
  console.log(`│  Requests/Second:    ${report.requestsPerSecond.toFixed(1).padStart(8)}                        │`);
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│                   RESPONSE TIMES                         │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│  Average:            ${report.avgResponseTime.toFixed(0).padStart(8)}ms                      │`);
  console.log(`│  Minimum:            ${report.minResponseTime.toFixed(0).padStart(8)}ms                      │`);
  console.log(`│  Maximum:            ${report.maxResponseTime.toFixed(0).padStart(8)}ms                      │`);
  console.log(`│  P95:                ${report.p95ResponseTime.toFixed(0).padStart(8)}ms                      │`);
  console.log(`│  P99:                ${report.p99ResponseTime.toFixed(0).padStart(8)}ms                      │`);
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│                   MEMORY USAGE                           │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│  Heap Used:          ${(report.memoryUsage.heapUsed / 1024 / 1024).toFixed(1).padStart(8)}MB                     │`);
  console.log(`│  Heap Total:         ${(report.memoryUsage.heapTotal / 1024 / 1024).toFixed(1).padStart(8)}MB                     │`);
  console.log(`│  RSS:                ${(report.memoryUsage.rss / 1024 / 1024).toFixed(1).padStart(8)}MB                     │`);
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log('');

  console.log('📊 Endpoint Performance:');
  for (const [endpoint, data] of Object.entries(report.endpointResults)) {
    const successRate = ((data.successes / data.requests) * 100).toFixed(1);
    console.log(`   ${endpoint}`);
    console.log(`      Requests: ${data.requests} | Success: ${successRate}% | Avg: ${data.avgTime.toFixed(0)}ms`);
    if (data.errors.length > 0) {
      console.log(`      Errors: ${data.errors.join(', ')}`);
    }
  }
  console.log('');

  if (report.issues.length > 0) {
    console.log('⚠️  Issues Detected:');
    for (const issue of report.issues) {
      console.log(`   - ${issue}`);
    }
    console.log('');
  }

  const statusEmoji = report.status === 'PASS' ? '✅' : report.status === 'WARN' ? '⚠️' : '❌';
  console.log('════════════════════════════════════════════════════════════');
  console.log(`              LOAD TEST STATUS: ${statusEmoji} ${report.status}                    `);
  console.log('════════════════════════════════════════════════════════════');
}

async function main(): Promise<void> {
  try {
    const report = await runLoadTest();
    
    if (report.status === 'FAIL') {
      console.error('\n❌ Load test FAILED. System may not be stable under load.');
      process.exit(1);
    } else if (report.status === 'WARN') {
      console.warn('\n⚠️  Load test passed with warnings. Review issues before production.');
      process.exit(0);
    } else {
      console.log('\n✅ Load test PASSED. System is stable under load.');
      process.exit(0);
    }
  } catch (error) {
    console.error('Load test failed with error:', error);
    process.exit(1);
  }
}

main();

export { runLoadTest, LoadTestReport };
