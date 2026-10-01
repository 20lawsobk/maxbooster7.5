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

export async function claimToolostRetry(
  userId: string,
  releaseId: string,
  platform: string,
  retryCount: number,
): Promise<string> {
  const platformKey = platform.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!platformKey) throw new Error("A valid platform is required for a retry");
  const attemptId = randomUUID();
  const result = await pool.query(
    `UPDATE integration_distribution_submissions
     SET checkpoint = jsonb_set(
       COALESCE(checkpoint, '{}'::jsonb),
       ARRAY['retryAttempts', $3],
       jsonb_build_object(
         'attemptId', $4,
         'retryCount', $5,
         'state', 'started',
         'startedAt', now()
       ),
       true
     ), updated_at=now()
     WHERE provider='toolost' AND user_id=$1 AND release_id=$2 AND state='completed'
       AND COALESCE(checkpoint #>> ARRAY['retryAttempts', $3, 'state'], '') <> 'started'
     RETURNING owner`,
    [userId, releaseId, platformKey, attemptId, retryCount],
  );
  if (result.rows.length !== 1) {
    throw new Error(
      "A safe Too Lost retry cannot be claimed. The original submission checkpoint is missing or another retry is in progress.",
    );
  }
  return attemptId;
}

export async function completeToolostRetry(
  userId: string,
  releaseId: string,
  platform: string,
  attemptId: string,
  retryCount: number,
  state: "confirmed" | "failed" | "unknown",
  result: Record<string, unknown>,
): Promise<void> {
  const platformKey = platform.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const saved = await pool.query(
    `UPDATE integration_distribution_submissions
     SET checkpoint = jsonb_set(
       COALESCE(checkpoint, '{}'::jsonb),
       ARRAY['retryAttempts', $3],
       jsonb_build_object(
         'attemptId', $4,
         'retryCount', $5,
         'state', $6,
         'result', $7::jsonb,
         'updatedAt', now()
       ),
       true
     ), updated_at=now()
     WHERE provider='toolost' AND user_id=$1 AND release_id=$2 AND state='completed'
       AND checkpoint #>> ARRAY['retryAttempts', $3, 'attemptId'] = $4
     RETURNING owner`,
    [userId, releaseId, platformKey, attemptId, retryCount, state, JSON.stringify(result)],
  );
  if (saved.rows.length !== 1) {
    throw new Error(
      "Too Lost retry outcome could not be persisted; refresh provider status before retrying again.",
    );
  }
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
    const saved = await pool.query(
      `UPDATE integration_distribution_submissions SET checkpoint=checkpoint || $2::jsonb,updated_at=now()
       WHERE owner=$1 AND state='started' RETURNING owner`, [owner, JSON.stringify(data)],
    );
    if (saved.rows.length !== 1) throw new Error("Distribution checkpoint ownership lost; reconcile before continuing");
  };
  try {
    const result = await submit(checkpoint);
    const saved = await pool.query(
      `UPDATE integration_distribution_submissions SET state='completed',result=$2::jsonb,updated_at=now()
       WHERE owner=$1 AND state='started' RETURNING owner`, [owner, JSON.stringify(result)],
    );
    if (saved.rows.length !== 1) throw new Error("Distribution completion was not persisted; reconcile provider receipt");
    return result;
  } catch (error) {
    await pool.query(
      `UPDATE integration_distribution_submissions SET state='unknown',error=$2,updated_at=now()
       WHERE owner=$1 AND state='started'`, [owner, error instanceof Error ? error.message : "Submission failed"],
    );
    throw error;
  }
}