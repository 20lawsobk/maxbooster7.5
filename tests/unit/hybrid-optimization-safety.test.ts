import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectHybridTieringKeys } from "../../server/services/hybridOptimizationSafety.js";

describe("hybrid optimization tenant and byte integrity", () => {
  const entries = [
    { key: "a-primary", userId: "account-a", isDeduplicated: false },
    { key: "b-primary", userId: "account-b", isDeduplicated: false },
    { key: "a-alias", userId: "account-a", isDeduplicated: true },
  ];

  it("selects only the authenticated tenant's physical entries", () => {
    expect(selectHybridTieringKeys(entries, "account-a")).toEqual(["a-primary"]);
    expect(selectHybridTieringKeys(entries, "account-b")).toEqual(["b-primary"]);
  });

  it("allows the explicit scheduler-wide path without aliases", () => {
    expect(selectHybridTieringKeys(entries)).toEqual(["a-primary", "b-primary"]);
  });

  it("does not treat an unknown tenant as global maintenance", () => {
    expect(selectHybridTieringKeys(entries, "account-c")).toEqual([]);
    expect(selectHybridTieringKeys(entries, "")).toEqual([]);
  });

  it("never mutates deduplication state or the original entries", () => {
    const before = JSON.stringify(entries);
    selectHybridTieringKeys(entries, "account-a");
    expect(JSON.stringify(entries)).toBe(before);
  });

  it("routes user optimization through tenant-scoped tiering", () => {
    const source = readFileSync(new URL("../../server/services/hybridStorageService.ts", import.meta.url), "utf8");
    const optimize = source.split("  async optimizeStorage(")[1]?.split("  async cleanup(")[0];
    expect(optimize).toBeTruthy();
    expect(optimize).toContain("this.runAutoTiering(userId)");
    expect(optimize).toContain("deduplicated: 0");
    expect(optimize).not.toContain("isDeduplicated = true");
    expect(optimize).not.toContain("deduplicationRef =");
  });

  it("enforces tenant selection before tiering metadata mutations", () => {
    const source = readFileSync(new URL("../../server/services/hybridStorageService.ts", import.meta.url), "utf8");
    const tiering = source.split("  async runAutoTiering(")[1]?.split("  async getAnalytics(")[0];
    expect(tiering).toBeTruthy();
    expect(tiering).toContain("selectHybridTieringKeys(this.fileIndex.values(), userId)");
  });
  it("scopes the legacy authenticated auto-tier HTTP handler to the caller", () => {
    // This is a route-wiring contract; full two-account HTTP integration is
    // still required in a disposable configured environment.
    const source = readFileSync(new URL("../../server/routes/storage.ts", import.meta.url), "utf8");
    const route = source.split('  "/hybrid/auto-tier",')[1]?.split('  "/hybrid/metadata/*key",')[0];
    expect(route).toBeTruthy();
    expect(route).toContain("requireAuth");
    expect(route).toContain("const userId = req.user!.id");
    expect(route).toContain("hybridStorageService?.runAutoTiering(userId)");
    expect(route).not.toMatch(/hybridStorageService\\?\\.runAutoTiering\\(\\s*\\)/);
  });

});
