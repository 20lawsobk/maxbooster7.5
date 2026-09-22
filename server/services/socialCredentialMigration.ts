import { pool } from "../db.js";
import { encryptSocialCredential } from "./socialCredentialCodec.js";

/** Operator-invoked, bounded CAS backfill. NOT run on startup or by an HTTP route.
 * Deploy all reader patches and provision the stable external key first.
 * Existing encrypted bundle formats are deliberately left to their legacy decoder.
 */
export async function migratePlainSocialCredentials(limit = 100, afterId = ""): Promise<{ migrated: number; skippedLegacyEncrypted: number; nextAfterId: string | null }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Migration batch size must be 1–500");
  const result = await pool.query(
    `SELECT id,user_id,platform,access_token,refresh_token FROM social_accounts
     WHERE id>$2 AND ((access_token IS NOT NULL AND access_token NOT LIKE 'social:%')
        OR (refresh_token IS NOT NULL AND refresh_token NOT LIKE 'social:%'))
     ORDER BY id LIMIT $1`, [limit, afterId],
  );
  let migrated = 0;
  let skippedLegacyEncrypted = 0;
  for (const row of result.rows) {
    const legacyEncrypted = (value: string | null) => !!value && /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i.test(value);
    if (legacyEncrypted(row.access_token) || legacyEncrypted(row.refresh_token) || row.access_token?.startsWith("{")) {
      skippedLegacyEncrypted++;
      continue;
    }
    const encode = (value: string | null, kind: string) =>
      !value || value.startsWith("social:") ? value : encryptSocialCredential(value, `${row.user_id}:${row.platform}:${kind}`);
    const updated = await pool.query(
      `UPDATE social_accounts SET access_token=$2,refresh_token=$3 WHERE id=$1
       AND access_token IS NOT DISTINCT FROM $4 AND refresh_token IS NOT DISTINCT FROM $5 RETURNING id`,
      [row.id, encode(row.access_token, "access"), encode(row.refresh_token, "refresh"), row.access_token, row.refresh_token],
    );
    migrated += updated.rows.length;
  }
  return { migrated, skippedLegacyEncrypted, nextAfterId: result.rows.length === limit ? result.rows[result.rows.length - 1].id : null };
}