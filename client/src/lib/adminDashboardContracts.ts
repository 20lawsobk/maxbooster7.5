/**
 * Runtime contracts for the admin dashboard's read-only aggregate endpoints.
 *
 * These parsers intentionally do not fill missing fields with defaults. A
 * response that does not match the API contract is rejected so the page can
 * render an explicit invalid-response state instead of crashing while mapping
 * an absent collection.
 */

export interface AuditIssue {
  category: string;
  item: string;
  status: "pass" | "warning" | "fail";
  details: string;
}

export interface AuditRecommendation {
  category: string;
  recommendation: string;
  priority: string;
}

export interface AuditResults {
  overallScore: number;
  securityScore: number;
  functionalityScore: number;
  performanceScore: number;
  codeQualityScore: number;
  accessibilityScore: number;
  seoScore: number;
  auditItems: AuditIssue[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
    total: number;
  };
  recommendations: AuditRecommendation[];
  lastAuditDate: string;
}

export interface TestSuiteSummary {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

export interface TestingResults {
  overallScore: number | null;
  lastRunDate: string | null;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: string;
  };
  testSuites: TestSuiteSummary[];
  coverage: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  } | null;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeAuditResults(value: unknown): AuditResults | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.auditItems)) return null;
  if (!Array.isArray(value.recommendations)) return null;
  if (!isRecord(value.summary)) return null;
  return value as unknown as AuditResults;
}

export function normalizeTestingResults(value: unknown): TestingResults | null {
  if (!isRecord(value)) return null;
  if (!isRecord(value.summary)) return null;
  if (!Array.isArray(value.testSuites)) return null;
  if (value.coverage !== null && !isRecord(value.coverage)) return null;
  return value as unknown as TestingResults;
}

export function adminDashboardResponseError(
  kind: "audit" | "testing",
  value: unknown,
): string | null {
  const valid =
    kind === "audit"
      ? normalizeAuditResults(value)
      : normalizeTestingResults(value);
  if (valid) return null;
  return kind === "audit"
    ? "The audit response was invalid."
    : "The testing response was invalid.";
}