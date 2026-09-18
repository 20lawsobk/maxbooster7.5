import { describe, expect, it } from "vitest";
import { serializeResponseForLog } from "../../server/lib/responseLogSerialization";

describe("response log credential redaction", () => {
  it("redacts authentication tokens before string interpolation", () => {
    const body = { success: true, sessionToken: "test-secret-token", expiresAt: "tomorrow" };
    expect(JSON.parse(serializeResponseForLog(body)!)).toEqual({
      success: true, sessionToken: "[REDACTED]", expiresAt: "tomorrow",
    });
    expect(body.sessionToken).toBe("test-secret-token");
  });

  it("redacts nested credentials and arrays without dropping useful counters", () => {
    expect(JSON.parse(serializeResponseForLog({
      user: { id: "fixture-user", password: "test-password" },
      keys: [{ api_key: "test-key" }],
      credentials: { private: "test-value" },
      tokenCount: 42,
      hasToken: true,
    })!)).toEqual({
      user: { id: "fixture-user", password: "[REDACTED]" },
      keys: [{ api_key: "[REDACTED]" }],
      credentials: "[REDACTED]",
      tokenCount: 42,
      hasToken: true,
    });
  });
});