import { describe, expect, it } from "vitest";
import { requireAcceptedEmail, requireEmailSettings } from "../../server/workers/emailProviderAck.js";

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
