import { db } from "../../../db.js";
import { fabricChunks } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import type {
  FabricChunkLocation,
  ChunkId,
  NodeId,
  ObjectId,
} from "../types.js";

export class ChunkIndex {
  async putChunkLocation(
    loc: Omit<FabricChunkLocation, "createdAt">,
  ): Promise<void> {
    await db
      .insert(fabricChunks)
      .values({
        id: loc.id,
        objectId: loc.objectId,
        nodeIds: loc.nodeIds,
        sizeBytes: String(loc.sizeBytes),
        checksum: loc.checksum,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: fabricChunks.id,
        set: { nodeIds: loc.nodeIds, sizeBytes: String(loc.sizeBytes) },
      });
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

  private rowToChunk(
    row: typeof fabricChunks.$inferSelect,
  ): FabricChunkLocation {
    return {
      id: row.id,
      objectId: row.objectId,
      nodeIds: row.nodeIds as NodeId[],
      sizeBytes: Number(row.sizeBytes),
      checksum: row.checksum,
      createdAt: row.createdAt,
    };
  }
}
