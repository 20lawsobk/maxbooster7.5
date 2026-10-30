import { randomUUID, createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { withFabricCatalogTransaction } from "./DeletionOutbox.js";
import type { ChunkStore } from "../storage/ChunkStore.js";
import type { ChunkId, NodeId } from "../types.js";

type Migration = {
  id: string; chunk_id: string; from_node: string; to_node: string;
  source_key: string; target_key: string; size_bytes: string; checksum: string;
  state: "copying" | "published";
};
/** A reserved target remains charged until its copy is published or reclaimed.
 * Every physical key is durable before I/O; source accounting is released only
 * with its deletion receipt. All methods require the existing catalog fence. */
export class MigrationOutbox {
  constructor(private readonly store: (nodeId: NodeId) => ChunkStore) {}

  async pending(): Promise<Migration[]> {
    return withFabricCatalogTransaction(async tx =>
      (await tx.execute(sql`SELECT * FROM fabric_migration_jobs ORDER BY created_at,id`)).rows as Migration[]);
  }

  async begin(chunkId: ChunkId, from: NodeId, to: NodeId): Promise<Migration> {
    return withFabricCatalogTransaction(async tx => {
      const loc = (await tx.execute(sql`SELECT * FROM fabric_chunks WHERE id=${chunkId} FOR UPDATE`)).rows[0];
      if (!loc || !(loc.node_ids as string[]).includes(from)) throw new Error(`Cannot migrate unindexed source chunk ${chunkId}`);
      if ((loc.node_ids as string[]).includes(to)) throw new Error(`Migration would reduce replica count for ${chunkId}`);
      const size = Number(loc.size_bytes);
      if (!Number.isSafeInteger(size) || size < 0) throw new Error("Invalid migration chunk size");
      const node = (await tx.execute(sql`UPDATE fabric_storage_nodes SET used_bytes=(used_bytes::bigint+${size})::text
        WHERE id=${to} AND healthy=true AND capacity_bytes::bigint-used_bytes::bigint>=${size} RETURNING id`)).rows;
      if (node.length !== 1) throw new Error("Migration target has insufficient available capacity");
      const id = randomUUID(), targetKey = `${chunkId}.${randomUUID()}`;
      return (await tx.execute(sql`INSERT INTO fabric_migration_jobs
        (id,chunk_id,from_node,to_node,source_key,target_key,size_bytes,checksum,state)
        VALUES(${id},${chunkId},${from},${to},${(loc.physical_keys as Record<string,string>)?.[from] ?? chunkId},
          ${targetKey},${String(size)},${String(loc.checksum)},'copying') RETURNING *`)).rows[0] as Migration;
    });
  }

  async resume(job: Migration): Promise<void> {
    if (job.state === "copying") {
      const loc = await withFabricCatalogTransaction(async tx =>
        (await tx.execute(sql`SELECT node_ids,physical_keys FROM fabric_chunks WHERE id=${job.chunk_id}`)).rows[0]);
      if (!loc || !(loc.node_ids as string[]).includes(job.from_node) ||
          ((loc.physical_keys as Record<string,string>)?.[job.from_node] ?? job.chunk_id) !== job.source_key) {
        // Another completed catalog operation removed this source while the
        // owner was offline. The unreferenced reserved target is reclaimed.
        await this.discard(job);
        return;
      }
      const data = await this.store(job.from_node).getChunk(job.source_key);
      if (data.length !== Number(job.size_bytes) || createHash("sha256").update(data).digest("hex") !== job.checksum) {
        throw new Error(`Migration source integrity failed: ${job.chunk_id}`);
      }
      try {
        await this.store(job.to_node).putChunk(job.target_key, data);
        const verified = await this.store(job.to_node).getChunk(job.target_key);
        if (!verified.equals(data)) throw Object.assign(new Error(`Migration verification failed: ${job.chunk_id}`), { code: "FABRIC_MIGRATION_TARGET_CORRUPT" });
      } catch (error) {
        // A transport outage does not prove corruption. Retire/rotate only a
        // conflicting, already-retired or demonstrably corrupt target key.
        if (["FABRIC_REPLICA_RETIRED", "FABRIC_REPLICA_CONFLICT", "FABRIC_MIGRATION_TARGET_CORRUPT"].includes(String((error as { code?: string })?.code))) {
          await this.rotateTarget(job);
        }
        throw error;
      }
      await withFabricCatalogTransaction(async tx => {
        const current = (await tx.execute(sql`SELECT * FROM fabric_migration_jobs WHERE id=${job.id} FOR UPDATE`)).rows[0];
        if (!current || current.state !== "copying") throw new Error("Migration publication lost its intent");
        const chunk = (await tx.execute(sql`SELECT node_ids,physical_keys FROM fabric_chunks WHERE id=${job.chunk_id} FOR UPDATE`)).rows[0];
        if (!chunk || !(chunk.node_ids as string[]).includes(job.from_node) ||
            ((chunk.physical_keys as Record<string,string>)?.[job.from_node] ?? job.chunk_id) !== job.source_key ||
            (chunk.node_ids as string[]).includes(job.to_node)) throw new Error("Migration source changed before publication");
        const nodes = (chunk.node_ids as string[]).map(id => id === job.from_node ? job.to_node : id);
        const keys = { ...(chunk.physical_keys as Record<string,string>), [job.to_node]: job.target_key };
        delete keys[job.from_node];
        await tx.execute(sql`UPDATE fabric_chunks SET node_ids=${JSON.stringify(nodes)}::jsonb,physical_keys=${JSON.stringify(keys)}::jsonb
          WHERE id=${job.chunk_id}`);
        await tx.execute(sql`UPDATE fabric_migration_jobs SET state='published' WHERE id=${job.id}`);
      });
    }
    await withFabricCatalogTransaction(async tx => {
      const current = (await tx.execute(sql`SELECT * FROM fabric_migration_jobs WHERE id=${job.id} FOR UPDATE`)).rows[0];
      if (!current) return;
      if (current.state !== "published") throw new Error("Migration cleanup requires a published target");
      const live = (await tx.execute(sql`SELECT node_ids,physical_keys FROM fabric_chunks WHERE id=${job.chunk_id}`)).rows[0];
      if (live && (live.node_ids as string[]).includes(job.from_node) &&
          ((live.physical_keys as Record<string,string>)?.[job.from_node] ?? job.chunk_id) === job.source_key) {
        throw new Error("Migration cleanup cannot delete a referenced source");
      }
      if (live && (live.node_ids as string[]).includes(job.to_node) &&
          ((live.physical_keys as Record<string,string>)?.[job.to_node] ?? job.chunk_id) === job.target_key) {
        const target = await this.store(job.to_node).getChunk(job.target_key);
        if (target.length !== Number(job.size_bytes) || createHash("sha256").update(target).digest("hex") !== job.checksum) {
          throw new Error("Published migration target integrity failed; original source retained");
        }
      }
      await this.store(job.from_node).deleteChunk(job.source_key);
      const node = (await tx.execute(sql`UPDATE fabric_storage_nodes SET used_bytes=(used_bytes::bigint-${Number(job.size_bytes)})::text
        WHERE id=${job.from_node} AND used_bytes::bigint>=${Number(job.size_bytes)} RETURNING id`)).rows;
      if (node.length !== 1) throw new Error("Migration source accounting unavailable");
      await tx.execute(sql`DELETE FROM fabric_migration_jobs WHERE id=${job.id}`);
    });
  }

  private async rotateTarget(job: Migration): Promise<void> {
    await withFabricCatalogTransaction(async tx => {
      const current = (await tx.execute(sql`SELECT * FROM fabric_migration_jobs WHERE id=${job.id} FOR UPDATE`)).rows[0];
      if (!current || current.state !== "copying" || current.target_key !== job.target_key) return;
      // Tombstone before changing the durable key. If SQL rolls back after
      // deletion, the retained old key rejects publication and rotates on the
      // next attempt. The single conservative capacity reservation stays put.
      await this.store(job.to_node).deleteChunk(job.target_key);
      await tx.execute(sql`UPDATE fabric_migration_jobs SET target_key=${`${job.chunk_id}.${randomUUID()}`} WHERE id=${job.id}`);
    });
  }

  private async discard(job: Migration): Promise<void> {
    await withFabricCatalogTransaction(async tx => {
      const current = (await tx.execute(sql`SELECT * FROM fabric_migration_jobs WHERE id=${job.id} FOR UPDATE`)).rows[0];
      if (!current) return;
      if (current.state !== "copying") throw new Error("Cannot discard a published migration");
      await this.store(job.to_node).deleteChunk(job.target_key);
      const node = (await tx.execute(sql`UPDATE fabric_storage_nodes SET used_bytes=(used_bytes::bigint-${Number(job.size_bytes)})::text
        WHERE id=${job.to_node} AND used_bytes::bigint>=${Number(job.size_bytes)} RETURNING id`)).rows;
      if (node.length !== 1) throw new Error("Migration target accounting unavailable");
      await tx.execute(sql`DELETE FROM fabric_migration_jobs WHERE id=${job.id}`);
    });
  }
}
