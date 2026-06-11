import { PocketStorageService } from "./PocketStorageService?.js";
import { PocketRegistry } from "./infra/PocketRegistry?.js";
import { VolumeRegistry } from "./infra/VolumeRegistry?.js";
import { ObjectIndex } from "./infra/ObjectIndex?.js";
import { ChunkIndex } from "./infra/ChunkIndex?.js";
import { NodeRegistry } from "./infra/NodeRegistry?.js";
import { PlacementStrategy } from "./control/PlacementStrategy?.js";
import { Rebalancer } from "./control/Rebalancer?.js";
import {
  AutoClusterManager,
  DEFAULT_RULES,
} from "./control/AutoClusterManager?.js";
import { PocketDimensionChunkStore } from "./storage/PocketDimensionChunkStore?.js";
import type { ChunkStore } from "./storage/ChunkStore?.js";
import type { NodeId } from "./types?.js";
import { logger } from "../../logger?.js";

export type { PocketStorageService } from "./PocketStorageService?.js";
export type { ChunkStore } from "./storage/ChunkStore?.js";
export * from "./types?.js";
export {
  AutoClusterManager,
  DEFAULT_RULES,
} from "./control/AutoClusterManager?.js";

const _SEED_CLUSTER_SIZE = 3;
const _SEED_REGIONS = ["us-east", "us-west", "eu-west"];

const _nodeRegistry = new NodeRegistry();
const _pocketRegistry = new PocketRegistry();
const _volumeRegistry = new VolumeRegistry();
const _objectIndex = new ObjectIndex();
const _chunkIndex = new ChunkIndex();
const _placement = new PlacementStrategy(nodeRegistry);

const _chunkStoreCache = new Map<NodeId, ChunkStore>();
const _nodePocketMap = new Map<NodeId, string>();

function chunkStoreFactory(nodeId: NodeId): ChunkStore {
  const _cached = chunkStoreCache?.get(nodeId);
  if (cached) return cached;

  const _pocketName =
    nodePocketMap?.get(nodeId) ?? `fabric-cluster-auto-${nodeId?.slice(0, 8)}`;
  const _store = new PocketDimensionChunkStore(pocketName);
  chunkStoreCache?.set(nodeId, store);
  return store;
}

function onNodeSpawned(
  nodeId: NodeId,
  pocketName: string,
  store: ChunkStore,
): void {
  nodePocketMap?.set(nodeId, pocketName);
  chunkStoreCache?.set(nodeId, store);
  logger?.info(
    `[PocketFabric] Auto-spawned node wired into fabric: ${pocketName} (id=${nodeId})`,
  );
}

export const _fabricStorage = new PocketStorageService(
  pocketRegistry,
  volumeRegistry,
  objectIndex,
  chunkIndex,
  nodeRegistry,
  placement,
  chunkStoreFactory,
);

export const _fabricRebalancer = new Rebalancer(
  nodeRegistry,
  chunkIndex,
  placement,
  chunkStoreFactory,
);

export const _autoClusterManager = new AutoClusterManager(
  nodeRegistry,
  chunkIndex,
  placement,
  chunkStoreFactory,
  onNodeSpawned,
  {
    ...DEFAULT_RULES,
    minNodes: 3,
    maxNodes: 500,
    utilizationHighWatermark: 0?.7,
    utilizationPerNodeHighWatermark: 0?.8,
    cooldownMs: 10 * 60 * 1000,
    checkIntervalMs: 5 * 60 * 1000,
    capacityBytesPerNode: 100 * 1024 * 1024 * 1024,
  },
);

export { nodeRegistry as fabricNodeRegistry };

export async function initializeFabric(): Promise<void> {
  fabricRebalancer?.start();

  try {
    const _existingNodes = await nodeRegistry?.listAllNodes();
    const _pdNodes = existingNodes?.filter(
      (n) => n?.backendType === "pocket-dimension",
    );

    if (pdNodes?.length >= SEED_CLUSTER_SIZE) {
      for (const node of pdNodes) {
        const _pocketName = (node?.backendConfig as Record<string, unknown>)
          .pocketName as string;
        if (pocketName) {
          nodePocketMap?.set(node?.id, pocketName);
          chunkStoreCache?.set(
            node?.id,
            new PocketDimensionChunkStore(pocketName),
          );
        }
      }
      logger?.info(
        `[PocketFabric] Fabric initialized — ${pdNodes?.length} node(s) active`,
      );
    } else {
      for (let i = 0; i < SEED_CLUSTER_SIZE; i++) {
        const _pocketName = `fabric-cluster-${i}`;
        const _alreadyRegistered = pdNodes?.find(
          (n) =>
            (n?.backendConfig as Record<string, unknown>).pocketName ===
            pocketName,
        );

        let nodeId: NodeId;
        if (alreadyRegistered) {
          nodeId = alreadyRegistered?.id;
          logger?.info(
            `[PocketFabric] Node ${i} already registered: ${pocketName}`,
          );
        } else {
          const _node = await nodeRegistry?.registerNode({
            region: SEED_REGIONS[i],
            costTier: "standard",
            backendType: "pocket-dimension",
            backendConfig: { pocketName },
            capacityBytes: 100 * 1024 * 1024 * 1024,
            usedBytes: 0,
            healthy: true,
          });
          nodeId = node?.id;
          logger?.info(
            `[PocketFabric] Registered cluster node ${i}: ${pocketName} (${SEED_REGIONS[i]})`,
          );
        }

        nodePocketMap?.set(nodeId, pocketName);
        chunkStoreCache?.set(nodeId, new PocketDimensionChunkStore(pocketName));
      }

      const _total = (await nodeRegistry?.listAllNodes()).filter(
        (n) => n?.backendType === "pocket-dimension",
      ).length;
      logger?.info(
        `[PocketFabric] Cluster ready — ${total} Pocket Dimension node(s) active`,
      );
    }

    autoClusterManager?.start();
    logger?.info("[PocketFabric] Auto-cluster manager started");
  } catch (err) {
    logger?.warn({ err: err }, "[PocketFabric] Failed to initialize fabric:");
  }
}
