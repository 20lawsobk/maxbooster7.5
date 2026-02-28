/**
 * Max Booster Load Test
 *
 * Usage:
 *   node scripts/load-test.mjs [target] [duration] [connections]
 *
 * Examples:
 *   node scripts/load-test.mjs                          # local dev defaults
 *   node scripts/load-test.mjs https://maxbooster.replit.app 30 100
 *
 * Requires: npm i -g autocannon  OR  npx autocannon
 */

import { execSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const TARGET   = process.argv[2] || 'http://localhost:5000';
const DURATION = parseInt(process.argv[3] || '30', 10);   // seconds
const CONNS    = parseInt(process.argv[4] || '50', 10);   // concurrent connections

// Endpoints to test — mix of public, authenticated, and write endpoints
const SCENARIOS = [
  { title: 'Uptime ping', path: '/api/ping', method: 'GET' },
  { title: 'Health check', path: '/api/health', method: 'GET' },
  { title: 'CSRF token', path: '/api/csrf-token', method: 'GET' },
  { title: 'Auth me (unauthenticated)', path: '/api/auth/me', method: 'GET' },
  { title: 'Marketplace listings', path: '/api/marketplace/listings?limit=20', method: 'GET' },
  { title: 'Analytics overview', path: '/api/analytics/overview', method: 'GET' },
];

console.log(`\n🎵 Max Booster Load Test`);
console.log(`   Target:      ${TARGET}`);
console.log(`   Duration:    ${DURATION}s per scenario`);
console.log(`   Connections: ${CONNS} concurrent`);
console.log(`   Scenarios:   ${SCENARIOS.length}\n`);

const results = [];

for (const scenario of SCENARIOS) {
  const url = `${TARGET}${scenario.path}`;
  console.log(`▶ ${scenario.title} — ${scenario.method} ${scenario.path}`);

  try {
    const output = execSync(
      `npx autocannon --json --duration ${DURATION} --connections ${CONNS} "${url}"`,
      { timeout: (DURATION + 10) * 1000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );

    const data = JSON.parse(output);
    const p99 = data.latency?.p99 ?? 'N/A';
    const rps = data.requests?.average ?? 'N/A';
    const errors = data.errors ?? 0;
    const non2xx = data.non2xx ?? 0;

    const status = (p99 !== 'N/A' && p99 < 2000 && errors === 0) ? '✅' : '⚠️';
    console.log(`  ${status} p99=${p99}ms  rps=${rps}  errors=${errors}  non-2xx=${non2xx}`);

    results.push({ scenario: scenario.title, p99, rps, errors, non2xx, ok: p99 < 2000 && errors === 0 });
  } catch (err) {
    console.log(`  ❌ Failed: ${err.message.slice(0, 80)}`);
    results.push({ scenario: scenario.title, p99: 'ERR', rps: 0, errors: 1, non2xx: 0, ok: false });
  }

  console.log('');
}

console.log('═══════════════════════════════════════════════');
console.log('  LOAD TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
for (const r of results) {
  const icon = r.ok ? '✅' : '⚠️';
  console.log(`  ${icon}  ${r.scenario.padEnd(35)} p99=${String(r.p99).padStart(6)}ms  rps=${r.rps}`);
}

const passed = results.filter(r => r.ok).length;
console.log(`\n  ${passed}/${results.length} scenarios within 2s p99 threshold`);
console.log('═══════════════════════════════════════════════\n');
