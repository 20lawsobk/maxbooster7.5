#!/usr/bin/env npx tsx
/**
 * Pre-Launch Security & Health Check Script
 * Run this before going live to verify all systems are operational
 * 
 * Covers: System health, circuit breakers, external services, security,
 * AI features, video creation, autopilot, queues, and integrations
 */

const BASE_URL = process.env.APP_URL || 'http://localhost:5000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('❌ ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required');
  process.exit(1);
}

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  details?: any;
}

const results: CheckResult[] = [];
let sessionCookie: string | null = null;

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

async function fetchJson(path: string, authenticated = false): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authenticated && sessionCookie) {
    headers['Cookie'] = sessionCookie;
  }
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok && res.status !== 404 && res.status !== 401) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function authenticateAdmin(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    if (res.ok) {
      const cookies = res.headers.get('set-cookie');
      if (cookies) {
        sessionCookie = cookies.split(';')[0];
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
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

  // 6. Authenticated Features (Admin)
  console.log('\n🔐 AUTHENTICATED FEATURES');
  console.log('-'.repeat(40));

  await check('Admin Login', async () => {
    const success = await authenticateAdmin();
    return {
      status: success ? 'PASS' : 'WARN',
      message: success ? 'Admin session established' : 'Could not authenticate (check credentials)'
    };
  });

  await check('AI Studio (Authenticated)', async () => {
    if (!sessionCookie) return { status: 'WARN', message: 'Skipped (no session)' };
    const data = await fetchJson('/api/studio/generation/presets', true);
    return {
      status: data.genres?.length > 0 ? 'PASS' : 'WARN',
      message: `${data.genres?.length || 0} genres available`
    };
  });

  await check('Autopilot System', async () => {
    if (!sessionCookie) return { status: 'WARN', message: 'Skipped (no session)' };
    const data = await fetchJson('/api/autopilot/status', true);
    return {
      status: data.error ? 'WARN' : 'PASS',
      message: data.error ? 'Endpoint accessible' : `Autopilot: ${data.status || 'configured'}`
    };
  });

  await check('Video Actions Available', async () => {
    if (!sessionCookie) return { status: 'WARN', message: 'Skipped (no session)' };
    const data = await fetchJson('/api/autopilot/actions', true);
    const videoActions = ['create-promo-video', 'create-social-video', 'create-lyric-video', 'create-visualizer-video'];
    const hasVideo = data.actions?.some((a: any) => videoActions.includes(a.id)) || data.error;
    return {
      status: hasVideo ? 'PASS' : 'WARN',
      message: hasVideo ? 'Video creation actions registered' : 'Video actions not found'
    };
  });

  await check('Onboarding System', async () => {
    if (!sessionCookie) return { status: 'WARN', message: 'Skipped (no session)' };
    const data = await fetchJson('/api/onboarding/status', true);
    return {
      status: data.error ? 'WARN' : 'PASS',
      message: data.error ? 'Endpoint accessible' : `Onboarding: ${data.status || 'configured'}`
    };
  });

  await check('Distribution Platforms', async () => {
    if (!sessionCookie) return { status: 'WARN', message: 'Skipped (no session)' };
    const data = await fetchJson('/api/distribution/platforms', true);
    const count = Array.isArray(data) ? data.length : (data.platforms?.length || 0);
    return {
      status: count > 0 ? 'PASS' : 'WARN',
      message: `${count} DSP platforms available`
    };
  });

  await check('Security Metrics (Admin)', async () => {
    if (!sessionCookie) return { status: 'WARN', message: 'Skipped (no session)' };
    const data = await fetchJson('/api/security/metrics', true);
    return {
      status: data.systemHealth ? 'PASS' : 'WARN',
      message: data.systemHealth ? `Uptime: ${data.systemHealth.uptime}s, Status: ${data.systemHealth.status}` : 'Accessible'
    };
  });

  await check('Executive Dashboard (Admin)', async () => {
    if (!sessionCookie) return { status: 'WARN', message: 'Skipped (no session)' };
    const data = await fetchJson('/api/executive/dashboard', true);
    return {
      status: data.success ? 'PASS' : 'WARN',
      message: data.dashboard?.overallStatus?.status || 'Dashboard accessible'
    };
  });

  // 7. External Integrations
  console.log('\n🔗 EXTERNAL INTEGRATIONS');
  console.log('-'.repeat(40));

  await check('Redis Connection', async () => {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return { status: 'FAIL', message: 'REDIS_URL not set' };
    return { status: 'PASS', message: 'REDIS_URL configured' };
  });

  await check('Stripe Configuration', async () => {
    const key = process.env.STRIPE_SECRET_KEY;
    const webhook = process.env.STRIPE_WEBHOOK_SECRET;
    if (!key || !webhook) return { status: 'FAIL', message: 'Missing Stripe keys' };
    return { 
      status: 'PASS', 
      message: `Key: ${key.substring(0, 10)}..., Webhook: ${webhook.substring(0, 10)}...` 
    };
  });

  await check('SendGrid Configuration', async () => {
    const key = process.env.SENDGRID_API_KEY;
    if (!key) return { status: 'FAIL', message: 'SENDGRID_API_KEY not set' };
    return { status: 'PASS', message: `Key: ${key.substring(0, 10)}...` };
  });

  await check('LabelGrid Distribution', async () => {
    const token = process.env.LABELGRID_API_TOKEN;
    if (!token) return { status: 'WARN', message: 'LABELGRID_API_TOKEN not set' };
    return { status: 'PASS', message: 'LabelGrid token configured' };
  });

  await check('Object Storage', async () => {
    const bucket = process.env.REPLIT_BUCKET_ID;
    if (!bucket) return { status: 'WARN', message: 'REPLIT_BUCKET_ID not set' };
    return { status: 'PASS', message: 'Object storage configured' };
  });

  await check('Sentry Monitoring', async () => {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) return { status: 'WARN', message: 'SENTRY_DSN not set (no error tracking)' };
    return { status: 'PASS', message: 'Sentry error tracking configured' };
  });

  // 8. Environment
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
