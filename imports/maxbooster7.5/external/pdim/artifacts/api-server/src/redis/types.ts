// ============================================================================
// REDIS-LIKE STORE TYPES
// ============================================================================

export type RedisValueType =
  | "string"
  | "list"
  | "hash"
  | "set"
  | "zset"
  | "stream";

export interface RedisStringEntry {
  type: "string";
  value: string;
  expiresAt?: number;
}

export interface RedisListEntry {
  type: "list";
  value: string[];
  expiresAt?: number;
}

export interface RedisHashEntry {
  type: "hash";
  value: Record<string, string>;
  expiresAt?: number;
}

export interface RedisSetEntry {
  type: "set";
  value: string[];
  expiresAt?: number;
}

export interface ZSetMember {
  member: string;
  score: number;
}

export interface RedisZSetEntry {
  type: "zset";
  value: ZSetMember[];
  expiresAt?: number;
}

export interface StreamItem {
  id: string;
  fields: string[];
}

export interface StreamGroup {
  lastDeliveredId: string;
  pending: Array<{
    id: string;
    consumer: string;
    deliveredAt: number;
    count: number;
  }>;
  consumers: Record<string, { name: string; lastSeenAt: number }>;
}

export interface RedisStreamEntry {
  type: "stream";
  value: StreamItem[];
  groups: Record<string, StreamGroup>;
  expiresAt?: number;
}

export type RedisEntry =
  | RedisStringEntry
  | RedisListEntry
  | RedisHashEntry
  | RedisSetEntry
  | RedisZSetEntry
  | RedisStreamEntry;

export type RedisCommandResult =
  | string
  | number
  | null
  | boolean
  | string[]
  | Record<string, string>
  | Array<string | null>
  | Array<unknown>;

export interface RedisCommandError {
  error: string;
}

export interface RedisStoreSnapshot {
  version: number;
  savedAt: number;
  entries: Record<string, RedisEntry>;
  // Highest AOF sequence number whose effect is already folded into `entries`.
  // On boot, only AOF records with seq > baselineSeq are replayed, so a snapshot
  // and a not-yet-truncated AOF can never double-apply the same write.
  baselineSeq?: number;
}

// One mutating command captured in the append-only log. `s` = monotonic seq,
// `c` = uppercased command name, `a` = its arguments.
export interface RedisAofRecord {
  s: number;
  c: string;
  a: string[];
}

export interface RedisAofLog {
  version: number;
  records: RedisAofRecord[];
}

export interface RedisInfoStats {
  instanceId: string;
  instanceName: string;
  keyCount: number;
  totalCommandsProcessed: number;
  uptimeSeconds: number;
  createdAt: string;
  lastSavedAt: string | null;
  persistenceEnabled: boolean;
}
