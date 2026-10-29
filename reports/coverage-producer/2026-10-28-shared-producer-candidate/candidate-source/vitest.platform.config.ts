import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createContract } from "./scripts/testing/coverage-shared-provider.mjs";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));
const reportsDirectory = process.env.MAXBOOSTER_TEST_COVERAGE_DIR || "reports/test-verification/coverage";

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
      reportsDirectory,
      reporter: ["json-summary", "json", "lcov", [
        path.join(repositoryRoot, "scripts/testing/coverage-raw-sidecar-reporter.cjs"),
        { output: path.resolve(repositoryRoot, reportsDirectory, "raw-p1"), contract: createContract(repositoryRoot) },
      ]],
      reportOnFailure: true,
    },
  },
}));
