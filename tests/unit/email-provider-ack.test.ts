import { describe, expect, it } from "vitest";
import { requireAcceptedEmail, requireEmailSettings, requireRetrySafeEmailJob, EMAIL_IDEMPOTENCY_WINDOW_MS } from "../../server/workers/emailProviderAck.js";

describe("email provider acceptance contract", () => {
  it("accepts a confirmed provider message ID", () => {
    expect(requireAcceptedEmail({ data: { id: "provider-msg-123" }, error: null })).toBe("provider-msg-123");
  });

  it("rejects resolved provider error responses instead of acknowledging jobs", () => {
    expect(() => requireAcceptedEmail({
      data: null,
      error: { name: "validation_error", message: "recipient rejected" },
    })).toThrow(/provider rejected/);
  });

  it.each([undefined, null, { data: null }, { data: {} }, { data: { id: "" } }, { data: { id: "  " } }])(
    "rejects missing or unconfirmed provider acceptance: %j",
    (response) => {
      expect(() => requireAcceptedEmail(response)).toThrow();
    },
  );
});


describe("email worker configuration", () => {
  it.each([undefined, "", "   "])("rejects missing provider API key: %j", (apiKey) => {
    expect(() => requireEmailSettings(apiKey, "verified@example.test")).toThrow(/credentials are not configured/);
  });

  it.each([undefined, "", "   "])("rejects missing verified sender: %j", (sender) => {
    expect(() => requireEmailSettings("test-api-key", sender)).toThrow(/sender is not configured/);
  });

  it("accepts configured provider and sender after trimming", () => {
    expect(requireEmailSettings(" key ", " sender@example.test ")).toEqual({
      apiKey: "key", sender: "sender@example.test",
    });
  });
});

describe("queued email idempotency retry boundary", () => {
  const queuedAt = 1_800_000_000_000;
  it("reuses the same stable key through retries inside provider window", () => {
    const first = requireRetrySafeEmailJob("job-123", queuedAt, queuedAt + 1000);
    const retry = requireRetrySafeEmailJob("job-123", queuedAt, queuedAt + 5000);
    expect(first).toBe("maxbooster-email-job-123");
    expect(retry).toBe(first);
  });

  it("permits the final millisecond inside the window but fails at expiry", () => {
    expect(requireRetrySafeEmailJob("job-123", queuedAt,
      queuedAt + EMAIL_IDEMPOTENCY_WINDOW_MS - 1)).toBe("maxbooster-email-job-123");
    expect(() => requireRetrySafeEmailJob("job-123", queuedAt,
      queuedAt + EMAIL_IDEMPOTENCY_WINDOW_MS)).toThrow(/manual reconciliation required/);
  });

  it.each([undefined, "", "  ", "x".repeat(201), "bad\\nkey"])(
    "rejects missing, oversized, or unsafe queue IDs",
    id => expect(() => requireRetrySafeEmailJob(id, queuedAt, queuedAt + 1000)).toThrow(/queue ID/),
  );

  it.each([undefined, -1, 0, Number.NaN])(
    "rejects unreliable original enqueue timestamps",
    timestamp => expect(() => requireRetrySafeEmailJob("job-123", timestamp, queuedAt + 1000))
      .toThrow(/manual reconciliation/),
  );

  it("rejects an enqueue timestamp after the current clock", () => {
    expect(() => requireRetrySafeEmailJob("job-123", queuedAt + 2000, queuedAt))
      .toThrow(/manual reconciliation/);
  });
});
