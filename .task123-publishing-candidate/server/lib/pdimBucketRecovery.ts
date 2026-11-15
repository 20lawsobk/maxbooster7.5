import type { RedisAofRecord } from "../../external/pdim/artifacts/api-server/src/redis/types.js";

export type PdimBucketTransaction =
  | { kind: "redis"; records: RedisAofRecord[] }
  | { kind: "capsule"; sequence: number; changes: Record<string, string | null> };

export function isBucketTransaction(value: unknown): value is PdimBucketTransaction {
  if (!value || typeof value !== "object") return false;
  const transaction = value as Partial<PdimBucketTransaction>;
  if (transaction.kind === "redis") {
    return Array.isArray(transaction.records) && transaction.records.length > 0 &&
      transaction.records.every(record => !!record && Number.isSafeInteger(record.s) && record.s > 0 &&
        typeof record.c === "string" && Array.isArray(record.a) &&
        record.a.every((arg: unknown) => typeof arg === "string"));
  }
  if (transaction.kind === "capsule") {
    return Number.isSafeInteger(transaction.sequence) && transaction.sequence! > 0 &&
      !!transaction.changes && typeof transaction.changes === "object" &&
      !Array.isArray(transaction.changes) &&
      Object.values(transaction.changes).every(item => item === null || typeof item === "string");
  }
  return false;
}

/** Preserve Redis/capsule interleaving using the canonical engine's existing
 * recovery primitives, not a second Redis interpreter. Synthetic sequence
 * numbers exist only during replay; afterward the owner must reattach the map
 * at redisSequence before exposing it or accepting writes. Both attaches are
 * synchronous, so no expiry callback or incoming request can interleave.
 */
export function orderedBucketRecovery(
  transactions: readonly PdimBucketTransaction[],
  redisBaseline: number,
  capsuleBaseline: number,
): { records: RedisAofRecord[]; redisSequence: number; capsuleSequence: number } {
  if (![redisBaseline, capsuleBaseline].every(n => Number.isSafeInteger(n) && n >= 0)) {
    throw new Error("Invalid bucket recovery baseline");
  }
  let redisSequence = redisBaseline;
  let capsuleSequence = capsuleBaseline;
  let replaySequence = redisBaseline;
  const records: RedisAofRecord[] = [];
  const next = () => {
    if (!Number.isSafeInteger(replaySequence + 1)) throw new Error("Recovery sequence overflow");
    return ++replaySequence;
  };
  for (const transaction of transactions) {
    if (!isBucketTransaction(transaction)) throw new Error("Invalid bucket transaction");
    if (transaction.kind === "redis") {
      for (const record of transaction.records) {
        if (record.s !== redisSequence + 1) throw new Error("Bucket Redis sequence discontinuity");
        redisSequence = record.s;
        records.push({ ...record, s: next() });
      }
    } else {
      if (transaction.sequence !== capsuleSequence + 1) throw new Error("Bucket capsule sequence discontinuity");
      capsuleSequence = transaction.sequence;
      for (const [key, value] of Object.entries(transaction.changes)) {
        records.push({
          s: next(), c: "__RESTORE_KEY",
          a: [key, JSON.stringify(value === null ? null : { type: "string", value })],
        });
      }
    }
  }
  return { records, redisSequence, capsuleSequence };
}
