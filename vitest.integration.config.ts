import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Integration tests hitting a running Express server via fetch.
    // Run via: npm run test:integration
    include: [
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
