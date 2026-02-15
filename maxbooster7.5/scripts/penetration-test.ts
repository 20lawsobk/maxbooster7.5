#!/usr/bin/env npx tsx
/**
 * PENETRATION & SECURITY TEST SUITE
 * 
 * Comprehensive security testing for production readiness.
 * Tests OWASP Top 10 vulnerabilities, authentication, and more.
 * 
 * Usage: npm run test:security
 */

import http from 'http';
import https from 'https';
import { performance } from 'perf_hooks';

interface SecurityTestResult {
  category: string;
  test: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message: string;
  details?: string;
}

interface PenTestReport {
  timestamp: string;
  duration: number;
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  criticalIssues: SecurityTestResult[];
  highIssues: SecurityTestResult[];
  mediumIssues: SecurityTestResult[];
  lowIssues: SecurityTestResult[];
  allResults: SecurityTestResult[];
  status: 'PASS' | 'WARN' | 'FAIL';
  summary: string;
}

const BASE_URL = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : 'http://localhost:5000';

async function makeRequest(
  path: string, 
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  } = {}
): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  error?: string;
}> {
  const url = `${BASE_URL}${path}`;
  
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    
    const req = protocol.request({
      hostname: urlObj.hostname,
      port: urlObj.port || (url.startsWith('https') ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      timeout: options.timeout || 10000,
      headers: {
        'User-Agent': 'MaxBooster-SecurityTest/1.0',
        'Accept': 'application/json',
        ...options.headers,
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.headers)) {
          headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : (value || '');
        }
        resolve({
          statusCode: res.statusCode || 0,
          headers,
          body: data,
        });
      });
    });

    req.on('error', (error) => {
      resolve({
        statusCode: 0,
        headers: {},
        body: '',
        error: error.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        statusCode: 0,
        headers: {},
        body: '',
        error: 'Request timeout',
      });
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

class PenetrationTester {
  private results: SecurityTestResult[] = [];

  private addResult(result: SecurityTestResult): void {
    this.results.push(result);
    const icon = result.status === 'pass' ? '✅' : 
                 result.status === 'fail' ? '❌' : 
                 result.status === 'warn' ? '⚠️' : '⏭️';
    console.log(`   ${icon} [${result.severity.toUpperCase()}] ${result.test}`);
    if (result.status !== 'pass' && result.details) {
      console.log(`      └─ ${result.details}`);
    }
  }

  async testSecurityHeaders(): Promise<void> {
    console.log('\n🔒 Testing Security Headers...');
    
    const res = await makeRequest('/');
    
    const requiredHeaders = [
      { name: 'x-content-type-options', expected: 'nosniff', severity: 'medium' as const },
      { name: 'x-frame-options', expected: ['DENY', 'SAMEORIGIN'], severity: 'high' as const },
      { name: 'x-xss-protection', expected: '0', severity: 'low' as const },
      { name: 'strict-transport-security', expected: null, severity: 'high' as const },
      { name: 'content-security-policy', expected: null, severity: 'medium' as const },
      { name: 'x-dns-prefetch-control', expected: 'off', severity: 'low' as const },
      { name: 'x-download-options', expected: 'noopen', severity: 'low' as const },
      { name: 'x-permitted-cross-domain-policies', expected: 'none', severity: 'low' as const },
      { name: 'referrer-policy', expected: null, severity: 'low' as const },
    ];

    for (const header of requiredHeaders) {
      const value = res.headers[header.name];
      let status: 'pass' | 'fail' = 'fail';
      
      if (value) {
        if (header.expected === null) {
          status = 'pass';
        } else if (Array.isArray(header.expected)) {
          status = header.expected.some(e => value.includes(e)) ? 'pass' : 'fail';
        } else {
          status = value.includes(header.expected) ? 'pass' : 'fail';
        }
      }

      this.addResult({
        category: 'Security Headers',
        test: `${header.name} header`,
        severity: header.severity,
        status,
        message: status === 'pass' ? `Header present: ${value}` : 'Header missing or incorrect',
        details: status === 'fail' ? `Expected: ${header.expected || 'any value'}, Got: ${value || 'missing'}` : undefined,
      });
    }

    const serverHeader = res.headers['server'];
    this.addResult({
      category: 'Security Headers',
      test: 'Server header exposure',
      severity: 'low',
      status: !serverHeader || serverHeader === '' ? 'pass' : 'warn',
      message: serverHeader ? 'Server header exposed' : 'Server header hidden',
      details: serverHeader ? `Server: ${serverHeader}` : undefined,
    });

    const poweredBy = res.headers['x-powered-by'];
    this.addResult({
      category: 'Security Headers',
      test: 'X-Powered-By header',
      severity: 'low',
      status: !poweredBy ? 'pass' : 'fail',
      message: poweredBy ? 'X-Powered-By header exposed' : 'X-Powered-By header hidden',
      details: poweredBy ? `Reveals: ${poweredBy}` : undefined,
    });
  }

  async testAuthentication(): Promise<void> {
    console.log('\n🔐 Testing Authentication...');

    const protectedEndpoints = [
      '/api/analytics/streams',
      '/api/distribution/releases',
      '/api/payouts/balance',
      '/api/admin/metrics',
    ];

    for (const endpoint of protectedEndpoints) {
      const res = await makeRequest(endpoint);
      
      this.addResult({
        category: 'Authentication',
        test: `Protected endpoint: ${endpoint}`,
        severity: 'critical',
        status: res.statusCode === 401 || res.statusCode === 403 ? 'pass' : 'fail',
        message: res.statusCode === 401 || res.statusCode === 403 
          ? 'Endpoint properly protected' 
          : 'Endpoint accessible without auth',
        details: res.statusCode !== 401 && res.statusCode !== 403 
          ? `Status: ${res.statusCode}` 
          : undefined,
      });
    }

    const bruteForceRes = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', password: 'wrong' }),
    });

    const rateLimitHeader = bruteForceRes.headers['x-ratelimit-remaining'] || 
                            bruteForceRes.headers['ratelimit-remaining'] ||
                            bruteForceRes.headers['retry-after'];

    this.addResult({
      category: 'Authentication',
      test: 'Rate limiting on auth endpoints',
      severity: 'high',
      status: rateLimitHeader || bruteForceRes.statusCode === 429 ? 'pass' : 'warn',
      message: rateLimitHeader || bruteForceRes.statusCode === 429
        ? 'Rate limiting active'
        : 'Rate limiting headers not visible',
      details: rateLimitHeader ? `Limit: ${rateLimitHeader}` : 'Consider explicit rate limit headers',
    });
  }

  async testInjectionVulnerabilities(): Promise<void> {
    console.log('\n💉 Testing Injection Vulnerabilities...');

    const sqlPayloads = [
      "' OR '1'='1",
      "1; DROP TABLE users--",
      "' UNION SELECT * FROM users--",
      "admin'--",
    ];

    for (const payload of sqlPayloads) {
      const res = await makeRequest(`/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: payload, password: 'test' }),
      });

      const isSafe = res.statusCode === 400 || 
                     res.statusCode === 401 || 
                     res.statusCode === 422 ||
                     !res.body.toLowerCase().includes('sql') &&
                     !res.body.toLowerCase().includes('syntax error');

      this.addResult({
        category: 'Injection',
        test: `SQL injection: ${payload.substring(0, 20)}...`,
        severity: 'critical',
        status: isSafe ? 'pass' : 'fail',
        message: isSafe ? 'Input properly sanitized' : 'Potential SQL injection vulnerability',
      });
    }

    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      '"><script>alert("XSS")</script>',
      "javascript:alert('XSS')",
    ];

    for (const payload of xssPayloads) {
      const res = await makeRequest(`/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: 'test@test.com', 
          password: 'Test123!@#',
          username: payload 
        }),
      });

      const isEscaped = !res.body.includes(payload) || 
                        res.body.includes('&lt;') ||
                        res.statusCode === 400 ||
                        res.statusCode === 422;

      this.addResult({
        category: 'Injection',
        test: `XSS protection: ${payload.substring(0, 25)}...`,
        severity: 'high',
        status: isEscaped ? 'pass' : 'fail',
        message: isEscaped ? 'XSS payload properly handled' : 'Potential XSS vulnerability',
      });
    }

    const pathTraversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '....//....//....//etc/passwd',
    ];

    for (const payload of pathTraversalPayloads) {
      const res = await makeRequest(`/api/files/${encodeURIComponent(payload)}`);

      const isSafe = res.statusCode === 400 || 
                     res.statusCode === 403 || 
                     res.statusCode === 404 ||
                     !res.body.includes('root:');

      this.addResult({
        category: 'Injection',
        test: `Path traversal: ${payload.substring(0, 20)}...`,
        severity: 'critical',
        status: isSafe ? 'pass' : 'fail',
        message: isSafe ? 'Path traversal blocked' : 'Potential path traversal vulnerability',
      });
    }
  }

  async testSessionManagement(): Promise<void> {
    console.log('\n🍪 Testing Session Management...');

    const res = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', password: 'test' }),
    });

    const setCookie = res.headers['set-cookie'] || '';
    
    if (setCookie) {
      this.addResult({
        category: 'Session',
        test: 'Session cookie HttpOnly flag',
        severity: 'high',
        status: setCookie.toLowerCase().includes('httponly') ? 'pass' : 'fail',
        message: setCookie.toLowerCase().includes('httponly') 
          ? 'HttpOnly flag set' 
          : 'HttpOnly flag missing',
      });

      this.addResult({
        category: 'Session',
        test: 'Session cookie Secure flag',
        severity: 'high',
        status: setCookie.toLowerCase().includes('secure') || BASE_URL.startsWith('http://localhost') ? 'pass' : 'warn',
        message: setCookie.toLowerCase().includes('secure') 
          ? 'Secure flag set' 
          : 'Secure flag should be set in production',
      });

      this.addResult({
        category: 'Session',
        test: 'Session cookie SameSite attribute',
        severity: 'medium',
        status: setCookie.toLowerCase().includes('samesite') ? 'pass' : 'warn',
        message: setCookie.toLowerCase().includes('samesite') 
          ? 'SameSite attribute set' 
          : 'SameSite attribute recommended',
      });
    } else {
      this.addResult({
        category: 'Session',
        test: 'Session cookie presence',
        severity: 'info',
        status: 'skip',
        message: 'No session cookie set (may use tokens)',
      });
    }
  }

  async testCORS(): Promise<void> {
    console.log('\n🌐 Testing CORS Configuration...');

    const maliciousOrigin = 'https://evil-attacker.com';
    const res = await makeRequest('/api/system/health', {
      headers: { 'Origin': maliciousOrigin },
    });

    const allowOrigin = res.headers['access-control-allow-origin'];
    
    this.addResult({
      category: 'CORS',
      test: 'Wildcard CORS check',
      severity: 'high',
      status: allowOrigin !== '*' ? 'pass' : 'fail',
      message: allowOrigin !== '*' 
        ? 'CORS is not using wildcard' 
        : 'Wildcard CORS allows any origin',
    });

    this.addResult({
      category: 'CORS',
      test: 'Malicious origin rejection',
      severity: 'high',
      status: allowOrigin !== maliciousOrigin ? 'pass' : 'fail',
      message: allowOrigin !== maliciousOrigin 
        ? 'Malicious origin rejected' 
        : 'Malicious origin accepted',
    });

    const allowCredentials = res.headers['access-control-allow-credentials'];
    if (allowCredentials === 'true' && allowOrigin === '*') {
      this.addResult({
        category: 'CORS',
        test: 'Credentials with wildcard',
        severity: 'critical',
        status: 'fail',
        message: 'Credentials allowed with wildcard origin - security risk',
      });
    }
  }

  async testErrorHandling(): Promise<void> {
    console.log('\n🚨 Testing Error Handling...');

    const res = await makeRequest('/api/nonexistent-endpoint-12345');
    
    const exposesStack = res.body.includes('at ') && res.body.includes('.ts:') ||
                         res.body.includes('.js:') && res.body.includes('node_modules');

    this.addResult({
      category: 'Error Handling',
      test: 'Stack trace exposure',
      severity: 'medium',
      status: !exposesStack ? 'pass' : 'fail',
      message: !exposesStack 
        ? 'Stack traces hidden' 
        : 'Stack traces exposed in errors',
    });

    const exposesPath = res.body.includes('/home/') || 
                        res.body.includes('/app/') ||
                        res.body.includes('C:\\');

    this.addResult({
      category: 'Error Handling',
      test: 'File path exposure',
      severity: 'medium',
      status: !exposesPath ? 'pass' : 'fail',
      message: !exposesPath 
        ? 'File paths hidden' 
        : 'File paths exposed in errors',
    });
  }

  async testStripeWebhook(): Promise<void> {
    console.log('\n💳 Testing Stripe Webhook Security...');

    const fakeWebhook = await makeRequest('/api/webhooks/stripe', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'stripe-signature': 'fake-signature-12345',
      },
      body: JSON.stringify({
        type: 'checkout.session.completed',
        data: { object: { customer: 'cus_fake' } },
      }),
    });

    this.addResult({
      category: 'Payments',
      test: 'Stripe webhook signature validation',
      severity: 'critical',
      status: fakeWebhook.statusCode === 400 || fakeWebhook.statusCode === 401 ? 'pass' : 'warn',
      message: fakeWebhook.statusCode === 400 || fakeWebhook.statusCode === 401
        ? 'Webhook signature validation active'
        : 'Webhook endpoint behavior unclear',
      details: `Status: ${fakeWebhook.statusCode}`,
    });
  }

  async testRateLimiting(): Promise<void> {
    console.log('\n⏱️  Testing Rate Limiting...');

    const requests: Promise<{ statusCode: number }>[] = [];
    for (let i = 0; i < 100; i++) {
      requests.push(makeRequest('/api/system/health'));
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.some(r => r.statusCode === 429);

    this.addResult({
      category: 'Rate Limiting',
      test: 'Rate limiting enforcement',
      severity: 'high',
      status: rateLimited ? 'pass' : 'warn',
      message: rateLimited 
        ? 'Rate limiting triggered' 
        : 'Rate limiting not triggered with 100 rapid requests',
      details: rateLimited ? undefined : 'Consider if limits are too high',
    });
  }

  async testSensitiveDataExposure(): Promise<void> {
    console.log('\n🔍 Testing Sensitive Data Exposure...');

    const sensitivePatterns = [
      /api[_-]?key/i,
      /secret/i,
      /password/i,
      /token/i,
      /bearer/i,
      /sk_live_/i,
      /pk_live_/i,
    ];

    const endpoints = [
      '/api/system/health',
      '/api/system/status',
      '/',
    ];

    for (const endpoint of endpoints) {
      const res = await makeRequest(endpoint);
      
      let foundSensitive = false;
      for (const pattern of sensitivePatterns) {
        if (pattern.test(res.body)) {
          if (!res.body.includes('api_key') || res.body.includes('sk_') || res.body.includes('password')) {
            foundSensitive = true;
            break;
          }
        }
      }

      this.addResult({
        category: 'Data Exposure',
        test: `Sensitive data in ${endpoint}`,
        severity: 'high',
        status: !foundSensitive ? 'pass' : 'warn',
        message: !foundSensitive 
          ? 'No obvious sensitive data exposed' 
          : 'Potential sensitive data in response',
      });
    }
  }

  async run(): Promise<PenTestReport> {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           MAX BOOSTER - PENETRATION TEST                   ║');
    console.log('║           Security Vulnerability Scanner                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🎯 Target: ${BASE_URL}`);

    const startTime = performance.now();

    await this.testSecurityHeaders();
    await this.testAuthentication();
    await this.testInjectionVulnerabilities();
    await this.testSessionManagement();
    await this.testCORS();
    await this.testErrorHandling();
    await this.testStripeWebhook();
    await this.testRateLimiting();
    await this.testSensitiveDataExposure();

    const duration = (performance.now() - startTime) / 1000;

    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const warnings = this.results.filter(r => r.status === 'warn').length;
    const skipped = this.results.filter(r => r.status === 'skip').length;

    const criticalIssues = this.results.filter(r => r.status === 'fail' && r.severity === 'critical');
    const highIssues = this.results.filter(r => r.status === 'fail' && r.severity === 'high');
    const mediumIssues = this.results.filter(r => r.status === 'fail' && r.severity === 'medium');
    const lowIssues = this.results.filter(r => r.status === 'fail' && r.severity === 'low');

    let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
    if (criticalIssues.length > 0) {
      status = 'FAIL';
    } else if (highIssues.length > 0) {
      status = 'FAIL';
    } else if (warnings > passed * 0.2) {
      status = 'WARN';
    }

    const report: PenTestReport = {
      timestamp: new Date().toISOString(),
      duration,
      totalTests: this.results.length,
      passed,
      failed,
      warnings,
      skipped,
      criticalIssues,
      highIssues,
      mediumIssues,
      lowIssues,
      allResults: this.results,
      status,
      summary: this.generateSummary(status, criticalIssues, highIssues),
    };

    this.printReport(report);
    return report;
  }

  private generateSummary(status: string, critical: SecurityTestResult[], high: SecurityTestResult[]): string {
    if (status === 'PASS') {
      return 'All security tests passed. System is ready for production.';
    } else if (status === 'WARN') {
      return 'Security tests passed with warnings. Review recommended before production.';
    } else {
      return `Security tests FAILED. ${critical.length} critical and ${high.length} high severity issues found.`;
    }
  }

  private printReport(report: PenTestReport): void {
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('                 PENETRATION TEST RESULTS                    ');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`📅 Timestamp: ${report.timestamp}`);
    console.log(`⏱️  Duration: ${report.duration.toFixed(2)}s`);
    console.log('');
    console.log('┌─────────────────────────────────────────────────────────┐');
    console.log('│                   TEST SUMMARY                          │');
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log(`│  Total Tests:        ${String(report.totalTests).padStart(8)}                        │`);
    console.log(`│  ✅ Passed:          ${String(report.passed).padStart(8)}                        │`);
    console.log(`│  ❌ Failed:          ${String(report.failed).padStart(8)}                        │`);
    console.log(`│  ⚠️  Warnings:        ${String(report.warnings).padStart(8)}                        │`);
    console.log(`│  ⏭️  Skipped:         ${String(report.skipped).padStart(8)}                        │`);
    console.log('└─────────────────────────────────────────────────────────┘');
    console.log('');

    if (report.criticalIssues.length > 0) {
      console.log('🚨 CRITICAL ISSUES:');
      for (const issue of report.criticalIssues) {
        console.log(`   - ${issue.test}: ${issue.message}`);
      }
      console.log('');
    }

    if (report.highIssues.length > 0) {
      console.log('⚠️  HIGH SEVERITY ISSUES:');
      for (const issue of report.highIssues) {
        console.log(`   - ${issue.test}: ${issue.message}`);
      }
      console.log('');
    }

    console.log(`📝 Summary: ${report.summary}`);
    console.log('');

    const statusEmoji = report.status === 'PASS' ? '✅' : report.status === 'WARN' ? '⚠️' : '❌';
    console.log('════════════════════════════════════════════════════════════');
    console.log(`           SECURITY TEST STATUS: ${statusEmoji} ${report.status}                  `);
    console.log('════════════════════════════════════════════════════════════');
  }
}

async function main(): Promise<void> {
  try {
    const tester = new PenetrationTester();
    const report = await tester.run();
    
    if (report.status === 'FAIL') {
      console.error('\n❌ Security test FAILED. Address critical/high issues before production.');
      process.exit(1);
    } else if (report.status === 'WARN') {
      console.warn('\n⚠️  Security test passed with warnings. Review issues.');
      process.exit(0);
    } else {
      console.log('\n✅ Security test PASSED. System meets security standards.');
      process.exit(0);
    }
  } catch (error) {
    console.error('Security test failed with error:', error);
    process.exit(1);
  }
}

main();

export { PenetrationTester, PenTestReport };
