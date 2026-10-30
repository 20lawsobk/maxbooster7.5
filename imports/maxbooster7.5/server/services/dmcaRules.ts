export type CounterNoticeEmailState =
  | "not_attempted"
  | "sending"
  | "accepted"
  | "rejected"
  | "unknown";

export type CounterNoticeEmailAttemptPlan =
  | { action: "new_attempt"; attemptedAt: Date }
  | { action: "retry_same_key"; attemptedAt: Date }
  | { action: "manual_review"; reason: string };

/**
 * Resend idempotency keys are valid for 24 hours. Keep a one-hour safety
 * margin so an uncertain request is never retried near/after expiry.
 */
export function planCounterNoticeEmailAttempt(
  state: CounterNoticeEmailState,
  previousAttemptAt: Date | string | null | undefined,
  now = new Date(),
): CounterNoticeEmailAttemptPlan {
  const previous = previousAttemptAt ? new Date(previousAttemptAt) : null;
  const uncertain = state === "sending" || state === "unknown";
  if (!Number.isFinite(now.getTime()) ||
      !["not_attempted", "sending", "accepted", "rejected", "unknown"].includes(state)) {
    return { action: "manual_review", reason: "Invalid email state or evaluation clock" };
  }

  if (state === "accepted") {
    return {
      action: "manual_review",
      reason: "Email is marked accepted but has no confirmed receipt in the caller",
    };
  }

  if (uncertain) {
    if (!previous || !Number.isFinite(previous.getTime())) {
      return {
        action: "manual_review",
        reason: "An uncertain email attempt has no valid timestamp",
      };
    }
    if (previous.getTime() > now.getTime() ||
        now.getTime() - previous.getTime() >= 23 * 60 * 60 * 1000) {
      return {
        action: "manual_review",
        reason: "The safe provider idempotency retry window has elapsed",
      };
    }
    return { action: "retry_same_key", attemptedAt: previous };
  }

  return { action: "new_attempt", attemptedAt: now };
}

export interface DmcaStrikeLike {
  isActive?: boolean | null;
  revokedAt?: Date | string | null;
  expiresAt?: Date | string | null;
}

/** Revoked and expired strikes must not count toward repeat-infringer limits. */
export function isActiveDmcaStrike(
  strike: DmcaStrikeLike,
  now = new Date(),
): boolean {
  if (strike.isActive === false || strike.revokedAt != null) return false;
  if (!strike.expiresAt) return true;
  const expiresAt = new Date(strike.expiresAt);
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
}
