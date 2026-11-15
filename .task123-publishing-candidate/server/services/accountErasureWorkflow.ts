import { randomUUID } from "node:crypto";
import type { AuthorityDatabase } from "./sessionAuthority.js";

/** Trusted, operator-approved inventory, NOT a policy accepted from an HTTP body.
 * Every entry covers one complete system (including retained/backup copies).
 * Expiry and legal-hold checks are repeated before each external attempt.
 */
export interface ErasureApproval {
  requestId: string;
  userId: string;
  policyVersion: string;
  inventoryVersion: string;
  approvedBy: string;
  approvalRef: string;
  validUntil: number;
  notBefore: number;
  legalHold: boolean;
  inventoryComplete: boolean;
  writesFenced: boolean;
  systems: Array<{ id: string; eligibleAfter: number; legalHold: boolean }>;
}

export interface ErasureAuthority {
  // Must read authoritative policy, retention/hold and write-fence state; never cached fallback.
  review(requestId: string): Promise<ErasureApproval>;
  // Must verify the provider receipt against THIS subject/system/inventory.
  verifyReceipt(approval: ErasureApproval, systemId: string, receiptRef: string): Promise<boolean>;
}

const opaque = (value: string) =>
  typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(value);

export function validateErasureApproval(a: ErasureApproval, requestId: string, now: number) {
  if (!a || a.requestId !== requestId || !a.userId || !opaque(a.policyVersion) ||
      !opaque(a.inventoryVersion) || !opaque(a.approvedBy) || !opaque(a.approvalRef) ||
      !Number.isFinite(a.validUntil) || a.validUntil <= now ||
      !Number.isFinite(a.notBefore) || a.notBefore > now ||
      a.legalHold !== false || a.inventoryComplete !== true || a.writesFenced !== true ||
      !Array.isArray(a.systems) || a.systems.length === 0 ||
      new Set(a.systems.map(s => s.id)).size !== a.systems.length ||
      a.systems.some(s => !opaque(s.id) || s.legalHold !== false ||
        !Number.isFinite(s.eligibleAfter) || s.eligibleAfter > now)) {
    throw new Error("Erasure blocked: approved complete inventory, write fence and expired retention without holds required");
  }
}

/** SQL boundary. Atomic statements, conditional transitions, fenced leases.
 * The application deliberately has no default authority or deletion adapters.
 */
export function createErasureWorkflowRepository(database: AuthorityDatabase) {
  return {
    async prepare(a: ErasureApproval) {
      const result = await database.query(
        `WITH locked AS (
           SELECT * FROM account_erasure_requests
           WHERE request_id = $1 AND user_id = $2 AND status = 'pending_policy'
             AND not_before <= now() FOR UPDATE
         ), planned AS (
           INSERT INTO account_erasure_steps
             (request_id, system_id, inventory_version, policy_version, approval_ref, approved_by)
           SELECT locked.request_id, system_id, $3, $4, $6, $7 FROM locked,
             unnest($5::text[]) AS system_id
           ON CONFLICT DO NOTHING RETURNING request_id
         )
         SELECT request_id FROM planned`,
        [a.requestId, a.userId, a.inventoryVersion, a.policyVersion, a.systems.map(s => s.id),
          a.approvalRef, a.approvedBy]);
      return result.rows.length;
    },
    async claim(a: ErasureApproval, systemId: string, leaseId: string) {
      const result = await database.query(
        `WITH locked AS (
           SELECT * FROM account_erasure_requests
           WHERE request_id = $1 AND user_id = $2
             AND status IN ('pending_policy', 'processing') AND not_before <= now()
             AND (policy_version IS NULL OR policy_version = $4)
             AND (SELECT count(*) FROM account_erasure_steps WHERE request_id = $1)
               = cardinality($7::text[])
             AND NOT EXISTS (
               SELECT 1 FROM account_erasure_steps WHERE request_id = $1
                 AND (NOT (system_id = ANY($7::text[])) OR inventory_version <> $3
                   OR policy_version <> $4 OR approval_ref <> $8 OR approved_by <> $9)
             ) FOR UPDATE
         ), claimed AS (
           UPDATE account_erasure_steps s SET status = 'running', attempts = attempts + 1,
             lease_id = $6, lease_until = now() + interval '5 minutes', retry_at = NULL
           FROM locked WHERE s.request_id = locked.request_id AND s.system_id = $5
             AND s.inventory_version = $3 AND s.policy_version = $4
             AND ((s.status IN ('pending', 'retry') AND (retry_at IS NULL OR retry_at <= now()))
               OR (s.status = 'running' AND lease_until < now()))
           RETURNING s.request_id
         ), started AS (
           UPDATE account_erasure_requests SET status = 'processing', policy_version = $4
           WHERE request_id IN (SELECT request_id FROM claimed) RETURNING user_id
         ), revoked AS (
           INSERT INTO auth_session_epochs (user_id, generation)
           SELECT users.id, 2 FROM users JOIN started ON users.id = started.user_id
           ON CONFLICT (user_id) DO UPDATE SET generation = auth_session_epochs.generation + 1
         ) SELECT request_id FROM claimed`,
        [a.requestId, a.userId, a.inventoryVersion, a.policyVersion, systemId, leaseId,
          a.systems.map(s => s.id), a.approvalRef, a.approvedBy]);
      return result.rows.length === 1;
    },
    async acknowledge(requestId: string, systemId: string, leaseId: string, receipt: string) {
      const result = await database.query(
        `UPDATE account_erasure_steps SET status = 'acknowledged', receipt_ref = $4,
           acknowledged_at = now(), lease_until = NULL
         WHERE request_id = $1 AND system_id = $2 AND lease_id = $3
           AND status = 'running' AND lease_until > now() RETURNING system_id`,
        [requestId, systemId, leaseId, receipt]);
      if (result.rows.length !== 1) throw new Error("Erasure receipt rejected: stale lease");
    },
    async retry(requestId: string, systemId: string, leaseId: string) {
      const result = await database.query(
        `UPDATE account_erasure_steps SET status = 'retry',
           retry_at = now() + interval '5 minutes', lease_until = NULL
         WHERE request_id = $1 AND system_id = $2 AND lease_id = $3 AND status = 'running'
         RETURNING system_id`, [requestId, systemId, leaseId]);
      if (result.rows.length !== 1) throw new Error("Erasure retry rejected: stale lease");
    },
  };
}

export type ErasureWorkflowRepository = ReturnType<typeof createErasureWorkflowRepository>;
export interface ErasureSystemAdapter {
  /** Must reconcile a prior ambiguous outcome before retrying. The stable key MUST
   * provide idempotency across crashes, lease expiry and multiple replicas.
   * It must enforce current holds/write fencing at the actual mutation boundary.
   */
  erase(input: { approval: ErasureApproval; systemId: string; idempotencyKey: string }): Promise<{ receiptRef: string }>;
}

export function createErasureWorkflow(
  repository: ErasureWorkflowRepository,
  authority: ErasureAuthority,
  adapters: ReadonlyMap<string, ErasureSystemAdapter>,
  now = Date.now,
) {
  async function approved(requestId: string) {
    const a = await authority.review(requestId);
    validateErasureApproval(a, requestId, now());
    // Missing even one system blocks every destructive operation.
    for (const system of a.systems) {
      if (!adapters.has(system.id)) throw new Error(`Erasure adapter unavailable: ${system.id}`);
    }
    return a;
  }
  return {
    async prepare(requestId: string) {
      return repository.prepare(await approved(requestId));
    },
    async attempt(requestId: string, systemId: string) {
      const a = await approved(requestId);
      if (!a.systems.some(s => s.id === systemId)) throw new Error("System outside approved inventory");
      const leaseId = randomUUID();
      if (!await repository.claim(a, systemId, leaseId)) return { claimed: false };
      try {
        // Recheck after acquisition; a hold may have been placed while waiting.
        const current = await approved(requestId);
        if (JSON.stringify(current) !== JSON.stringify(a)) throw new Error("Erasure approval changed during claim");
        const receipt = await adapters.get(systemId)!.erase({
          approval: current, systemId, idempotencyKey: `${requestId}:${systemId}`,
        });
        if (!opaque(receipt.receiptRef) ||
            !await authority.verifyReceipt(current, systemId, receipt.receiptRef)) {
          throw new Error("Erasure receipt could not be verified");
        }
        await repository.acknowledge(requestId, systemId, leaseId, receipt.receiptRef);
        return { claimed: true, acknowledged: true };
      } catch (error) {
        // No success fallback. Stable idempotency keys permit lost-ACK reconciliation.
        await repository.retry(requestId, systemId, leaseId);
        throw error;
      }
    },
    // Deliberately no complete(): receipts are not proof of zero residual data.
    // Finalization needs the approved residual/backup reconciliation contract.
  };
}