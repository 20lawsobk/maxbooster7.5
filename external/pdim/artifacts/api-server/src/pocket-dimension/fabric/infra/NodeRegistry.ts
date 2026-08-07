import { db } from "../../../lib/db.js";
import { fabricStorageNodes } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import type {
  FabricStorageNode,
  NodeId,
  CostTier,
  BackendType,
} from "../types.js";

export class NodeRegistry {
  async registerNode(
    opts: Omit<FabricStorageNode, "id" | "lastHeartbeat" | "createdAt">,
  ): Promise<FabricStorageNode> {
    const id = randomUUID();
    const now = new Date();
    await db.insert(fabricStorageNodes).values({
      id,
      region: opts.region,
      costTier: opts.costTier,
      backendType: opts.backendType,
      backendConfig: opts.backendConfig,
      failureDomain: opts.failureDomain,
      capacityBytes: opts.capacityBytes,
      usedBytes: opts.usedBytes,
      healthy: opts.healthy,
      lastHeartbeat: now,
    });
    return { ...opts, id, lastHeartbeat: now };
  }

  async updateNode(
    id: NodeId,
    patch: Partial<
      Pick<
        FabricStorageNode,
        | "usedBytes"
        | "healthy"
        | "lastHeartbeat"
        | "failureDomain"
        | "backendType"
        | "backendConfig"
      >
    >,
  ): Promise<void> {
    const values: Record<string, unknown> = {};
    if (patch.usedBytes !== undefined) values["usedBytes"] = patch.usedBytes;
    if (patch.healthy !== undefined) values["healthy"] = patch.healthy;
    if (patch.lastHeartbeat !== undefined)
      values["lastHeartbeat"] = patch.lastHeartbeat;
    if (patch.failureDomain !== undefined)
      values["failureDomain"] = patch.failureDomain;
    if (patch.backendType !== undefined)
      values["backendType"] = patch.backendType;
    if (patch.backendConfig !== undefined)
      values["backendConfig"] = patch.backendConfig;
    if (Object.keys(values).length > 0) {
      await db
        .update(fabricStorageNodes)
        .set(values)
        .where(eq(fabricStorageNodes.id, id));
    }
  }

  /** Liveness ping — marks the node healthy and refreshes its heartbeat. */
  async heartbeat(id: NodeId): Promise<void> {
    await this.updateNode(id, {
      lastHeartbeat: new Date(),
      healthy: true,
    });
  }

  /**
   * Adjust a node's durable physical usage by a signed delta (bytes written
   * minus bytes deleted). Uses an atomic SQL increment so concurrent writers
   * cannot clobber each other's accounting, and clamps at zero. This keeps
   * per-node `usedBytes` a truthful running total rather than the size of the
   * most recent write.
   */
  async addUsedBytes(id: NodeId, delta: number): Promise<void> {
    if (delta === 0) return;
    await db
      .update(fabricStorageNodes)
      .set({
        usedBytes: sql`GREATEST(0, ${fabricStorageNodes.usedBytes} + ${delta})`,
        lastHeartbeat: new Date(),
        healthy: true,
      })
      .where(eq(fabricStorageNodes.id, id));
  }

  /** Set a node's durable physical usage to an exact value (reconciliation). */
  async setUsedBytes(id: NodeId, usedBytes: number): Promise<void> {
    await db
      .update(fabricStorageNodes)
      .set({ usedBytes: Math.max(0, Math.round(usedBytes)) })
      .where(eq(fabricStorageNodes.id, id));
  }

  async listHealthyNodes(): Promise<FabricStorageNode[]> {
    const rows = await db
      .select()
      .from(fabricStorageNodes)
      .where(eq(fabricStorageNodes.healthy, true));
    return rows.map(this.rowToNode);
  }

  async listAllNodes(): Promise<FabricStorageNode[]> {
    const rows = await db.select().from(fabricStorageNodes);
    return rows.map(this.rowToNode);
  }

  async getNode(id: NodeId): Promise<FabricStorageNode | null> {
    const rows = await db
      .select()
      .from(fabricStorageNodes)
      .where(eq(fabricStorageNodes.id, id));
    return rows[0] ? this.rowToNode(rows[0]) : null;
  }

  private rowToNode(
    row: typeof fabricStorageNodes.$inferSelect,
  ): FabricStorageNode {
    return {
      id: row.id,
      region: row.region,
      costTier: row.costTier as CostTier,
      backendType: row.backendType as BackendType,
      backendConfig: row.backendConfig as Record<string, unknown>,
      failureDomain: row.failureDomain,
      capacityBytes: Number(row.capacityBytes),
      usedBytes: Number(row.usedBytes),
      healthy: row.healthy,
      lastHeartbeat: row.lastHeartbeat,
    };
  }
}
