import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

describe("static endpoint audit inventory", () => {
  it("keeps the scanner in explicit static-only mode without probing routes", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/audit-endpoints.mjs"), "utf8");
    expect(script).toContain('process.argv.includes("--static")');
    expect(script).toContain("buildStaticFrontendResults");
    expect(script).toContain("mountedRouters");
  });

  it("produces matched, exact unresolved, and dynamic sections", () => {
    execFileSync(process.execPath, ["scripts/audit-endpoints.mjs", "--static"], {
      cwd: process.cwd(),
      stdio: "ignore",
    });
    const report = JSON.parse(
      readFileSync(resolve(process.cwd(), "reports/endpoint-audit.json"), "utf8"),
    ) as {
      meta: {
        mode: string;
        matchedCount: number;
        unmatchedConfirmedCount: number;
        methodUnconfirmedCount: number;
        unresolvedDynamicCount: number;
      };
      frontendCalls: Array<{ status: string; path: string }>;
      mountedRouters: unknown[];
      unresolvedDynamic: unknown[];
    };

    expect(report.meta.mode).toBe("static");
    expect(report.meta.matchedCount).toBeGreaterThan(0);
    expect(report.meta.unmatchedConfirmedCount).toBe(0);
    expect(report.meta.methodUnconfirmedCount).toBe(0);
    expect(report.mountedRouters.length).toBeGreaterThan(0);
    expect(report.unresolvedDynamic.length).toBe(report.meta.unresolvedDynamicCount);

    // The remaining exact gaps are admin-only contracts and are deliberately
    // reported for manual review rather than probed or changed automatically.
    const nonAdminGaps = report.frontendCalls.filter(
      (call) =>
        call.status === "unmatched-confirmed" &&
        !call.path.startsWith("/api/admin/"),
    );
    expect(nonAdminGaps).toEqual([]);
  }, 30_000);
});