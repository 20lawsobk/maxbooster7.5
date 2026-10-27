// @ts-nocheck
import type { NodeRegistry } from "../infra/NodeRegistry.js";
import type { ChunkIndex } from "../infra/ChunkIndex.js";
import type { ChunkStore } from "../storage/ChunkStore.js";
import type { PlacementStrategy } from "./PlacementStrategy.js";
import type { NodeId, ChunkId } from "../types.js";
import { MigrationOutbox } from "../infra/MigrationOutbox.js";
import { logger } from "../../../logger.js";

// All fabric controllers in the owning process share one physical migration
// lane. More logical nodes must not mean concurrent destructive chunk moves.
let migrationTail: Promise<void> = Promise.resolve();

export class Rebalancer {
  private running = false;
  private recoveryTimer: NodeJS.Timeout | null = null;
  private readonly migrations: Pick<MigrationOutbox, "pending" | "begin" | "resume">;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly HIGH_WATERMARK = 0.8;

  constructor(
    private nodeRegistry: NodeRegistry,
    private chunkIndex: ChunkIndex,
    private placement: PlacementStrategy,
    private chunkStoreFactory: (nodeId: NodeId) => ChunkStore,
    private intervalMs = 6 * 60 * 60 * 1000,
    migrations?: Pick<MigrationOutbox, "pending" | "begin" | "resume">,
  ) { this.migrations = migrations ?? new MigrationOutbox(chunkStoreFactory); }

  start(): void {
    if (this.running) return;
    this.running = true;
    const recover = () => { void this.drainPendingMigrations().catch(err => logger.warn({ err }, "[FabricRebalancer] Migration retained for retry")); };
    recover();
    this.recoveryTimer = setInterval(recover, 30_000);
    this.recoveryTimer.unref();
    this.intervalId = setInterval(() => this.rebalance(), this.intervalMs);
    logger.info("[FabricRebalancer] Background rebalancer started");
  }

  stop(): void {
    this.running = false;
    if (this.recoveryTimer) { clearInterval(this.recoveryTimer); this.recoveryTimer = null; }
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
      await this.drainPendingMigrations();
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
        const allNodes = await this.nodeRegistry.listAllNodes();
        const hotNodeRow = allNodes?.find((n) => n?.id === hotNode?.id);
        if (!hotNodeRow) continue;

        logger.info(
          `[FabricRebalancer] Moving chunks from ${hotNode?.id} (${((hotNode?.usedBytes / hotNode?.capacityBytes) * 100).toFixed(1)}% full) to ${targetNode?.id}`,
        );

        const chunks = await this.chunkIndex.getChunksByNode(hotNode.id);
        for (const chunk of chunks) {
          if (chunk.nodeIds.includes(targetNode.id)) continue;
          const target = await this.nodeRegistry.getNode(targetNode.id);
          if (!target || target.capacityBytes - target.usedBytes < chunk.sizeBytes) continue;
          await this.migrateChunk(chunk.id, hotNode.id, targetNode.id);
          moved++;
          _migratedBytes += chunk.sizeBytes;
          if ((hotNodeRow.usedBytes - _migratedBytes) / hotNodeRow.capacityBytes <= this.HIGH_WATERMARK) break;
        }
      }
    } catch (err) {
      logger.warn({ err: err }, "[FabricRebalancer] Rebalance error:");
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
    const operation = migrationTail.then(() => this.chunkIndex.withCatalogLock(() => this.migrateChunkOnce(chunkId, fromNodeId, toNodeId)));
    migrationTail = operation.catch(() => {});
    return operation;
  }

  private async migrateChunkOnce(
    chunkId: ChunkId,
    fromNodeId: NodeId,
    toNodeId: NodeId,
  ): Promise<void> {
    let recoveredRequestedMove = false;
    for (const job of await this.migrations.pending()) {
      await this.migrations.resume(job);
      if (job.chunk_id === chunkId && job.from_node === fromNodeId && job.to_node === toNodeId) recoveredRequestedMove = true;
    }
    if (recoveredRequestedMove) return;
    const job = await this.migrations.begin(chunkId, fromNodeId, toNodeId);
    await this.migrations.resume(job);
  }

  async drainPendingMigrations(): Promise<void> {
    const operation = migrationTail.then(() => this.chunkIndex.withCatalogLock(async () => {
      for (const job of await this.migrations.pending()) await this.migrations.resume(job);
    }));
    migrationTail = operation.catch(() => {});
    return operation;
  }

  async drainNode(nodeId: NodeId): Promise<{ moved: number; errors: number }> {
    let moved = 0;
    let errors = 0;
    try { await this.drainPendingMigrations(); }
    catch (err) { logger.warn({ err }, "[FabricRebalancer] Pending migration prevents node retirement"); return { moved, errors: 1 }; }
    const chunks = await this.chunkIndex.getChunksByNode(nodeId);
    // Sequential physical I/O; logical node count does not create host capacity.
    for (const chunk of chunks) {
      try {
        const targets = await this.nodeRegistry.listHealthyNodes();
        const target = targets.find((node) => node.id !== nodeId &&
          !chunk.nodeIds.includes(node.id) &&
          node.capacityBytes - node.usedBytes >= chunk.sizeBytes);
        if (!target) throw new Error(`No safe drain destination for ${chunk.id}`);
        await this.migrateChunk(chunk.id, nodeId, target.id);
        moved++;
      } catch (err) {
        errors++;
        logger.warn({ err }, "[FabricRebalancer] Drain incomplete; source retained");
      }
    }
    return { moved, errors };
  }
}
