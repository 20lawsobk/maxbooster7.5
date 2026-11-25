import { db } from "../../../../db.js";
import { fabricPockets } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { FabricPocket, PocketId, PocketPolicy } from "../compression/types.js";

export class PocketRegistry {
  async createPocket(
    ownerId: string,
    name: string,
    policy: PocketPolicy,
  ): Promise<FabricPocket> {
    const id = randomUUID();
    const now = new Date();
    await db.insert(fabricPockets).values({
      id,
      ownerId,
      name,
      policy: policy as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    });
    return { id, ownerId, name, policy, createdAt: now, updatedAt: now };
  }

  async getPocket(id: PocketId): Promise<FabricPocket | null> {
    const rows = await db
      .select()
      .from(fabricPockets)
      .where(eq(fabricPockets.id, id));
    return rows[0] ? this.rowToPocket(rows[0]) : null;
  }

  async listPockets(ownerId: string): Promise<FabricPocket[]> {
    const rows = await db
      .select()
      .from(fabricPockets)
      .where(eq(fabricPockets.ownerId, ownerId));
    return rows?.map(this.rowToPocket);
  }

  async updatePolicy(id: PocketId, policy: PocketPolicy): Promise<void> {
    await db
      .update(fabricPockets)
      .set({ policy: policy as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(fabricPockets.id, id));
  }

  async deletePocket(id: PocketId): Promise<void> {
    await db.delete(fabricPockets).where(eq(fabricPockets.id, id));
  }

  private rowToPocket(row: typeof fabricPockets.$inferSelect): FabricPocket {
    return {
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      policy: row.policy as unknown as PocketPolicy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
