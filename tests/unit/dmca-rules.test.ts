import { describe, expect, it } from "vitest";
import {
  isActiveDmcaStrike,
  planCounterNoticeEmailAttempt,
} from "../../server/services/dmcaRules.js";

describe("DMCA workflow safety rules", () => {
  const now = new Date("2026-10-14T01:00:00.000Z");

  it("does not count revoked strikes even when their expiry is in the future", () => {
    expect(isActiveDmcaStrike({
      isActive: false,
      expiresAt: "2027-10-14T01:00:00.000Z",
    }, now)).toBe(false);
  });

  it("does not count expired strikes", () => {
    expect(isActiveDmcaStrike({
      isActive: true,
      expiresAt: "2026-10-13T23:59:59.000Z",
    }, now)).toBe(false);
  });

  it("counts unexpired active strikes", () => {
    expect(isActiveDmcaStrike({
      isActive: true,
      expiresAt: "2026-10-15T01:00:00.000Z",
    }, now)).toBe(true);
  });

  it("reuses the same attempt timestamp for uncertain email retries", () => {
    const attemptedAt = new Date("2026-10-14T00:00:00.000Z");
    expect(planCounterNoticeEmailAttempt("unknown", attemptedAt, now)).toEqual({
      action: "retry_same_key",
      attemptedAt,
    });
  });

  it("requires manual reconciliation when an uncertain email is outside the safe retry window", () => {
    const attemptedAt = new Date("2026-10-13T00:00:00.000Z");
    expect(planCounterNoticeEmailAttempt("unknown", attemptedAt, now)).toMatchObject({
      action: "manual_review",
    });
  });

  it("does not blindly retry an uncertain attempt without a timestamp", () => {
    expect(planCounterNoticeEmailAttempt("sending", null, now)).toMatchObject({
      action: "manual_review",
    });
  });

  it("starts a new attempt after a definitive rejection", () => {
    expect(planCounterNoticeEmailAttempt("rejected", now, now)).toEqual({
      action: "new_attempt",
      attemptedAt: now,
    });
  });
});
