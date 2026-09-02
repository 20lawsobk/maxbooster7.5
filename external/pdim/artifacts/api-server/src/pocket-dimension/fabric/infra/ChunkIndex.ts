import { db } from "../../../lib/db.js";
import { fabricChunks } from "@workspace/db/schema";
import { eq, inArray, sql, and, lte } from "drizzle-orm";
import type {
  FabricChunkLocation,
  ChunkId,
  NodeId,
  ObjectId,
} from "../types.js";

export class ChunkIndex {
  /**
   * Record (or re-reference) a content-addressed chunk. A first insert starts at
   * refCount 1; a conflict (the same chunk already exists, i.e. a dedup hit from
   * another object — possibly in another volume/owner) atomically increments the
   * reference count instead of clobbering accounting. nodeIds/sizeBytes are
   * stable for a given content id, so the existing location is preserved.
   */
  async putChunkLocation(
    loc: Omit<FabricChunkLocation, "createdAt" | "refCount">,
  ): Promise<void> {
    await db
      .insert(fabricChunks)
      .values({
        id: loc.id,
        objectId: loc.objectId,
        nodeIds: loc.nodeIds,
        sizeBytes: loc.sizeBytes,
        checksum: loc.checksum,
        refCount: 1,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: fabricChunks.id,
        set: { refCount: sql`${fabricChunks.refCount} + 1` },
      });
  }

  /**
   * Repoint an existing chunk to a new set of nodes WITHOUT changing its
   * reference count. Used by relocation paths (read-repair, node drain,
   * rebalance) where the same content-addressed chunk physically moves to
   * different nodes. Unlike putChunkLocation (which is for new/deduped
   * references and bumps refCount on conflict), this updates nodeIds/checksum/
   * sizeBytes in place so the index keeps pointing at where the bytes actually
   * live. objectId is preserved on conflict so a chunk's owning object is not
   * clobbered by a relocation that passes a placeholder objectId.
   */
  async updateChunkLocation(
    loc: Omit<FabricChunkLocation, "createdAt" | "refCount">,
  ): Promise<void> {
    await db
      .insert(fabricChunks)
      .values({
        id: loc.id,
        objectId: loc.objectId,
        nodeIds: loc.nodeIds,
        sizeBytes: loc.sizeBytes,
        checksum: loc.checksum,
        refCount: 1,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: fabricChunks.id,
        set: {
          nodeIds: loc.nodeIds,
          checksum: loc.checksum,
          sizeBytes: loc.sizeBytes,
        },
      });
  }

  /**
   * Drop one reference to a chunk. Returns the location and `deleted: true` only
   * when this was the LAST reference (refCount hit zero), at which point the row
   * is removed and the caller should free the physical bytes. Otherwise the
   * chunk survives for its remaining references and `deleted` is false.
   */
  async releaseChunk(
    chunkId: ChunkId,
  ): Promise<{ deleted: boolean; loc: FabricChunkLocation | null }> {
    // The decrement and the row removal must be one atomic critical section.
    // The UPDATE takes a row lock held until commit, so a concurrent
    // putChunkLocation() (which conflict-updates refCount + 1, i.e. revives the
    // chunk) cannot interleave between our decrement and delete. The delete is
    // additionally guarded by `refCount <= 0` so a revived row is never dropped.
    return await db.transaction(async (tx) => {
      const rows = await tx
        .update(fabricChunks)
        .set({ refCount: sql`${fabricChunks.refCount} - 1` })
        .where(eq(fabricChunks.id, chunkId))
        .returning();
      const row = rows[0];
      if (!row) return { deleted: false, loc: null };
      const loc = this.rowToChunk(row);
      if (loc.refCount <= 0) {
        const del = await tx
          .delete(fabricChunks)
          .where(
            and(eq(fabricChunks.id, chunkId), lte(fabricChunks.refCount, 0)),
          )
          .returning();
        return { deleted: del.length > 0, loc };
      }
      return { deleted: false, loc };
    });
  }

  /**
   * Rebuild reference counts from the authoritative set of live object→chunk
   * references and drop any orphaned chunk rows (refCount 0). Used at boot to
   * heal drift and migrate rows created before refCount existed. Returns the ids
   * of orphaned chunks so the caller can free their physical bytes.
   */
  async reconcileRefCounts(
    counts: Map<ChunkId, number>,
  ): Promise<FabricChunkLocation[]> {
    const rows = await db.select().from(fabricChunks);
    const orphans: FabricChunkLocation[] = [];
    for (const row of rows) {
      const next = counts.get(row.id) ?? 0;
      if (next <= 0) {
        orphans.push(this.rowToChunk(row));
        await db.delete(fabricChunks).where(eq(fabricChunks.id, row.id));
      } else if (next !== row.refCount) {
        await db
          .update(fabricChunks)
          .set({ refCount: next })
          .where(eq(fabricChunks.id, row.id));
      }
    }
    return orphans;
  }

  async getChunkLocation(
    chunkId: ChunkId,
  ): Promise<FabricChunkLocation | null> {
    const rows = await db
      .select()
      .from(fabricChunks)
      .where(eq(fabricChunks.id, chunkId));
    return rows[0] ? this.rowToChunk(rows[0]) : null;
  }

  async getManyChunkLocations(
    chunkIds: ChunkId[],
  ): Promise<Map<ChunkId, FabricChunkLocation>> {
    if (chunkIds.length === 0) return new Map();
    const rows = await db
      .select()
      .from(fabricChunks)
      .where(inArray(fabricChunks.id, chunkIds));
    const map = new Map<ChunkId, FabricChunkLocation>();
    for (const row of rows) map.set(row.id, this.rowToChunk(row));
    return map;
  }

  async deleteChunkLocation(chunkId: ChunkId): Promise<void> {
    await db.delete(fabricChunks).where(eq(fabricChunks.id, chunkId));
  }

  async getChunksByObject(objectId: ObjectId): Promise<FabricChunkLocation[]> {
    const rows = await db
      .select()
      .from(fabricChunks)
      .where(eq(fabricChunks.objectId, objectId));
    return rows.map(this.rowToChunk);
  }

  /**
   * All chunk locations that currently live on a given node. Uses a JSONB
   * containment (`@>`) query so the GIN index on `node_ids` serves it without a
   * full table scan — needed on the drain/scrub paths, not just the periodic
   * rebalancer.
   */
  async listChunksOnNode(nodeId: NodeId): Promise<FabricChunkLocation[]> {
    const rows = await db
      .select()
      .from(fabricChunks)
      .where(
        sql`${fabricChunks.nodeIds} @> ${JSON.stringify([nodeId])}::jsonb`,
      );
    return rows.map(this.rowToChunk);
  }

  /**
   * Truthful physical bytes currently stored per node, derived from the chunk
   * index (the authoritative record of what exists). A chunk replicated across
   * N nodes counts on each of those N nodes. Used to reconcile node usage
   * counters so telemetry never drifts from reality.
   */
  async getUsageByNode(): Promise<Map<NodeId, number>> {
    const rows = await db.select().from(fabricChunks);
    const usage = new Map<NodeId, number>();
    for (const row of rows) {
      const size = Number(row.sizeBytes);
      for (const nodeId of row.nodeIds as NodeId[]) {
        usage.set(nodeId, (usage.get(nodeId) ?? 0) + size);
      }
    }
    return usage;
  }

  private rowToChunk(
    row: typeof fabricChunks.$inferSelect,
  ): FabricChunkLocation {
    return {
      id: row.id,
      objectId: row.objectId,
      nodeIds: row.nodeIds as NodeId[],
      sizeBytes: Number(row.sizeBytes),
      checksum: row.checksum,
      refCount: row.refCount,
      createdAt: row.createdAt,
    };
  }
}
