import { db } from "../../../db.js";
import { fabricObjects, fabricChunks, fabricObjectDependencies } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { FabricObject, ObjectId, VolumeId, ChunkId } from "../types.js";

import { withFabricCatalogTransaction } from "./DeletionOutbox.js";

export class ObjectIndex {
  async putObjectWithChunks(
    volumeId: VolumeId, originalName: string, contentType: string, sizeBytes: number,
    chunkIds: ChunkId[], contentHash: string, id: string,
    chunks: { id: ChunkId; nodeIds: string[]; sizeBytes: number; checksum: string; physicalKeys?: Record<string, string> }[],
    deltaBaseId?: string,
  ): Promise<FabricObject> {
    const createdAt = new Date();
    await withFabricCatalogTransaction(async tx => {
      await tx.insert(fabricObjects).values({ id, volumeId, originalName, contentType,
        sizeBytes: String(sizeBytes), chunkIds, contentHash, createdAt, dependenciesIndexed: true });
      for (const chunk of chunks) {
        await tx.insert(fabricChunks).values({ id: chunk.id, objectId: id, nodeIds: chunk.nodeIds,
          sizeBytes: String(chunk.sizeBytes), checksum: chunk.checksum, refCount: 1, physicalKeys: chunk.physicalKeys ?? {}, createdAt })
          .onConflictDoUpdate({ target: fabricChunks.id, set: { refCount: sql`${fabricChunks.refCount}+1` } });
      }
      if (deltaBaseId) await tx.insert(fabricObjectDependencies).values({ objectId: id, baseObjectId: deltaBaseId });
      await tx.execute(sql`DELETE FROM fabric_deletion_chunks WHERE object_id=${id}`);
      await tx.execute(sql`DELETE FROM fabric_deletion_objects WHERE object_id=${id}`);
    });
    return { id, volumeId, originalName, contentType, sizeBytes, chunkIds, contentHash, createdAt };
  }

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
    return rows?.map(this.rowToObject);
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
      sizeBytes: Number(row?.sizeBytes),
      chunkIds: row.chunkIds as ChunkId[],
      contentHash: row.contentHash,
      createdAt: row.createdAt,
    };
  }
}
