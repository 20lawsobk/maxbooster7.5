import session from "express-session";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { sessionAuthority } from "../services/sessionAuthority.js";

/** PG is the only read/write authority. No cache can resurrect a deleted SID. */
export class AuthoritativeSessionStore extends session.Store {
  get(sid: string, cb: (err: unknown, data?: session.SessionData | null) => void): void {
    db.execute(sql`SELECT sess FROM pg_sessions WHERE sid=${sid} AND expire>${Date.now()}`)
      .then(result => {
        const rows = (result as any).rows ?? result;
        if (!Array.isArray(rows)) throw new Error("Invalid session database response");
        return rows.length ? JSON.parse(rows[0].sess) : null;
      }).then(async data => {
        if (!data) return null;
        const passportUser = data.passport?.user;
        const userId = data.userId ??
          (passportUser && typeof passportUser === "object" ? passportUser.id : passportUser);
        if (!userId) return data; // anonymous pre-login session
        const authority = await sessionAuthority();
        return await authority.validate(String(userId), data.authGeneration) ? data : null;
      }).then(data => cb(null, data), err => cb(err));
  }
  set(sid: string, data: session.SessionData, cb?: (err?: unknown) => void): void {
    const expires = data.cookie?.expires
      ? new Date(data.cookie.expires).getTime()
      : Date.now() + (data.cookie?.maxAge ?? 86_400_000);
    if (!Number.isFinite(expires)) { cb?.(new Error("Invalid session expiry")); return; }
    let serialized: string;
    try { serialized = JSON.stringify(data); } catch (err) { cb?.(err); return; }
    db.execute(sql`INSERT INTO pg_sessions(sid,sess,expire) VALUES(${sid},${serialized},${expires})
      ON CONFLICT(sid) DO UPDATE SET sess=EXCLUDED.sess,expire=EXCLUDED.expire`)
      .then(() => cb?.(), err => cb?.(err));
  }
  destroy(sid: string, cb?: (err?: unknown) => void): void {
    db.execute(sql`DELETE FROM pg_sessions WHERE sid=${sid}`)
      .then(() => cb?.(), err => cb?.(err));
  }
  touch(sid: string, data: session.SessionData, cb?: (err?: unknown) => void): void {
    const expires = data.cookie?.expires
      ? new Date(data.cookie.expires).getTime()
      : Date.now() + (data.cookie?.maxAge ?? 86_400_000);
    if (!Number.isFinite(expires)) { cb?.(new Error("Invalid session expiry")); return; }
    // UPDATE only: an in-flight touch must not recreate a destroyed session.
    db.execute(sql`UPDATE pg_sessions SET expire=${expires} WHERE sid=${sid} AND expire>${Date.now()}`)
      .then(() => cb?.(), err => cb?.(err));
  }
}