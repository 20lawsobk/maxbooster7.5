export function needsTopupCleanupReconciliation(record) {
  // Also reject the older unsafe journal shape: creation may have committed
  // even if its response/ID was never recorded and cleanup said NOT_NEEDED.
  if (record.phase === "test_topup_creation" && !record.resourceId) return true;
  return !["PASS", "NOT_NEEDED"].includes(record.cleanup);
}

export function topupExitCode(report) {
  if (report.status === "FAIL" ||
      needsTopupCleanupReconciliation(report) ||
      report.previousRuns?.some(needsTopupCleanupReconciliation)) return 1;
  return report.status === "BLOCKED" ? 2 : 0;
}