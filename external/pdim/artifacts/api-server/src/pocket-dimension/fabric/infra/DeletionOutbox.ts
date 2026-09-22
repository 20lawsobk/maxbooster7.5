import { db } from "../../../lib/db.js";
import { sql } from "drizzle-orm";

function rows(result: any): any[] {
  const values = result.rows ?? result;
  if (!Array.isArray(values)) throw new Error("Invalid deletion repository response");
  return values;
}

/** Object claim, ref release and per-node accounting each have durable receipts. */
export class DeletionOutbox {
  private activeLocks = 0;
  private readonly lockWaiters: Array<() => void> = [];
  async claim(objectId: string): Promise<void> {
    await db.transaction(async tx => {
      const [object] = rows(await tx.execute(sql`DELETE FROM fabric_objects WHERE id=${objectId} RETURNING *`));
      if (!object) return;
      await tx.execute(sql`INSERT INTO fabric_deletion_objects(id,payload)
        VALUES(${objectId},${JSON.stringify(object)}::jsonb)`);
      const chunks = object.chunk_ids as string[];
      for (let ordinal = 0; ordinal < chunks.length; ordinal++) {
        await tx.execute(sql`INSERT INTO fabric_deletion_chunks(object_id,ordinal,chunk_id)
          VALUES(${objectId},${ordinal},${chunks[ordinal]})`);
      }
    });
  }

  async pendingObjects(): Promise<string[]> {
    return rows(await db.execute(sql`SELECT id FROM fabric_deletion_objects ORDER BY created_at LIMIT 100`)).map(r => r.id);
  }

  async chunks(objectId: string): Promise<string[]> {
    return rows(await db.execute(sql`SELECT DISTINCT chunk_id FROM fabric_deletion_chunks
      WHERE object_id=${objectId} AND state <> 'complete'`)).map(r => r.chunk_id);
  }

  async withLock<T>(chunkId: string, fn: () => Promise<T>): Promise<T> {
    // Metadata pool has ten connections. Bound lock holders so nested metadata
    // commits always have connections available, even under a write burst.
    if (this.activeLocks >= 2) await new Promise<void>(resolve => this.lockWaiters.push(resolve));
    else this.activeLocks++;
    try {
      return await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${chunkId}, 48105))`);
        return fn();
      });
    } finally {
      const next = this.lockWaiters.shift();
      if (next) next();
      else this.activeLocks--;
    }
  }

  async drainChunk(chunkId: string, remove: (nodeId: string, chunkId: string) => Promise<void>): Promise<void> {
    const jobs = rows(await db.execute(sql`SELECT object_id,ordinal FROM fabric_deletion_chunks
      WHERE chunk_id=${chunkId} AND state <> 'complete' ORDER BY object_id,ordinal`));
    for (const job of jobs) {
      const receipt = await db.transaction(async tx => {
        const [current] = rows(await tx.execute(sql`SELECT * FROM fabric_deletion_chunks
          WHERE object_id=${job.object_id} AND ordinal=${job.ordinal} FOR UPDATE`));
        if (current.state !== "pending") return current;
        const [chunk] = rows(await tx.execute(sql`UPDATE fabric_chunks SET ref_count=ref_count-1
          WHERE id=${chunkId} RETURNING *`));
        if (!chunk) throw new Error(`Missing chunk metadata during reference release: ${chunkId}`);
        const location = chunk.ref_count <= 0 ? chunk : null;
        if (location) await tx.execute(sql`DELETE FROM fabric_chunks WHERE id=${chunkId} AND ref_count<=0`);
        const state = location ? "released" : "complete";
        await tx.execute(sql`UPDATE fabric_deletion_chunks SET state=${state},location=${JSON.stringify(location)}::jsonb
          WHERE object_id=${job.object_id} AND ordinal=${job.ordinal}`);
        return { ...current, state, location };
      });
      if (receipt.state === "complete") continue;
      const location = receipt.location;
      for (const nodeId of location.node_ids as string[]) {
        if ((receipt.done_nodes as string[]).includes(nodeId)) continue;
        // Idempotent physical delete may repeat after a crash; accounting cannot.
        await remove(nodeId, chunkId);
        await db.transaction(async tx => {
          const [current] = rows(await tx.execute(sql`SELECT done_nodes FROM fabric_deletion_chunks
            WHERE object_id=${job.object_id} AND ordinal=${job.ordinal} FOR UPDATE`));
          if (current.done_nodes.includes(nodeId)) return;
          const updated = rows(await tx.execute(sql`UPDATE fabric_storage_nodes SET used_bytes=used_bytes-${location.size_bytes}
            WHERE id=${nodeId} RETURNING id`));
          if (!updated.length) throw new Error("Deletion node metadata missing");
          await tx.execute(sql`UPDATE fabric_deletion_chunks
            SET done_nodes=done_nodes || ${JSON.stringify([nodeId])}::jsonb
            WHERE object_id=${job.object_id} AND ordinal=${job.ordinal}`);
        });
      }
      await db.execute(sql`UPDATE fabric_deletion_chunks SET state='complete'
        WHERE object_id=${job.object_id} AND ordinal=${job.ordinal}`);
    }
  }

  async finish(objectId: string): Promise<void> {
    await db.transaction(async tx => {
      const unfinished = rows(await tx.execute(sql`SELECT 1 FROM fabric_deletion_chunks
        WHERE object_id=${objectId} AND state<>'complete' LIMIT 1`));
      if (unfinished.length) throw new Error("Deletion cleanup remains incomplete");
      await tx.execute(sql`DELETE FROM fabric_segments WHERE object_id=${objectId}`);
      await tx.execute(sql`DELETE FROM fabric_deletion_chunks WHERE object_id=${objectId}`);
      await tx.execute(sql`DELETE FROM fabric_deletion_objects WHERE id=${objectId}`);
    });
  }
}