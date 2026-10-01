import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Unit tests only — no running server required.
    // Integration tests (tests/*.integration.test.ts) run separately via `npm run test:integration`.
    include: [
      "server/**/__tests__/**/*.test.ts",
      "server/**/__tests__/**/*.spec.ts",
      "tests/unit/**/*.test.ts",
    ],
    exclude: [
      "node_modules/**",
      "client/**",
      "dist/**",
      "tests/critical-paths.test.ts",
      "tests/paid-user-e2e.test.ts",
      // Legacy Jest-based test files not converted to Vitest
      "tests/unit/example.test.ts",
      "server/simulations/__tests__/verifyKPIs.test.ts",
    ],
    environment: "node",
    globals: true,
    setupFiles: ["tests/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    pool: "forks",
    // These suites include process-spawning PDIM simulations whose waits are
    // wall-clock sensitive; on small CI containers the default worker-per-CPU
    // parallelism starves them into intermittent timeouts. Cap the workers
    // and let vitest retry a failed file once in a fresh process so a
    // starved simulation gets one clean shot instead of failing the run.
    maxWorkers: 2,
    retry: 1,
    // @ts-ignore — poolOptions is valid in vitest 4.x but missing from older type stubs
    poolOptions: {
      forks: {
        execArgv: ["--max-old-space-size=4096"],
      },
    },
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      include: [
        "server/services/**",
        "server/middleware/**",
        "server/safety/**",
        "server/lib/**",
      ],
      exclude: ["server/services/diffusion/**", "**/__tests__/**", "**/*.d.ts"],
      reporter: ["text", "lcov"],
      thresholds: {
        statements: 20,
        functions: 20,
        lines: 20,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
