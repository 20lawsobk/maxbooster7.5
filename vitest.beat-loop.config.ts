import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/unit/beat-sale-money-loop.test.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: { alias: { "@shared": path.resolve("shared"), "@": path.resolve("client/src") } },
});
