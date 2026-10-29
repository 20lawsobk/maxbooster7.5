import { describe, expect, it } from "vitest";
import { supportMessageSchema, supportTicketCreateSchema, supportTicketUpdateSchema } from "../../shared/supportTicketValidation";

describe("support ticket write validation", () => {
  it.each([null, {}, {subject: 42}, {subject: "  "}, {subject: "a".repeat(256)}, {subject: "Valid", description: []}, {subject: "Valid", priority: ""}])("rejects malformed ticket input", input => {
    expect(supportTicketCreateSchema.safeParse(input).success).toBe(false);
  });
  it("normalizes creation and discards caller-controlled identity/status", () => {
    expect(supportTicketCreateSchema.parse({subject: " Help ", userId: "victim", status: "closed"})).toEqual({subject: "Help", category: "general", priority: "medium"});
  });
  it.each([{}, {status: null}, {status: ""}, {priority: false}, {responseTimeMinutes: -1}, {responseTimeMinutes: "10"}, {satisfactionRating: 6}, {satisfactionRating: 1.5}, {resolvedAt: "garbage"}, {userId: "victim"}])("rejects unsafe admin updates input", input => {
    expect(supportTicketUpdateSchema.safeParse(input).success).toBe(false);
  });
  it("converts a valid resolution timestamp to a database Date", () => {
    expect(supportTicketUpdateSchema.parse({resolvedAt: "2026-10-17T12:00:00Z"}).resolvedAt).toEqual(new Date("2026-10-17T12:00:00Z"));
  });
  it.each([null, {message: 1}, {message: " "}, {message: "a".repeat(10001)}])("rejects malformed staff messages input", input => {
    expect(supportMessageSchema.safeParse(input).success).toBe(false);
  });
});
