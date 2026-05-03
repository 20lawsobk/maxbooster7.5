import { Router, type RequestHandler } from 'express';
import { require2FA } from '../middleware/auth.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../db.js';
import { users, projects, releases } from '../../shared/schema.js';
import { count, eq } from 'drizzle-orm';
import { logger } from '../logger.js';

const router = Router();

/**
 * POST /api/testing/setup-stripe-customer
 * Test-only endpoint (NODE_ENV=test only) that sets stripeCustomerId on the
 * authenticated user directly in the DB so integration tests can exercise the
 * full billing-webhook tier-update flow without a live Stripe connection.
 */
router.post('/setup-stripe-customer', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!req.isAuthenticated?.() || !req.user?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const { stripeCustomerId } = req.body as Record<string, unknown>;
  if (typeof stripeCustomerId !== 'string' || !stripeCustomerId) {
    return res.status(400).json({ error: 'stripeCustomerId (string) required' });
  }
  await db.update(users).set({ stripeCustomerId }).where(eq(users.id, req.user.id));
  return res.json({ success: true });
});

/**
 * GET /api/testing/user-tier
 * Test-only endpoint (non-production) that returns the authenticated user's
 * subscriptionTier read directly from the primary DB — no Stripe API call,
 * no caching.  Used by billing integration tests to verify webhook-driven
 * tier updates without interference from the Stripe subscription-sync logic.
 */
router.get('/user-tier', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!req.isAuthenticated?.() || !req.user?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const [row] = await db
    .select({ subscriptionTier: users.subscriptionTier })
    .from(users)
    .where(eq(users.id, req.user.id))
    .limit(1);
  return res.json({ tier: row?.subscriptionTier ?? 'free' });
});

const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

router.use(requireAdmin);
router.use(require2FA);

interface TestSuiteSummary {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

interface TestRunArtifact {
  ranAt: string;
  durationMs: number;
  suites: TestSuiteSummary[];
  coverage?: { statements: number; branches: number; functions: number; lines: number };
}

const RESULTS_PATH = path.resolve(process.cwd(), 'logs', 'test-results.json');

async function loadStoredRun(): Promise<TestRunArtifact | null> {
  try {
    const raw = await fs.readFile(RESULTS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as TestRunArtifact;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.suites)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

router.get('/results', async (_req, res) => {
  try {
    const stored = await loadStoredRun();

    if (!stored) {
      const [{ value: userCount }] = await db.select({ value: count() }).from(users);
      const [{ value: projectCount }] = await db.select({ value: count() }).from(projects);
      const [{ value: releaseCount }] = await db.select({ value: count() }).from(releases);

      return res.json({
        overallScore: null,
        lastRunDate: null,
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, duration: '0.0' },
        testSuites: [],
        coverage: null,
        runtimeStats: {
          users: userCount,
          projects: projectCount,
          releases: releaseCount,
        },
        message: 'No test runs recorded yet. Use POST /api/testing/run to trigger a suite, or write a TestRunArtifact JSON to logs/test-results.json from your CI pipeline.',
      });
    }

    const totalPassed = stored.suites.reduce((sum, s) => sum + s.passed, 0);
    const totalFailed = stored.suites.reduce((sum, s) => sum + s.failed, 0);
    const totalSkipped = stored.suites.reduce((sum, s) => sum + s.skipped, 0);
    const totalTests = totalPassed + totalFailed + totalSkipped;
    const totalDuration = stored.suites.reduce((sum, s) => sum + s.duration, 0);
    const overallScore = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

    return res.json({
      overallScore,
      lastRunDate: stored.ranAt,
      summary: {
        total: totalTests,
        passed: totalPassed,
        failed: totalFailed,
        skipped: totalSkipped,
        duration: (totalDuration / 1000).toFixed(1),
      },
      testSuites: stored.suites,
      coverage: stored.coverage ?? null,
    });
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching test results');
    return res.status(500).json({ error: 'Failed to fetch test results' });
  }
});

router.post('/run', async (req, res) => {
  try {
    const { suite } = req.body ?? {};
    const requested = typeof suite === 'string' && suite.length > 0 ? suite : 'all';

    logger.info({ requested, requestedBy: req.user?.id }, 'Test run requested via admin API');

    return res.status(202).json({
      accepted: true,
      suite: requested,
      message: 'Test runs are not executed by the API server. Trigger your CI pipeline (e.g. GitHub Actions test-runner.yml) and write logs/test-results.json on completion to surface results in this dashboard.',
      docsUrl: '/docs/testing',
    });
  } catch (error) {
    logger.warn({ err: error }, 'Error handling test run request');
    return res.status(500).json({ error: 'Failed to handle test run request' });
  }
});

export default router;
