import type { NodeRegistry } from "../infra/NodeRegistry.js";
import type { ChunkIndex } from "../infra/ChunkIndex.js";
import type { PlacementStrategy } from "./PlacementStrategy.js";
import type { ChunkStore } from "../storage/ChunkStore.js";
import type { NodeId, FabricStorageNode } from "../types.js";
import { Rebalancer } from "./Rebalancer.js";
import { logger } from "../../../logger.js";

export interface ClusterRules {
  minNodes: number;
  maxNodes: number;
  utilizationHighWatermark: number;
  utilizationLowWatermark: number;
  utilizationPerNodeHighWatermark: number;
  healthCheckStaleMs: number;
  cooldownMs: number;
  scaleDownCooldownMs: number;
  checkIntervalMs: number;
  capacityBytesPerNode: number;
  velocitySampleWindowMs: number;
  maxSpawnPerEvent: number;
  emaAlpha: number;
}

export const DEFAULT_RULES: ClusterRules = {
  minNodes: 3,
  maxNodes: 20,
  utilizationHighWatermark: 0.7,
  utilizationLowWatermark: 0.4,
  utilizationPerNodeHighWatermark: 0.8,
  healthCheckStaleMs: 10 * 60 * 1000,
  cooldownMs: 10 * 60 * 1000,
  scaleDownCooldownMs: 30 * 60 * 1000,
  checkIntervalMs: 5 * 60 * 1000,
  capacityBytesPerNode: 400 * 1024 * 1024 * 1024 * 1024,
  velocitySampleWindowMs: 60 * 60 * 1000,
  maxSpawnPerEvent: 5,
  emaAlpha: 0.3,
};

type SpawnReason =
  | "below_min_nodes"
  | "unhealthy_node_replacement"
  | "avg_utilization_high"
  | "hot_node_detected";

type ScaleDownReason = "avg_utilization_low";

interface UtilizationSample {
  timestamp: number;
  totalUsedBytes: number;
  totalCapacityBytes: number;
}

interface ScaleEvent {
  direction: "up" | "down";
  at: Date;
  reason: SpawnReason | ScaleDownReason;
  nodesChanged: number;
  pocketNames: string[];
  smoothedVelocityBytesPerMs: number;
  rawVelocityBytesPerMs: number;
  projectionWindowMs: number;
  projectedBytes: number;
  timeToThresholdMs: number | null;
  nodesBefore: number;
  nodesAfter: number;
}

export class AutoClusterManager {
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;
  private lastSpawnAt: Date | null = null;
  private lastScaleDownAt: Date | null = null;
  private rebalancer: Rebalancer;
  readonly history: ScaleEvent[] = [];

  private utilizationHistory: UtilizationSample[] = [];
  private readonly MAX_HISTORY_SAMPLES = 288;
  private thresholdFirstCrossedAt: number | null = null;

  private emaVelocity = 0;
  private emaInitialized = false;

  constructor(
    private nodeRegistry: NodeRegistry,
    private chunkIndex: ChunkIndex,
    private placement: PlacementStrategy,
    private chunkStoreFactory: (nodeId: NodeId) => ChunkStore,
    private onNodeSpawned: (
      nodeId: NodeId,
      pocketName: string,
      store: ChunkStore,
    ) => void,
    private rules: ClusterRules = DEFAULT_RULES,
    private onDrainNode?: (
      nodeId: NodeId,
    ) => Promise<{ migrated: number; errors: number }>,
  ) {
    this.rebalancer = new Rebalancer(
      nodeRegistry,
      chunkIndex,
      placement,
      chunkStoreFactory,
    );
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(
      () =>
        this.evaluate().catch((e) =>
          logger.error("[AutoCluster] Evaluation error:", e),
        ),
      this.rules.checkIntervalMs,
    );
    logger.info(
      `[AutoCluster] Started — ` +
        `min=${this.rules.minNodes} max=${this.rules.maxNodes} ` +
        `up≥${(this.rules.utilizationHighWatermark * 100).toFixed(0)}% ` +
        `down≤${(this.rules.utilizationLowWatermark * 100).toFixed(0)}% ` +
        `ema_alpha=${this.rules.emaAlpha} ` +
        `maxSpawn=${this.rules.maxSpawnPerEvent} ` +
        `spawnCooldown=${this.rules.cooldownMs / 60_000}min ` +
        `drainCooldown=${this.rules.scaleDownCooldownMs / 60_000}min`,
    );
  }

  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info("[AutoCluster] Stopped");
  }

  async evaluate(): Promise<{
    spawned: number;
    removed: number;
    reasons: string[];
    smoothedVelocityBytesPerMs: number;
  }> {
    const allNodes = await this.nodeRegistry.listAllNodes();
    // Consider every storage backend, not just local pocket-dimension nodes.
    // After a migration to Object Storage the cluster has zero PD nodes, so a
    // PD-only filter would report 0 healthy nodes and loop forever on
    // below_min_nodes, spawning spurious replacement nodes.
    const fabricNodes = allNodes.filter(
      (n) =>
        n.backendType === "pocket-dimension" ||
        n.backendType === "replit-object-storage",
    );
    const healthyNodes = fabricNodes.filter((n) => this.isNodeHealthy(n));

    const totalUsed = healthyNodes.reduce((s, n) => s + n.usedBytes, 0);
    const totalCapacity = healthyNodes.reduce((s, n) => s + n.capacityBytes, 0);
    const avgUtil = totalCapacity > 0 ? totalUsed / (totalCapacity || 1) : 0;
    const now = Date.now();

    this.recordSample({
      timestamp: now,
      totalUsedBytes: totalUsed,
      totalCapacityBytes: totalCapacity,
    });
    const rawVelocity = this.computeRawVelocity(now);
    this.updateEma(rawVelocity);
    const smoothedVelocity = this.emaVelocity;
    const projectionWindowMs = this.dynamicProjectionWindow(smoothedVelocity);
    const projectedBytes = smoothedVelocity * projectionWindowMs;

    logger.info(
      `[AutoCluster] Eval — ${healthyNodes.length}/${fabricNodes.length} healthy ` +
        `util=${(avgUtil * 100).toFixed(1)}% ` +
        `raw=${this.formatVelocity(rawVelocity)} ` +
        `ema=${this.formatVelocity(smoothedVelocity)} ` +
        `projection=${(projectionWindowMs / 3_600_000).toFixed(1)}h ` +
        `projected=${this.formatBytes(projectedBytes)}`,
    );

    const reasons: string[] = [];
    let totalSpawned = 0;
    let totalRemoved = 0;

    const spawnTriggers = this.evaluateScaleUpRules(
      fabricNodes,
      healthyNodes,
      avgUtil,
      now,
    );

    for (const trigger of spawnTriggers) {
      if (!this.canSpawn(fabricNodes.length + totalSpawned)) {
        logger.info(
          `[AutoCluster] Would spawn (${trigger.reason}) but cap or cooldown prevents it`,
        );
        continue;
      }

      const count = this.computeSpawnCount(
        trigger.reason,
        smoothedVelocity,
        fabricNodes.length + totalSpawned,
        projectedBytes,
      );
      const timeToThreshold = this.thresholdFirstCrossedAt
        ? now - this.thresholdFirstCrossedAt
        : null;

      logger.info(
        `[AutoCluster] ScaleUp: ${trigger.reason} ` +
          `ema=${this.formatVelocity(smoothedVelocity)} raw=${this.formatVelocity(rawVelocity)} ` +
          `ttThreshold=${timeToThreshold !== null ? (timeToThreshold / 60_000).toFixed(1) + "min" : "unknown"} ` +
          `projected=${this.formatBytes(projectedBytes)} → spawn ${count}`,
      );

      const spawned: string[] = [];
      for (let i = 0; i < count; i++) {
        if (!this.canSpawn(fabricNodes.length + totalSpawned + i)) break;

        const pocketName = this.nextPocketName(fabricNodes, totalSpawned + i);
        const region = this.pickRegion(fabricNodes, totalSpawned + i);
        const failureDomain = this.pickDomain(fabricNodes, totalSpawned + i);

        const useObjectStorage =
          process.env["FABRIC_BACKEND"] === "replit-object-storage";
        const node = await this.nodeRegistry.registerNode({
          region,
          costTier: "standard",
          backendType: useObjectStorage
            ? "replit-object-storage"
            : "pocket-dimension",
          backendConfig: useObjectStorage
            ? {
                namespace: pocketName,
                spawnedBy: "auto-cluster",
                reason: trigger.reason,
              }
            : {
                pocketName,
                spawnedBy: "auto-cluster",
                reason: trigger.reason,
              },
          failureDomain,
          capacityBytes: this.rules.capacityBytesPerNode,
          usedBytes: 0,
          healthy: true,
        });

        let store: import("../storage/ChunkStore.js").ChunkStore;
        if (useObjectStorage) {
          const { ReplitChunkStore } =
            await import("../storage/ReplitChunkStore.js");
          store = new ReplitChunkStore(pocketName);
        } else {
          const { PocketDimensionChunkStore } =
            await import("../storage/PocketDimensionChunkStore.js");
          store = new PocketDimensionChunkStore(pocketName);
        }
        this.onNodeSpawned(node.id, pocketName, store);
        spawned.push(pocketName);
        logger.info(`[AutoCluster] Spawned: ${pocketName} (${region})`);
      }

      if (spawned.length > 0) {
        this.pushHistory({
          direction: "up",
          at: new Date(),
          reason: trigger.reason,
          nodesChanged: spawned.length,
          pocketNames: spawned,
          smoothedVelocityBytesPerMs: smoothedVelocity,
          rawVelocityBytesPerMs: rawVelocity,
          projectionWindowMs,
          projectedBytes,
          timeToThresholdMs: timeToThreshold,
          nodesBefore: fabricNodes.length + totalSpawned,
          nodesAfter: fabricNodes.length + totalSpawned + spawned.length,
        });
        this.lastSpawnAt = new Date();
        totalSpawned += spawned.length;
        reasons.push(`↑${trigger.reason} → [${spawned.join(", ")}]`);

        if (trigger.reason === "hot_node_detected" && trigger.hotNodeId) {
          this.rebalancer
            .rebalance()
            .catch((e) => logger.warn("[AutoCluster] Rebalance error:", e));
        }
      }
    }

    if (avgUtil < this.rules.utilizationHighWatermark) {
      this.thresholdFirstCrossedAt = null;
    }

    if (
      avgUtil <= this.rules.utilizationLowWatermark &&
      spawnTriggers.length === 0
    ) {
      const removed = await this.tryScaleDown(
        fabricNodes,
        healthyNodes,
        avgUtil,
        smoothedVelocity,
        rawVelocity,
        projectionWindowMs,
        projectedBytes,
        now,
      );
      if (removed.length > 0) {
        totalRemoved += removed.length;
        reasons.push(`↓avg_utilization_low → [${removed.join(", ")}]`);
      }
    }

    if (totalSpawned > 0 || totalRemoved > 0) {
      logger.info(
        `[AutoCluster] Done — spawned=${totalSpawned} removed=${totalRemoved} | ${reasons.join(" | ")}`,
      );
    } else {
      logger.info("[AutoCluster] Cluster balanced — no action needed");
    }

    return {
      spawned: totalSpawned,
      removed: totalRemoved,
      reasons,
      smoothedVelocityBytesPerMs: smoothedVelocity,
    };
  }

  private async tryScaleDown(
    fabricNodes: FabricStorageNode[],
    healthyNodes: FabricStorageNode[],
    avgUtil: number,
    smoothedVelocity: number,
    rawVelocity: number,
    projectionWindowMs: number,
    projectedBytes: number,
    now: number,
  ): Promise<string[]> {
    if (healthyNodes.length <= this.rules.minNodes) {
      logger.info(
        `[AutoCluster] ScaleDown skipped — already at min (${healthyNodes.length})`,
      );
      return [];
    }

    if (
      this.lastScaleDownAt &&
      now - this.lastScaleDownAt.getTime() < this.rules.scaleDownCooldownMs
    ) {
      const remaining = Math.ceil(
        (this.rules.scaleDownCooldownMs -
          (now - this.lastScaleDownAt.getTime())) /
          60_000,
      );
      logger.info(
        `[AutoCluster] ScaleDown cooldown — ${remaining}min remaining`,
      );
      return [];
    }

    const autoSpawnedNodes = fabricNodes
      .filter((n) => {
        const cfg = n.backendConfig as any;
        return cfg?.spawnedBy === "auto-cluster" && this.isNodeHealthy(n);
      })
      .sort((a, b) => a.usedBytes - b.usedBytes);

    if (autoSpawnedNodes.length === 0) {
      logger.info(
        "[AutoCluster] ScaleDown skipped — no auto-spawned nodes eligible",
      );
      return [];
    }

    const candidate = autoSpawnedNodes[0];
    const pocketName: string = this.storageName(candidate) || candidate.id;
    const util =
      candidate.capacityBytes > 0
        ? ((candidate.usedBytes / candidate.capacityBytes) * 100).toFixed(1)
        : "0.0";

    logger.info(
      `[AutoCluster] ScaleDown: util=${(avgUtil * 100).toFixed(1)}% ≤ ${(this.rules.utilizationLowWatermark * 100).toFixed(0)}% ` +
        `— draining ${pocketName} (${util}% used, ${this.formatBytes(candidate.usedBytes)})`,
    );

    // Migrate the node's chunks off it BEFORE deactivating so scale-down can
    // never drop the last copy of a chunk. The drain hook deactivates the node
    // itself only once every chunk has moved cleanly; if it's unavailable or the
    // drain fails, leave the node active rather than risk data loss.
    if (this.onDrainNode) {
      const { migrated, errors } = await this.onDrainNode(candidate.id);
      if (errors > 0) {
        logger.warn(
          `[AutoCluster] ScaleDown aborted — drain of ${pocketName} left ${errors} chunk(s) unmoved; node kept active`,
        );
        return [];
      }
      logger.info(
        `[AutoCluster] ScaleDown drained ${migrated} chunk(s) off ${pocketName}`,
      );
    } else {
      await this.nodeRegistry.updateNode(candidate.id, { healthy: false });
    }

    this.pushHistory({
      direction: "down",
      at: new Date(),
      reason: "avg_utilization_low",
      nodesChanged: 1,
      pocketNames: [pocketName],
      smoothedVelocityBytesPerMs: smoothedVelocity,
      rawVelocityBytesPerMs: rawVelocity,
      projectionWindowMs,
      projectedBytes,
      timeToThresholdMs: null,
      nodesBefore: fabricNodes.length,
      nodesAfter: fabricNodes.length - 1,
    });

    this.lastScaleDownAt = new Date(now);
    return [pocketName];
  }

  private evaluateScaleUpRules(
    allPdNodes: FabricStorageNode[],
    healthyNodes: FabricStorageNode[],
    avgUtil: number,
    now: number,
  ): Array<{ reason: SpawnReason; hotNodeId?: NodeId }> {
    const triggers: Array<{ reason: SpawnReason; hotNodeId?: NodeId }> = [];

    if (healthyNodes.length < this.rules.minNodes) {
      triggers.push({ reason: "below_min_nodes" });
      logger.warn(
        `[AutoCluster] RULE below_min_nodes: ${healthyNodes.length} < ${this.rules.minNodes}`,
      );
    }

    const unhealthy = allPdNodes.filter((n) => !this.isNodeHealthy(n));
    for (const dead of unhealthy) {
      triggers.push({ reason: "unhealthy_node_replacement" });
      logger.warn(
        `[AutoCluster] RULE unhealthy_node_replacement: ${this.storageName(dead) || dead.id}`,
      );
    }

    if (avgUtil >= this.rules.utilizationHighWatermark) {
      if (this.thresholdFirstCrossedAt === null) {
        this.thresholdFirstCrossedAt = now;
        logger.info(
          `[AutoCluster] High-watermark crossed at ${(avgUtil * 100).toFixed(1)}%`,
        );
      }
      triggers.push({ reason: "avg_utilization_high" });
      logger.warn(
        `[AutoCluster] RULE avg_utilization_high: ${(avgUtil * 100).toFixed(1)}% ≥ ${(this.rules.utilizationHighWatermark * 100).toFixed(0)}%`,
      );
    }

    for (const node of healthyNodes) {
      const util =
        node.capacityBytes > 0 ? node.usedBytes / node.capacityBytes : 0;
      if (util >= this.rules.utilizationPerNodeHighWatermark) {
        triggers.push({ reason: "hot_node_detected", hotNodeId: node.id });
        logger.warn(
          `[AutoCluster] RULE hot_node: ${this.storageName(node) || node.id} at ${(util * 100).toFixed(1)}%`,
        );
      }
    }

    return triggers;
  }

  private computeSpawnCount(
    reason: SpawnReason,
    smoothedVelocity: number,
    currentNodeCount: number,
    projectedBytes: number,
  ): number {
    const headroom = this.rules.maxNodes - currentNodeCount;

    if (
      reason === "below_min_nodes" ||
      reason === "unhealthy_node_replacement"
    ) {
      return Math.min(
        this.rules.minNodes - currentNodeCount,
        this.rules.maxSpawnPerEvent,
        headroom,
      );
    }

    if (smoothedVelocity <= 0 || projectedBytes <= 0) return 1;

    const nodesNeeded = Math.ceil(
      projectedBytes / this.rules.capacityBytesPerNode,
    );
    const clamped = Math.max(
      1,
      Math.min(nodesNeeded, this.rules.maxSpawnPerEvent, headroom),
    );

    logger.info(
      `[AutoCluster] SpawnCount: projected=${this.formatBytes(projectedBytes)} ` +
        `÷ cap=${this.formatBytes(this.rules.capacityBytesPerNode)} ` +
        `= ${nodesNeeded} → clamped=${clamped}`,
    );
    return clamped;
  }

  private dynamicProjectionWindow(smoothedVelocity: number): number {
    const perSec = smoothedVelocity * 1000;
    const GB = 1_073_741_824;
    const MB = 1_048_576;
    const KB = 1024;

    if (perSec >= 1 * GB) return 2 * 3_600_000;
    if (perSec >= 100 * MB) return 4 * 3_600_000;
    if (perSec >= 10 * MB) return 6 * 3_600_000;
    if (perSec >= 1 * MB) return 12 * 3_600_000;
    if (perSec >= 100 * KB) return 24 * 3_600_000;
    if (perSec >= 10 * KB) return 36 * 3_600_000;
    return 48 * 3_600_000;
  }

  private updateEma(rawVelocity: number): void {
    if (!this.emaInitialized) {
      this.emaVelocity = rawVelocity;
      this.emaInitialized = true;
    } else {
      this.emaVelocity =
        this.rules.emaAlpha * rawVelocity +
        (1 - this.rules.emaAlpha) * this.emaVelocity;
    }
  }

  private recordSample(sample: UtilizationSample): void {
    this.utilizationHistory.push(sample);
    if (this.utilizationHistory.length > this.MAX_HISTORY_SAMPLES) {
      this.utilizationHistory.shift();
    }
  }

  private computeRawVelocity(now: number): number {
    const windowStart = now - this.rules.velocitySampleWindowMs;
    const windowSamples = this.utilizationHistory.filter(
      (s) => s.timestamp >= windowStart,
    );
    if (windowSamples.length < 2) return 0;

    const oldest = windowSamples[0];
    const newest = windowSamples[windowSamples.length - 1];
    const deltaBytes = newest.totalUsedBytes - oldest.totalUsedBytes;
    const deltaMs = newest.timestamp - oldest.timestamp;
    if (deltaMs <= 0) return 0;

    return Math.max(0, deltaBytes / deltaMs);
  }

  private isNodeHealthy(node: FabricStorageNode): boolean {
    if (!node.healthy) return false;
    // Liveness is heartbeat-based only. A node that simply isn't being written to
    // is NOT unhealthy — "quiet" must never be confused with "dead". Health is
    // lost only when a node stops heart-beating past the stale threshold.
    const staleThreshold = Date.now() - this.rules.healthCheckStaleMs;
    return node.lastHeartbeat.getTime() > staleThreshold;
  }

  private canSpawn(currentCount: number): boolean {
    if (currentCount >= this.rules.maxNodes) return false;
    if (
      this.lastSpawnAt &&
      Date.now() - this.lastSpawnAt.getTime() < this.rules.cooldownMs
    )
      return false;
    return true;
  }

  /**
   * Canonical storage namespace of a node, independent of backend. Object-storage
   * nodes persist `namespace`; pocket-dimension nodes persist `pocketName`. Reading
   * only one field makes a fully-migrated cluster look like it has no existing
   * `fabric-cluster-N` indices, which resets name generation to 0 and collides new
   * spawns onto an existing node's object keyspace.
   */
  private storageName(n: FabricStorageNode): string {
    const cfg = (n.backendConfig as any) ?? {};
    return (
      (cfg.namespace as string | undefined) ??
      (cfg.pocketName as string | undefined) ??
      ""
    );
  }

  private nextPocketName(existing: FabricStorageNode[], offset = 0): string {
    const indices = existing
      .map((n) => {
        const match = this.storageName(n).match(/fabric-cluster-(\d+)$/);
        return match ? parseInt(match[1], 10) : -1;
      })
      .filter((i) => i >= 0);
    const base = indices.length > 0 ? Math.max(...indices) + 1 : 0;
    return `fabric-cluster-${base + offset}`;
  }

  /**
   * Assign a failure domain to a new node, preferring domains not yet present so
   * the cluster keeps growing its cross-domain spread. Falls back to round-robin
   * once every known domain is in use.
   */
  private pickDomain(existing: FabricStorageNode[], offset = 0): string {
    const domains = [
      "domain-0",
      "domain-1",
      "domain-2",
      "domain-3",
      "domain-4",
      "domain-5",
    ];
    const used = new Set(existing.map((n) => n.failureDomain));
    const fresh = domains.filter((d) => !used.has(d));
    if (fresh.length > 0) return fresh[offset % fresh.length];
    return domains[(existing.length + offset) % domains.length];
  }

  private pickRegion(existing: FabricStorageNode[], offset = 0): string {
    const regions = [
      "us-east",
      "us-west",
      "eu-west",
      "ap-southeast",
      "ap-northeast",
      "sa-east",
    ];
    const usedRegions = new Set(existing.map((n) => n.region));
    const fresh = regions.filter((r) => !usedRegions.has(r));
    if (fresh.length > 0) return fresh[offset % fresh.length];
    return regions[(existing.length + offset) % regions.length];
  }

  private pushHistory(event: ScaleEvent): void {
    this.history.push(event);
    if (this.history.length > 100) this.history.shift();
  }

  private formatVelocity(bytesPerMs: number): string {
    const perSec = bytesPerMs * 1000;
    if (perSec >= 1_073_741_824)
      return `${(perSec / 1_073_741_824).toFixed(2)} GB/s`;
    if (perSec >= 1_048_576) return `${(perSec / 1_048_576).toFixed(2)} MB/s`;
    if (perSec >= 1024) return `${(perSec / 1024).toFixed(2)} KB/s`;
    return `${perSec.toFixed(0)} B/s`;
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1_073_741_824)
      return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${Math.round(bytes)} B`;
  }

  getStatus() {
    const latest = this.utilizationHistory[this.utilizationHistory.length - 1];
    const rawVelocity = this.computeRawVelocity(Date.now());
    const projectionWindowMs = this.dynamicProjectionWindow(this.emaVelocity);
    return {
      running: this.running,
      lastSpawnAt: this.lastSpawnAt,
      lastScaleDownAt: this.lastScaleDownAt,
      spawnCooldownRemainingMs: this.lastSpawnAt
        ? Math.max(
            0,
            this.rules.cooldownMs - (Date.now() - this.lastSpawnAt.getTime()),
          )
        : 0,
      scaleDownCooldownRemainingMs: this.lastScaleDownAt
        ? Math.max(
            0,
            this.rules.scaleDownCooldownMs -
              (Date.now() - this.lastScaleDownAt.getTime()),
          )
        : 0,
      thresholdFirstCrossedAt: this.thresholdFirstCrossedAt
        ? new Date(this.thresholdFirstCrossedAt)
        : null,
      rawVelocityBytesPerMs: rawVelocity,
      smoothedVelocityBytesPerMs: this.emaVelocity,
      rawVelocityFormatted: this.formatVelocity(rawVelocity),
      smoothedVelocityFormatted: this.formatVelocity(this.emaVelocity),
      projectionWindowMs,
      projectionWindowHours: (projectionWindowMs / 3_600_000).toFixed(1),
      projectedBytes: this.emaVelocity * projectionWindowMs,
      projectedBytesFormatted: this.formatBytes(
        this.emaVelocity * projectionWindowMs,
      ),
      latestSample: latest
        ? {
            timestamp: new Date(latest.timestamp),
            usedBytes: latest.totalUsedBytes,
            capacityBytes: latest.totalCapacityBytes,
            utilizationPercent:
              latest.totalCapacityBytes > 0
                ? (
                    (latest.totalUsedBytes / latest.totalCapacityBytes) *
                    100
                  ).toFixed(1)
                : "0.0",
          }
        : null,
      rules: this.rules,
      recentHistory: this.history.slice(-10).map((e) => ({
        ...e,
        rawVelocityFormatted: this.formatVelocity(e.rawVelocityBytesPerMs),
        smoothedVelocityFormatted: this.formatVelocity(
          e.smoothedVelocityBytesPerMs,
        ),
        projectedFormatted: this.formatBytes(e.projectedBytes),
        projectionWindowHours: (e.projectionWindowMs / 3_600_000).toFixed(1),
        timeToThresholdFormatted:
          e.timeToThresholdMs !== null
            ? `${(e.timeToThresholdMs / 60_000).toFixed(1)}min`
            : null,
      })),
    };
  }
}
