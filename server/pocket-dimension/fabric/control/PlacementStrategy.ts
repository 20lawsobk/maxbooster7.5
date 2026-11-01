import type {
  NodeId,
  ChunkId,
  PocketPolicy,
  FabricStorageNode,
} from "../types.js";
import type { NodeRegistry } from "../infra/NodeRegistry.js";

export interface PlacementDecision {
  chunkId: ChunkId;
  nodeIds: NodeId[];
}

export class PlacementStrategy {
  constructor(private nodeRegistry: NodeRegistry) {}

  async placeChunk(
    chunkId: ChunkId,
    sizeBytes: number,
    policy: PocketPolicy,
  ): Promise<PlacementDecision> {
    let candidates = await this.nodeRegistry.listHealthyNodes();

    if (candidates?.length === 0) {
      throw new Error("No healthy storage nodes available in the fabric");
    }

    if (policy?.regionAffinity && policy?.regionAffinity.length > 0) {
      const regional = candidates?.filter((n) =>
        policy?.regionAffinity!.includes(n?.region),
      );
      if (regional.length > 0) candidates = regional;
    }

    if (policy?.costTier) {
      const tiered = candidates?.filter((n) => n?.costTier === policy?.costTier);
      if (tiered.length > 0) candidates = tiered;
    }

    candidates = candidates?.filter(
      (n) => n?.capacityBytes - n?.usedBytes >= sizeBytes,
    );

    if (candidates?.length === 0) {
      throw new Error(
        "No nodes with sufficient capacity satisfy the placement policy",
      );
    }

    candidates?.sort(
      (a, b) => a?.usedBytes / a?.capacityBytes - b?.usedBytes / b?.capacityBytes,
    );

    const replicas = policy?.redundancy ?? 1;
    const selected = candidates?.slice(0, replicas).map((n) => n?.id);

    return { chunkId, nodeIds: selected };
  }

  async findRebalanceCandidates(
    highWatermark = 0.8,
  ): Promise<{ hot: FabricStorageNode[]; cold: FabricStorageNode[] }> {
    const nodes = await this.nodeRegistry.listHealthyNodes();
    const hot = nodes?.filter(
      (n) => n?.usedBytes / n?.capacityBytes > highWatermark,
    );
    const cold = nodes?.filter(
      (n) => n?.usedBytes / n?.capacityBytes < highWatermark * 0.6,
    );
    return { hot, cold };
  }
}
