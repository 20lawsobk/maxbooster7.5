import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: {
    include: ["tests/unit/growth-rights*.test.ts"],
    environment: "node", setupFiles: [], fileParallelism: false, maxWorkers: 1,
  },
  resolve: { alias: { "@shared": path.resolve(process.cwd(), "shared") } },
});