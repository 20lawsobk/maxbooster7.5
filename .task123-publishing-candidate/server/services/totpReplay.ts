import { createHash } from "node:crypto";
import { verifySync } from "otplib";
import type { AuthorityDatabase } from "./sessionAuthority.js";

export function verifiedTotpStep(secret: string, token: unknown): number | null {
  if (typeof token !== "string" || !/^\d{6}$/.test(token)) return null;
  const result = verifySync({ secret, token, strategy: "totp", epochTolerance: 1 });
  return result.valid && "timeStep" in result ? result.timeStep : null;
}

export function createTotpConsumer(database: AuthorityDatabase) {
  return async (userId: string, secret: string, token: unknown): Promise<boolean> => {
    const step = verifiedTotpStep(secret, token);
    if (step === null) return false;
    const hash = createHash("sha256").update(secret).digest("hex");
    const result = await database.query(
      `INSERT INTO auth_session_epochs (user_id, generation, last_totp_step, last_totp_secret_hash)
       SELECT id, 1, $3, $4 FROM users
       WHERE id = $1 AND two_factor_enabled = true AND two_factor_secret = $2 FOR UPDATE
       ON CONFLICT (user_id) DO UPDATE SET last_totp_step = EXCLUDED.last_totp_step,
         last_totp_secret_hash = EXCLUDED.last_totp_secret_hash
       WHERE auth_session_epochs.last_totp_secret_hash IS DISTINCT FROM EXCLUDED.last_totp_secret_hash
          OR auth_session_epochs.last_totp_step IS NULL
          OR auth_session_epochs.last_totp_step < EXCLUDED.last_totp_step
       RETURNING user_id`, [userId, secret, step, hash]);
    return result.rows.length === 1;
  };
}

export async function consumeTotp(userId: string, secret: string, token: unknown) {
  const { pool } = await import("../db.js");
  return createTotpConsumer(pool)(userId, secret, token);
}