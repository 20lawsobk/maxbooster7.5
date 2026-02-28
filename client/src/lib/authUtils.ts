/**
 * Auth Utility Helpers
 *
 * Small, pure utility functions used by React Query / fetch wrappers
 * to detect authentication-related error conditions.
 *
 * `isUnauthorizedError(error)` — returns true when the error message
 *   matches the standard 401 Unauthorized pattern produced by the server.
 *   Used by hooks to trigger logout/redirect flows.
 */

export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}
