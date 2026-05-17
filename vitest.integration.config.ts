import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Integration tests hitting a running Express server via fetch.
    // Files must run sequentially so concurrent test suites don't interfere
    // with each other's sessions, DB writes, or rate-limit counters.
    // Run via: npm run test:integration
    fileParallelism: false,
    globalSetup: ['tests/globalSetup.ts'],
    include: [
      // Core platform
      'tests/health.test.ts',
      'tests/api-guards.test.ts',
      'tests/auth-flows.test.ts',
      'tests/security-hardening.test.ts',
      'tests/webhook-security.test.ts',
      'tests/critical-paths.test.ts',
      'tests/paid-user-e2e.test.ts',
      'tests/ai-analytics-integration.test.ts',
      'tests/cache-invalidation.test.ts',
      'tests/unit/cache-cross-pod.test.ts',
      'tests/file-management.test.ts',
      'tests/billing-lifecycle.test.ts',
      'tests/auth-2fa.test.ts',
      // Feature coverage — previously untested platform areas
      'tests/feature-press-pitching-ar.test.ts',
      'tests/feature-catalog-production.test.ts',
      'tests/feature-revenue-merch.test.ts',
      'tests/feature-marketplace-distribution.test.ts',
      'tests/feature-storefront-dns.test.ts',
    ],
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ['verbose', 'junit'],
    outputFile: 'test-results-integration.xml',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
});
