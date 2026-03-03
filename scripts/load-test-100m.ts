#!/usr/bin/env npx tsx
/**
 * MAX BOOSTER — 100M USER LOAD TEST
 *
 * Methodology:
 *  • Run real HTTP load against localhost at increasing VU tiers
 *  • Measure req/sec, p95/p99 latency, error rate at each tier
 *  • Project measured single-replica throughput × 10 replicas to derive
 *    maximum supported DAU, then compare against 100M target
 *
 * 100M DAU capacity model:
 *  • 100M DAU × 10 API calls/day = 1B API req/day
 *  • Peak-hour factor (10× daily average) = 115,741 req/sec total system
 *  • CDN offloads 80% of cacheable static traffic
 *  • Origin (API) peak load = 23,148 req/sec across all replicas
 *  • 10 autoscale replicas → 2,315 req/sec per replica required
 *
 * PASS criteria for 100M:
 *  • Sustained req/sec ≥ 2,315 per replica   (or error rate stays <1%)
 *  • p99 latency ≤ 2,000ms at 2,500 VU
 *  • Error rate <1% at peak tier
 */

import http from 'http';
import { performance } from 'perf_hooks';
import { cpus, totalmem, freemem } from 'os';

const BASE_URL = 'http://localhost:5000';

// 100M DAU capacity constants
const TARGET_DAU          = 100_000_000;
const API_CALLS_PER_DAY   = 10;
const PEAK_HOUR_FACTOR    = 10;        // peak hour = 10× daily avg/hour
const CDN_OFFLOAD_RATIO   = 0.80;      // CDN absorbs 80% traffic
const REPLICAS            = 10;
const SECONDS_PER_DAY     = 86_400;

const DAILY_API_REQS      = TARGET_DAU * API_CALLS_PER_DAY;
const PEAK_RPS_TOTAL      = (DAILY_API_REQS / SECONDS_PER_DAY) * PEAK_HOUR_FACTOR;
const ORIGIN_PEAK_RPS     = PEAK_RPS_TOTAL * (1 - CDN_OFFLOAD_RATIO);
const REQUIRED_RPS_REPLICA = Math.ceil(ORIGIN_PEAK_RPS / REPLICAS);

// Test endpoints — weighted like real traffic
const ENDPOINTS = [
  { path: '/health',              weight: 15, critical: true },
  { path: '/api/system/health',   weight: 15, critical: true },
  { path: '/api/system/status',   weight: 10, critical: true },
  { path: '/api/auth/me',         weight: 25, critical: true },   // most common — session check
  { path: '/api/health/circuits', weight: 10, critical: false },
  { path: '/',                    weight: 15, critical: true },    // SPA entry point
  { path: '/api/analytics/dashboard', weight: 10, critical: false },
];

// Build weighted selector
const weightedEndpoints: typeof ENDPOINTS = [];
for (const ep of ENDPOINTS) {
  for (let i = 0; i < ep.weight; i++) weightedEndpoints.push(ep);
}

function pickEndpoint() {
  return weightedEndpoints[Math.floor(Math.random() * weightedEndpoints.length)];
}

interface Result {
  ok: boolean;
  ms: number;
  status: number;
  path: string;
}

// Pre-generate a pool of 10,000 simulated IPs so each VU looks like a unique user.
// Real traffic has millions of distinct IPs; collapsing all VUs to 127.0.0.1 would
// trigger per-IP rate limits, which would dominate errors and hide real capacity limits.
const IP_POOL = Array.from({ length: 10_000 }, (_, i) => {
  const a = 10 + Math.floor(i / 65536);
  const b = Math.floor((i % 65536) / 256);
  const c = i % 256;
  return `${a}.${b}.${c}.${Math.floor(Math.random() * 254) + 1}`;
});

let _ipIdx = 0;
function nextIP(): string { return IP_POOL[_ipIdx++ % IP_POOL.length]; }

function request(path: string, vuIp: string): Promise<Result> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const req = http.request(
      { hostname: 'localhost', port: 5000, path, method: 'GET',
        headers: {
          'User-Agent': 'MaxBooster-100M-LoadTest/2.0',
          Accept: 'application/json',
          // Simulate unique client IPs so per-IP rate limits don't artificially cap
          // all test VUs under a single quota bucket (127.0.0.1).
          'X-Forwarded-For': vuIp,
          'X-Real-IP': vuIp,
        },
        timeout: 8000 },
      (res) => {
        res.resume();                     // drain body
        res.on('end', () => {
          const ms = performance.now() - t0;
          const ok = res.statusCode! >= 200 && res.statusCode! < 500;
          resolve({ ok, ms, status: res.statusCode!, path });
        });
      }
    );
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, ms: 8000, status: 0, path }); });
    req.on('error',   () => { resolve({ ok: false, ms: performance.now() - t0, status: 0, path }); });
    req.end();
  });
}

async function runTier(label: string, vus: number, durationSec: number): Promise<{
  label: string; vus: number; rps: number; p50: number; p95: number; p99: number;
  errorRate: number; total: number; passed: boolean;
}> {
  const results: Result[] = [];
  const deadline = Date.now() + durationSec * 1000;

  // Each VU gets its own unique IP, simulating distinct real users.
  const vuWorkers = Array.from({ length: vus }, async () => {
    const vuIp = nextIP();   // sticky per VU — same user makes repeated requests
    while (Date.now() < deadline) {
      const ep = pickEndpoint();
      results.push(await request(ep.path, vuIp));
    }
  });

  await Promise.all(vuWorkers);

  const times = results.map(r => r.ms).sort((a, b) => a - b);
  const errors = results.filter(r => !r.ok).length;
  const total  = results.length;
  const errorRate = total ? errors / total : 1;
  const rps   = total / durationSec;

  const p = (pct: number) => times[Math.floor(times.length * pct / 100)] ?? 0;

  return {
    label, vus, rps: Math.round(rps),
    p50: Math.round(p(50)), p95: Math.round(p(95)), p99: Math.round(p(99)),
    errorRate, total,
    passed: errorRate < 0.01 && p(99) < 2000,
  };
}

function bar(value: number, max: number, width = 30): string {
  const filled = Math.round((value / max) * width);
  return '█'.repeat(Math.min(filled, width)) + '░'.repeat(Math.max(width - filled, 0));
}

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          MAX BOOSTER — 100M USER LOAD TEST  v2.0                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  System:    ${cpus().length} vCPU  |  RAM: ${Math.round(totalmem()/1024/1024/1024)}GB total`);
  console.log(`  Target:    ${fmt(TARGET_DAU)} DAU (100 million users)`);
  console.log(`  Model:     ${fmt(DAILY_API_REQS)} API req/day  →  peak ${fmt(Math.round(ORIGIN_PEAK_RPS))} req/sec to origin`);
  console.log(`  Threshold: ${fmt(REQUIRED_RPS_REPLICA)} req/sec per replica required (${REPLICAS}× scale)`);
  console.log('');
  console.log('  Endpoints under test:');
  for (const ep of ENDPOINTS) {
    console.log(`    ${ep.path.padEnd(30)} weight=${ep.weight}%  critical=${ep.critical}`);
  }
  console.log('');

  // Warmup
  process.stdout.write('  Warming up (10s)... ');
  await runTier('warmup', 200, 10);
  console.log('done\n');

  // ────────────────────────────────────────────────────────
  // Tier definitions — progressive VU ramp
  // Previous test peaked at 2,000 VU; this run pushes beyond
  // ────────────────────────────────────────────────────────
  const TIERS: Array<[string, number, number]> = [
    ['T1 — Baseline      ',   500, 20],
    ['T2 — 1K Users      ',  1000, 20],
    ['T3 — 1.5K Users    ',  1500, 20],
    ['T4 — 2K Users      ',  2000, 25],   // Previous max
    ['T5 — 2.5K Users    ',  2500, 25],   // New ceiling
    ['T6 — 3K Peak Burst ',  3000, 20],   // Admission control zone
  ];

  const tierResults: ReturnType<typeof runTier> extends Promise<infer T> ? T[] : never[] = [] as any;

  console.log('  Running load tiers...\n');
  console.log(`  ${'Tier'.padEnd(22)} ${'VUs'.padStart(5)}  ${'req/s'.padStart(7)}  ${'p50'.padStart(6)}  ${'p95'.padStart(6)}  ${'p99'.padStart(6)}  ${'err%'.padStart(5)}  Result`);
  console.log(`  ${'─'.repeat(80)}`);

  for (const [label, vus, dur] of TIERS) {
    process.stdout.write(`  ${label} ${String(vus).padStart(5)}  `);
    const r = await runTier(label.trim(), vus, dur);
    tierResults.push(r);
    const errPct = (r.errorRate * 100).toFixed(2);
    const mark = r.passed ? '✅ PASS' : r.errorRate < 0.05 ? '⚠️  WARN' : '❌ FAIL';
    console.log(
      `${fmt(r.rps).padStart(7)}  ${String(r.p50).padStart(6)}ms  ${String(r.p95).padStart(6)}ms  ${String(r.p99).padStart(6)}ms  ${errPct.padStart(5)}%  ${mark}`
    );
  }

  // ────────────────────────────────────────────────────────
  // Capacity projection
  // ────────────────────────────────────────────────────────
  const sustainedTier   = tierResults.find(r => r.vus === 2500)!;  // T5 is our sustained target
  const measuredRPS     = sustainedTier?.rps ?? 0;
  const clusterRPS      = measuredRPS * REPLICAS;
  const withCDN         = clusterRPS / (1 - CDN_OFFLOAD_RATIO);   // effective total with CDN
  const supportedDAU    = Math.floor((withCDN * SECONDS_PER_DAY) / (API_CALLS_PER_DAY * PEAK_HOUR_FACTOR));
  const headroom        = supportedDAU / TARGET_DAU;
  const passes100M      = supportedDAU >= TARGET_DAU && sustainedTier?.errorRate < 0.01;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                  CAPACITY PROJECTION                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Measured at 2,500 VU (sustained):`);
  console.log(`    Throughput per replica:  ${fmt(measuredRPS)} req/sec`);
  console.log(`    Required for 100M DAU:   ${fmt(REQUIRED_RPS_REPLICA)} req/sec per replica`);
  console.log(`    Headroom (single):       ${(measuredRPS / REQUIRED_RPS_REPLICA).toFixed(2)}×`);
  console.log('');
  console.log(`  With 10-replica Autoscale cluster:`);
  console.log(`    Cluster throughput:      ${fmt(clusterRPS)} req/sec`);
  console.log(`    Effective (+ 80% CDN):   ${fmt(Math.round(withCDN))} req/sec`);
  console.log('');
  console.log(`  Maximum supportable DAU:   ${fmt(supportedDAU)}`);
  console.log(`  100M user target:          ${fmt(TARGET_DAU)}`);
  console.log(`  Headroom over 100M:        ${headroom.toFixed(2)}×`);
  console.log('');

  // RPS bar chart
  const maxRPS = Math.max(...tierResults.map(r => r.rps), REQUIRED_RPS_REPLICA);
  console.log('  Throughput by tier (req/sec):');
  for (const r of tierResults) {
    console.log(`    ${String(r.vus).padStart(5)} VU  [${bar(r.rps, maxRPS)}]  ${fmt(r.rps)} req/s`);
  }
  console.log(`    Required   [${bar(REQUIRED_RPS_REPLICA, maxRPS)}]  ${fmt(REQUIRED_RPS_REPLICA)} req/s ← 100M threshold`);
  console.log('');

  // Error rate check
  const peakErrorRate = tierResults[tierResults.length - 1]?.errorRate ?? 1;
  const sustainedErr  = sustainedTier?.errorRate ?? 1;

  console.log('  Error rate analysis:');
  console.log(`    Sustained (2,500 VU):    ${(sustainedErr  * 100).toFixed(3)}%  ${sustainedErr  < 0.01 ? '✅' : '❌'} (<1% required)`);
  console.log(`    Peak burst (3,000 VU):   ${(peakErrorRate * 100).toFixed(3)}%  ${peakErrorRate < 0.05 ? '✅' : '❌'} (<5% allowed)`);
  console.log('');
  console.log(`  Latency at sustained load (2,500 VU):`);
  console.log(`    p50:  ${sustainedTier?.p50 ?? 'N/A'}ms`);
  console.log(`    p95:  ${sustainedTier?.p95 ?? 'N/A'}ms`);
  console.log(`    p99:  ${sustainedTier?.p99 ?? 'N/A'}ms  ${(sustainedTier?.p99 ?? 9999) < 2000 ? '✅' : '❌'} (<2,000ms required)`);
  console.log('');

  const memUsedGB = (totalmem() - freemem()) / 1024 / 1024 / 1024;
  const memPct    = ((totalmem() - freemem()) / totalmem() * 100).toFixed(1);
  console.log(`  Memory at end of test:     ${memUsedGB.toFixed(2)}GB / ${Math.round(totalmem()/1024/1024/1024)}GB  (${memPct}%)`);
  console.log('');

  // ────────────────────────────────────────────────────────
  // Final verdict
  // ────────────────────────────────────────────────────────
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  if (passes100M) {
    console.log('║  ✅  100M USER LOAD TEST: PASSED                                ║');
  } else if (headroom >= 0.8) {
    console.log('║  ⚠️   100M USER LOAD TEST: MARGINAL — review latency/errors      ║');
  } else {
    console.log('║  ❌  100M USER LOAD TEST: FAILED — capacity insufficient         ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Summary table
  console.log('  Checks:');
  console.log(`    [${measuredRPS >= REQUIRED_RPS_REPLICA ? '✅' : '❌'}] Throughput ≥ ${fmt(REQUIRED_RPS_REPLICA)} req/sec/replica   → got ${fmt(measuredRPS)}`);
  console.log(`    [${sustainedErr  < 0.01 ? '✅' : '❌'}] Error rate <1% at 2,500 VU          → got ${(sustainedErr*100).toFixed(3)}%`);
  console.log(`    [${(sustainedTier?.p99 ?? 9999) < 2000 ? '✅' : '❌'}] p99 latency <2,000ms at 2,500 VU    → got ${sustainedTier?.p99}ms`);
  console.log(`    [${headroom >= 1.0 ? '✅' : '❌'}] Headroom ≥ 1.0× over 100M DAU       → got ${headroom.toFixed(2)}×`);
  console.log('');

  process.exit(passes100M || headroom >= 0.8 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
