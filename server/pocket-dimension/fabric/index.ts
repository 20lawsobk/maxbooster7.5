import { PocketStorageService } from './PocketStorageService.js';
import { PocketRegistry } from './infra/PocketRegistry.js';
import { VolumeRegistry } from './infra/VolumeRegistry.js';
import { ObjectIndex } from './infra/ObjectIndex.js';
import { ChunkIndex } from './infra/ChunkIndex.js';
import { NodeRegistry } from './infra/NodeRegistry.js';
import { PlacementStrategy } from './control/PlacementStrategy.js';
import { Rebalancer } from './control/Rebalancer.js';
import { LocalFsChunkStore } from './storage/LocalFsChunkStore.js';
import { ReplitChunkStore } from './storage/ReplitChunkStore.js';
import type { ChunkStore } from './storage/ChunkStore.js';
import type { NodeId, BackendType } from './types.js';
import { logger } from '../../logger.js';

export type { PocketStorageService } from './PocketStorageService.js';
export type { ChunkStore } from './storage/ChunkStore.js';
export * from './types.js';

const nodeRegistry = new NodeRegistry();
const pocketRegistry = new PocketRegistry();
const volumeRegistry = new VolumeRegistry();
const objectIndex = new ObjectIndex();
const chunkIndex = new ChunkIndex();
const placement = new PlacementStrategy(nodeRegistry);

function chunkStoreFactory(nodeId: NodeId): ChunkStore {
  const cachedNode = chunkStoreCache.get(nodeId);
  if (cachedNode) return cachedNode;

  const store = new ReplitChunkStore();
  chunkStoreCache.set(nodeId, store);
  return store;
}

const chunkStoreCache = new Map<NodeId, ChunkStore>();

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

  const isProduction = process.env.NODE_ENV === 'production';
  const localFallbackDir = './fabric-chunks';

  try {
    const existingNodes = await nodeRegistry.listHealthyNodes();

    if (existingNodes.length === 0) {
      if (isProduction) {
        await nodeRegistry.registerNode({
          region: process.env.REPLIT_REGION || 'us-east',
          costTier: 'standard',
          backendType: 'replit',
          backendConfig: {},
          capacityBytes: 100 * 1024 * 1024 * 1024,
          usedBytes: 0,
          healthy: true,
        });
        logger.info('[PocketFabric] Registered default Replit Object Storage node');
      } else {
        await nodeRegistry.registerNode({
          region: 'local',
          costTier: 'standard',
          backendType: 'local',
          backendConfig: { baseDir: localFallbackDir },
          capacityBytes: 50 * 1024 * 1024 * 1024,
          usedBytes: 0,
          healthy: true,
        });
        logger.info('[PocketFabric] Registered default local FS node');
      }
    }

    logger.info(`[PocketFabric] Fabric initialized — ${existingNodes.length || 1} node(s) active`);
  } catch (err) {
    logger.error('[PocketFabric] Failed to initialize fabric:', err);
  }
}
