import { PocketStorageService } from "./PocketStorageService.js";
import { PocketRegistry } from "./infra/PocketRegistry.js";
import { VolumeRegistry } from "./infra/VolumeRegistry.js";
import { ObjectIndex } from "./infra/ObjectIndex.js";
import { ChunkIndex } from "./infra/ChunkIndex.js";
import { SegmentIndex } from "./infra/SegmentIndex.js";
import { NodeRegistry } from "./infra/NodeRegistry.js";
import { PlacementStrategy } from "./control/PlacementStrategy.js";
import { Rebalancer } from "./control/Rebalancer.js";
import { ScrubService } from "./control/ScrubService.js";
import {
  AutoClusterManager,
  DEFAULT_RULES,
} from "./control/AutoClusterManager.js";
import { PocketDimensionChunkStore } from "./storage/PocketDimensionChunkStore.js";
import { LocalFsChunkStore } from "./storage/LocalFsChunkStore.js";
import { ReplitChunkStore } from "./storage/ReplitChunkStore.js";
import type { ChunkStore } from "./storage/ChunkStore.js";
import type { BackendType, NodeId } from "./types.js";
import { logger } from "../../logger.js";

export type { PocketStorageService } from "./PocketStorageService.js";
export type { ChunkStore } from "./storage/ChunkStore.js";
export * from "./types.js";
export {
  AutoClusterManager,
  DEFAULT_RULES,
} from "./control/AutoClusterManager.js";

const SEED_CLUSTER_SIZE = 3;

/**
 * Distinct failure domains the seed cluster spreads across. With ≥ k+m domains,
 * cross-domain placement guarantees no two shards of a stripe share a domain, so
 * losing an entire domain costs at most one shard per object.
 */
const FAILURE_DOMAINS = ["domain-0", "domain-1", "domain-2"] as const;

/**
 * Cluster-wide chunk backend for NEW nodes. Set
 * FABRIC_BACKEND=replit-object-storage to make seeded and auto-spawned nodes
 * persist chunks in Replit Object Storage (a cloud bucket) instead of the local
 * container disk. Existing nodes keep whatever backend the registry records;
 * only newly created nodes follow this default.
 */
const CLUSTER_BACKEND: BackendType =
  process.env["FABRIC_BACKEND"] === "replit-object-storage"
    ? "replit-object-storage"
    : "pocket-dimension";

const nodeRegistry = new NodeRegistry();
const pocketRegistry = new PocketRegistry();
const volumeRegistry = new VolumeRegistry();
const objectIndex = new ObjectIndex();
const chunkIndex = new ChunkIndex();
const segmentIndex = new SegmentIndex();
const placement = new PlacementStrategy(nodeRegistry);

const chunkStoreCache = new Map<NodeId, ChunkStore>();
const nodePocketMap = new Map<NodeId, string>();

/**
 * Per-node backend descriptor, populated from the node registry at init (and
 * whenever a node is spawned). The chunk-store factory is synchronous, so it
 * reads the right backend from this map rather than re-querying the DB.
 */
interface NodeBackend {
  backendType: BackendType;
  backendConfig: Record<string, unknown>;
}
const nodeBackendMap = new Map<NodeId, NodeBackend>();

/**
 * Build the ChunkStore for a node from its backend descriptor. This is the
 * single place that maps a node's `backendType` + `backendConfig` to a concrete
 * storage driver, so a node can be backed by PocketDimension, the local
 * filesystem, or Replit Object Storage — durability is per-node, not hardcoded
 * to one backend.
 */
function buildStore(nodeId: NodeId, meta: NodeBackend | undefined): ChunkStore {
  const backendType = meta?.backendType ?? "pocket-dimension";
  const cfg = meta?.backendConfig ?? {};
  switch (backendType) {
    case "local-fs": {
      const baseDir =
        (cfg["baseDir"] as string | undefined) ?? `./fabric-fs/${nodeId}`;
      return new LocalFsChunkStore(baseDir);
    }
    case "replit-object-storage": {
      const namespace =
        (cfg["namespace"] as string | undefined) ??
        (cfg["pocketName"] as string | undefined) ??
        nodeId;
      return new ReplitChunkStore(namespace);
    }
    case "pocket-dimension":
    default: {
      const pocketName =
        (cfg["pocketName"] as string | undefined) ??
        nodePocketMap.get(nodeId) ??
        `fabric-cluster-auto-${nodeId.slice(0, 8)}`;
      nodePocketMap.set(nodeId, pocketName);
      return new PocketDimensionChunkStore(pocketName);
    }
  }
}

function chunkStoreFactory(nodeId: NodeId): ChunkStore {
  const cached = chunkStoreCache.get(nodeId);
  if (cached) return cached;
  const store = buildStore(nodeId, nodeBackendMap.get(nodeId));
  chunkStoreCache.set(nodeId, store);
  return store;
}

function onNodeSpawned(
  nodeId: NodeId,
  pocketName: string,
  store: ChunkStore,
): void {
  nodePocketMap.set(nodeId, pocketName);
  chunkStoreCache.set(nodeId, store);
  nodeBackendMap.set(nodeId, {
    backendType: CLUSTER_BACKEND,
    backendConfig:
      CLUSTER_BACKEND === "replit-object-storage"
        ? { namespace: pocketName }
        : { pocketName },
  });
  logger.info(
    `[PocketFabric] Auto-spawned node wired into fabric: ${pocketName} (id=${nodeId})`,
  );
}

export const fabricStorage = new PocketStorageService(
  pocketRegistry,
  volumeRegistry,
  objectIndex,
  chunkIndex,
  segmentIndex,
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

export const fabricScrubService = new ScrubService(objectIndex, fabricStorage);

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
    utilizationHighWatermark: 0.7,
    utilizationPerNodeHighWatermark: 0.8,
    cooldownMs: 10 * 60 * 1000,
    checkIntervalMs: 5 * 60 * 1000,
    capacityBytesPerNode: 400 * 1024 * 1024 * 1024 * 1024,
  },
  // Safe scale-down: migrate all chunks off a node (and deactivate it) before
  // the cluster manager retires it, so a shrink never drops the last copy.
  (nodeId) => fabricStorage.drainNode(nodeId),
);

export { nodeRegistry as fabricNodeRegistry };

export async function initializeFabric(): Promise<void> {
  fabricRebalancer.start();

  try {
    const existingNodes = await nodeRegistry.listAllNodes();
    const pdNodes = existingNodes.filter(
      (n) => n.backendType === "pocket-dimension",
    );

    // Wire every known node into the backend map so the (synchronous) chunk
    // store factory can build the correct driver per node, regardless of
    // backend type. Non-PD nodes get their store lazily via buildStore().
    for (const node of existingNodes) {
      nodeBackendMap.set(node.id, {
        backendType: node.backendType,
        backendConfig: node.backendConfig,
      });
    }

    if (existingNodes.length >= SEED_CLUSTER_SIZE) {
      for (let i = 0; i < pdNodes.length; i++) {
        const node = pdNodes[i]!;
        const pocketName = (node.backendConfig as any).pocketName as string;
        if (pocketName) {
          nodePocketMap.set(node.id, pocketName);
          chunkStoreCache.set(
            node.id,
            new PocketDimensionChunkStore(pocketName),
          );
        }
        // Backfill failure domains for clusters seeded before domains existed:
        // any node still on the "default" domain gets a distinct one so
        // cross-domain placement has something to spread across.
        if (node.failureDomain === "default") {
          const domain = `domain-${i % FAILURE_DOMAINS.length}`;
          await nodeRegistry.updateNode(node.id, { failureDomain: domain });
          logger.info(
            `[PocketFabric] Assigned failure domain ${domain} to ${pocketName ?? node.id}`,
          );
        }
      }
      logger.info(
        `[PocketFabric] Fabric initialized — ${pdNodes.length} node(s) active`,
      );
    } else {
      for (let i = 0; i < SEED_CLUSTER_SIZE; i++) {
        const pocketName = `fabric-cluster-${i}`;
        const alreadyRegistered = pdNodes.find(
          (n) => (n.backendConfig as any).pocketName === pocketName,
        );

        let nodeId: NodeId;
        if (alreadyRegistered) {
          nodeId = alreadyRegistered.id;
          if (alreadyRegistered.failureDomain === "default") {
            await nodeRegistry.updateNode(nodeId, {
              failureDomain: `domain-${i % FAILURE_DOMAINS.length}`,
            });
          }
          logger.info(
            `[PocketFabric] Node ${i} already registered: ${pocketName}`,
          );
        } else {
          const node = await nodeRegistry.registerNode({
            region: ["us-east", "us-west", "eu-west"][i % 3],
            costTier: "standard",
            backendType: CLUSTER_BACKEND,
            backendConfig:
              CLUSTER_BACKEND === "replit-object-storage"
                ? { namespace: pocketName }
                : { pocketName },
            failureDomain: `domain-${i % FAILURE_DOMAINS.length}`,
            capacityBytes: 400 * 1024 * 1024 * 1024 * 1024,
            usedBytes: 0,
            healthy: true,
          });
          nodeId = node.id;
          logger.info(
            `[PocketFabric] Seeded node ${i}: ${pocketName} ` +
              `(id=${nodeId}, domain=domain-${i % FAILURE_DOMAINS.length})`,
          );
        }

        nodePocketMap.set(nodeId, pocketName);
        chunkStoreCache.set(
          nodeId,
          CLUSTER_BACKEND === "replit-object-storage"
            ? new ReplitChunkStore(pocketName)
            : new PocketDimensionChunkStore(pocketName),
        );
        nodeBackendMap.set(nodeId, {
          backendType: CLUSTER_BACKEND,
          backendConfig:
            CLUSTER_BACKEND === "replit-object-storage"
              ? { namespace: pocketName }
              : { pocketName },
        });
      }
    }

    // Heal accounting on boot: first rebuild chunk reference counts from live
    // objects (GC'ing orphans and migrating pre-refCount rows), then derive
    // per-node usage from the surviving chunks so telemetry starts truthful.
    await fabricStorage.reconcileRefCounts();
    await fabricStorage.reconcileNodeUsage();

    autoClusterManager.start();
    logger.info("[PocketFabric] Auto-cluster manager started");

    fabricScrubService.start();

    startSelfHeartbeat();
  } catch (err) {
    logger.warn("[PocketFabric] Fabric init error (non-fatal):", err);
  }
}

/**
 * Migrate every node not already on Object Storage to the replit-object-storage
 * backend, copying each chunk it holds from its current store into the cloud
 * bucket (namespaced per node). The node keeps its identity, chunk index and
 * refcounts — only the physical bytes move, so no data is lost. Routing is
 * flipped to the new store FIRST, so any chunk written mid-migration lands in
 * Object Storage instead of the abandoned local store.
 */
interface MigrationDetail {
  nodeId: NodeId;
  namespace: string;
  from: string;
  copied: number;
  errors: number;
}

interface MigrationResult {
  nodesMigrated: number;
  chunksCopied: number;
  errors: number;
  details: MigrationDetail[];
}

interface MigrationState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  result: MigrationResult | null;
  error: string | null;
}

let migrationState: MigrationState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  result: null,
  error: null,
};

export function getClusterMigrationState(): MigrationState {
  return migrationState;
}

/**
 * Kick the migration off as a background job and return immediately. The copy
 * can take far longer than an HTTP request timeout, so callers poll
 * getClusterMigrationState() (GET /api/fabric/migrate-backend/status) instead of
 * blocking on the response. Re-entrant calls while a run is in flight are no-ops.
 */
export function startClusterMigration(): {
  started: boolean;
  alreadyRunning: boolean;
} {
  if (migrationState.running) return { started: false, alreadyRunning: true };
  migrationState = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    error: null,
  };
  void runClusterMigration()
    .then((result) => {
      migrationState.result = result;
    })
    .catch((err: unknown) => {
      migrationState.error = (err as Error).message;
    })
    .finally(() => {
      migrationState.running = false;
      migrationState.finishedAt = new Date().toISOString();
    });
  return { started: true, alreadyRunning: false };
}

async function runClusterMigration(): Promise<MigrationResult> {
  const all = await nodeRegistry.listAllNodes();
  // Reconcile EVERY node onto Object Storage. We iterate all nodes (not only
  // those still flagged local) because an interrupted earlier run can leave a
  // node already flagged replit-object-storage while some of its chunks were
  // never uploaded. Those chunks still live in the on-disk pocket (the source is
  // never deleted), so we backfill anything Object Storage is missing.
  let chunksCopied = 0;
  let errors = 0;
  let nodesMigrated = 0;
  const details: MigrationDetail[] = [];

  for (const node of all) {
    const cfg = (node.backendConfig ?? {}) as Record<string, unknown>;
    // The OS namespace equals the source pocket name, so a single value both
    // reconstructs the on-disk source store and addresses the cloud shard set.
    const namespace =
      (cfg["pocketName"] as string | undefined) ??
      (cfg["namespace"] as string | undefined) ??
      node.id;
    const wasObjectStorage = node.backendType === "replit-object-storage";

    const osStore = buildStore(node.id, {
      backendType: "replit-object-storage",
      backendConfig: { namespace },
    });
    // Source is the original on-disk pocket — left intact, so this is safe to
    // re-read on a resumed run.
    const sourceStore = new PocketDimensionChunkStore(namespace);

    const newBackendConfig = {
      namespace,
      migratedFrom: wasObjectStorage
        ? ((cfg["migratedFrom"] as string | undefined) ?? "pocket-dimension")
        : node.backendType,
    };

    // Flip routing to Object Storage FIRST so any write landing mid-copy goes to
    // the cloud store rather than the abandoned local pocket.
    nodeBackendMap.set(node.id, {
      backendType: "replit-object-storage",
      backendConfig: newBackendConfig,
    });
    chunkStoreCache.set(node.id, osStore);
    if (!wasObjectStorage) {
      await nodeRegistry.updateNode(node.id, {
        backendType: "replit-object-storage",
        backendConfig: newBackendConfig,
      });
      nodesMigrated++;
    }

    const chunks = await chunkIndex.listChunksOnNode(node.id);
    let copied = 0;
    let nodeErrors = 0;
    for (const loc of chunks) {
      try {
        if (await osStore.hasChunk(loc.id)) continue;
        const data = await sourceStore.getChunk(loc.id);
        await osStore.putChunk(loc.id, data);
        copied++;
      } catch (err) {
        nodeErrors++;
        logger.warn(
          `[PocketFabric] migrate: chunk ${loc.id} on ${node.id} failed: ${(err as Error).message}`,
        );
      }
    }

    chunksCopied += copied;
    errors += nodeErrors;
    details.push({
      nodeId: node.id,
      namespace,
      from: node.backendType,
      copied,
      errors: nodeErrors,
    });
    logger.info(
      `[PocketFabric] Reconciled node ${node.id} (${namespace}) → object-storage: ` +
        `${copied} chunk(s) copied, ${nodeErrors} error(s)`,
    );
  }

  return { nodesMigrated, chunksCopied, errors, details };
}

let heartbeatTimer: NodeJS.Timeout | null = null;

/**
 * Every node currently runs in THIS process, so this process is the host that
 * must prove they're alive. Periodically heart-beat every node we back locally
 * so heartbeat-based health stays truthful: an idle-but-present node keeps
 * beating (and is NOT reaped as dead), while a node whose host actually dies
 * stops beating and goes stale. Once nodes run on separate hosts, each host runs
 * its own heartbeat for the nodes it backs.
 */
function startSelfHeartbeat(): void {
  if (heartbeatTimer) return;
  const HEARTBEAT_INTERVAL_MS = 60 * 1000;
  const beat = async () => {
    try {
      const nodes = await nodeRegistry.listHealthyNodes();
      for (const node of nodes) {
        if (chunkStoreCache.has(node.id) || nodeBackendMap.has(node.id)) {
          await nodeRegistry.heartbeat(node.id);
        }
      }
    } catch (err) {
      logger.warn("[PocketFabric] Self-heartbeat error:", err);
    }
  };
  heartbeatTimer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
  void beat();
  logger.info("[PocketFabric] Local node self-heartbeat started (60s)");
}
