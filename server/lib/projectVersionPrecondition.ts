export type ProjectVersionPreconditionResult =
  | { status: 200; current: true }
  | { status: 409; current: false }
  | { status: 428; current: false };

/**
 * Keep the API and sync paths on the same fail-closed optimistic-version rule.
 * Callers still choose the response body appropriate to their route.
 */
export function evaluateProjectVersionPrecondition(
  currentUpdatedAt: string | null,
  expectedUpdatedAt: unknown,
): ProjectVersionPreconditionResult {
  if (expectedUpdatedAt === undefined) {
    return { status: 428, current: false };
  }
  if (currentUpdatedAt !== expectedUpdatedAt) {
    return { status: 409, current: false };
  }
  return { status: 200, current: true };
}
