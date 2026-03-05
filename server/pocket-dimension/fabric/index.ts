import { PocketStorageService } from './PocketStorageService.js';
import { PocketRegistry } from './infra/PocketRegistry.js';
import { VolumeRegistry } from './infra/VolumeRegistry.js';
import { ObjectIndex } from './infra/ObjectIndex.js';
import { ChunkIndex } from './infra/ChunkIndex.js';
import { NodeRegistry } from './infra/NodeRegistry.js';
import { PlacementStrategy } from './control/PlacementStrategy.js';
import { Rebalancer } from './control/Rebalancer.js';
import { PocketDimensionChunkStore } from './storage/PocketDimensionChunkStore.js';
import type { ChunkStore } from './storage/ChunkStore.js';
import type { NodeId } from './types.js';
import { logger } from '../../logger.js';

export type { PocketStorageService } from './PocketStorageService.js';
export type { ChunkStore } from './storage/ChunkStore.js';
export * from './types.js';

const CLUSTER_SIZE = 3;
const CLUSTER_REGIONS = ['us-east', 'us-west', 'eu-west'];
const CLUSTER_NODE_NAMES = Array.from({ length: CLUSTER_SIZE }, (_, i) => `fabric-cluster-${i}`);

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

export { nodeRegistry as fabricNodeRegistry };

export async function initializeFabric(): Promise<void> {
  fabricRebalancer.start();

  try {
    const existingNodes = await nodeRegistry.listHealthyNodes();

    const pdNodes = existingNodes.filter(n => n.backendType === 'pocket-dimension');

    if (pdNodes.length >= CLUSTER_SIZE) {
      for (const node of pdNodes) {
        const pocketName = (node.backendConfig as any).pocketName as string;
        if (pocketName) {
          nodePocketMap.set(node.id, pocketName);
          chunkStoreCache.set(node.id, new PocketDimensionChunkStore(pocketName));
        }
      }
      logger.info(`[PocketFabric] Fabric initialized — ${pdNodes.length} node(s) active`);
      return;
    }

    for (let i = 0; i < CLUSTER_SIZE; i++) {
      const pocketName = CLUSTER_NODE_NAMES[i];
      const alreadyRegistered = existingNodes.find(
        n => n.backendType === 'pocket-dimension' && (n.backendConfig as any).pocketName === pocketName
      );

      let nodeId: NodeId;

      if (alreadyRegistered) {
        nodeId = alreadyRegistered.id;
        logger.info(`[PocketFabric] Node ${i} already registered: ${pocketName}`);
      } else {
        const node = await nodeRegistry.registerNode({
          region: CLUSTER_REGIONS[i],
          costTier: 'standard',
          backendType: 'pocket-dimension',
          backendConfig: { pocketName },
          capacityBytes: 100 * 1024 * 1024 * 1024,
          usedBytes: 0,
          healthy: true,
        });
        nodeId = node.id;
        logger.info(`[PocketFabric] Registered cluster node ${i}: ${pocketName} (${CLUSTER_REGIONS[i]})`);
      }

      nodePocketMap.set(nodeId, pocketName);
      chunkStoreCache.set(nodeId, new PocketDimensionChunkStore(pocketName));
    }

    const totalNodes = (await nodeRegistry.listHealthyNodes()).filter(n => n.backendType === 'pocket-dimension').length;
    logger.info(`[PocketFabric] Cluster ready — ${totalNodes} Pocket Dimension node(s) active`);
  } catch (err) {
    logger.error('[PocketFabric] Failed to initialize fabric:', err);
  }
}
