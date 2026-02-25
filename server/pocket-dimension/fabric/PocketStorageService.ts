import { createHash, randomUUID } from 'crypto';
import type { PocketId, VolumeId, ObjectId, ChunkId, NodeId, PocketPolicy, FabricPocket, FabricVolume, FabricObject, FabricStats, VolumeType } from './types.js';
import type { PocketRegistry } from './infra/PocketRegistry.js';
import type { VolumeRegistry } from './infra/VolumeRegistry.js';
import type { ObjectIndex } from './infra/ObjectIndex.js';
import type { ChunkIndex } from './infra/ChunkIndex.js';
import type { NodeRegistry } from './infra/NodeRegistry.js';
import type { PlacementStrategy } from './control/PlacementStrategy.js';
import type { ChunkStore } from './storage/ChunkStore.js';
import { logger } from '../../logger.js';

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;

export class PocketStorageService {
  constructor(
    private pocketRegistry: PocketRegistry,
    private volumeRegistry: VolumeRegistry,
    private objectIndex: ObjectIndex,
    private chunkIndex: ChunkIndex,
    private nodeRegistry: NodeRegistry,
    private placement: PlacementStrategy,
    private chunkStoreFactory: (nodeId: NodeId) => ChunkStore,
  ) {}

  async createPocket(ownerId: string, name: string, policy: Partial<PocketPolicy> = {}): Promise<FabricPocket> {
    const fullPolicy: PocketPolicy = { redundancy: 1, costTier: 'standard', ...policy };
    return this.pocketRegistry.createPocket(ownerId, name, fullPolicy);
  }

  async getPocket(pocketId: PocketId): Promise<FabricPocket | null> {
    return this.pocketRegistry.getPocket(pocketId);
  }

  async listPockets(ownerId: string): Promise<FabricPocket[]> {
    return this.pocketRegistry.listPockets(ownerId);
  }

  async createVolume(pocketId: PocketId, name: string, type: VolumeType = 'objects'): Promise<FabricVolume> {
    const pocket = await this.pocketRegistry.getPocket(pocketId);
    if (!pocket) throw new Error(`Pocket ${pocketId} not found`);
    return this.volumeRegistry.createVolume(pocketId, name, type);
  }

  async listVolumes(pocketId: PocketId): Promise<FabricVolume[]> {
    return this.volumeRegistry.listVolumes(pocketId);
  }

  async putObject(
    pocketId: PocketId,
    volumeId: VolumeId,
    data: Buffer,
    originalName: string,
    contentType = 'application/octet-stream',
  ): Promise<ObjectId> {
    const pocket = await this.pocketRegistry.getPocket(pocketId);
    if (!pocket) throw new Error(`Pocket ${pocketId} not found`);

    const volume = await this.volumeRegistry.getVolume(volumeId);
    if (!volume || volume.pocketId !== pocketId) throw new Error(`Volume ${volumeId} not found in pocket ${pocketId}`);

    const objectId = randomUUID() as ObjectId;
    const contentHash = createHash('sha256').update(data).digest('hex');

    interface ChunkMeta { id: ChunkId; nodeIds: NodeId[]; sizeBytes: number; checksum: string; }
    const chunkMetas: ChunkMeta[] = [];

    for (let offset = 0; offset < data.length; offset += DEFAULT_CHUNK_SIZE) {
      const chunk = data.subarray(offset, Math.min(offset + DEFAULT_CHUNK_SIZE, data.length));
      const chunkId = randomUUID() as ChunkId;
      const chunkChecksum = createHash('sha256').update(chunk).digest('hex');

      const decision = await this.placement.placeChunk(chunkId, chunk.length, pocket.policy);

      await Promise.all(decision.nodeIds.map(async nodeId => {
        const store = this.chunkStoreFactory(nodeId);
        await store.putChunk(chunkId, chunk);
      }));

      chunkMetas.push({ id: chunkId, nodeIds: decision.nodeIds, sizeBytes: chunk.length, checksum: chunkChecksum });

      await Promise.all(decision.nodeIds.map(async nodeId => {
        const node = await this.nodeRegistry.getNode(nodeId);
        if (node) await this.nodeRegistry.updateNode(nodeId, { usedBytes: node.usedBytes + chunk.length });
      }));
    }

    const chunkIds = chunkMetas.map(c => c.id);

    const obj = await this.objectIndex.putObject(volumeId, originalName, contentType, data.length, chunkIds, contentHash, objectId);

    await Promise.all(chunkMetas.map(meta =>
      this.chunkIndex.putChunkLocation({
        id: meta.id,
        objectId: obj.id,
        nodeIds: meta.nodeIds,
        sizeBytes: meta.sizeBytes,
        checksum: meta.checksum,
      })
    ));

    logger.info(`[PocketFabric] Stored object ${obj.id} (${data.length} bytes, ${chunkIds.length} chunks) in pocket=${pocketId} volume=${volumeId}`);
    return obj.id;
  }

  async getObject(objectId: ObjectId): Promise<{ data: Buffer; object: FabricObject } | null> {
    const obj = await this.objectIndex.getObject(objectId);
    if (!obj) return null;

    const chunkLocations = await this.chunkIndex.getManyChunkLocations(obj.chunkIds);

    const buffers: Buffer[] = [];
    for (const chunkId of obj.chunkIds) {
      const loc = chunkLocations.get(chunkId);
      if (!loc || loc.nodeIds.length === 0) {
        throw new Error(`Chunk ${chunkId} has no known nodes — data may be lost`);
      }

      let retrieved = false;
      for (const nodeId of loc.nodeIds) {
        try {
          const store = this.chunkStoreFactory(nodeId);
          const chunk = await store.getChunk(chunkId);
          buffers.push(chunk);
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

    return { data: Buffer.concat(buffers), object: obj };
  }

  async deleteObject(objectId: ObjectId): Promise<void> {
    const obj = await this.objectIndex.getObject(objectId);
    if (!obj) return;

    const chunkLocations = await this.chunkIndex.getManyChunkLocations(obj.chunkIds);

    await Promise.all(obj.chunkIds.map(async chunkId => {
      const loc = chunkLocations.get(chunkId);
      if (loc) {
        await Promise.all(loc.nodeIds.map(async nodeId => {
          try {
            const store = this.chunkStoreFactory(nodeId);
            await store.deleteChunk(chunkId);
            const node = await this.nodeRegistry.getNode(nodeId);
            if (node) await this.nodeRegistry.updateNode(nodeId, { usedBytes: Math.max(0, node.usedBytes - loc.sizeBytes) });
          } catch {}
        }));
        await this.chunkIndex.deleteChunkLocation(chunkId);
      }
    }));

    await this.objectIndex.deleteObject(objectId);
    logger.info(`[PocketFabric] Deleted object ${objectId}`);
  }

  async listObjects(volumeId: VolumeId): Promise<FabricObject[]> {
    return this.objectIndex.listObjects(volumeId);
  }

  async getStats(): Promise<FabricStats> {
    const nodes = await this.nodeRegistry.listAllNodes();
    const healthyNodes = nodes.filter(n => n.healthy);
    const totalCapacity = nodes.reduce((s, n) => s + n.capacityBytes, 0);
    const totalUsed = nodes.reduce((s, n) => s + n.usedBytes, 0);
    return {
      pockets: 0,
      volumes: 0,
      objects: 0,
      chunks: 0,
      nodes: { total: nodes.length, healthy: healthyNodes.length },
      capacityBytes: totalCapacity,
      usedBytes: totalUsed,
      utilizationPercent: totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : 0,
    };
  }
}
