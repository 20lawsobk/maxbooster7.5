import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// Executed-source coverage complements business assertions. Uncovered files
// remain visible; importing a module or rendering a page is not a full journey.
export default mergeConfig(base, defineConfig({
  test: {
    // The real database contracts are instrumented here while ordinary unit
    // CI keeps its dependency-light scope. The master supplies owned PG tools.
    include: ["tests/coverage/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      include: [
        "client/src/**/*.{ts,tsx,js,mjs,cjs}",
        "server/**/*.{ts,tsx,js,mjs,cjs}",
        "shared/**/*.{ts,tsx,js,mjs,cjs}",
        "built-in plugins dsp/**/*.{ts,tsx,js,mjs,cjs}",
        "external/{maxcore,pdim}/artifacts/*/src/**/*.{ts,tsx,js,mjs,cjs}",
        "external/{maxcore,pdim}/lib/*/src/**/*.{ts,tsx,js,mjs,cjs}",
      ],
      exclude: ["**/node_modules/**", "**/*.d.ts", "**/__tests__/**", "**/tests/**", "**/*.test.*", "**/*.spec.*"],
      reportsDirectory: process.env.MAXBOOSTER_TEST_COVERAGE_DIR || "reports/test-verification/coverage",
      reporter: ["json-summary", "json", "lcov"],
      reportOnFailure: true,
    },
  },
}));
