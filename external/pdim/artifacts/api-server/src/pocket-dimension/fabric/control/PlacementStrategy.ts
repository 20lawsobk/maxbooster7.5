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

    if (candidates.length === 0) {
      throw new Error("No healthy storage nodes available in the fabric");
    }

    if (policy.regionAffinity && policy.regionAffinity.length > 0) {
      const regional = candidates.filter((n) =>
        policy.regionAffinity!.includes(n.region),
      );
      if (regional.length > 0) candidates = regional;
    }

    if (policy.costTier) {
      const tiered = candidates.filter((n) => n.costTier === policy.costTier);
      if (tiered.length > 0) candidates = tiered;
    }

    candidates = candidates.filter(
      (n) => n.capacityBytes - n.usedBytes >= sizeBytes,
    );

    if (candidates.length === 0) {
      throw new Error(
        "No nodes with sufficient capacity satisfy the placement policy",
      );
    }

    candidates.sort(
      (a, b) => a.usedBytes / a.capacityBytes - b.usedBytes / b.capacityBytes,
    );

    const replicas = policy.redundancy ?? 1;
    // Spread replicas across distinct failure domains so one domain loss can
    // never take every copy of a chunk.
    const ordered = this.orderByDomainDiversity(candidates);
    const selected: NodeId[] = [];
    for (let i = 0; i < replicas; i++) {
      selected.push(ordered[i % ordered.length]!.id);
    }

    return { chunkId, nodeIds: selected };
  }

  /**
   * Reorder capacity-sorted candidates so that consecutive picks land in
   * distinct failure domains: bucket nodes by domain (each bucket stays
   * utilization-sorted), then round-robin across domains. The first
   * `min(count, #domains)` picks are guaranteed domain-distinct; only once every
   * domain is used does a domain repeat. Graceful when domains < shards.
   */
  private orderByDomainDiversity(
    candidates: FabricStorageNode[],
  ): FabricStorageNode[] {
    const byDomain = new Map<string, FabricStorageNode[]>();
    for (const n of candidates) {
      const arr = byDomain.get(n.failureDomain) ?? [];
      arr.push(n);
      byDomain.set(n.failureDomain, arr);
    }
    const domains = [...byDomain.keys()];
    const ordered: FabricStorageNode[] = [];
    let round = 0;
    while (ordered.length < candidates.length) {
      let added = false;
      for (const d of domains) {
        const bucket = byDomain.get(d)!;
        if (round < bucket.length) {
          ordered.push(bucket[round]!);
          added = true;
        }
      }
      round++;
      if (!added) break;
    }
    return ordered;
  }

  /**
   * Pick a single healthy node to host a (re)placed shard during self-healing:
   * one that has room, isn't already holding the shard, and — preferably — sits
   * in a failure domain none of the surviving shards occupy. Returns null when no
   * eligible node exists.
   */
  async pickReplacementNode(opts: {
    sizeBytes: number;
    excludeNodeIds: NodeId[];
    occupiedDomains: string[];
    policy?: PocketPolicy;
  }): Promise<NodeId | null> {
    const { sizeBytes, excludeNodeIds, occupiedDomains, policy } = opts;
    let candidates = await this.nodeRegistry.listHealthyNodes();

    if (policy?.costTier) {
      const tiered = candidates.filter((n) => n.costTier === policy.costTier);
      if (tiered.length > 0) candidates = tiered;
    }

    candidates = candidates.filter(
      (n) =>
        !excludeNodeIds.includes(n.id) &&
        n.capacityBytes - n.usedBytes >= sizeBytes,
    );
    if (candidates.length === 0) return null;

    candidates.sort(
      (a, b) => a.usedBytes / a.capacityBytes - b.usedBytes / b.capacityBytes,
    );

    const occupied = new Set(occupiedDomains);
    const freshDomain = candidates.find((n) => !occupied.has(n.failureDomain));
    return (freshDomain ?? candidates[0]!).id;
  }

  /**
   * Choose `count` node placements for erasure-coded shards. Spreads shards
   * across as many distinct healthy nodes as possible (round-robin over
   * capacity-sorted nodes) so a single node failure loses at most one shard
   * per stripe whenever the cluster has ≥ count nodes.
   */
  async placeShards(count: number, policy: PocketPolicy): Promise<NodeId[]> {
    let candidates = await this.nodeRegistry.listHealthyNodes();
    if (candidates.length === 0) {
      throw new Error("No healthy storage nodes available in the fabric");
    }

    if (policy.regionAffinity && policy.regionAffinity.length > 0) {
      const regional = candidates.filter((n) =>
        policy.regionAffinity!.includes(n.region),
      );
      if (regional.length > 0) candidates = regional;
    }
    if (policy.costTier) {
      const tiered = candidates.filter((n) => n.costTier === policy.costTier);
      if (tiered.length > 0) candidates = tiered;
    }

    candidates.sort(
      (a, b) => a.usedBytes / a.capacityBytes - b.usedBytes / b.capacityBytes,
    );

    // Spread shards across distinct failure domains first, falling back to reuse
    // only when there are fewer nodes than shards (graceful degradation).
    const ordered = this.orderByDomainDiversity(candidates);
    const out: NodeId[] = [];
    for (let i = 0; i < count; i++) {
      out.push(ordered[i % ordered.length]!.id);
    }
    return out;
  }

  async findRebalanceCandidates(
    highWatermark = 0.8,
  ): Promise<{ hot: FabricStorageNode[]; cold: FabricStorageNode[] }> {
    const nodes = await this.nodeRegistry.listHealthyNodes();
    const hot = nodes.filter(
      (n) => n.usedBytes / n.capacityBytes > highWatermark,
    );
    const cold = nodes.filter(
      (n) => n.usedBytes / n.capacityBytes < highWatermark * 0.6,
    );
    return { hot, cold };
  }
}
