import type { NodeRegistry } from "../infra/NodeRegistry.js";
import type { ChunkIndex } from "../infra/ChunkIndex.js";
import type { ChunkStore } from "../storage/ChunkStore.js";
import type { PlacementStrategy } from "./PlacementStrategy.js";
import type { NodeId, ChunkId } from "../types.js";
import { logger } from "../../../logger.js";

export class Rebalancer {
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly HIGH_WATERMARK = 0.8;

  constructor(
    private nodeRegistry: NodeRegistry,
    private chunkIndex: ChunkIndex,
    private placement: PlacementStrategy,
    private chunkStoreFactory: (nodeId: NodeId) => ChunkStore,
    private intervalMs = 6 * 60 * 60 * 1000,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(() => this.rebalance(), this.intervalMs);
    logger.info("[FabricRebalancer] Background rebalancer started");
  }

  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info("[FabricRebalancer] Stopped");
  }

  async rebalance(): Promise<{ moved: number; errors: number }> {
    logger.info("[FabricRebalancer] Starting rebalance pass...");
    let moved = 0;
    let errors = 0;

    try {
      const { hot, cold } = await this.placement.findRebalanceCandidates(
        this.HIGH_WATERMARK,
      );

      if (hot?.length === 0 || cold?.length === 0) {
        logger.info("[FabricRebalancer] Nothing to rebalance");
        return { moved, errors };
      }

      for (const hotNode of hot) {
        let _migratedBytes = 0;

        const candidateCold = cold?.filter(
          (n) => n?.costTier === hotNode?.costTier || n?.costTier === "archive",
        );
        if (candidateCold?.length === 0) continue;

        const targetNode = candidateCold[0];
        this.chunkStoreFactory(hotNode?.id);
        this.chunkStoreFactory(targetNode?.id);

        const allNodes = await this.nodeRegistry.listAllNodes();
        const hotNodeRow = allNodes?.find((n) => n?.id === hotNode?.id);
        if (!hotNodeRow) continue;

        logger.info(
          `[FabricRebalancer] Moving chunks from ${hotNode?.id} (${((hotNode?.usedBytes / hotNode?.capacityBytes) * 100).toFixed(1)}% full) to ${targetNode?.id}`,
        );

        break;
      }
    } catch (err) {
      logger.error({ err: err }, "[FabricRebalancer] Rebalance error:");
      errors++;
    }

    logger.info(
      `[FabricRebalancer] Rebalance complete: moved=${moved} errors=${errors}`,
    );
    return { moved, errors };
  }

  async migrateChunk(
    chunkId: ChunkId,
    fromNodeId: NodeId,
    toNodeId: NodeId,
  ): Promise<void> {
    const fromStore = this.chunkStoreFactory(fromNodeId);
    const toStore = this.chunkStoreFactory(toNodeId);

    const data = await fromStore?.getChunk(chunkId);
    await toStore?.putChunk(chunkId, data);

    const loc = await this.chunkIndex.getChunkLocation(chunkId);
    if (loc) {
      const newNodeIds = [
        ...loc?.nodeIds.filter((id) => id !== fromNodeId),
        toNodeId,
      ];
      await this.chunkIndex.putChunkLocation({ ...loc, nodeIds: newNodeIds });
    }

    await fromStore?.deleteChunk(chunkId);
    await this.nodeRegistry.updateNode(fromNodeId, {
      usedBytes: Math.max(
        0,
        (await this.nodeRegistry.getNode(fromNodeId))!.usedBytes -
          (loc?.sizeBytes ?? 0),
      ),
    });
    await this.nodeRegistry.updateNode(toNodeId, {
      usedBytes:
        (await this.nodeRegistry.getNode(toNodeId))!.usedBytes +
        (loc?.sizeBytes ?? 0),
    });
  }
}
