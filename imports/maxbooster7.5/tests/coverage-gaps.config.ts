import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { include: ["tests/unit/coverage-gaps.test.ts"], environment: "node", setupFiles: [] },
  resolve: { alias: { "@shared": path.resolve("shared") } },
});