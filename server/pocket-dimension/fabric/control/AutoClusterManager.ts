import type { NodeRegistry } from '../infra/NodeRegistry.js';
import type { ChunkIndex } from '../infra/ChunkIndex.js';
import type { PlacementStrategy } from './PlacementStrategy.js';
import type { ChunkStore } from '../storage/ChunkStore.js';
import type { NodeId, FabricStorageNode } from '../types.js';
import { Rebalancer } from './Rebalancer.js';
import { logger } from '../../../logger.js';

export interface ClusterRules {
  minNodes: number;
  maxNodes: number;
  utilizationHighWatermark: number;
  utilizationPerNodeHighWatermark: number;
  healthCheckStaleMs: number;
  cooldownMs: number;
  checkIntervalMs: number;
  capacityBytesPerNode: number;
  velocitySampleWindowMs: number;
  projectionWindowMs: number;
  maxSpawnPerEvent: number;
}

export const DEFAULT_RULES: ClusterRules = {
  minNodes: 3,
  maxNodes: 20,
  utilizationHighWatermark: 0.70,
  utilizationPerNodeHighWatermark: 0.80,
  healthCheckStaleMs: 10 * 60 * 1000,
  cooldownMs: 10 * 60 * 1000,
  checkIntervalMs: 5 * 60 * 1000,
  capacityBytesPerNode: 100 * 1024 * 1024 * 1024,
  velocitySampleWindowMs: 60 * 60 * 1000,
  projectionWindowMs: 24 * 60 * 60 * 1000,
  maxSpawnPerEvent: 5,
};

type SpawnReason =
  | 'below_min_nodes'
  | 'unhealthy_node_replacement'
  | 'avg_utilization_high'
  | 'hot_node_detected';

interface UtilizationSample {
  timestamp: number;
  totalUsedBytes: number;
  totalCapacityBytes: number;
}

interface ScaleEvent {
  at: Date;
  reason: SpawnReason;
  nodesSpawned: number;
  pocketNames: string[];
  velocityBytesPerMs: number;
  projectedBytesIn24h: number;
  timeToThresholdMs: number | null;
  nodesBefore: number;
  nodesAfter: number;
}

export class AutoClusterManager {
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;
  private lastSpawnAt: Date | null = null;
  private rebalancer: Rebalancer;
  readonly history: ScaleEvent[] = [];

  private utilizationHistory: UtilizationSample[] = [];
  private readonly MAX_HISTORY_SAMPLES = 288;
  private thresholdFirstCrossedAt: number | null = null;

  constructor(
    private nodeRegistry: NodeRegistry,
    private chunkIndex: ChunkIndex,
    private placement: PlacementStrategy,
    private chunkStoreFactory: (nodeId: NodeId) => ChunkStore,
    private onNodeSpawned: (nodeId: NodeId, pocketName: string, store: ChunkStore) => void,
    private rules: ClusterRules = DEFAULT_RULES,
  ) {
    this.rebalancer = new Rebalancer(nodeRegistry, chunkIndex, placement, chunkStoreFactory);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(
      () => this.evaluate().catch(e => logger.error('[AutoCluster] Evaluation error:', e)),
      this.rules.checkIntervalMs,
    );
    logger.info(
      `[AutoCluster] Velocity-based auto-cluster started — ` +
      `min=${this.rules.minNodes} max=${this.rules.maxNodes} ` +
      `threshold=${(this.rules.utilizationHighWatermark * 100).toFixed(0)}% ` +
      `projection=${this.rules.projectionWindowMs / 3_600_000}h ` +
      `maxSpawnPerEvent=${this.rules.maxSpawnPerEvent} ` +
      `cooldown=${this.rules.cooldownMs / 60_000}min`,
    );
  }

  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info('[AutoCluster] Stopped');
  }

  async evaluate(): Promise<{ spawned: number; reasons: string[]; velocityBytesPerMs: number }> {
    const allNodes = await this.nodeRegistry.listAllNodes();
    const pdNodes = allNodes.filter(n => n.backendType === 'pocket-dimension');
    const healthyNodes = pdNodes.filter(n => this.isNodeHealthy(n));

    const totalUsed = healthyNodes.reduce((s, n) => s + n.usedBytes, 0);
    const totalCapacity = healthyNodes.reduce((s, n) => s + n.capacityBytes, 0);
    const avgUtil = totalCapacity > 0 ? totalUsed / totalCapacity : 0;

    const now = Date.now();
    this.recordSample({ timestamp: now, totalUsedBytes: totalUsed, totalCapacityBytes: totalCapacity });

    const velocity = this.computeVelocity(now);
    const projectedBytes = velocity * this.rules.projectionWindowMs;

    logger.info(
      `[AutoCluster] Evaluation — ${healthyNodes.length}/${pdNodes.length} healthy nodes, ` +
      `util=${(avgUtil * 100).toFixed(1)}% ` +
      `velocity=${this.formatVelocity(velocity)} ` +
      `projected=${this.formatBytes(projectedBytes)} in ${this.rules.projectionWindowMs / 3_600_000}h`,
    );

    const triggers = this.evaluateRules(pdNodes, healthyNodes, avgUtil);
    const reasons: string[] = [];
    let totalSpawned = 0;

    for (const trigger of triggers) {
      if (!this.canSpawn(pdNodes.length + totalSpawned)) {
        logger.info(`[AutoCluster] Would spawn (${trigger.reason}) but cap=${this.rules.maxNodes} or cooldown active`);
        continue;
      }

      const count = this.computeSpawnCount(trigger.reason, velocity, pdNodes.length + totalSpawned, projectedBytes);
      const timeToThreshold = this.thresholdFirstCrossedAt ? now - this.thresholdFirstCrossedAt : null;

      logger.info(
        `[AutoCluster] Trigger: ${trigger.reason} — ` +
        `velocity=${this.formatVelocity(velocity)} ` +
        `timeToThreshold=${timeToThreshold !== null ? (timeToThreshold / 60_000).toFixed(1) + 'min' : 'unknown'} ` +
        `projected=${this.formatBytes(projectedBytes)} → spawning ${count} node(s)`,
      );

      const spawned: string[] = [];
      for (let i = 0; i < count; i++) {
        if (!this.canSpawn(pdNodes.length + totalSpawned + i)) break;

        const pocketName = this.nextPocketName(pdNodes, totalSpawned + i);
        const region = this.pickRegion(pdNodes, totalSpawned + i);

        const node = await this.nodeRegistry.registerNode({
          region,
          costTier: 'standard',
          backendType: 'pocket-dimension',
          backendConfig: { pocketName, spawnedBy: 'auto-cluster', reason: trigger.reason },
          capacityBytes: this.rules.capacityBytesPerNode,
          usedBytes: 0,
          healthy: true,
        });

        const { PocketDimensionChunkStore } = await import('../storage/PocketDimensionChunkStore.js');
        const store = new PocketDimensionChunkStore(pocketName);
        this.onNodeSpawned(node.id, pocketName, store);
        spawned.push(pocketName);
        logger.info(`[AutoCluster] Spawned: ${pocketName} (${region}) reason=${trigger.reason}`);
      }

      if (spawned.length > 0) {
        const event: ScaleEvent = {
          at: new Date(),
          reason: trigger.reason,
          nodesSpawned: spawned.length,
          pocketNames: spawned,
          velocityBytesPerMs: velocity,
          projectedBytesIn24h: projectedBytes,
          timeToThresholdMs: timeToThreshold,
          nodesBefore: pdNodes.length + totalSpawned,
          nodesAfter: pdNodes.length + totalSpawned + spawned.length,
        };
        this.history.push(event);
        if (this.history.length > 100) this.history.shift();

        this.lastSpawnAt = new Date();
        totalSpawned += spawned.length;
        reasons.push(`${trigger.reason} → [${spawned.join(', ')}]`);

        if (trigger.reason === 'hot_node_detected' && trigger.hotNodeId) {
          this.rebalancer.rebalance().catch(e => logger.warn('[AutoCluster] Rebalance error:', e));
        }
      }
    }

    if (avgUtil < this.rules.utilizationHighWatermark) {
      this.thresholdFirstCrossedAt = null;
    }

    if (totalSpawned > 0) {
      logger.info(`[AutoCluster] Spawned ${totalSpawned} node(s): ${reasons.join(' | ')}`);
    } else if (triggers.length === 0) {
      logger.info('[AutoCluster] Cluster healthy — no action needed');
    }

    return { spawned: totalSpawned, reasons, velocityBytesPerMs: velocity };
  }

  private evaluateRules(
    allPdNodes: FabricStorageNode[],
    healthyNodes: FabricStorageNode[],
    avgUtil: number,
  ): Array<{ reason: SpawnReason; hotNodeId?: NodeId }> {
    const triggers: Array<{ reason: SpawnReason; hotNodeId?: NodeId }> = [];
    const now = Date.now();

    if (healthyNodes.length < this.rules.minNodes) {
      triggers.push({ reason: 'below_min_nodes' });
      logger.warn(`[AutoCluster] RULE below_min_nodes: ${healthyNodes.length} < ${this.rules.minNodes}`);
    }

    const unhealthy = allPdNodes.filter(n => !this.isNodeHealthy(n));
    for (const dead of unhealthy) {
      triggers.push({ reason: 'unhealthy_node_replacement' });
      logger.warn(`[AutoCluster] RULE unhealthy_node_replacement: ${(dead.backendConfig as any).pocketName} stale`);
    }

    if (avgUtil >= this.rules.utilizationHighWatermark) {
      if (this.thresholdFirstCrossedAt === null) {
        this.thresholdFirstCrossedAt = now;
        logger.info(`[AutoCluster] Threshold crossed at ${(avgUtil * 100).toFixed(1)}% — recording timestamp`);
      }
      triggers.push({ reason: 'avg_utilization_high' });
      logger.warn(`[AutoCluster] RULE avg_utilization_high: ${(avgUtil * 100).toFixed(1)}% ≥ ${(this.rules.utilizationHighWatermark * 100).toFixed(0)}%`);
    }

    for (const node of healthyNodes) {
      const util = node.capacityBytes > 0 ? node.usedBytes / node.capacityBytes : 0;
      if (util >= this.rules.utilizationPerNodeHighWatermark) {
        triggers.push({ reason: 'hot_node_detected', hotNodeId: node.id });
        logger.warn(`[AutoCluster] RULE hot_node_detected: ${(node.backendConfig as any).pocketName} at ${(util * 100).toFixed(1)}%`);
      }
    }

    return triggers;
  }

  private computeSpawnCount(
    reason: SpawnReason,
    velocity: number,
    currentNodeCount: number,
    projectedBytes: number,
  ): number {
    if (reason === 'below_min_nodes' || reason === 'unhealthy_node_replacement') {
      return Math.min(
        this.rules.minNodes - currentNodeCount,
        this.rules.maxSpawnPerEvent,
        this.rules.maxNodes - currentNodeCount,
      );
    }

    if (velocity <= 0 || projectedBytes <= 0) return 1;

    const nodesNeeded = Math.ceil(projectedBytes / this.rules.capacityBytesPerNode);
    const clamped = Math.max(1, Math.min(nodesNeeded, this.rules.maxSpawnPerEvent, this.rules.maxNodes - currentNodeCount));

    logger.info(
      `[AutoCluster] Velocity spawn calc: projected=${this.formatBytes(projectedBytes)} ` +
      `÷ nodeCapacity=${this.formatBytes(this.rules.capacityBytesPerNode)} ` +
      `= ${nodesNeeded} → clamped to ${clamped}`,
    );
    return clamped;
  }

  private recordSample(sample: UtilizationSample): void {
    this.utilizationHistory.push(sample);
    if (this.utilizationHistory.length > this.MAX_HISTORY_SAMPLES) {
      this.utilizationHistory.shift();
    }
  }

  private computeVelocity(now: number): number {
    const windowStart = now - this.rules.velocitySampleWindowMs;
    const windowSamples = this.utilizationHistory.filter(s => s.timestamp >= windowStart);
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
    const staleThreshold = Date.now() - this.rules.healthCheckStaleMs;
    return node.lastHeartbeat.getTime() > staleThreshold || node.usedBytes === 0;
  }

  private canSpawn(currentCount: number): boolean {
    if (currentCount >= this.rules.maxNodes) return false;
    if (this.lastSpawnAt && Date.now() - this.lastSpawnAt.getTime() < this.rules.cooldownMs) return false;
    return true;
  }

  private nextPocketName(existing: FabricStorageNode[], offset = 0): string {
    const indices = existing
      .map(n => {
        const name: string = (n.backendConfig as any).pocketName ?? '';
        const match = name.match(/fabric-cluster-(\d+)$/);
        return match ? parseInt(match[1], 10) : -1;
      })
      .filter(i => i >= 0);
    const base = indices.length > 0 ? Math.max(...indices) + 1 : 0;
    return `fabric-cluster-${base + offset}`;
  }

  private pickRegion(existing: FabricStorageNode[], offset = 0): string {
    const regions = ['us-east', 'us-west', 'eu-west', 'ap-southeast', 'ap-northeast', 'sa-east'];
    const usedRegions = new Set(existing.map(n => n.region));
    const fresh = regions.filter(r => !usedRegions.has(r));
    if (fresh.length > 0) return fresh[offset % fresh.length];
    return regions[(existing.length + offset) % regions.length];
  }

  private formatVelocity(bytesPerMs: number): string {
    const perSec = bytesPerMs * 1000;
    if (perSec >= 1_073_741_824) return `${(perSec / 1_073_741_824).toFixed(2)} GB/s`;
    if (perSec >= 1_048_576) return `${(perSec / 1_048_576).toFixed(2)} MB/s`;
    if (perSec >= 1024) return `${(perSec / 1024).toFixed(2)} KB/s`;
    return `${perSec.toFixed(0)} B/s`;
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${Math.round(bytes)} B`;
  }

  getStatus() {
    const latest = this.utilizationHistory[this.utilizationHistory.length - 1];
    const velocity = this.computeVelocity(Date.now());
    return {
      running: this.running,
      lastSpawnAt: this.lastSpawnAt,
      cooldownRemainingMs: this.lastSpawnAt
        ? Math.max(0, this.rules.cooldownMs - (Date.now() - this.lastSpawnAt.getTime()))
        : 0,
      thresholdFirstCrossedAt: this.thresholdFirstCrossedAt
        ? new Date(this.thresholdFirstCrossedAt)
        : null,
      currentVelocityBytesPerMs: velocity,
      currentVelocityFormatted: this.formatVelocity(velocity),
      projectedBytesIn24h: velocity * 24 * 60 * 60 * 1000,
      projectedBytesIn24hFormatted: this.formatBytes(velocity * 24 * 60 * 60 * 1000),
      latestSample: latest
        ? {
            timestamp: new Date(latest.timestamp),
            usedBytes: latest.totalUsedBytes,
            capacityBytes: latest.totalCapacityBytes,
            utilizationPercent: latest.totalCapacityBytes > 0
              ? ((latest.totalUsedBytes / latest.totalCapacityBytes) * 100).toFixed(1)
              : '0.0',
          }
        : null,
      rules: this.rules,
      recentHistory: this.history.slice(-10).map(e => ({
        ...e,
        velocityFormatted: this.formatVelocity(e.velocityBytesPerMs),
        projectedFormatted: this.formatBytes(e.projectedBytesIn24h),
        timeToThresholdFormatted: e.timeToThresholdMs !== null
          ? `${(e.timeToThresholdMs / 60_000).toFixed(1)}min`
          : null,
      })),
    };
  }
}
