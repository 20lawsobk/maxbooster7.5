import { describe, expect, it } from "vitest";
import { collaborationCallRequestSchema } from "../collaborationCallContracts.js";

describe("collaboration call signaling contracts", () => {
  it("accepts the supported join and leave control messages", () => {
    expect(
      collaborationCallRequestSchema.safeParse({
        type: "call:join",
        requestId: "95b33340-82ea-4a16-8509-457c78ace6a2",
        payload: {},
      }).success,
    ).toBe(true);
    expect(
      collaborationCallRequestSchema.safeParse({
        type: "call:leave",
        requestId: "95b33340-82ea-4a16-8509-457c78ace6a2",
        payload: {},
      }).success,
    ).toBe(true);
  });

  it("rejects invalid identifiers, malformed DTLS, and extra controls", () => {
    const requestId = "95b33340-82ea-4a16-8509-457c78ace6a2";
    expect(
      collaborationCallRequestSchema.safeParse({
        type: "call:create-transport",
        requestId,
        payload: { direction: "both" },
      }).success,
    ).toBe(false);
    expect(
      collaborationCallRequestSchema.safeParse({
        type: "call:connect-transport",
        requestId,
        payload: { transportId: "transport-1", dtlsParameters: {} },
      }).success,
    ).toBe(false);
    expect(
      collaborationCallRequestSchema.safeParse({
        type: "call:leave",
        requestId,
        payload: {},
        admin: true,
      }).success,
    ).toBe(false);
  });
});
