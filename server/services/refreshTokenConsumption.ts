import type { AuthorityDatabase } from "./sessionAuthority.js";

export function createRefreshTokenConsumer(database: AuthorityDatabase) {
  return async (id: string, token: string, userId: string): Promise<boolean> => {
    const result = await database.query(
      `UPDATE refresh_tokens SET revoked = true, revoked_at = now(), revoked_reason = 'Token rotation'
       WHERE id = $1 AND token = $2 AND user_id = $3 AND COALESCE(revoked, false) = false
         AND expires_at > now() RETURNING id`, [id, token, userId]);
    return result.rows.length === 1;
  };
}

export async function consumeRefreshToken(id: string, token: string, userId: string) {
  const { pool } = await import("../db.js");
  return createRefreshTokenConsumer(pool)(id, token, userId);
}