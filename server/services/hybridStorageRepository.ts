import type { HybridFileMetadata } from "./hybridStorageService.js";

export interface HybridMetadataRow {
  entry: HybridFileMetadata;
  blobKey: string;
  state: "uploading" | "active" | "deleting";
}
interface QueryResult { rows: Record<string, any>[]; rowCount?: number | null }
interface Connection {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
  release(): void;
}
export interface HybridMetadataPool {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
  connect(): Promise<Connection>;
}

function decode(row: Record<string, any>): HybridMetadataRow {
  return {
    entry: { ...row.metadata, createdAt: new Date(row.metadata.createdAt), lastAccessed: new Date(row.metadata.lastAccessed) },
    blobKey: row.blob_key,
    state: row.state,
  };
}

/** Per-file SQL authority. No process-local ownership cache or whole-index writes. */
export class HybridStorageRepository {
  constructor(private readonly pool: HybridMetadataPool) {}

  async importLegacy(load: () => Promise<HybridMetadataRow[]>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('hybrid-storage-legacy-import-v1'))");
      if (!(await client.query("SELECT source FROM hybrid_storage_imports WHERE source=$1", ["pdim-index-v1"])).rows.length) {
        const rows = await load(); // A corrupt/unavailable source aborts; it never becomes an empty import.
        for (const { entry, blobKey } of rows) {
          await client.query(`INSERT INTO hybrid_storage_files(key,user_id,blob_key,state,metadata)
            VALUES($1,$2,$3,'active',$4::jsonb)`, [entry.key, entry.userId, blobKey, JSON.stringify(entry)]);
        }
        await client.query("INSERT INTO hybrid_storage_imports(source,imported_count) VALUES($1,$2)", ["pdim-index-v1", rows.length]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async beginUpload(entry: HybridFileMetadata, blobKey: string): Promise<{ blobKey: string; deduplicated: boolean; compressedSize: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`hybrid-content:${entry.contentHash}`]);
      // Legacy metadata has not had its bytes verified during import. Only a
      // committed immutable-format receipt may supply a new dedup reference.
      const existing = (await client.query(`SELECT blob_key,metadata FROM hybrid_storage_files WHERE state='active'
        AND blob_key LIKE 'hybrid:v2:%' AND metadata->>'contentHash'=$1 AND (metadata->>'sizeBytes')::bigint=$2 LIMIT 1`,
      [entry.contentHash, entry.sizeBytes])).rows[0];
      const stored = existing ? { ...entry, compressedSize: existing.metadata.compressedSize,
        isDeduplicated: true, deduplicationRef: existing.metadata.key } : entry;
      const actualBlobKey = existing?.blob_key ?? blobKey;
      await client.query(`INSERT INTO hybrid_storage_files(key,user_id,blob_key,state,metadata)
        VALUES($1,$2,$3,$4,$5::jsonb)`, [entry.key, entry.userId, actualBlobKey,
        "uploading", JSON.stringify(stored)]);
      await client.query("COMMIT");
      return { blobKey: actualBlobKey, deduplicated: !!existing, compressedSize: stored.compressedSize };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async activate(key: string, compressedSize: number): Promise<void> {
    const result = await this.pool.query(`UPDATE hybrid_storage_files SET state='active',
      metadata=jsonb_set(metadata,'{compressedSize}',to_jsonb($2::bigint)),updated_at=now()
      WHERE key=$1 AND state IN ('uploading','active') RETURNING key`, [key, compressedSize]);
    if (!result.rows.length) throw new Error("Hybrid upload publication lost its pending record");
  }

  async get(key: string, includePending = false): Promise<HybridMetadataRow | undefined> {
    const result = await this.pool.query(`SELECT metadata,blob_key,state FROM hybrid_storage_files
      WHERE key=$1 ${includePending ? "" : "AND state='active'"}`, [key]);
    return result.rows[0] ? decode(result.rows[0]) : undefined;
  }

  async list(userId?: string, includePublic = false): Promise<HybridMetadataRow[]> {
    const result = await this.pool.query(`SELECT metadata,blob_key,state FROM hybrid_storage_files WHERE state='active'
      ${userId === undefined ? "" : "AND (user_id=$1 OR ($2::boolean AND (metadata->>'isPublic')::boolean))"}
      ORDER BY key`, userId === undefined ? [] : [userId, includePublic]);
    return result.rows.map(decode);
  }

  async touch(key: string): Promise<void> {
    await this.pool.query(`UPDATE hybrid_storage_files SET metadata=jsonb_set(jsonb_set(metadata,
      '{accessCount}',to_jsonb(COALESCE((metadata->>'accessCount')::bigint,0)+1)),
      '{lastAccessed}',to_jsonb(now())),updated_at=now() WHERE key=$1 AND state='active'`, [key]);
  }

  async markCold(key: string, userId?: string): Promise<boolean> {
    const result = await this.pool.query(`UPDATE hybrid_storage_files SET metadata=metadata ||
      '{"tier":"cold","location":"pocket-dimension"}'::jsonb,updated_at=now()
      WHERE key=$1 AND state='active' ${userId === undefined ? "" : "AND user_id=$2"} RETURNING key`,
    userId === undefined ? [key] : [key, userId]);
    return result.rows.length > 0;
  }

  /** A durable deletion intent hides the row before physical deletion. Legacy
   * aliases retain the same immutable blob key; removing a primary never
   * promotes a nonexistent physical key. New uploads never reuse blob keys. */
  async beginDelete(key: string, userId: string): Promise<{ found: boolean; blobKey?: string }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const initial = (await client.query("SELECT user_id,blob_key,metadata->>'contentHash' AS content_hash FROM hybrid_storage_files WHERE key=$1", [key])).rows[0];
      if (!initial) { await client.query("COMMIT"); return { found: false }; }
      if (initial.user_id !== userId) throw new Error(`Access denied: ${key}`);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`hybrid-content:${initial.content_hash}`]);
      // Re-read after the common blob lock; another request may have finished.
      const current = (await client.query("SELECT key FROM hybrid_storage_files WHERE key=$1 FOR UPDATE", [key])).rows[0];
      if (!current) { await client.query("COMMIT"); return { found: false }; }
      const refs = (await client.query("SELECT key FROM hybrid_storage_files WHERE blob_key=$1 AND key<>$2", [initial.blob_key, key])).rows;
      if (refs.length) {
        await client.query("DELETE FROM hybrid_storage_files WHERE key=$1", [key]);
        await client.query("COMMIT");
        return { found: true };
      }
      await client.query("UPDATE hybrid_storage_files SET state='deleting',updated_at=now() WHERE key=$1", [key]);
      await client.query("COMMIT");
      return { found: true, blobKey: initial.blob_key };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async finishDelete(key: string, userId: string): Promise<void> {
    await this.pool.query("DELETE FROM hybrid_storage_files WHERE key=$1 AND user_id=$2 AND state='deleting'", [key, userId]);
  }
}
