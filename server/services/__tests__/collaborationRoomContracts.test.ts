import { describe, expect, it } from "vitest";
import { collaborationRoomMessageRequestSchema } from "../collaborationRoomContracts.js";

describe("collaboration room message contract", () => {
  it("trims valid messages before storage", () => {
    expect(
      collaborationRoomMessageRequestSchema.parse({
        clientMessageId: "9c731e7c-7815-4f88-94bd-291cc1ac7632",
        content: "  hello room  ",
      }),
    ).toEqual({
      clientMessageId: "9c731e7c-7815-4f88-94bd-291cc1ac7632",
      content: "hello room",
    });
  });

  it("rejects blank, oversized, malformed, and unexpected input", () => {
    const id = "9c731e7c-7815-4f88-94bd-291cc1ac7632";
    expect(
      collaborationRoomMessageRequestSchema.safeParse({
        clientMessageId: id,
        content: "  ",
      }).success,
    ).toBe(false);
    expect(
      collaborationRoomMessageRequestSchema.safeParse({
        clientMessageId: id,
        content: "x".repeat(4_001),
      }).success,
    ).toBe(false);
    expect(
      collaborationRoomMessageRequestSchema.safeParse({
        clientMessageId: "not-a-uuid",
        content: "hello",
      }).success,
    ).toBe(false);
    expect(
      collaborationRoomMessageRequestSchema.safeParse({
        clientMessageId: id,
        content: "hello",
        senderId: "forged-user",
      }).success,
    ).toBe(false);
  });
});
