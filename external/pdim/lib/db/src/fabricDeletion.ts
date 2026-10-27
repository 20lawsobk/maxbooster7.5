
type ObjectRow = { id: string; chunk_ids: string[] };
type Location = { node_ids: string[]; size_bytes: number | string; accounted_nodes?: string[]; physical_keys?: Record<string, string> };
type Job = { object_id: string; ordinal: number; chunk_id: string; state: string; location: Location | null; done_nodes: string[] };
function rows<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) ?? [];
}

/** Durable object reference release and per-node physical deletion receipts. */
export interface DeletionExecutor<Query> { execute(query: Query): PromiseLike<unknown> }
export interface DeletionDatabase<Query> extends DeletionExecutor<Query> {
  transaction<T>(work: (tx: DeletionExecutor<Query>) => Promise<T>): Promise<T>;
}
export type FabricFence = <T>(id: string, work: () => Promise<T>) => Promise<T>;

export class DurableDeletionOutbox<Query> {
  constructor(private readonly db: DeletionDatabase<Query>, private readonly fence: FabricFence,
    private readonly sql: (strings: TemplateStringsArray, ...values: unknown[]) => Query,
    private readonly options: { textUsage?: boolean; segments?: boolean } = {}) {}
  private ready: Promise<void> | undefined;

  async initialize(): Promise<void> {
    this.ready ??= this.db.transaction(async tx => {
      // Serialize additive bootstrap DDL between concurrently starting workers.
      await tx.execute(this.sql`SELECT pg_advisory_xact_lock(hashtextextended('fabric-deletion-schema',0))`);
      await tx.execute(this.sql`CREATE TABLE IF NOT EXISTS fabric_deletion_objects (
        object_id text PRIMARY KEY, object_data jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now())`);
      await tx.execute(this.sql`CREATE TABLE IF NOT EXISTS fabric_deletion_chunks (
        object_id text NOT NULL, ordinal integer NOT NULL, chunk_id text NOT NULL,
        state text NOT NULL DEFAULT 'pending', location jsonb,
        done_nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
        PRIMARY KEY (object_id, ordinal))`);
      await tx.execute(this.sql`CREATE INDEX IF NOT EXISTS fabric_deletion_chunks_chunk_idx
        ON fabric_deletion_chunks(chunk_id)`);
    }).catch(error => { this.ready = undefined; throw error; });
    return this.ready;
  }

  async claim(objectId: string): Promise<{ id: string; chunkIds: string[] } | null> {
    await this.initialize();
    return this.db.transaction(async tx => {
      const object = rows<ObjectRow>(await tx.execute(this.sql`DELETE FROM fabric_objects WHERE id=${objectId} RETURNING *`))[0];
      if (!object) {
        const existing = rows<{ object_data: ObjectRow }>(await tx.execute(this.sql`SELECT object_data FROM fabric_deletion_objects WHERE object_id=${objectId}`))[0];
        return existing ? { id: existing.object_data.id, chunkIds: existing.object_data.chunk_ids } : null;
      }
      await tx.execute(this.sql`INSERT INTO fabric_deletion_objects (object_id,object_data)
        VALUES (${objectId},${JSON.stringify(object)}::jsonb)`);
      for (const [ordinal, chunkId] of object.chunk_ids.entries()) {
        await tx.execute(this.sql`INSERT INTO fabric_deletion_chunks (object_id,ordinal,chunk_id)
          VALUES (${objectId},${ordinal},${chunkId})`);
      }
      return { id: object.id, chunkIds: object.chunk_ids };
    });
  }

  async pendingObjects(): Promise<string[]> {
    await this.initialize();
    return rows<{ object_id: string }>(await this.db.execute(this.sql`SELECT object_id FROM fabric_deletion_objects ORDER BY created_at,object_id`)).map(row => row.object_id);
  }

  async drainChunk(chunkId: string, remove: (nodeId: string, physicalKey?: string) => Promise<void>): Promise<void> {
    return this.withChunkLock(chunkId, () => this.drainClaimedChunk(chunkId, remove));
  }

  async withChunkLock<T>(chunkId: string, work: () => Promise<T>): Promise<T> {
    return this.fence(chunkId, work);
  }

  /** Caller holds withChunkLock across this drain and its following write. */
  async drainClaimedChunk(chunkId: string, remove: (nodeId: string, physicalKey?: string) => Promise<void>): Promise<void> {
    await this.initialize();
    const jobs = rows<Job>(await this.db.execute(this.sql`SELECT object_id,ordinal FROM fabric_deletion_chunks
      WHERE chunk_id=${chunkId} AND state <> 'complete' ORDER BY object_id,ordinal`));
    for (const key of jobs) {
      const location = await this.db.transaction(async tx => {
        const job = rows<Job>(await tx.execute(this.sql`SELECT * FROM fabric_deletion_chunks
          WHERE object_id=${key.object_id} AND ordinal=${key.ordinal} FOR UPDATE`))[0];
        if (!job || job.state === "complete") return null;
        if (job.state === "released") {
          if (!job.location) throw new Error("Deletion release has no retained location");
          return job.location;
        }
        if (job.state !== "pending") throw new Error(`Unknown deletion state: ${job.state}`);
        const loc = rows<Location & { ref_count: number }>(await tx.execute(this.sql`UPDATE fabric_chunks
          SET ref_count=ref_count-1 WHERE id=${chunkId} RETURNING *`))[0];
        if (!loc || loc.ref_count > 0) {
          await tx.execute(this.sql`UPDATE fabric_deletion_chunks SET state='complete'
            WHERE object_id=${key.object_id} AND ordinal=${key.ordinal}`);
          return null;
        }
        if (!Array.isArray(loc.node_ids) || !loc.node_ids.every(node => typeof node === "string") ||
            !Number.isSafeInteger(Number(loc.size_bytes)) || Number(loc.size_bytes) < 0) {
          throw new Error("Deletion chunk location is malformed");
        }
        await tx.execute(this.sql`DELETE FROM fabric_chunks WHERE id=${chunkId} AND ref_count <= 0`);
        await tx.execute(this.sql`UPDATE fabric_deletion_chunks SET state=${"released"},location=${JSON.stringify(loc)}::jsonb
          WHERE object_id=${key.object_id} AND ordinal=${key.ordinal}`);
        return loc;
      });
      if (!location) continue;
      for (const nodeId of location.node_ids) {
        // A receipt and its accounting update commit together. Physical deletes
        // are idempotent, so a crash after I/O but before COMMIT safely retries.
        await this.db.transaction(async tx => {
          const job = rows<Pick<Job, "done_nodes" | "location">>(await tx.execute(this.sql`SELECT done_nodes,location FROM fabric_deletion_chunks
            WHERE object_id=${key.object_id} AND ordinal=${key.ordinal} FOR UPDATE`))[0];
          if (!job || job.done_nodes.includes(nodeId)) return;
          await remove(nodeId, location.physical_keys?.[nodeId]);
          if (location.accounted_nodes === undefined || location.accounted_nodes.includes(nodeId)) {
            const updated = rows(await tx.execute(this.options.textUsage
              ? this.sql`UPDATE fabric_storage_nodes SET used_bytes=(GREATEST(0,used_bytes::bigint-${Number(location.size_bytes)}))::text WHERE id=${nodeId} RETURNING id`
              : this.sql`UPDATE fabric_storage_nodes SET used_bytes=GREATEST(0,used_bytes-${Number(location.size_bytes)}) WHERE id=${nodeId} RETURNING id`));
            if (updated.length !== 1) throw new Error(`Deletion node accounting unavailable: ${nodeId}`);
          }
          await tx.execute(this.sql`UPDATE fabric_deletion_chunks SET done_nodes=done_nodes || ${JSON.stringify([nodeId])}::jsonb
            WHERE object_id=${key.object_id} AND ordinal=${key.ordinal}`);
        });
      }
      await this.db.execute(this.sql`UPDATE fabric_deletion_chunks SET state='complete'
        WHERE object_id=${key.object_id} AND ordinal=${key.ordinal}`);
    }
  }

  async finish(objectId: string): Promise<boolean> {
    return this.db.transaction(async tx => {
      const pending = rows(await tx.execute(this.sql`SELECT 1 FROM fabric_deletion_chunks WHERE object_id=${objectId} AND state <> 'complete' LIMIT 1`));
      if (pending.length) return false;
      if (this.options.segments !== false) await tx.execute(this.sql`DELETE FROM fabric_segments WHERE object_id=${objectId}`);
      await tx.execute(this.sql`DELETE FROM fabric_deletion_chunks WHERE object_id=${objectId}`);
      await tx.execute(this.sql`DELETE FROM fabric_deletion_objects WHERE object_id=${objectId}`);
      return true;
    });
  }
}
