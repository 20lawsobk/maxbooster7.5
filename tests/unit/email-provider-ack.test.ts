import { describe, expect, it } from "vitest";
import { requireAcceptedEmail } from "../../server/workers/emailProviderAck.js";

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
