import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";

export type SyncTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface SyncOperation {
  id: string;
  type: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
}
export interface OperationResult {
  success: boolean;
  data?: unknown;
  error?: string;
  conflict?: boolean;
}
export interface OperationReceipt {
  protocolVersion: 1;
  actionId: string;
  ownerId: string;
  payloadHash: string;
  success: boolean;
  outcome: "applied" | "rejected" | "conflict";
  receipt: true;
  retryable: false;
  error?: string;
  serverResponse?: unknown;
}

export function operationFingerprint(action: SyncOperation): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]),
    );
    return value;
  };
  return createHash("sha256").update(JSON.stringify(canonical({
    type: action.type, payload: action.payload, metadata: action.metadata ?? {},
  }))).digest("hex");
}

/** Injectable transaction boundary permits isolated tests, not runtime fallback. */
export function createReceiptRepository(database: Pick<typeof db, "transaction" | "execute">) {
  return {
    async apply(ownerId: string, action: SyncOperation,
      handler: (tx: SyncTransaction) => Promise<OperationResult>): Promise<OperationReceipt> {
      const hash = operationFingerprint(action);
      return database.transaction(async tx => {
        // Owner+ID lock serializes both absent-row creation and receipt reads.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ownerId}), hashtext(${action.id}))`);
        const previous = await tx.execute(sql`
          SELECT payload_hash, receipt FROM client_sync_receipts
          WHERE owner_id = ${ownerId} AND operation_id = ${action.id}`);
        const existing = previous.rows[0] as { payload_hash: string; receipt: OperationReceipt } | undefined;
        if (existing) {
          if (existing.payload_hash !== hash) throw new Error("Operation ID already belongs to a different payload");
          return existing.receipt;
        }
        const result = await handler(tx);
        const receipt: OperationReceipt = {
          protocolVersion: 1, actionId: action.id, ownerId, payloadHash: hash, success: result.success,
          outcome: result.success ? "applied" : result.conflict ? "conflict" : "rejected",
          receipt: true, retryable: false,
          ...(result.error ? { error: result.error } : {}),
          ...(result.data !== undefined ? { serverResponse: result.data } : {}),
        };
        await tx.execute(sql`INSERT INTO client_sync_receipts
          (owner_id, operation_id, payload_hash, receipt)
          VALUES (${ownerId}, ${action.id}, ${hash}, ${JSON.stringify(receipt)}::jsonb)`);
        return receipt;
      });
    },
    async lookup(ownerId: string, ids: string[]) {
      const result = await database.execute(sql`
        SELECT operation_id, receipt FROM client_sync_receipts
        WHERE owner_id = ${ownerId} AND operation_id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
      const rows = result.rows as unknown as Array<{ operation_id: string; receipt: OperationReceipt }>;
      return { receipts: rows.map(row => row.receipt), missing: ids.filter(id => !rows.some(row => row.operation_id === id)) };
    },
  };
}

export const clientSyncReceipts = createReceiptRepository(db);