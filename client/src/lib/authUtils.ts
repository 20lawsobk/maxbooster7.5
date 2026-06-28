/**
 * Auth Utility Helpers
 *
 * Small, pure utility functions used by React Query / fetch wrappers
 * to detect authentication-related error conditions.
 *
 * `isUnauthorizedError(error)` — returns true for any 401 error regardless
 *   of the exact message text.  The server may say "Not authenticated",
 *   "Unauthorized", "session_expired", etc. — all are treated the same.
 */

export function isUnauthorizedError(error: Error): boolean {
  const apiError = error as Error & { status?: number; code?: string };
  if (apiError?.status === 401) return true;
  if (apiError?.code === "UNAUTHORIZED") return true;
  return /401|unauthorized|not authenticated/i?.test(error?.message);
}
