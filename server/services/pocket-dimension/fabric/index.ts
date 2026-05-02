import { PocketStorageService } from './PocketStorageService.js';
import { PocketRegistry } from './infra/PocketRegistry.js';
import { VolumeRegistry } from './infra/VolumeRegistry.js';
import { ObjectIndex } from './infra/ObjectIndex.js';
import { ChunkIndex } from './infra/ChunkIndex.js';
import { NodeRegistry } from './infra/NodeRegistry.js';
import { PlacementStrategy } from './control/PlacementStrategy.js';
import { Rebalancer } from './control/Rebalancer.js';
import { AutoClusterManager, DEFAULT_RULES } from './control/AutoClusterManager.js';
import { PocketDimensionChunkStore } from './storage/PocketDimensionChunkStore.js';
import type { ChunkStore } from './storage/ChunkStore.js';
import type { NodeId } from './types.js';
import { logger } from '../../logger.js';

export type { PocketStorageService } from './PocketStorageService.js';
export type { ChunkStore } from './storage/ChunkStore.js';
export * from './types.js';
export { AutoClusterManager, DEFAULT_RULES } from './control/AutoClusterManager.js';

const SEED_CLUSTER_SIZE = 3;
const SEED_REGIONS = ['us-east', 'us-west', 'eu-west'];

const nodeRegistry = new NodeRegistry();
const pocketRegistry = new PocketRegistry();
const volumeRegistry = new VolumeRegistry();
const objectIndex = new ObjectIndex();
const chunkIndex = new ChunkIndex();
const placement = new PlacementStrategy(nodeRegistry);

const chunkStoreCache = new Map<NodeId, ChunkStore>();
const nodePocketMap = new Map<NodeId, string>();

function chunkStoreFactory(nodeId: NodeId): ChunkStore {
  const cached = chunkStoreCache.get(nodeId);
  if (cached) return cached;

  const pocketName = nodePocketMap.get(nodeId) ?? `fabric-cluster-auto-${nodeId.slice(0, 8)}`;
  const store = new PocketDimensionChunkStore(pocketName);
  chunkStoreCache.set(nodeId, store);
  return store;
}

function onNodeSpawned(nodeId: NodeId, pocketName: string, store: ChunkStore): void {
  nodePocketMap.set(nodeId, pocketName);
  chunkStoreCache.set(nodeId, store);
  logger.info(`[PocketFabric] Auto-spawned node wired into fabric: ${pocketName} (id=${nodeId})`);
}

export const fabricStorage = new PocketStorageService(
  pocketRegistry,
  volumeRegistry,
  objectIndex,
  chunkIndex,
  nodeRegistry,
  placement,
  chunkStoreFactory,
);

export const fabricRebalancer = new Rebalancer(
  nodeRegistry,
  chunkIndex,
  placement,
  chunkStoreFactory,
);

export const autoClusterManager = new AutoClusterManager(
  nodeRegistry,
  chunkIndex,
  placement,
  chunkStoreFactory,
  onNodeSpawned,
  {
    ...DEFAULT_RULES,
    minNodes: 3,
    maxNodes: 20,
    utilizationHighWatermark: 0.70,
    utilizationPerNodeHighWatermark: 0.80,
    cooldownMs: 10 * 60 * 1000,
    checkIntervalMs: 5 * 60 * 1000,
    capacityBytesPerNode: 100 * 1024 * 1024 * 1024,
  },
);

export { nodeRegistry as fabricNodeRegistry };

export async function initializeFabric(): Promise<void> {
  fabricRebalancer.start();

  try {
    const existingNodes = await nodeRegistry.listAllNodes();
    const pdNodes = existingNodes.filter(n => n.backendType === 'pocket-dimension');

    if (pdNodes.length >= SEED_CLUSTER_SIZE) {
      for (const node of pdNodes) {
        const pocketName = (node.backendConfig as Record<string, unknown>).pocketName as string;
        if (pocketName) {
          nodePocketMap.set(node.id, pocketName);
          chunkStoreCache.set(node.id, new PocketDimensionChunkStore(pocketName));
        }
      }
      logger.info(`[PocketFabric] Fabric initialized — ${pdNodes.length} node(s) active`);
    } else {
      for (let i = 0; i < SEED_CLUSTER_SIZE; i++) {
        const pocketName = `fabric-cluster-${i}`;
        const alreadyRegistered = pdNodes.find(
          n => (n.backendConfig as Record<string, unknown>).pocketName === pocketName
        );

        let nodeId: NodeId;
        if (alreadyRegistered) {
          nodeId = alreadyRegistered.id;
          logger.info(`[PocketFabric] Node ${i} already registered: ${pocketName}`);
        } else {
          const node = await nodeRegistry.registerNode({
            region: SEED_REGIONS[i],
            costTier: 'standard',
            backendType: 'pocket-dimension',
            backendConfig: { pocketName },
            capacityBytes: 100 * 1024 * 1024 * 1024,
            usedBytes: 0,
            healthy: true,
          });
          nodeId = node.id;
          logger.info(`[PocketFabric] Registered cluster node ${i}: ${pocketName} (${SEED_REGIONS[i]})`);
        }

        nodePocketMap.set(nodeId, pocketName);
        chunkStoreCache.set(nodeId, new PocketDimensionChunkStore(pocketName));
      }

      const total = (await nodeRegistry.listAllNodes()).filter(n => n.backendType === 'pocket-dimension').length;
      logger.info(`[PocketFabric] Cluster ready — ${total} Pocket Dimension node(s) active`);
    }

    autoClusterManager.start();
    logger.info('[PocketFabric] Auto-cluster manager started');
  } catch (err) {
    logger.error({ err: err }, '[PocketFabric] Failed to initialize fabric:');
  }
}
