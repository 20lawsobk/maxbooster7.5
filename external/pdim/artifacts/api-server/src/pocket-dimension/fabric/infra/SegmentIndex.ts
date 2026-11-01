import { db } from "../../../lib/db.js";
import { fabricSegments } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type {
  FabricSegment,
  ObjectId,
  ChunkId,
  ObjectManifest,
} from "../types.js";

/**
 * Persistence for object segments. A large object is split into ordered
 * segments; each row records that segment's own layout (chunk ids + manifest)
 * and its byte offset within the reassembled object.
 */
export class SegmentIndex {
  async putSegment(
    objectId: ObjectId,
    segmentIndex: number,
    byteOffset: number,
    originalSize: number,
    chunkIds: ChunkId[],
    contentHash: string,
    manifest: ObjectManifest,
  ): Promise<FabricSegment> {
    const id = randomUUID();
    const now = new Date();
    await db.insert(fabricSegments).values({
      id,
      objectId,
      segmentIndex,
      byteOffset,
      originalSize,
      chunkIds,
      contentHash,
      manifest,
      createdAt: now,
    });
    return {
      id,
      objectId,
      segmentIndex,
      byteOffset,
      originalSize,
      chunkIds,
      contentHash,
      manifest,
      createdAt: now,
    };
  }

  /** All segments of an object, ordered by their position (segmentIndex). */
  async getSegmentsByObject(objectId: ObjectId): Promise<FabricSegment[]> {
    const rows = await db
      .select()
      .from(fabricSegments)
      .where(eq(fabricSegments.objectId, objectId));
    return rows
      .map(this.rowToSegment)
      .sort((a, b) => a.segmentIndex - b.segmentIndex);
  }

  /** Every segment in the fabric, across all objects. */
  async listAllSegments(): Promise<FabricSegment[]> {
    const rows = await db.select().from(fabricSegments);
    return rows.map(this.rowToSegment);
  }

  /** Persist an updated manifest for a segment (used by self-healing). */
  async updateManifest(id: string, manifest: ObjectManifest): Promise<void> {
    await db
      .update(fabricSegments)
      .set({ manifest })
      .where(eq(fabricSegments.id, id));
  }

  async deleteSegmentsByObject(objectId: ObjectId): Promise<void> {
    await db
      .delete(fabricSegments)
      .where(eq(fabricSegments.objectId, objectId));
  }

  private rowToSegment(row: typeof fabricSegments.$inferSelect): FabricSegment {
    return {
      id: row.id,
      objectId: row.objectId,
      segmentIndex: row.segmentIndex,
      byteOffset: Number(row.byteOffset),
      originalSize: Number(row.originalSize),
      chunkIds: row.chunkIds as ChunkId[],
      contentHash: row.contentHash,
      manifest: row.manifest as ObjectManifest,
      createdAt: row.createdAt,
    };
  }
}
