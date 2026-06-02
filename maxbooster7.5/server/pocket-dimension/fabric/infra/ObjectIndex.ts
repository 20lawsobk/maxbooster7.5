import { db } from "../../../db.js";
import { fabricObjects } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { FabricObject, ObjectId, VolumeId, ChunkId } from "../types.js";

export class ObjectIndex {
  async putObject(
    volumeId: VolumeId,
    originalName: string,
    contentType: string,
    sizeBytes: number,
    chunkIds: ChunkId[],
    contentHash: string,
    existingId?: string,
  ): Promise<FabricObject> {
    const id = existingId ?? randomUUID();
    const now = new Date();
    await db.insert(fabricObjects).values({
      id,
      volumeId,
      originalName,
      contentType,
      sizeBytes: String(sizeBytes),
      chunkIds,
      contentHash,
      createdAt: now,
    });
    return {
      id,
      volumeId,
      originalName,
      contentType,
      sizeBytes,
      chunkIds,
      contentHash,
      createdAt: now,
    };
  }

  async getObject(id: ObjectId): Promise<FabricObject | null> {
    const rows = await db
      .select()
      .from(fabricObjects)
      .where(eq(fabricObjects.id, id));
    return rows[0] ? this.rowToObject(rows[0]) : null;
  }

  async listObjects(volumeId: VolumeId): Promise<FabricObject[]> {
    const rows = await db
      .select()
      .from(fabricObjects)
      .where(eq(fabricObjects.volumeId, volumeId));
    return rows.map(this.rowToObject);
  }

  async deleteObject(id: ObjectId): Promise<void> {
    await db.delete(fabricObjects).where(eq(fabricObjects.id, id));
  }

  private rowToObject(row: typeof fabricObjects.$inferSelect): FabricObject {
    return {
      id: row.id,
      volumeId: row.volumeId,
      originalName: row.originalName,
      contentType: row.contentType,
      sizeBytes: Number(row.sizeBytes),
      chunkIds: row.chunkIds as ChunkId[],
      contentHash: row.contentHash,
      createdAt: row.createdAt,
    };
  }
}
