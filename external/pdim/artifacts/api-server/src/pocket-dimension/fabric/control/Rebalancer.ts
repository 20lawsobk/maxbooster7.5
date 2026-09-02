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

      if (hot.length === 0 || cold.length === 0) {
        logger.info("[FabricRebalancer] Nothing to rebalance");
        return { moved, errors };
      }

      // Track per-target remaining free space across this pass so we never
      // overfill a cold node while draining several hot ones.
      const freeBytes = new Map<NodeId, number>();
      for (const n of cold) {
        freeBytes.set(
          n.id,
          n.capacityBytes * this.HIGH_WATERMARK - n.usedBytes,
        );
      }

      for (const hotNode of hot) {
        const overageBytes =
          hotNode.usedBytes - hotNode.capacityBytes * this.HIGH_WATERMARK;
        if (overageBytes <= 0) continue;
        let migratedBytes = 0;

        const candidateCold = cold
          .filter(
            (n) =>
              n.id !== hotNode.id &&
              (n.costTier === hotNode.costTier || n.costTier === "archive") &&
              (freeBytes.get(n.id) ?? 0) > 0,
          )
          .sort(
            (a, b) => (freeBytes.get(b.id) ?? 0) - (freeBytes.get(a.id) ?? 0),
          );
        if (candidateCold.length === 0) continue;

        const chunks = await this.chunkIndex.listChunksOnNode(hotNode.id);

        for (const chunk of chunks) {
          if (migratedBytes >= overageBytes) break;
          // Pick the emptiest eligible target that still has room and does not
          // already hold this chunk (keep redundancy spread across nodes).
          const target = candidateCold.find(
            (n) =>
              (freeBytes.get(n.id) ?? 0) >= chunk.sizeBytes &&
              !chunk.nodeIds.includes(n.id),
          );
          if (!target) continue;

          try {
            await this.migrateChunk(chunk.id, hotNode.id, target.id);
            migratedBytes += chunk.sizeBytes;
            moved++;
            freeBytes.set(
              target.id,
              (freeBytes.get(target.id) ?? 0) - chunk.sizeBytes,
            );
          } catch (err) {
            logger.error(
              `[FabricRebalancer] Failed to migrate chunk ${chunk.id}:`,
              err,
            );
            errors++;
          }
        }

        logger.info(
          `[FabricRebalancer] Drained ${(migratedBytes / 1024 / 1024).toFixed(1)} MB from ${hotNode.id} ` +
            `(was ${((hotNode.usedBytes / hotNode.capacityBytes) * 100).toFixed(1)}% full)`,
        );
      }
    } catch (err) {
      logger.error("[FabricRebalancer] Rebalance error:", err);
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

    const data = await fromStore.getChunk(chunkId);
    await toStore.putChunk(chunkId, data);

    const loc = await this.chunkIndex.getChunkLocation(chunkId);
    if (loc) {
      const newNodeIds = [
        ...loc.nodeIds.filter((id) => id !== fromNodeId),
        toNodeId,
      ];
      await this.chunkIndex.updateChunkLocation({
        ...loc,
        nodeIds: newNodeIds,
      });
    }

    await fromStore.deleteChunk(chunkId);
    const sizeBytes = loc?.sizeBytes ?? 0;
    await this.nodeRegistry.addUsedBytes(fromNodeId, -sizeBytes);
    await this.nodeRegistry.addUsedBytes(toNodeId, sizeBytes);
  }
}
