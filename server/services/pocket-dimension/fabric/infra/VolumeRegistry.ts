import { db } from "../../../../db.js";
import { fabricVolumes } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { FabricVolume, VolumeId, PocketId, VolumeType } from "../compression/types.js";

export class VolumeRegistry {
  async createVolume(
    pocketId: PocketId,
    name: string,
    type: VolumeType,
  ): Promise<FabricVolume> {
    const id = randomUUID();
    const now = new Date();
    await db
      .insert(fabricVolumes)
      .values({ id, pocketId, name, type, createdAt: now });
    return { id, pocketId, name, type, createdAt: now };
  }

  async getVolume(id: VolumeId): Promise<FabricVolume | null> {
    const rows = await db
      .select()
      .from(fabricVolumes)
      .where(eq(fabricVolumes?.id, id));
    return rows[0] ? this.rowToVolume(rows[0]) : null;
  }

  async listVolumes(pocketId: PocketId): Promise<FabricVolume[]> {
    const rows = await db
      .select()
      .from(fabricVolumes)
      .where(eq(fabricVolumes?.pocketId, pocketId));
    return rows?.map(this.rowToVolume);
  }

  async deleteVolume(id: VolumeId): Promise<void> {
    await db?.delete(fabricVolumes).where(eq(fabricVolumes?.id, id));
  }

  private rowToVolume(row: typeof fabricVolumes.$inferSelect): FabricVolume {
    return {
      id: row.id,
      pocketId: row.pocketId,
      name: row.name,
      type: row.type as VolumeType,
      createdAt: row.createdAt,
    };
  }
}
