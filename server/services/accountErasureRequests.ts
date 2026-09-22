import type { AuthorityDatabase } from "./sessionAuthority.js";

/** Records a request, not a claim of erasure. Policy approval is an operator gate.
 * Request and credential revocation commit together; retry preserves original date.
 */
export function createErasureRequests(database: AuthorityDatabase) {
  return {
    async request(userId: string) {
      const result = await database.query(
        `WITH account AS (SELECT id FROM users WHERE id = $1),
         revoke AS (
           INSERT INTO auth_session_epochs (user_id, generation)
           SELECT id, 2 FROM account
           ON CONFLICT (user_id) DO UPDATE SET generation = auth_session_epochs.generation + 1
         )
         INSERT INTO account_erasure_requests (user_id)
         SELECT id FROM account
         ON CONFLICT (user_id) DO UPDATE SET
           status = CASE WHEN account_erasure_requests.status = 'cancelled'
                         THEN 'pending_policy' ELSE account_erasure_requests.status END,
           requested_at = CASE WHEN account_erasure_requests.status = 'cancelled'
                         THEN now() ELSE account_erasure_requests.requested_at END,
           not_before = CASE WHEN account_erasure_requests.status = 'cancelled'
                         THEN now() + interval '30 days' ELSE account_erasure_requests.not_before END,
           request_id = CASE WHEN account_erasure_requests.status = 'cancelled'
                         THEN gen_random_uuid() ELSE account_erasure_requests.request_id END,
           policy_version = CASE WHEN account_erasure_requests.status = 'cancelled'
                         THEN NULL ELSE account_erasure_requests.policy_version END,
           completed_at = CASE WHEN account_erasure_requests.status = 'cancelled'
                         THEN NULL ELSE account_erasure_requests.completed_at END
         RETURNING user_id, requested_at, not_before, status`, [userId]);
      if (!result.rows[0]) throw new Error("Account not found");
      return result.rows[0];
    },
    async status(userId: string): Promise<Record<string, unknown> | null> {
      const result = await database.query(
        "SELECT requested_at, not_before, status, completed_at FROM account_erasure_requests WHERE user_id = $1",
        [userId]);
      return result.rows[0] ?? null;
    },
    async cancel(userId: string) {
      const result = await database.query(
        `UPDATE account_erasure_requests SET status = 'cancelled'
         WHERE user_id = $1 AND status = 'pending_policy' RETURNING user_id`, [userId]);
      return result.rows.length === 1;
    },
  };
}