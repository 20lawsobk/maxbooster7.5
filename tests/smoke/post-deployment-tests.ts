/**
 * Max Booster — Post-deployment smoke tests
 *
 * Validates that a freshly-deployed (or running) instance is healthy enough
 * to serve real traffic by hitting only PUBLIC endpoints — no auth required.
 *
 * Critical tests must pass; non-critical tests provide signal but don't block.
 *
 * Usage:
 *   npm run test:smoke                  # local (http://localhost:5000)
 *   TEST_BASE_URL=https://...           # production
 */
import { logger } from '../../server/logger.ts';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5000';

interface SmokeTest {
  name: string;
  critical: boolean;
  test: () => Promise<{ ok: boolean; detail?: string }>;
}

class PostDeploymentSmokeTests {
  private tests: SmokeTest[] = [];
  private results: Array<{ name: string; passed: boolean; detail?: string; error?: string }> = [];

  constructor() {
    this.registerTests();
  }

  private registerTests(): void {
    this.tests = [
      // ── Critical: Liveness ───────────────────────────────────────────────────
      {
        name: 'Liveness — GET /health',
        critical: true,
        test: async () => {
          const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(8000) });
          if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
          const data = await r.json() as { status?: string };
          return { ok: data.status === 'ok', detail: `status=${data.status}` };
        },
      },
      {
        name: 'Liveness — GET /api/health',
        critical: true,
        test: async () => {
          const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) });
          if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
          const data = await r.json() as { status?: string; timestamp?: string };
          return { ok: data.status === 'ok' && !!data.timestamp, detail: `status=${data.status}` };
        },
      },
      {
        name: 'Liveness — GET /api/ping',
        critical: true,
        test: async () => {
          const r = await fetch(`${BASE}/api/ping`, { signal: AbortSignal.timeout(8000) });
          if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
          const data = await r.json() as { ok?: boolean; uptime?: number };
          return { ok: data.ok === true && typeof data.uptime === 'number', detail: `uptime=${data.uptime}s` };
        },
      },

      // ── Critical: Readiness (DB + dependencies) ──────────────────────────────
      {
        name: 'Readiness — GET /ready (probes DB + dependencies)',
        critical: true,
        test: async () => {
          const r = await fetch(`${BASE}/ready`, { signal: AbortSignal.timeout(10000) });
          if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
          const data = await r.json() as { status?: string; phase?: string };
          // ready or degraded both indicate the server is functional
          const okPhases = ['ready', 'degraded'];
          return { ok: okPhases.includes(data.phase ?? ''), detail: `phase=${data.phase}` };
        },
      },
      {
        name: 'Readiness — GET /readyz',
        critical: true,
        test: async () => {
          const r = await fetch(`${BASE}/readyz`, { signal: AbortSignal.timeout(10000) });
          return { ok: r.ok, detail: `HTTP ${r.status}` };
        },
      },
      {
        name: 'Startup probes — GET /startup',
        critical: false,
        test: async () => {
          const r = await fetch(`${BASE}/startup`, { signal: AbortSignal.timeout(10000) });
          // 200 = ready; 503 = still warming up — both are valid signals, not errors
          if (r.status !== 200 && r.status !== 503) return { ok: false, detail: `HTTP ${r.status}` };
          const data = await r.json() as { phase?: string; probes?: unknown };
          return { ok: !!data.phase && !!data.probes, detail: `phase=${data.phase}` };
        },
      },

      // ── Critical: Frontend served ────────────────────────────────────────────
      {
        name: 'Frontend — GET / serves HTML',
        critical: true,
        test: async () => {
          const r = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(10000) });
          if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
          const html = await r.text();
          // Must contain the React root and either a script tag or the loader
          const hasRoot = html.includes('id="root"');
          const hasScript = html.includes('<script');
          return { ok: hasRoot && hasScript, detail: `${html.length} bytes` };
        },
      },

      // ── Critical: Auth surface reachable ─────────────────────────────────────
      {
        name: 'Auth — GET /api/auth/me returns 200 (public, null when unauth)',
        critical: true,
        test: async () => {
          const r = await fetch(`${BASE}/api/auth/me`, { signal: AbortSignal.timeout(8000) });
          return { ok: r.ok, detail: `HTTP ${r.status}` };
        },
      },

      // ── Critical: Security middleware active ─────────────────────────────────
      {
        name: 'Security headers — X-Content-Type-Options is nosniff',
        critical: true,
        test: async () => {
          const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) });
          const xcto = r.headers.get('x-content-type-options');
          return { ok: xcto === 'nosniff', detail: `x-content-type-options=${xcto}` };
        },
      },
      {
        name: 'Security headers — CSP or X-Frame-Options present',
        critical: true,
        test: async () => {
          const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) });
          const csp = r.headers.get('content-security-policy');
          const xfo = r.headers.get('x-frame-options');
          return { ok: !!(csp || xfo), detail: `csp=${!!csp} xfo=${xfo}` };
        },
      },
      {
        name: 'Auth guard — protected route returns 401 without auth',
        critical: true,
        test: async () => {
          const r = await fetch(`${BASE}/api/auth/notifications`, { signal: AbortSignal.timeout(8000) });
          return { ok: r.status === 401, detail: `HTTP ${r.status}` };
        },
      },

      // ── Non-critical: Public APIs ────────────────────────────────────────────
      {
        name: 'Public marketplace — GET /api/marketplace/beats',
        critical: false,
        test: async () => {
          const r = await fetch(`${BASE}/api/marketplace/beats`, { signal: AbortSignal.timeout(8000) });
          // 200 (data) or 404 (no listings) both acceptable; 5xx is failure
          const ok = r.status >= 200 && r.status < 500;
          return { ok, detail: `HTTP ${r.status}` };
        },
      },
      {
        name: 'Static assets — favicon served',
        critical: false,
        test: async () => {
          const r = await fetch(`${BASE}/favicon.ico`, { signal: AbortSignal.timeout(8000) });
          // Either a real favicon (200) or a 404 (not yet bundled) — never 5xx
          return { ok: r.status < 500, detail: `HTTP ${r.status}` };
        },
      },
      {
        name: 'OpenAPI docs — GET /api-docs returns Swagger UI',
        critical: false,
        test: async () => {
          const r = await fetch(`${BASE}/api-docs/`, { signal: AbortSignal.timeout(8000), redirect: 'follow' });
          return { ok: r.status >= 200 && r.status < 400, detail: `HTTP ${r.status}` };
        },
      },
    ];
  }

  async runAllTests(): Promise<{ passed: boolean; criticalFailures: number; totalCritical: number }> {
    console.log('\n' + '═'.repeat(70));
    console.log('             POST-DEPLOYMENT SMOKE TESTS');
    console.log(`             Target: ${BASE}`);
    console.log(`             Running ${this.tests.length} tests`);
    console.log('═'.repeat(70) + '\n');

    for (const test of this.tests) {
      try {
        const { ok, detail } = await test.test();
        this.results.push({ name: test.name, passed: ok, detail });
        const icon = ok ? '✅' : '❌';
        const tag = test.critical ? ' (CRITICAL)' : '';
        console.log(`${icon} ${test.name}${tag}${detail ? ` — ${detail}` : ''}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.results.push({ name: test.name, passed: false, error: msg });
        const tag = test.critical ? ' (CRITICAL)' : '';
        console.log(`❌ ${test.name}${tag} — ERROR: ${msg}`);
      }
    }

    return this.generateReport();
  }

  private generateReport(): { passed: boolean; criticalFailures: number; totalCritical: number } {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = this.results.filter(r => !r.passed).length;
    const totalCritical = this.tests.filter(t => t.critical).length;

    const criticalFailures = this.results.filter(r => {
      const test = this.tests.find(t => t.name === r.name);
      return !r.passed && test?.critical;
    }).length;

    console.log('\n' + '═'.repeat(70));
    console.log('                  SMOKE TEST RESULTS');
    console.log('═'.repeat(70));
    console.log(`Total Tests:         ${totalTests}`);
    console.log(`Passed:              ${passedTests} ✅`);
    console.log(`Failed:              ${failedTests} ❌`);
    console.log(`Critical Tests:      ${totalCritical}`);
    console.log(`Critical Failures:   ${criticalFailures} ${criticalFailures > 0 ? '🚨' : '✅'}`);
    console.log('═'.repeat(70));

    if (criticalFailures === 0 && passedTests === totalTests) {
      console.log('  ✅ DEPLOYMENT: SUCCESSFUL — all smoke tests passed.');
    } else if (criticalFailures === 0) {
      console.log('  ⚠️  DEPLOYMENT: PARTIAL SUCCESS');
      console.log('     Critical tests passed; some non-critical tests need review.');
    } else {
      console.log('  ❌ DEPLOYMENT: FAILED');
      console.log('     Critical smoke tests failed. Investigate before serving traffic.');
    }
    console.log('═'.repeat(70) + '\n');

    return {
      passed: criticalFailures === 0,
      criticalFailures,
      totalCritical,
    };
  }
}

const smokeTests = new PostDeploymentSmokeTests();
smokeTests.runAllTests().then(({ passed }) => {
  process.exit(passed ? 0 : 1);
}).catch((error) => {
  logger.error('Smoke tests failed:', error);
  process.exit(1);
});
