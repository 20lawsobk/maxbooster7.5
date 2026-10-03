/** Durable authentication epoch. No caches or availability fallback are permitted. */
export interface AuthorityDatabase {
  query(text: string, values: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export function createSessionAuthority(database: AuthorityDatabase) {
  return {
    async validateBearer(userId: string, issuedAt: unknown): Promise<boolean> {
      if (typeof issuedAt !== "number" || !Number.isSafeInteger(issuedAt) || issuedAt <= 0) return false;
      const result = await database.query(
        `SELECT (sess::jsonb->>'revokedBefore')::bigint AS cutoff
         FROM pg_sessions WHERE sid = $1`, [`bearer-revocation:${userId}`]);
      return !result.rows.length || issuedAt > Number(result.rows[0].cutoff);
    },
    async issue(userId: string): Promise<string> {
      const result = await database.query(
        `INSERT INTO auth_session_epochs (user_id, generation)
         SELECT id, 1 FROM users WHERE id = $1 AND subscription_status IS DISTINCT FROM 'suspended' AND subscription_status IS DISTINCT FROM 'banned'
         ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING generation::text`, [userId]);
      if (!result.rows[0]) throw new Error("Authentication account does not exist");
      return String(result.rows[0].generation);
    },
    async validate(userId: string, generation: unknown): Promise<boolean> {
      if (typeof generation !== "string" || !/^[1-9]\d*$/.test(generation)) return false;
      const result = await database.query(
        `SELECT 1 FROM auth_session_epochs e JOIN users u ON u.id = e.user_id
         WHERE e.user_id = $1 AND e.generation = $2::bigint
         AND u.subscription_status IS DISTINCT FROM 'suspended'
         AND u.subscription_status IS DISTINCT FROM 'banned'`, [userId, generation]);
      return result.rows.length === 1;
    },
    async revoke(userId: string): Promise<void> {
      await database.query(
        `INSERT INTO auth_session_epochs (user_id, generation)
         SELECT id, 2 FROM users WHERE id = $1
         ON CONFLICT (user_id) DO UPDATE SET generation = auth_session_epochs.generation + 1`,
        [userId]);
    },
  };
}

// Lazy load: importing the factory in isolated tests never initializes a database.
export async function sessionAuthority() {
  const { pool } = await import("../db.js");
  return createSessionAuthority(pool);
}