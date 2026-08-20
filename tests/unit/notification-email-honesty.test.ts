import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for Task #104 review feedback: Resend's SDK resolves
// provider-side rejections (invalid sender, quota exceeded, validation
// errors) as { data: null, error } instead of throwing. sendEmail() must
// treat that as a failure, not a successful send.

const sendMock = vi.fn();

vi.mock("resend", () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: { send: sendMock },
    })),
  };
});

vi.mock("../../server/config/env.js", () => ({
  env: {
    RESEND_API_KEY: "test-key",
    SENDGRID_FROM_EMAIL: "noreply@test.com",
  },
}));

vi.mock("../../server/db", () => ({
  db: {
    query: { users: { findFirst: vi.fn() } },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "notif-1" }]),
      })),
    })),
  },
}));

vi.mock("../../server/services/webPushService.js", () => ({
  webPushService: { isReady: vi.fn().mockReturnValue(false) },
}));

describe("notificationService email honesty", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("reports emailSent:false when Resend resolves a provider error", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid `from` field" },
    });

    const { db } = await import("../../server/db");
    (db.query.users.findFirst as any).mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      notificationSettings: { email: true, system: true },
    });

    const { notificationService } = await import(
      "../../server/services/notificationService.js"
    );

    const result = await notificationService.send({
      userId: "user-1",
      type: "system",
      title: "Test",
      message: "Test message",
    });

    expect(result.emailSent).toBe(false);
  });

  it("reports emailSent:true only when Resend resolves a real message id with no error", async () => {
    sendMock.mockResolvedValue({
      data: { id: "msg_123" },
      error: null,
    });

    const { db } = await import("../../server/db");
    (db.query.users.findFirst as any).mockResolvedValue({
      id: "user-2",
      email: "user2@example.com",
      notificationSettings: { email: true, system: true },
    });

    const { notificationService } = await import(
      "../../server/services/notificationService.js"
    );

    const result = await notificationService.send({
      userId: "user-2",
      type: "system",
      title: "Test",
      message: "Test message",
    });
    console.log("DEBUG result", JSON.stringify(result), "sendMock calls", sendMock.mock.calls.length);

    expect(result.emailSent).toBe(true);
  });
});
