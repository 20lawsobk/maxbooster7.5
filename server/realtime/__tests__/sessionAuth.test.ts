import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type session from "express-session";
import {
  authenticateRealtimeSession,
  setRealtimeSessionStore,
} from "../sessionAuth.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cookieSignature = require("cookie-signature") as {
  sign(value: string, secret: string): string;
};
const SESSION_SECRET = "session-auth-test-secret";

function signedCookie(sessionId: string): string {
  return `sessionId=${encodeURIComponent(
    `s:${cookieSignature.sign(sessionId, SESSION_SECRET)}`,
  )}`;
}

describe("realtime session authentication", () => {
  const get = vi.fn();

  beforeEach(() => {
    get.mockReset();
    setRealtimeSessionStore(
      { get } as unknown as session.Store,
      SESSION_SECRET,
    );
  });

  afterEach(() => {
    setRealtimeSessionStore(null, null);
  });

  it("resolves the app's signed sessionId cookie through the authoritative store", async () => {
    get.mockImplementation((_sid: string, callback: (error: null, data: object) => void) => {
      callback(null, { passport: { user: "user-1" } });
    });
    const request = { headers: { cookie: `other=value; ${signedCookie("random-session-id")}` } } as any;

    await expect(authenticateRealtimeSession(request)).resolves.toBe("user-1");
    expect(get).toHaveBeenCalledWith("random-session-id", expect.any(Function));
  });

  it("accepts the authoritative session's structured passport identity", async () => {
    get.mockImplementation((_sid: string, callback: (error: null, data: object) => void) => {
      callback(null, { passport: { user: { id: "user-2" } } });
    });

    await expect(
      authenticateRealtimeSession({
        headers: { cookie: signedCookie("session-id") },
      } as any),
    ).resolves.toBe("user-2");
  });

  it("rejects unsigned, invalid-signature, malformed, and non-app cookies", async () => {
    const valid = signedCookie("tampered-session");
    const signedValue = decodeURIComponent(valid.slice("sessionId=".length));
    const separator = signedValue.lastIndexOf(".");
    const signature = signedValue.slice(separator + 1);
    const alteredSignature =
      signedValue.slice(0, separator + 1) +
      (signature.startsWith("A") ? "B" : "A") +
      signature.slice(1);
    for (const cookie of [
      "sessionId=unsigned-session-id",
      "sessionId=s%3A",
      `sessionId=${encodeURIComponent(alteredSignature)}`,
      "connect.sid=s%3Alegacy-session.signature",
    ]) {
      await expect(
        authenticateRealtimeSession({ headers: { cookie } } as any),
      ).resolves.toBeNull();
    }
    expect(get).not.toHaveBeenCalled();
  });

  it("fails closed when the store reports an expired, revoked, or unavailable session", async () => {
    get.mockImplementation((_sid: string, callback: (error: Error | null, data?: object | null) => void) => {
      callback(null, null);
    });
    await expect(
      authenticateRealtimeSession({
        headers: { cookie: signedCookie("expired-session") },
      } as any),
    ).resolves.toBeNull();

    get.mockImplementation((_sid: string, callback: (error: Error | null, data?: object | null) => void) => {
      callback(new Error("session database unavailable"));
    });
    await expect(
      authenticateRealtimeSession({
        headers: { cookie: signedCookie("session-id") },
      } as any),
    ).resolves.toBeNull();
  });
});
