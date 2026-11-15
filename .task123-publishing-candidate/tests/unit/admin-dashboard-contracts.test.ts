import { describe, expect, it } from "vitest";
import {
  adminDashboardResponseError,
  normalizeAuditResults,
  normalizeTestingResults,
} from "../../client/src/lib/adminDashboardContracts";

describe("admin dashboard API contracts", () => {
  it("accepts and preserves the audit route payload used by the dashboard", () => {
    const payload = {
      overallScore: 91,
      securityScore: 95,
      functionalityScore: 90,
      performanceScore: 92,
      codeQualityScore: 88,
      accessibilityScore: 85,
      seoScore: 90,
      auditItems: [
        {
          category: "Security",
          item: "HTTPS Enabled",
          status: "pass",
          details: "All traffic encrypted",
        },
      ],
      summary: { passed: 1, warnings: 0, failed: 0, total: 1 },
      recommendations: [
        {
          category: "Accessibility",
          recommendation: "Add ARIA labels",
          priority: "medium",
        },
      ],
      lastAuditDate: "2026-01-01T00:00:00.000Z",
    };

    expect(normalizeAuditResults(payload)).toBe(payload);
    expect(adminDashboardResponseError("audit", payload)).toBeNull();
  });

  it("accepts a testing result with null coverage without creating a collection", () => {
    const payload = {
      overallScore: null,
      lastRunDate: null,
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: "0.0",
      },
      testSuites: [],
      coverage: null,
      message: "No test runs recorded yet.",
    };

    const normalized = normalizeTestingResults(payload);
    expect(normalized).toBe(payload);
    expect(normalized?.coverage).toBeNull();
  });

  it("rejects malformed collection payloads so the page can show its invalid-response state", () => {
    const malformedAudit = {
      overallScore: 91,
      issues: undefined,
      recommendations: undefined,
    };
    const malformedTesting = {
      summary: { total: 1 },
      testSuites: undefined,
      coverage: undefined,
    };

    expect(normalizeAuditResults(malformedAudit)).toBeNull();
    expect(normalizeTestingResults(malformedTesting)).toBeNull();
    expect(adminDashboardResponseError("audit", malformedAudit)).toBe(
      "The audit response was invalid.",
    );
    expect(adminDashboardResponseError("testing", malformedTesting)).toBe(
      "The testing response was invalid.",
    );
  });
});