import type { IncomingMessage } from "node:http";
import type session from "express-session";
import { createRequire } from "node:module";
import { parse as parseCookie } from "cookie";

const require = createRequire(import.meta.url);
const cookieSignature = require("cookie-signature") as {
  unsign(value: string, secret: string): string | false;
};

let realtimeSessionStore: session.Store | null = null;
let realtimeSessionSecret: string | null = null;

export function setRealtimeSessionStore(
  store: session.Store | null,
  secret: string | null,
): void {
  realtimeSessionStore = store;
  realtimeSessionSecret = secret;
}

function sessionIdFromRequest(
  request: IncomingMessage,
  secret: string | null,
): string | null {
  try {
    const value = parseCookie(request.headers.cookie ?? "").sessionId;
    if (!secret || !value?.startsWith("s:")) return null;

    const signedValue = value.slice(2);
    const sessionId = cookieSignature.unsign(signedValue, secret);
    return typeof sessionId === "string" && sessionId.length > 0
      ? sessionId
      : null;
  } catch {
    return null;
  }
}

function userIdFromSession(data: session.SessionData): string | null {
  const passportUser = (data as session.SessionData & {
    passport?: { user?: unknown };
  }).passport?.user;
  const user = passportUser ?? (data as session.SessionData & { userId?: unknown }).userId;
  if (typeof user === "string" && user.length > 0) return user;
  if (
    user &&
    typeof user === "object" &&
    "id" in user &&
    typeof user.id === "string" &&
    user.id.length > 0
  ) {
    return user.id;
  }
  return null;
}

/**
 * Resolve the app's signed session cookie through its authoritative session
 * store. The store enforces expiry, revocation, and session-generation checks;
 * realtime transports do not maintain a separate cache or Redis identity path.
 */
export async function authenticateRealtimeSession(
  request: IncomingMessage,
): Promise<string | null> {
  const store = realtimeSessionStore;
  const sessionId = sessionIdFromRequest(request, realtimeSessionSecret);
  if (!store || !sessionId) return null;

  return new Promise((resolve) => {
    try {
      store.get(sessionId, (error, data) => {
        if (error || !data) {
          resolve(null);
          return;
        }
        resolve(userIdFromSession(data));
      });
    } catch {
      // The authoritative store is fail-closed for realtime authentication.
      resolve(null);
    }
  });
}
