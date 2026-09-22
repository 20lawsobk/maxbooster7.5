import type { AuthorityDatabase } from "./sessionAuthority.js";
import { createHash } from "node:crypto";

/** Compare-and-swap the proved active factor and revoke all prior credentials
 * in one statement. Concurrent replacement cannot overwrite an unproved factor. */
export function createFactorRepository(database: AuthorityDatabase) {
  return {
    async replace(userId: string, expectedSecret: string | null, expectedEnabled: boolean,
      newSecret: string | null, enabled: boolean, verifiedStep: number | null = null): Promise<string> {
      if (enabled && (!newSecret || !Number.isSafeInteger(verifiedStep))) {
        throw new Error("Verified factor time step required");
      }
      const result = await database.query(
        `WITH changed AS (
           UPDATE users SET two_factor_secret = $4, two_factor_enabled = $5
           WHERE id = $1 AND two_factor_secret IS NOT DISTINCT FROM $2
             AND COALESCE(two_factor_enabled, false) = $3 RETURNING id
         )
         INSERT INTO auth_session_epochs (user_id, generation, last_totp_step, last_totp_secret_hash)
         SELECT id, 2, $6, $7 FROM changed
         ON CONFLICT (user_id) DO UPDATE SET generation = auth_session_epochs.generation + 1,
           last_totp_step = EXCLUDED.last_totp_step, last_totp_secret_hash = EXCLUDED.last_totp_secret_hash
         RETURNING generation::text`, [userId, expectedSecret, expectedEnabled, newSecret, enabled,
          verifiedStep, newSecret ? createHash("sha256").update(newSecret).digest("hex") : null]);
      if (!result.rows[0]) throw new Error("Authenticator changed during verification. Please start again.");
      return String(result.rows[0].generation);
    },
  };
}

export async function factorRepository() {
  const { pool } = await import("../db.js");
  return createFactorRepository(pool);
}