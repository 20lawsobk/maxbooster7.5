import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // CI-safe integration tests: health probes + auth guard checks.
    // These tests hit a running Express server via fetch — no DB writes required
    // for health or unauthenticated-guard tests, only a running server.
    include: [
      'tests/health.test.ts',
      'tests/api-guards.test.ts',
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
