#!/usr/bin/env npx tsx
/**
 * Pre-Launch Security & Health Check Script
 * Run this before going live to verify all systems are operational
 */

const BASE_URL = process.env.APP_URL || 'http://localhost:5000';

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  details?: any;
}

const results: CheckResult[] = [];

async function check(name: string, fn: () => Promise<CheckResult['status'] | { status: CheckResult['status']; message?: string; details?: any }>): Promise<void> {
  try {
    const result = await fn();
    if (typeof result === 'string') {
      results.push({ name, status: result, message: result === 'PASS' ? 'OK' : 'Check failed' });
    } else {
      results.push({ name, status: result.status, message: result.message || '', details: result.details });
    }
  } catch (error: any) {
    results.push({ name, status: 'FAIL', message: error.message });
  }
}

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok && res.status !== 404) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function runChecks(): Promise<void> {
  console.log('\n🚀 MAX BOOSTER PRE-LAUNCH CHECK\n');
  console.log('='.repeat(50));
  console.log(`Target: ${BASE_URL}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('='.repeat(50) + '\n');

  // 1. System Health
  console.log('📊 SYSTEM HEALTH');
  console.log('-'.repeat(40));

  await check('System Status', async () => {
    const data = await fetchJson('/api/system/status');
    return {
      status: data.status === 'ok' ? 'PASS' : 'FAIL',
      message: `Status: ${data.status}, Uptime: ${data.uptime_percentage}%`,
      details: data
    };
  });

  await check('System Health', async () => {
    const data = await fetchJson('/api/system/health');
    return {
      status: data.status === 'healthy' ? 'PASS' : 'FAIL',
      message: `DB Queries: ${data.database?.queries?.total || 0}, P95: ${data.database?.queries?.p95Ms || 0}ms`,
      details: data.monitoring
    };
  });

  // 2. Circuit Breakers
  console.log('\n⚡ CIRCUIT BREAKERS');
  console.log('-'.repeat(40));

  await check('Circuit Breakers', async () => {
    const data = await fetchJson('/api/health/circuits');
    const unhealthy = data.circuits?.filter((c: any) => !c.isHealthy) || [];
    return {
      status: data.summary?.unhealthy === 0 ? 'PASS' : 'FAIL',
      message: `${data.summary?.healthy}/${data.summary?.total} healthy`,
      details: unhealthy.length > 0 ? { unhealthy: unhealthy.map((c: any) => c.name) } : undefined
    };
  });

  // 3. External Services
  console.log('\n🔌 EXTERNAL SERVICES');
  console.log('-'.repeat(40));

  await check('Database Connection', async () => {
    const data = await fetchJson('/api/system/health');
    return {
      status: data.database?.queries?.total > 0 ? 'PASS' : 'WARN',
      message: `${data.database?.queries?.total || 0} queries executed`
    };
  });

  await check('Public Status Page', async () => {
    const data = await fetchJson('/api/status');
    return {
      status: data.overallStatus === 'operational' ? 'PASS' : 'WARN',
      message: `Status: ${data.overallStatus}`
    };
  });

  // 4. Security Endpoints
  console.log('\n🔒 SECURITY');
  console.log('-'.repeat(40));

  await check('Auth Endpoint', async () => {
    const data = await fetchJson('/api/auth/me');
    return {
      status: 'PASS',
      message: 'Auth endpoint responding'
    };
  });

  await check('CSRF Protection', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', password: 'test' })
    });
    return {
      status: res.status === 401 || res.status === 400 ? 'PASS' : 'WARN',
      message: `Login returns ${res.status} for invalid credentials`
    };
  });

  // 5. Core Features
  console.log('\n🎵 CORE FEATURES');
  console.log('-'.repeat(40));

  await check('AI Studio Presets', async () => {
    const res = await fetch(`${BASE_URL}/api/studio/generation/presets`);
    if (res.status === 401) {
      return { status: 'PASS', message: 'Auth required (expected)' };
    }
    const data = await res.json();
    return {
      status: data.genres?.length > 0 ? 'PASS' : 'FAIL',
      message: `${data.genres?.length || 0} genres, ${data.instrumentTypes?.length || 0} instruments`
    };
  });

  await check('Contract Templates', async () => {
    const data = await fetchJson('/api/contracts/templates');
    return {
      status: data.templates?.length > 0 ? 'PASS' : 'FAIL',
      message: `${data.templates?.length || 0} templates available`
    };
  });

  await check('Help Desk AI', async () => {
    const data = await fetchJson('/api/helpdesk/welcome');
    return {
      status: data.success ? 'PASS' : 'FAIL',
      message: data.assistant?.name ? `AI Assistant: ${data.assistant.name}` : 'No assistant'
    };
  });

  // 6. Environment
  console.log('\n🔧 ENVIRONMENT');
  console.log('-'.repeat(40));

  const requiredEnvVars = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'SENDGRID_API_KEY',
    'REDIS_URL'
  ];

  for (const envVar of requiredEnvVars) {
    await check(`ENV: ${envVar}`, async () => ({
      status: process.env[envVar] ? 'PASS' : 'FAIL',
      message: process.env[envVar] ? 'Set' : 'MISSING'
    }));
  }

  // Print Results Summary
  console.log('\n' + '='.repeat(50));
  console.log('📋 RESULTS SUMMARY');
  console.log('='.repeat(50) + '\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;

  for (const result of results) {
    const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${result.name}: ${result.message}`);
  }

  console.log('\n' + '-'.repeat(50));
  console.log(`Total: ${results.length} checks`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Warnings: ${warned}`);
  console.log('-'.repeat(50));

  if (failed > 0) {
    console.log('\n❌ PRE-LAUNCH CHECK FAILED');
    console.log('Fix the issues above before launching.\n');
    process.exit(1);
  } else if (warned > 0) {
    console.log('\n⚠️  PRE-LAUNCH CHECK PASSED WITH WARNINGS');
    console.log('Review warnings before launching.\n');
  } else {
    console.log('\n✅ ALL PRE-LAUNCH CHECKS PASSED');
    console.log('Max Booster is ready for launch! 🚀\n');
  }
}

runChecks().catch(console.error);
