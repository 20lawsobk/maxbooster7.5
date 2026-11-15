import { describe, expect, it, vi } from "vitest";
import { completeAuthentication } from "../../client/src/lib/authenticationBoundary";

function fixture() {
  const events: string[] = [];
  return {
    events,
    changeAccount: async <T,>(request: () => Promise<T>) => {
      events.push("cleanup", "exclusive");
      const result = await request();
      events.push("released");
      return result;
    },
    setToken: vi.fn(),
    verify: vi.fn(async () => {
      events.push("verified");
      return { id: "user-a" };
    }),
    commit: vi.fn(),
  };
}

describe("provider-controlled authentication", () => {
  it("cleans old state before requesting sign-in and commits only verified identity", async () => {
    const boundary = fixture();
    await completeAuthentication(async () => {
      boundary.events.push("request");
      return { response: { ok: true }, data: { id: "user-a", sessionToken: "test-token" } };
    }, boundary);
    expect(boundary.events).toEqual(["cleanup", "exclusive", "request", "released", "verified"]);
    expect(boundary.setToken).toHaveBeenCalledWith("test-token");
    expect(boundary.commit).toHaveBeenCalledExactlyOnceWith({ id: "user-a" });
  });
  it("clears stale bearer authentication on cookie-only completion", async () => {
    const boundary = fixture();
    await completeAuthentication(async () => ({
      response: { ok: true }, data: { id: "user-a" },
    }), boundary);
    expect(boundary.setToken).toHaveBeenCalledExactlyOnceWith(null);
  });
  it.each([
    { response: { ok: true }, data: { requiresTwoFactor: true } },
    { response: { ok: false }, data: { message: "Invalid credentials" } },
  ])("does not unlock or verify incomplete authentication: %j", async exchange => {
    const boundary = fixture();
    expect(await completeAuthentication(async () => exchange, boundary)).toBe(exchange);
    expect(boundary.verify).not.toHaveBeenCalled();
    expect(boundary.commit).not.toHaveBeenCalled();
    expect(boundary.setToken).not.toHaveBeenCalled();
  });
  it("fails closed if a different account wins before session verification", async () => {
    const boundary = fixture();
    boundary.verify.mockResolvedValue({ id: "user-b" });
    await expect(completeAuthentication(async () => ({
      response: { ok: true }, data: { id: "user-a" },
    }), boundary)).rejects.toThrow("could not be verified");
    expect(boundary.commit).not.toHaveBeenCalled();
    expect(boundary.setToken).toHaveBeenLastCalledWith(null);
  });
  it("rejects malformed success without seeding private state", async () => {
    const boundary = fixture();
    await expect(completeAuthentication(async () => ({
      response: { ok: true }, data: {},
    }), boundary)).rejects.toThrow("Invalid authentication response");
    expect(boundary.commit).not.toHaveBeenCalled();
  });
});
