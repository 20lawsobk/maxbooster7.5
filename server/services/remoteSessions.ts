import { db } from "../db.js";
import { sql } from "drizzle-orm";

// The cookie store is authoritative. The historical sessions table is metadata
// only and does not prove that a SID exists or belongs to the caller.
const owner = sql`COALESCE(sess::jsonb->>'userId',
  sess::jsonb#>>'{passport,user,id}',sess::jsonb#>>'{passport,user}')`;
export async function listOwnedSessions(userId: string) {
  const result = await db.execute<{id:string;sess:string;expire:string}>(sql`
    SELECT sid AS id,sess,expire FROM pg_sessions WHERE ${owner}=${userId}
    AND expire>${Date.now()} AND sess::jsonb->>'revoked' IS DISTINCT FROM 'true'
    ORDER BY expire DESC LIMIT 50`);
  return result.rows.map(row => {
    const data = JSON.parse(row.sess);
    return {id:row.id,userAgent:data.userAgent ?? "",ipAddress:data.ipAddress ?? null,
      lastActivity:data.lastActivity ? new Date(data.lastActivity) : null,
      createdAt:data.createdAt ? new Date(data.createdAt) : null,
      expiresAt:new Date(Number(row.expire)),trusted:data.trusted === true};
  });
}
export async function ownsLiveSession(userId: string, sid: string) {
  const result = await db.execute(sql`SELECT sid FROM pg_sessions
    WHERE sid=${sid} AND ${owner}=${userId} AND expire>${Date.now()}`);
  return result.rows.length === 1;
}
export async function ownedSessionStatus(userId: string, sid: string) {
  const result = await db.execute<{expire:string;count:string}>(sql`
    SELECT expire,count FROM (
      SELECT sid,expire,count(*) OVER() AS count FROM pg_sessions
      WHERE ${owner}=${userId} AND expire>${Date.now()}
    ) owned WHERE sid=${sid}`);
  const row = result.rows[0];
  return row ? { expiresAt: new Date(Number(row.expire)), concurrentSessions:Number(row.count) } : null;
}
export async function setDeviceTrust(userId: string, sid: string, trusted: boolean) {
  const result = await db.execute(sql`UPDATE pg_sessions
    SET sess=(sess::jsonb || jsonb_build_object('trusted',${trusted}::boolean))::text
    WHERE sid=${sid} AND ${owner}=${userId} AND expire>${Date.now()} RETURNING sid`);
  return result.rows.length === 1;
}
export async function revokeOwnedSessions(userId: string, currentSid: string, targetSid?: string) {
  if (!currentSid || targetSid===currentSid) throw new Error("Cannot revoke current session");
  return db.transaction(async tx => {
    const result = await tx.execute<{sid:string}>(sql`
      UPDATE pg_sessions SET sess='{"revoked":true}',expire=9007199254740991
      WHERE ${owner}=${userId} AND sid<>${currentSid}
      AND ${targetSid ? sql`sid=${targetSid}` : sql`TRUE`}
      AND sess::jsonb->>'revoked' IS DISTINCT FROM 'true' RETURNING sid`);
    if (result.rows.length || !targetSid) {
      // Persist a cutoff as well as updating token rows: a refresh already in
      // flight could insert its successor AFTER this transaction commits.
      // The original authentication time follows the entire rotation chain.
      await tx.execute(sql`INSERT INTO pg_sessions(sid,sess,expire)
        VALUES(${`bearer-revocation:${userId}`},
          jsonb_build_object('revoked',true,'revokedBefore',
            floor(extract(epoch FROM clock_timestamp())*1000)::bigint)::text,9007199254740991)
        ON CONFLICT(sid) DO UPDATE SET sess=jsonb_build_object('revoked',true,
          'revokedBefore',GREATEST((pg_sessions.sess::jsonb->>'revokedBefore')::bigint,
            (EXCLUDED.sess::jsonb->>'revokedBefore')::bigint))::text`);
      // Legacy bearer credentials have no SID binding. Revoke all of these,
      // not unrelated cookie sessions, rather than leave an unknown linked
      // credential usable after a successful remote logout.
      await tx.execute(sql`UPDATE jwt_tokens SET revoked=true,revoked_at=now(),
        revoked_reason='remote_session_termination' WHERE user_id=${userId} AND revoked=false`);
      await tx.execute(sql`UPDATE refresh_tokens SET revoked=true,revoked_at=now(),
        revoked_reason='remote_session_termination' WHERE user_id=${userId} AND revoked=false`);
    }
    return result.rows.length;
  });
}