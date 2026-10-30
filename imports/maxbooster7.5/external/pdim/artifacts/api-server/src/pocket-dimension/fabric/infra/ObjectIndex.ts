import { db } from "../../../lib/db.js";
import { fabricObjects } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type {
  FabricObject,
  ObjectId,
  VolumeId,
  ChunkId,
  ObjectManifest,
} from "../types.js";

export class ObjectIndex {
  async putObject(
    volumeId: VolumeId,
    originalName: string,
    contentType: string,
    sizeBytes: number,
    chunkIds: ChunkId[],
    contentHash: string,
    manifest?: ObjectManifest,
    existingId?: string,
  ): Promise<FabricObject> {
    const id = existingId ?? randomUUID();
    const now = new Date();
    await db.insert(fabricObjects).values({
      id,
      volumeId,
      originalName,
      contentType,
      sizeBytes,
      chunkIds,
      contentHash,
      manifest: manifest ?? {},
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
      manifest,
      createdAt: now,
    };
  }

  /**
   * Persist an updated manifest for an object. Used by self-healing (read-repair,
   * scrub, drain) when a shard's home node changes and the manifest's shard refs
   * must point at the new location.
   */
  async updateManifest(id: ObjectId, manifest: ObjectManifest): Promise<void> {
    await db
      .update(fabricObjects)
      .set({ manifest })
      .where(eq(fabricObjects.id, id));
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

  /** Every object in the fabric, across all volumes/owners. */
  async listAllObjects(): Promise<FabricObject[]> {
    const rows = await db.select().from(fabricObjects);
    return rows.map(this.rowToObject);
  }

  /** Latest object (by creation time) in a volume with the given name. */
  async getObjectByName(
    volumeId: VolumeId,
    originalName: string,
  ): Promise<FabricObject | null> {
    const rows = await db
      .select()
      .from(fabricObjects)
      .where(
        and(
          eq(fabricObjects.volumeId, volumeId),
          eq(fabricObjects.originalName, originalName),
        ),
      );
    const objects = rows
      .map(this.rowToObject)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return objects[0] ?? null;
  }

  /**
   * Atomically claim and remove an object row. Returns the deleted object, or
   * null if no row matched (already deleted). This is the single-claim primitive
   * for safe deletion: under concurrent deletes of the same object, only ONE
   * caller gets the row back (and thus the right to release its chunk
   * references), so shared chunks can never be double-released.
   */
  async deleteObject(id: ObjectId): Promise<FabricObject | null> {
    const rows = await db
      .delete(fabricObjects)
      .where(eq(fabricObjects.id, id))
      .returning();
    return rows[0] ? this.rowToObject(rows[0]) : null;
  }

  private rowToObject(row: typeof fabricObjects.$inferSelect): FabricObject {
    const rawManifest = row.manifest as ObjectManifest | null | undefined;
    const manifest =
      rawManifest && Object.keys(rawManifest).length > 0
        ? rawManifest
        : undefined;
    return {
      id: row.id,
      volumeId: row.volumeId,
      originalName: row.originalName,
      contentType: row.contentType,
      sizeBytes: Number(row.sizeBytes),
      chunkIds: row.chunkIds as ChunkId[],
      contentHash: row.contentHash,
      manifest,
      createdAt: row.createdAt,
    };
  }
}
