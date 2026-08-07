import { db } from "../../../db.js";
import { fabricStorageNodes } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type {
  FabricStorageNode,
  NodeId,
  BackendType,
  CostTier,
} from "../types.js";

export class NodeRegistry {
  async registerNode(
    node: Omit<FabricStorageNode, "id" | "lastHeartbeat">,
  ): Promise<FabricStorageNode> {
    const id = randomUUID();
    const now = new Date();
    await db.insert(fabricStorageNodes).values({
      id,
      region: node.region,
      costTier: node.costTier,
      backendType: node.backendType,
      backendConfig: node.backendConfig,
      capacityBytes: String(node?.capacityBytes),
      usedBytes: String(node?.usedBytes),
      healthy: node.healthy,
      lastHeartbeat: now,
    });
    return { ...node, id, lastHeartbeat: now };
  }

  async updateNode(
    id: NodeId,
    patch: Partial<
      Pick<FabricStorageNode, "usedBytes" | "healthy" | "lastHeartbeat">
    >,
  ): Promise<void> {
    const values: Record<string, any> = {};
    if (patch?.usedBytes !== undefined)
      values.usedBytes = String(patch?.usedBytes);
    if (patch?.healthy !== undefined) values.healthy = patch?.healthy;
    if (patch?.lastHeartbeat !== undefined)
      values.lastHeartbeat = patch?.lastHeartbeat;
    if (Object.keys(values).length > 0) {
      await db
        .update(fabricStorageNodes)
        .set(values)
        .where(eq(fabricStorageNodes.id, id));
    }
  }

  async heartbeat(id: NodeId, usedBytes: number): Promise<void> {
    await this.updateNode(id, {
      lastHeartbeat: new Date(),
      usedBytes,
      healthy: true,
    });
  }

  async listHealthyNodes(): Promise<FabricStorageNode[]> {
    const rows = await db
      .select()
      .from(fabricStorageNodes)
      .where(eq(fabricStorageNodes.healthy, true));
    return rows?.map(this.rowToNode);
  }

  async listAllNodes(): Promise<FabricStorageNode[]> {
    const rows = await db.select().from(fabricStorageNodes);
    return rows?.map(this.rowToNode);
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
      backendConfig: row.backendConfig as Record<string, any>,
      capacityBytes: Number(row?.capacityBytes),
      usedBytes: Number(row?.usedBytes),
      healthy: row.healthy,
      lastHeartbeat: row.lastHeartbeat,
    };
  }
}
