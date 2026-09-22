import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db.js";

export type DistributionCheckpoint = (checkpoint: Record<string, unknown>) => Promise<void>;

export async function getDistributionSubmissions(userId: string, releaseId: string) {
  const result = await pool.query(
    `SELECT provider,release_id,state,checkpoint,result,error,created_at,updated_at
     FROM integration_distribution_submissions WHERE user_id=$1 AND release_id=$2`,
    [userId, releaseId],
  );
  return result.rows;
}
/** Serialize a local release submission and retain ambiguous attempts for reconciliation.
 * This does not pretend providers support an idempotency header or remote lookup.
 */
export async function submitDistributionOnce<T>(
  provider: "labelgrid" | "toolost", userId: string, releaseId: string,
  payload: unknown, submit: (checkpoint: DistributionCheckpoint) => Promise<T>,
): Promise<T> {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const owner = randomUUID();
  const claim = await pool.query(
    `INSERT INTO integration_distribution_submissions(provider,user_id,release_id,payload_hash,owner,state)
     VALUES($1,$2,$3,$4,$5,'started') ON CONFLICT(provider,user_id,release_id) DO NOTHING RETURNING owner`,
    [provider, userId, releaseId, hash, owner],
  );
  if (!claim.rows.length) {
    const existing = await pool.query(
      `SELECT payload_hash,state,result FROM integration_distribution_submissions
       WHERE provider=$1 AND user_id=$2 AND release_id=$3`, [provider, userId, releaseId],
    );
    const row = existing.rows[0];
    if (row?.payload_hash !== hash) throw new Error("Distribution payload changed after submission began; reconcile the existing remote release before submitting again");
    if (row.state === "completed") return row.result as T;
    throw new Error("Distribution submission already started or has an unknown outcome; reconcile the recorded provider checkpoint before retrying");
  }
  const checkpoint: DistributionCheckpoint = async data => {
    await pool.query(
      `UPDATE integration_distribution_submissions SET checkpoint=checkpoint || $2::jsonb,updated_at=now()
       WHERE owner=$1`, [owner, JSON.stringify(data)],
    );
  };
  try {
    const result = await submit(checkpoint);
    await pool.query(
      `UPDATE integration_distribution_submissions SET state='completed',result=$2::jsonb,updated_at=now()
       WHERE owner=$1`, [owner, JSON.stringify(result)],
    );
    return result;
  } catch (error) {
    await pool.query(
      `UPDATE integration_distribution_submissions SET state='unknown',error=$2,updated_at=now()
       WHERE owner=$1`, [owner, error instanceof Error ? error.message : "Submission failed"],
    );
    throw error;
  }
}