import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/unit/example.test.ts", "server/simulations/__tests__/verifyKPIs.test.ts"],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60000,
    reporters: ["verbose"],
  },
  resolve: { alias: { "@shared": path.resolve("shared"), "@": path.resolve("client/src") } },
});
