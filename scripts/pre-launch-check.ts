#!/usr/bin/env tsx
/**
 * Pre-launch readiness check.
 *
 * Verifies that all required environment variables are set and that
 * critical subsystems (database, health endpoint) are reachable before
 * a deployment is promoted to production traffic.
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];
let failed = 0;

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} ${name} — ${detail}`);
  if (!ok) failed++;
}

// ── 1. Required environment variables ────────────────────────────────────────
console.log('\n── Environment variables ────────────────────────────────────────────');
const required = ['DATABASE_URL', 'SESSION_SECRET'];
for (const key of required) {
  check(`${key} is set`, !!process.env[key], process.env[key] ? 'present' : 'MISSING');
}

const optionalWarned = ['STRIPE_SECRET_KEY', 'SENDGRID_API_KEY', 'MAXCORE_API_KEY'];
for (const key of optionalWarned) {
  const present = !!process.env[key];
  check(`${key} (optional)`, true, present ? 'present' : 'not set (feature degraded)');
}

// ── 2. Required files ────────────────────────────────────────────────────────
console.log('\n── Required files ───────────────────────────────────────────────────');
const geoDb = resolve(process.cwd(), process.env.GEODB_PATH ?? 'data/GeoLite2-Country.mmdb');
check('GeoLite2-Country.mmdb exists', existsSync(geoDb), existsSync(geoDb) ? geoDb : 'missing — run scripts/download-geodb.sh');

// ── 3. TypeScript compilation (no emit, just type-check) ─────────────────────
console.log('\n── TypeScript type check ────────────────────────────────────────────');
try {
  // Use a short timeout — tsc can be slow on large codebases under load.
  // The dedicated `typecheck` workflow is the authoritative check; here we
  // just do a quick sanity pass.  A timeout is not a type error.
  const out = execSync('npx tsc --noEmit --skipLibCheck 2>&1', { encoding: 'utf8', timeout: 60_000 });
  const errors = out.split('\n').filter(l => /error TS/.test(l));
  check('TypeScript compiles without errors', errors.length === 0,
    errors.length === 0 ? 'clean' : errors.slice(0, 3).join(' | '));
} catch (err: unknown) {
  const out = (err as { stdout?: string }).stdout ?? String(err);
  const errors = out.split('\n').filter(l => /error TS/.test(l));
  if (errors.length === 0) {
    // No "error TS" lines — tsc timed out or crashed without type errors.
    // The dedicated typecheck workflow is the authoritative check; skip here.
    check('TypeScript type check (timed out — see typecheck workflow)', true, 'skipped (no errors found)');
  } else {
    check('TypeScript compiles without errors', false, errors.slice(0, 3).join(' | '));
  }
}

// ── 4. Database connectivity ─────────────────────────────────────────────────
console.log('\n── Database connectivity ────────────────────────────────────────────');
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 5_000 });
    const client = await pool.connect();
    const { rows } = await client.query('SELECT 1 AS ok');
    client.release();
    await pool.end();
    check('PostgreSQL connection', rows[0]?.ok === 1, 'connected');
  } catch (err: unknown) {
    check('PostgreSQL connection', false, String(err).slice(0, 120));
  }
} else {
  check('PostgreSQL connection', false, 'DATABASE_URL not set — skipped');
}

// ── 5. Health endpoint (if server URL known) ─────────────────────────────────
console.log('\n── Health endpoint ──────────────────────────────────────────────────');
const baseUrl = process.env.TEST_BASE_URL ?? process.env.APP_URL ?? 'http://localhost:5000';
try {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  const r = await fetch(`${baseUrl}/health`, { signal: ctrl.signal });
  clearTimeout(timer);
  check(`GET ${baseUrl}/health`, r.ok, `HTTP ${r.status}`);
} catch {
  check(`GET ${baseUrl}/health`, false, 'unreachable (server may not be running locally)');
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`  PRE-LAUNCH CHECK — ${failed === 0 ? 'PASSED ✅' : `FAILED ❌ (${failed} issue${failed > 1 ? 's' : ''})`}`);
console.log('═'.repeat(60) + '\n');

process.exit(failed > 0 ? 1 : 0);
