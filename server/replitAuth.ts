// @ts-nocheck
import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import pg from "pg";
import { storage } from "./storage";
import { env } from "./config/env.js";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

// ── Inline TTL memoizer (replaces memoizee) ───────────────────────────────────

function makeTtlMemo<T>(fn: () => Promise<T>, maxAgeMs: number): () => Promise<T> {
  let cached: T | undefined;
  let cachedAt = 0;
  let inflight: Promise<T> | null = null;
  return async () => {
    const now = Date.now();
    if (cached !== undefined && now - cachedAt < maxAgeMs) return cached;
    if (inflight) return inflight;
    inflight = fn().then((value) => {
      cached = value;
      cachedAt = Date.now();
      inflight = null;
      return value;
    });
    return inflight;
  };
}

const getOidcConfig = makeTtlMemo(
  async () => {
    return await client?.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID,
    );
  },
  3600 * 1000,
);

// ── Custom PostgreSQL session store (replaces connect-pg-simple) ──────────────
//
// Stores express-session blobs in a table with columns:
//   sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expire BIGINT NOT NULL
//
// Uses raw pg.Pool so that it does not depend on drizzle or any other ORM.
// The `tableName` option preserves the original table name ("sessions") to
// avoid any schema migration.

class PgSessionStore extends session.Store {
  private readonly pool: pg.Pool;
  private readonly table: string;
  private readonly ttlMs: number;

  constructor(opts: { conString: string; tableName: string; ttl: number }) {
    super();
    this.pool = new pg.Pool({ connectionString: opts.conString, max: 3 });
    this.table = opts.tableName;
    this.ttlMs = opts.ttl;
    // Periodic cleanup of expired rows (every hour)
    setInterval(() => {
      this.pool
        .query(`DELETE FROM "${this.table}" WHERE expire <= $1`, [Date.now()])
        .catch(() => {});
    }, 3_600_000).unref();
  }

  get(sid, cb) {
    this.pool
      .query(
        `SELECT sess FROM "${this.table}" WHERE sid = $1 AND expire > $2`,
        [sid, Date.now()],
      )
      .then((res) => {
        if (!res.rows.length) return cb(null, null);
        try {
          cb(null, JSON.parse(res.rows[0].sess));
        } catch {
          cb(null, null);
        }
      })
      .catch(cb);
  }

  set(sid, sess, cb?) {
    const expire = Date.now() + this.ttlMs;
    this.pool
      .query(
        `INSERT INTO "${this.table}" (sid, sess, expire) VALUES ($1, $2, $3)
         ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
        [sid, JSON.stringify(sess), expire],
      )
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }

  destroy(sid, cb?) {
    this.pool
      .query(`DELETE FROM "${this.table}" WHERE sid = $1`, [sid])
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }

  touch(sid, sess, cb?) {
    this.set(sid, sess, cb);
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const sessionStore = new PgSessionStore({
    conString: env.NEON_DATABASE_URL || env.DATABASE_URL,
    tableName: "sessions",
    ttl: sessionTtl,
  });
  return session({
    secret: env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: unknown,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
) {
  (user as any).claims = tokens?.claims();
  (user as any).access_token = tokens?.access_token;
  (user as any).refresh_token = tokens?.refresh_token;
  (user as any).expires_at = (user as any)?.claims?.exp;
}

async function upsertUser(claims: unknown) {
  await (storage as any)?.upsertUser({
    id: (claims as any)["sub"],
    email: (claims as any)["email"],
    firstName: (claims as any)["first_name"],
    lastName: (claims as any)["last_name"],
    profileImageUrl: (claims as any)["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport?.initialize());
  app.use(passport?.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback,
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens?.claims());
    verified(null, user);
  };

  for (const domain of process.env.REPLIT_DOMAINS!.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport?.use(strategy);
  }

  passport?.serializeUser((user: Express.User, cb) => cb(null, user));
  passport?.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    passport?.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    passport?.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client?.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href,
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as Record<string, unknown>;

  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date?.now() / 1000);
  if (now <= user?.expires_at) {
    return next();
  }

  const refreshToken = user?.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client?.refreshTokenGrant(config, (refreshToken as string));
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error: unknown) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
