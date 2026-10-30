import type session from "express-session";
import crypto from "crypto";
import { logger } from "../logger.js";
import { env } from "../config/env.js";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { AuthoritativeSessionStore } from "./authoritativeSessionStore.js";
import { sessionAuthority } from "../services/sessionAuthority.js";

// Preserve periodic expiration cleanup for the authoritative PG store.
// Schema readiness is checked by createSessionStore; no runtime DDL or fallback.
setInterval(
  () => {
    db.execute(
      sql`DELETE FROM pg_sessions WHERE expire <= ${Date.now()}`,
    ).catch(err => logger.warn({ err }, "Expired PG session cleanup failed"));
  },
  60 * 60 * 1000,
).unref();

/**
 * Commit a durable cross-pod authentication generation change.
 * Call after security-critical state changes such as password reset or locking.
 * Success confirms the authority statement completed; backing failures propagate.
 */
export async function revokeUserSessions(userId: string): Promise<{ confirmed: true }> {
  await (await sessionAuthority()).revoke(userId);
  return { confirmed: true };
}

/**
 * Create the authoritative PostgreSQL session store. Cache availability never
 * changes acknowledgment or read semantics. Migration readiness is mandatory.
 */
export async function createSessionStore(): Promise<session.Store> {
  // Schema is provisioned by reviewed migration 0090, never boot-time DDL.
  // Existing pg_sessions rows retain their serialization and TTL.
  await db.execute(sql`SELECT sid FROM pg_sessions LIMIT 0`);
  return new AuthoritativeSessionStore();
}

export function getSessionConfig(store: session.Store) {
  const isProduction =
    process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEPLOYMENT;
  // Session cookies are only marked Secure when running under TLS in production.
  // REPLIT_DEPLOYMENT=1 can be set even for dev servers running on plain HTTP
  // (e?.g. localhost:5000 accessed by the test suite), so we gate the Secure
  // flag on NODE_ENV=production to allow session cookies over HTTP in dev.
  const useSecureCookies = process.env.NODE_ENV === "production";
  const sessionSecret = env?.SESSION_SECRET;

  if (isProduction) {
    if (!sessionSecret)
      throw new Error(
        "SESSION_SECRET environment variable is required in production",
      );
    if (sessionSecret?.length < 32)
      throw new Error("SESSION_SECRET must be at least 32 characters");
  } else if (!sessionSecret) {
    logger.warn(
      "⚠️  SESSION_SECRET not set. Using random default for development only.",
    );
  }

  const finalSecret = sessionSecret || crypto?.randomBytes(32).toString("hex");

  return {
    store,
    secret: finalSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: "sessionId",
    proxy: isProduction,
    cookie: {
      secure: useSecureCookies,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "lax" as const,
      path: "/",
    },
    genid: () => crypto?.randomBytes(32).toString("hex"),
  };
}