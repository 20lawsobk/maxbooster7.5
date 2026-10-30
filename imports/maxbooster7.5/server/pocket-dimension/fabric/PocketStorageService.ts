import { createHash, randomUUID } from "crypto";
import type {
  PocketId,
  VolumeId,
  ObjectId,
  ChunkId,
  NodeId,
  PocketPolicy,
  FabricPocket,
  FabricVolume,
  FabricObject,
  FabricStats,
  VolumeType,
} from "./types.js";
import type { PocketRegistry } from "./infra/PocketRegistry.js";
import type { VolumeRegistry } from "./infra/VolumeRegistry.js";
import type { ObjectIndex } from "./infra/ObjectIndex.js";
import type { ChunkIndex } from "./infra/ChunkIndex.js";
import type { NodeRegistry } from "./infra/NodeRegistry.js";
import type { PlacementStrategy } from "./control/PlacementStrategy.js";
import type { ChunkStore } from "./storage/ChunkStore.js";
import { compressionRouter } from "./compression/CompressionProfileRouter.js";
import { cdcChunker } from "./compression/ContentDefinedChunker.js";
import { isContainer } from "./compression/ContainerFormat.js";
import type { StoreOptions } from "./compression/types.js";
import { logger } from "../../logger.js";
import { DeletionOutbox, withFabricCatalogLock } from "./infra/DeletionOutbox.js";


export class PocketStorageService {
  private readonly deletionOutbox = new DeletionOutbox();
  constructor(
    private pocketRegistry: PocketRegistry,
    private volumeRegistry: VolumeRegistry,
    private objectIndex: ObjectIndex,
    private chunkIndex: ChunkIndex,
    private nodeRegistry: NodeRegistry,
    private placement: PlacementStrategy,
    private chunkStoreFactory: (nodeId: NodeId) => ChunkStore,
  ) {}

  async createPocket(
    ownerId: string,
    name: string,
    policy: Partial<PocketPolicy> = {},
  ): Promise<FabricPocket> {
    const fullPolicy: PocketPolicy = {
      redundancy: 1,
      costTier: "standard",
      ...policy,
    };
    return this.pocketRegistry.createPocket(ownerId, name, fullPolicy);
  }

  async getPocket(pocketId: PocketId): Promise<FabricPocket | null> {
    return this.pocketRegistry.getPocket(pocketId);
  }

  async listPockets(ownerId: string): Promise<FabricPocket[]> {
    return this.pocketRegistry.listPockets(ownerId);
  }

  async createVolume(
    pocketId: PocketId,
    name: string,
    type: VolumeType = "objects",
  ): Promise<FabricVolume> {
    const pocket = await this.pocketRegistry.getPocket(pocketId);
    if (!pocket) throw new Error(`Pocket ${pocketId} not found`);
    return this.volumeRegistry.createVolume(pocketId, name, type);
  }

  async listVolumes(pocketId: PocketId): Promise<FabricVolume[]> {
    return this.volumeRegistry.listVolumes(pocketId);
  }

  async getVolume(volumeId: VolumeId): Promise<FabricVolume | null> { return this.volumeRegistry.getVolume(volumeId); }
  async getObjectMetadata(objectId: ObjectId): Promise<FabricObject | null> { return this.objectIndex.getObject(objectId); }

  async putObject(
    pocketId: PocketId,
    volumeId: VolumeId,
    data: Buffer,
    originalName: string,
    contentType = "application/octet-stream",
    storeOpts: StoreOptions = {},
  ): Promise<ObjectId> {
    return withFabricCatalogLock(async () => {
      await this.drainPendingDeletionsLocked();
      try { return await this.putObjectLocked(pocketId, volumeId, data, originalName, contentType, storeOpts); }
      catch (error) {
        try { await this.drainPendingDeletionsLocked(); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], "Fabric write failed; cleanup retained for retry"); }
        throw error;
      }
    });
  }

  private async putObjectLocked(
    pocketId: PocketId, volumeId: VolumeId, data: Buffer, originalName: string,
    contentType: string, storeOpts: StoreOptions,
  ): Promise<ObjectId> {
    const pocket = await this.pocketRegistry.getPocket(pocketId);
    if (!pocket) throw new Error(`Pocket ${pocketId} not found`);

    const volume = await this.volumeRegistry.getVolume(volumeId);
    if (!volume || volume?.pocketId !== pocketId)
      throw new Error(`Volume ${volumeId} not found in pocket ${pocketId}`);

    const contentHash = createHash("sha256").update(data).digest("hex");

    const existingObjects = await this.objectIndex.listObjects(volumeId);
    const duplicate = existingObjects?.find(
      (o) => o?.contentHash === contentHash,
    );
    if (duplicate) {
      logger.info(
        `[PocketFabric] Dedup hit: object ${duplicate?.id} already stores hash ${contentHash?.substring(0, 12)}… — skipping store`,
      );
      return duplicate?.id;
    }

    // versionOf must name a real, independently-retrievable object — the
    // router itself no longer caches version bases in memory, so this is
    // the only place a prior version's bytes come from. A missing/bad id
    // degrades to a full (non-delta) store rather than failing the write.
    let priorVersionData: Buffer | undefined;
    if (storeOpts.versionOf) {
      const prior = await this.getObjectLocked(storeOpts.versionOf as ObjectId);
      if (prior) {
        priorVersionData = prior.data;
      } else {
        logger.warn(
          `[PocketFabric] versionOf=${storeOpts.versionOf} does not resolve to a real object — storing ${originalName} as a full version`,
        );
      }
    }

    const compressionResult = await compressionRouter?.process(
      data,
      originalName,
      contentType,
      {
        ...storeOpts,
        sizeHintBytes: data.length,
      },
      priorVersionData,
    );

    const containerBytes = compressionRouter.encodeForStorage(compressionResult);

    logger.info(
      `[PocketFabric] Compressed ${originalName}: ${data?.length} → ${compressionResult?.compressedBytes} bytes ` +
        `(${compressionResult.ratio.toFixed(2)}×) profile=${compressionResult.profile} codec=${compressionResult?.codec} ` +
        `container=${containerBytes.length} bytes`,
    );

    const cdcChunks = cdcChunker?.chunk(containerBytes);

    const objectId = randomUUID() as ObjectId;
    await this.deletionOutbox.beginWrite(objectId);

    interface ChunkMeta {
      id: ChunkId;
      nodeIds: NodeId[];
      sizeBytes: number;
      checksum: string;
      isDedup: boolean;
      physicalKeys?: Record<NodeId, string>;
    }
    const chunkMetas: ChunkMeta[] = [];

    for (const cdcChunk of cdcChunks) {
      const chunkId = cdcChunk?.hash as ChunkId;
      const chunkChecksum = cdcChunk?.hash;

      const repeated = chunkMetas.find(meta => meta.id === chunkId);
      if (repeated) { chunkMetas.push({ ...repeated, isDedup: true }); continue; }

      const existingLoc = await this.chunkIndex.getChunkLocation(chunkId);
      if (existingLoc) {
        logger.debug(
          `[PocketFabric] Chunk dedup: ${chunkId?.substring(0, 12)}… already stored`,
        );
        chunkMetas?.push({
          id: chunkId,
          nodeIds: existingLoc.nodeIds,
          sizeBytes: cdcChunk.length,
          checksum: chunkChecksum,
          isDedup: true,
          physicalKeys: existingLoc.physicalKeys,
        });
        continue;
      }

      const decision = await this.placement.placeChunk(
        chunkId,
        cdcChunk?.length,
        pocket?.policy,
      );
      const ordinal = chunkMetas.length;
      const physicalKeys = Object.fromEntries(decision.nodeIds.map(node => [node, `${chunkId}.${randomUUID()}`]));
      await this.deletionOutbox.stageWriteChunk(objectId, ordinal, chunkId, decision.nodeIds, cdcChunk.data.length, physicalKeys);

      const stored = await Promise.allSettled(
        decision?.nodeIds.map(async (nodeId) => {
          const store = this.chunkStoreFactory(nodeId);
          await store?.putChunk(physicalKeys[nodeId], cdcChunk?.data);
          await this.deletionOutbox.creditWriteNode(objectId, ordinal, nodeId, cdcChunk.data.length);
        }),
      );
      const failed = stored.filter(result => result.status === "rejected");
      if (failed.length) throw new AggregateError(failed.map(result => result.reason), "Fabric chunk write failed");

      chunkMetas?.push({
        id: chunkId,
        nodeIds: decision.nodeIds,
        sizeBytes: cdcChunk.data.length,
        checksum: chunkChecksum,
        isDedup: false,
        physicalKeys,
      });
    }

    const chunkIds = chunkMetas?.map((c) => c?.id);

    const obj = await this.objectIndex.putObjectWithChunks(
      volumeId,
      originalName,
      contentType,
      data?.length,
      chunkIds,
      contentHash,
      objectId,
      chunkMetas,
      compressionResult.isDelta ? compressionResult.deltaBaseId : undefined,
    );

    const dedupCount = chunkMetas?.filter((c) => c?.isDedup).length;
    const newCount = chunkMetas?.filter((c) => !c?.isDedup).length;

    logger.info(
      `[PocketFabric] Stored ${obj?.id} — ${data?.length} bytes raw → ${containerBytes?.length} compressed ` +
        `(${compressionResult?.ratio.toFixed(2)}×) — ${cdcChunks?.length} CDC chunks ` +
        `(${newCount} new, ${dedupCount} deduped) in pocket=${pocketId}`,
    );

    return obj?.id;
  }

  async getObject(
    objectId: ObjectId,
  ): Promise<{ data: Buffer; object: FabricObject } | null> {
    return withFabricCatalogLock(() => this.getObjectLocked(objectId));
  }

  private async getObjectLocked(objectId: ObjectId): Promise<{ data: Buffer; object: FabricObject } | null> {
    const obj = await this.objectIndex.getObject(objectId);
    if (!obj) return null;

    const chunkLocations = await this.chunkIndex.getManyChunkLocations(
      obj?.chunkIds,
    );

    const buffers: Buffer[] = [];
    for (const chunkId of obj?.chunkIds ?? []) {
      const loc = chunkLocations?.get(chunkId);
      if (!loc || loc?.nodeIds.length === 0) {
        throw new Error(
          `Chunk ${chunkId} has no known nodes — data may be lost`,
        );
      }

      let retrieved = false;
      for (const nodeId of loc?.nodeIds ?? []) {
        try {
          const store = this.chunkStoreFactory(nodeId);
          const chunk = await store?.getChunk(loc.physicalKeys?.[nodeId] ?? chunkId);
          buffers?.push(chunk);
          retrieved = true;
          break;
        } catch {
          continue;
        }
      }
      if (!retrieved) {
        throw new Error(`Failed to retrieve chunk ${chunkId} from any replica`);
      }
    }

    const containerBytes = Buffer.concat(buffers);

    if (!isContainer(containerBytes)) {
      // Every object written by putObject is wrapped in the compression
      // container envelope. Bytes that aren't a recognized container can't
      // be safely decompressed — returning them as-is would silently hand
      // back raw compressed (or corrupt) bytes as if they were the real
      // content, which is worse than failing loudly.
      throw new Error(
        `Object ${objectId} is not a recognized compression container — cannot decompress. ` +
          `It may have been written by a path that bypassed putObject's compression pipeline.`,
      );
    }

    const resolveDeltaBase = async (deltaBaseId: string): Promise<Buffer> => {
      const base = await this.getObjectLocked(deltaBaseId as ObjectId);
      if (!base) {
        throw new Error(
          `Delta base object ${deltaBaseId} not found — cannot reconstruct ${objectId}`,
        );
      }
      return base.data;
    };

    const data = await compressionRouter.decodeFromStorage(
      containerBytes,
      resolveDeltaBase,
    );

    return { data, object: obj };
  }

  async deleteObject(objectId: ObjectId): Promise<void> {
    return withFabricCatalogLock(() => this.deleteObjectLocked(objectId));
  }

  private async deleteObjectLocked(objectId: ObjectId): Promise<void> {
    const object = await this.deletionOutbox.claim(objectId);
    if (!object) return;
    const errors: unknown[] = [];
    for (const chunkId of new Set(object.chunkIds)) {
      try {
        await this.deletionOutbox.drainClaimedChunk(chunkId, (nodeId, physicalKey) => this.chunkStoreFactory(nodeId).deleteChunk(physicalKey ?? chunkId));
      } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Fabric deletion remains pending");
    await this.deletionOutbox.finish(objectId);
  }

  async drainPendingDeletions(): Promise<void> {
    return withFabricCatalogLock(() => this.drainPendingDeletionsLocked());
  }

  private async drainPendingDeletionsLocked(): Promise<void> {
    const errors: unknown[] = [];
    for (const objectId of await this.deletionOutbox.pendingObjects()) {
      try { await this.deleteObjectLocked(objectId); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Fabric deletion remains pending");
  }

  async listObjects(volumeId: VolumeId): Promise<FabricObject[]> {
    return this.objectIndex.listObjects(volumeId);
  }

  async getStats(): Promise<FabricStats> {
    const nodes = await this.nodeRegistry.listAllNodes();
    const healthyNodes = nodes?.filter((n) => n?.healthy);
    const totalCapacity = nodes?.reduce((s, n) => s + n?.capacityBytes, 0);
    const totalUsed = nodes?.reduce((s, n) => s + n?.usedBytes, 0);
    return {
      pockets: 0,
      volumes: 0,
      objects: 0,
      chunks: 0,
      nodes: { total: nodes.length, healthy: healthyNodes.length },
      capacityBytes: totalCapacity,
      usedBytes: totalUsed,
      utilizationPercent:
        totalCapacity > 0 ? (totalUsed / (totalCapacity || 1)) * 100 : 0,
    };
  }
}
