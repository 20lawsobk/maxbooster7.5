import { createHash, randomUUID } from "crypto";
import type { PocketRegistry } from "./infra/PocketRegistry.js";
import type { VolumeRegistry } from "./infra/VolumeRegistry.js";
import type { ObjectIndex } from "./infra/ObjectIndex.js";
import type { ChunkIndex } from "./infra/ChunkIndex.js";
import type { SegmentIndex } from "./infra/SegmentIndex.js";
import type { NodeRegistry } from "./infra/NodeRegistry.js";
import type { PlacementStrategy } from "./control/PlacementStrategy.js";
import type { ChunkStore } from "./storage/ChunkStore.js";
import type {
  PocketId,
  VolumeId,
  ObjectId,
  ChunkId,
  NodeId,
  FabricObject,
  FabricVolume,
  FabricPocket,
  PocketPolicy,
  VolumeType,
  ObjectManifest,
  ErasureShardRef,
  SegmentRef,
  FabricSegment,
} from "./types.js";
import { ReedSolomon } from "./erasure/ReedSolomon.js";
import { zstdEngine } from "./compression/ZstdEngine.js";
import { logger } from "../../logger.js";

const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB

// Objects larger than this are split into ordered segments, each independently
// compressed and chunked/erasure-coded. Default 64 MB (the low end of the
// 64–256 MB segment range); overridable via FABRIC_SEGMENT_SIZE for testing.
const DEFAULT_SEGMENT_SIZE = (() => {
  const env = Number(process.env["FABRIC_SEGMENT_SIZE"]);
  return Number.isFinite(env) && env > 0 ? env : 64 * 1024 * 1024;
})();

/**
 * A manifest-bearing entity (a whole object, or one segment of a large object)
 * that the erasure retrieve/repair/scrub paths can operate on uniformly. The
 * only differences between an object and a segment, from the EC machinery's
 * point of view, are its id and where its updated manifest is persisted.
 */
interface ManifestHolder {
  id: string;
  manifest: ObjectManifest;
  persistManifest(manifest: ObjectManifest): Promise<void>;
}

// Per owner+pocket serialization for the internal get-or-create container path,
// mirroring the gateway's bucket-resolve lock so concurrent internal writers
// (e.g. the Redis snapshotter) never create duplicate pockets/volumes.
const containerResolveLocks = new Map<string, Promise<void>>();

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export interface StoreObjectOptions {
  chunkSize?: number;
  policy?: PocketPolicy;
}

export interface RetrievedObject {
  data: Buffer;
  object: FabricObject;
}

export class PocketStorageService {
  constructor(
    private readonly pocketRegistry: PocketRegistry,
    private readonly volumeRegistry: VolumeRegistry,
    private readonly objectIndex: ObjectIndex,
    private readonly chunkIndex: ChunkIndex,
    private readonly segmentIndex: SegmentIndex,
    private readonly nodeRegistry: NodeRegistry,
    private readonly placement: PlacementStrategy,
    private readonly chunkStoreFactory: (nodeId: NodeId) => ChunkStore,
  ) {}

  /**
   * Per-chunk in-process mutex. The fabric runs as a single-process singleton,
   * so serializing the (physical-write + index-insert) and (index-release +
   * physical-delete) critical sections per chunk id closes the eager-GC race:
   * a delete that frees a chunk's last reference cannot interleave with a
   * concurrent dedup store of the same chunk, so a live index row can never
   * point at physically deleted bytes.
   */
  private readonly chunkLocks = new Map<ChunkId, Promise<void>>();

  private async withChunkLock<T>(
    chunkId: ChunkId,
    fn: () => Promise<T>,
  ): Promise<T> {
    const prev = this.chunkLocks.get(chunkId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mine = prev.then(() => gate);
    this.chunkLocks.set(chunkId, mine);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.chunkLocks.get(chunkId) === mine) {
        this.chunkLocks.delete(chunkId);
      }
    }
  }

  // ── Pocket management ────────────────────────────────────────────────────

  async createPocket(
    ownerId: string,
    name: string,
    policy: PocketPolicy = {},
  ): Promise<FabricPocket> {
    return this.pocketRegistry.createPocket(ownerId, name, policy);
  }

  async getPocket(id: PocketId): Promise<FabricPocket | null> {
    return this.pocketRegistry.getPocket(id);
  }

  async listPockets(ownerId: string): Promise<FabricPocket[]> {
    return this.pocketRegistry.listPockets(ownerId);
  }

  async deletePocket(id: PocketId): Promise<void> {
    return this.pocketRegistry.deletePocket(id);
  }

  // ── Volume management ────────────────────────────────────────────────────

  async createVolume(
    pocketId: PocketId,
    name: string,
    type: VolumeType = "general",
  ): Promise<FabricVolume> {
    return this.volumeRegistry.createVolume(pocketId, name, type);
  }

  async listVolumes(pocketId: PocketId): Promise<FabricVolume[]> {
    return this.volumeRegistry.listVolumes(pocketId);
  }

  // ── Unified named-object API (the single fabric data path) ────────────────
  // Internal subsystems (dataset downloader, Redis durability layer) and the
  // S3-like gateway all write through this path: every payload becomes a fabric
  // object → chunks with inline compression + erasure coding. No subsystem
  // writes to PocketDimension directly.

  /** Get (or create) a pocket + named volume for an owner, race-safely. */
  async getOrCreateContainer(
    ownerId: string,
    pocketName: string,
    create: boolean,
    volumeName = "root",
  ): Promise<{ pocketId: PocketId; volumeId: VolumeId } | null> {
    if (!create)
      return this.doResolveContainer(ownerId, pocketName, false, volumeName);

    const key = `${ownerId}::${pocketName}::${volumeName}`;
    const prev = containerResolveLocks.get(key) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(() =>
        this.doResolveContainer(ownerId, pocketName, true, volumeName),
      );
    containerResolveLocks.set(
      key,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    try {
      return await next;
    } finally {
      const tail = containerResolveLocks.get(key);
      if (tail) {
        void tail.then(() => {
          if (containerResolveLocks.get(key) === tail)
            containerResolveLocks.delete(key);
        });
      }
    }
  }

  private async doResolveContainer(
    ownerId: string,
    pocketName: string,
    create: boolean,
    volumeName: string,
  ): Promise<{ pocketId: PocketId; volumeId: VolumeId } | null> {
    const pockets = (await this.pocketRegistry.listPockets(ownerId))
      .filter((p) => p.name === pocketName)
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
    let pocket = pockets[0];
    if (!pocket) {
      if (!create) return null;
      pocket = await this.pocketRegistry.createPocket(ownerId, pocketName, {});
    }
    const volumes = (await this.volumeRegistry.listVolumes(pocket.id))
      .filter((v) => v.name === volumeName)
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
    let volume = volumes[0];
    if (!volume) {
      if (!create) return null;
      volume = await this.volumeRegistry.createVolume(
        pocket.id,
        volumeName,
        "general",
      );
    }
    return { pocketId: pocket.id, volumeId: volume.id };
  }

  /**
   * Store a payload under a stable (owner, pocket, name) address through the
   * full fabric path, replacing any prior object with the same name. Chunk
   * reference counting (see {@link deleteObject}) means shards shared between the
   * old and new versions survive the overwrite automatically — the new object's
   * store bumps their refCount before the old object's delete drops it.
   */
  async putNamedObject(
    ownerId: string,
    pocketName: string,
    name: string,
    contentType: string,
    data: Buffer,
    opts: StoreObjectOptions = {},
  ): Promise<FabricObject> {
    const container = await this.getOrCreateContainer(
      ownerId,
      pocketName,
      true,
    );
    if (!container) throw new Error("Failed to resolve fabric container");

    const priorVersions = (
      await this.objectIndex.listObjects(container.volumeId)
    ).filter((o) => o.originalName === name);

    const object = await this.storeObject(
      container.volumeId,
      name,
      contentType,
      data,
      opts,
    );

    for (const old of priorVersions) {
      if (old.id === object.id) continue;
      await this.deleteObject(old.id);
    }
    return object;
  }

  /** Retrieve the latest payload stored under (owner, pocket, name). */
  async getNamedObject(
    ownerId: string,
    pocketName: string,
    name: string,
  ): Promise<Buffer | null> {
    const container = await this.getOrCreateContainer(
      ownerId,
      pocketName,
      false,
    );
    if (!container) return null;
    const object = await this.objectIndex.getObjectByName(
      container.volumeId,
      name,
    );
    if (!object) return null;
    const { data } = await this.retrieveObject(object.id);
    return data;
  }

  // ── Object store / retrieve ───────────────────────────────────────────────

  /** Compress the payload with zstd unless it doesn't help or is disabled. */
  private async compress(
    data: Buffer,
    policy: PocketPolicy,
  ): Promise<{ payload: Buffer; codec: string }> {
    if (policy.compression === false || data.length === 0) {
      return { payload: data, codec: "raw" };
    }
    try {
      const { compressed } = await zstdEngine.compress(data);
      if (compressed.length < data.length) {
        return { payload: compressed, codec: "zstd" };
      }
    } catch (err) {
      logger.warn("[PocketFabric] Compression failed — storing raw:", err);
    }
    return { payload: data, codec: "raw" };
  }

  private async decompress(payload: Buffer, codec: string): Promise<Buffer> {
    return codec === "zstd" ? zstdEngine.decompress(payload) : payload;
  }

  async storeObject(
    volumeId: VolumeId,
    originalName: string,
    contentType: string,
    data: Buffer,
    opts: StoreObjectOptions = {},
  ): Promise<FabricObject> {
    const policy = opts.policy ?? {};

    // Large objects are split into ordered segments, each independently
    // compressed and chunked/erasure-coded, so failures and repairs are scoped
    // to a single segment rather than the whole object.
    if (data.length > DEFAULT_SEGMENT_SIZE) {
      return this.storeSegmented(
        volumeId,
        originalName,
        contentType,
        data,
        policy,
        opts.chunkSize ?? DEFAULT_CHUNK_SIZE,
      );
    }

    const contentHash = sha256(data);
    const { payload, codec } = await this.compress(data, policy);

    const { chunkIds, manifest } = await this.writePayload(
      payload,
      codec,
      data.length,
      policy,
      opts.chunkSize ?? DEFAULT_CHUNK_SIZE,
    );

    const object = await this.objectIndex.putObject(
      volumeId,
      originalName,
      contentType,
      data.length,
      chunkIds,
      contentHash,
      manifest,
    );
    logger.info(
      `[PocketFabric] Stored ${originalName} (${data.length} B → ${payload.length} B ${codec}) ` +
        `${manifest.storageMode} → ${chunkIds.length} chunk(s)`,
    );
    return object;
  }

  // ── Segmented layout (object split into independently stored segments) ─────

  private async storeSegmented(
    volumeId: VolumeId,
    originalName: string,
    contentType: string,
    data: Buffer,
    policy: PocketPolicy,
    chunkSize: number,
  ): Promise<FabricObject> {
    const contentHash = sha256(data);
    // Create the parent object first so segments can reference its id.
    const objectId = randomUUID();

    const segmentRefs: SegmentRef[] = [];
    const allChunkIds: ChunkId[] = [];
    let storedSize = 0;
    let segIndex = 0;

    for (let offset = 0; offset < data.length; offset += DEFAULT_SEGMENT_SIZE) {
      const segBytes = data.subarray(offset, offset + DEFAULT_SEGMENT_SIZE);
      const segHash = sha256(segBytes);
      const { payload, codec } = await this.compress(segBytes, policy);
      const { chunkIds, manifest } = await this.writePayload(
        payload,
        codec,
        segBytes.length,
        policy,
        chunkSize,
      );

      const segment = await this.segmentIndex.putSegment(
        objectId,
        segIndex,
        offset,
        segBytes.length,
        chunkIds,
        segHash,
        manifest,
      );
      segmentRefs.push({
        segmentId: segment.id,
        index: segIndex,
        byteOffset: offset,
        originalSize: segBytes.length,
      });
      // Aggregate every segment's chunk ids onto the parent object so refcount
      // GC, boot reconciliation, and deletion all operate on the object row
      // unchanged — segments need no special-casing in those paths.
      allChunkIds.push(...chunkIds);
      storedSize += manifest.storedSize;
      segIndex++;
    }

    const parentManifest: ObjectManifest = {
      storageMode: "segmented",
      codec: "segmented",
      originalSize: data.length,
      storedSize,
      segments: segmentRefs,
    };

    const object = await this.objectIndex.putObject(
      volumeId,
      originalName,
      contentType,
      data.length,
      allChunkIds,
      contentHash,
      parentManifest,
      objectId,
    );

    logger.info(
      `[PocketFabric] Stored ${originalName} (${data.length} B) segmented → ` +
        `${segmentRefs.length} segment(s), ${allChunkIds.length} chunk(s)`,
    );
    return object;
  }

  // ── Payload writers (shared by whole-object and per-segment storage) ───────

  /**
   * Persist a single compressed payload as either replicated chunks or
   * erasure-coded shards (per policy) and return its chunk ids plus the manifest
   * describing the layout. Used both for small whole objects and for each
   * segment of a large object.
   */
  private async writePayload(
    payload: Buffer,
    codec: string,
    originalSize: number,
    policy: PocketPolicy,
    chunkSize: number,
  ): Promise<{ chunkIds: ChunkId[]; manifest: ObjectManifest }> {
    if (policy.erasureCoding) {
      return this.writeErasureCoded(payload, codec, originalSize, policy);
    }
    return this.writeReplicated(
      payload,
      codec,
      originalSize,
      policy,
      chunkSize,
    );
  }

  // ── Replicated layout (compressed payload split into replicated chunks) ────

  private async writeReplicated(
    payload: Buffer,
    codec: string,
    originalSize: number,
    policy: PocketPolicy,
    chunkSize: number,
  ): Promise<{ chunkIds: ChunkId[]; manifest: ObjectManifest }> {
    const chunks: { id: ChunkId; data: Buffer }[] = [];
    for (let offset = 0; offset < payload.length; offset += chunkSize) {
      const slice = payload.subarray(offset, offset + chunkSize);
      chunks.push({ id: sha256(slice), data: slice });
    }
    // Zero-length payloads still produce one empty chunk so reads round-trip.
    if (chunks.length === 0) {
      const empty = Buffer.alloc(0);
      chunks.push({ id: sha256(empty), data: empty });
    }

    const chunkIds: ChunkId[] = [];
    for (const chunk of chunks) {
      const decision = await this.placement.placeChunk(
        chunk.id,
        chunk.data.length,
        policy,
      );
      await this.withChunkLock(chunk.id, async () => {
        for (const nodeId of decision.nodeIds) {
          const store = this.chunkStoreFactory(nodeId);
          const exists = await store.hasChunk(chunk.id).catch(() => false);
          if (!exists) {
            await store.putChunk(chunk.id, chunk.data);
            await this.nodeRegistry.addUsedBytes(nodeId, chunk.data.length);
          }
        }
        await this.chunkIndex.putChunkLocation({
          id: chunk.id,
          objectId: "",
          nodeIds: decision.nodeIds,
          sizeBytes: chunk.data.length,
          checksum: chunk.id,
        });
      });
      chunkIds.push(chunk.id);
    }

    const manifest: ObjectManifest = {
      storageMode: "replicated",
      codec,
      originalSize,
      storedSize: payload.length,
    };
    return { chunkIds, manifest };
  }

  // ── Erasure-coded layout (Reed–Solomon k data + m parity shards) ──────────

  private async writeErasureCoded(
    payload: Buffer,
    codec: string,
    originalSize: number,
    policy: PocketPolicy,
  ): Promise<{ chunkIds: ChunkId[]; manifest: ObjectManifest }> {
    const { k, m } = policy.erasureCoding!;
    const rs = new ReedSolomon(k, m);
    const { shards, shardSize } = await rs.encode(payload);

    const nodeIds = await this.placement.placeShards(k + m, policy);

    // Each shard is an independent write to a distinct node, guarded by a
    // per-chunk lock, and node usage is updated via an atomic SQL increment — so
    // the k+m shard PUTs are safe to run concurrently. Doing so collapses the
    // per-object store latency from the sum of all shard round-trips to the
    // slowest single one (the dominant cost when writing to Object Storage).
    const placed = await Promise.all(
      shards.map(async (shard, i) => {
        // Each shard gets a per-index id. Shards must NOT be content-addressed
        // by hash alone: with low k (e.g. k=1) Reed–Solomon parity shards can be
        // byte-identical to the data shard, and distinct shards are deliberately
        // placed on distinct nodes. A pure-hash id would collide, clobbering one
        // shard's location row (and leaking its node's usage). Suffixing the
        // shard index keeps every shard a distinct, addressable chunk.
        const contentHash = sha256(shard);
        const chunkId = `${contentHash}.${i}`;
        const nodeId = nodeIds[i]!;
        await this.withChunkLock(chunkId, async () => {
          const store = this.chunkStoreFactory(nodeId);
          const exists = await store.hasChunk(chunkId).catch(() => false);
          if (!exists) {
            await store.putChunk(chunkId, shard);
            await this.nodeRegistry.addUsedBytes(nodeId, shard.length);
          }
          await this.chunkIndex.putChunkLocation({
            id: chunkId,
            objectId: "",
            nodeIds: [nodeId],
            sizeBytes: shard.length,
            checksum: contentHash,
          });
        });
        const ref: ErasureShardRef = {
          chunkId,
          index: i,
          kind: i < k ? "data" : "parity",
          nodeId,
        };
        return { chunkId, ref };
      }),
    );

    // Promise.all preserves input order, so shard indices stay aligned.
    const chunkIds: ChunkId[] = placed.map((p) => p.chunkId);
    const shardRefs: ErasureShardRef[] = placed.map((p) => p.ref);

    const manifest: ObjectManifest = {
      storageMode: "erasure-coded",
      codec,
      originalSize,
      storedSize: payload.length,
      erasure: { k, m, shardSize, shards: shardRefs },
    };
    return { chunkIds, manifest };
  }

  /** Wrap a whole object as a ManifestHolder for the shared EC machinery. */
  private holderForObject(object: FabricObject): ManifestHolder {
    return {
      id: object.id,
      manifest: object.manifest!,
      persistManifest: (m) => this.objectIndex.updateManifest(object.id, m),
    };
  }

  /** Wrap a single segment as a ManifestHolder for the shared EC machinery. */
  private holderForSegment(segment: FabricSegment): ManifestHolder {
    return {
      id: segment.id,
      manifest: segment.manifest,
      persistManifest: (m) => this.segmentIndex.updateManifest(segment.id, m),
    };
  }

  async retrieveObject(objectId: ObjectId): Promise<RetrievedObject> {
    const object = await this.objectIndex.getObject(objectId);
    if (!object) throw new Error(`Object ${objectId} not found`);

    const manifest = object.manifest;

    if (manifest?.storageMode === "segmented") {
      const data = await this.retrieveSegmented(object, manifest);
      return { data, object };
    }

    const data = await this.retrievePayload(
      object.chunkIds,
      manifest,
      manifest ? this.holderForObject(object) : undefined,
    );
    return { data, object };
  }

  /**
   * Reassemble a segmented object by retrieving each segment in byte-offset
   * order and concatenating the decoded bytes. Each segment self-heals
   * independently via its own ManifestHolder.
   */
  private async retrieveSegmented(
    object: FabricObject,
    manifest: ObjectManifest,
  ): Promise<Buffer> {
    const refs = manifest.segments;
    // A segmented object with no segment refs is a corrupt manifest, not an
    // empty object — fail fast rather than silently returning empty bytes.
    if (!refs || refs.length === 0) {
      throw new Error(
        `Segmented object ${object.id} has no segment refs (corrupt manifest)`,
      );
    }

    const segments = await this.segmentIndex.getSegmentsByObject(object.id);
    // Every referenced segment must exist; a count mismatch means a segment row
    // was lost, so reassembly would silently truncate the object.
    if (segments.length !== refs.length) {
      throw new Error(
        `Segmented object ${object.id} expects ${refs.length} segment(s) but ` +
          `found ${segments.length} (corrupt or partially deleted)`,
      );
    }
    const byId = new Map(segments.map((s) => [s.id, s]));
    const ordered = [...refs].sort((a, b) => a.byteOffset - b.byteOffset);
    const parts: Buffer[] = [];
    for (const ref of ordered) {
      const segment = byId.get(ref.segmentId);
      if (!segment) {
        throw new Error(
          `Segment ${ref.segmentId} of object ${object.id} not found`,
        );
      }
      parts.push(
        await this.retrievePayload(
          segment.chunkIds,
          segment.manifest,
          this.holderForSegment(segment),
        ),
      );
    }
    return Buffer.concat(parts).subarray(0, manifest.originalSize);
  }

  /**
   * Retrieve and decode a single payload (whole small object or one segment),
   * dispatching on its manifest's storage mode. Erasure-coded payloads
   * self-heal through the supplied holder.
   */
  private async retrievePayload(
    chunkIds: ChunkId[],
    manifest: ObjectManifest | undefined,
    holder: ManifestHolder | undefined,
  ): Promise<Buffer> {
    if (manifest?.storageMode === "erasure-coded" && manifest.erasure) {
      const payload = await this.retrieveErasureCoded(holder!, manifest);
      const data = await this.decompress(payload, manifest.codec);
      return data.subarray(0, manifest.originalSize);
    }

    // Replicated (or legacy objects with no manifest).
    const payload = await this.retrieveReplicated(chunkIds);
    const codec = manifest?.codec ?? "raw";
    const data = await this.decompress(payload, codec);
    return manifest ? data.subarray(0, manifest.originalSize) : data;
  }

  private async retrieveReplicated(chunkIds: ChunkId[]): Promise<Buffer> {
    const chunkLocations =
      await this.chunkIndex.getManyChunkLocations(chunkIds);
    const parts: Buffer[] = [];
    for (const chunkId of chunkIds) {
      const loc = chunkLocations.get(chunkId);
      if (!loc || loc.nodeIds.length === 0) {
        throw new Error(`No location found for chunk ${chunkId}`);
      }
      let data: Buffer | null = null;
      for (const nodeId of loc.nodeIds) {
        const store = this.chunkStoreFactory(nodeId);
        try {
          data = await store.getChunk(chunkId);
          break;
        } catch {
          // try next replica
        }
      }
      if (!data)
        throw new Error(`Chunk ${chunkId} unavailable on all replicas`);
      parts.push(data);
    }
    return Buffer.concat(parts);
  }

  private async retrieveErasureCoded(
    holder: ManifestHolder,
    manifest: ObjectManifest,
  ): Promise<Buffer> {
    const { k, m, shards } = manifest.erasure!;
    const rs = new ReedSolomon(k, m);
    const slots: (Buffer | null)[] = new Array(k + m).fill(null);
    const missing: ErasureShardRef[] = [];
    let recovered = 0;

    for (const ref of shards) {
      const store = this.chunkStoreFactory(ref.nodeId);
      try {
        slots[ref.index] = await store.getChunk(ref.chunkId);
        recovered++;
      } catch {
        slots[ref.index] = null; // shard lost — RS will reconstruct it
        missing.push(ref);
      }
    }

    if (recovered < k) {
      throw new Error(
        `Object unrecoverable: only ${recovered}/${k + m} shards available (need ${k})`,
      );
    }

    if (recovered < k + m) {
      logger.warn(
        `[PocketFabric] Reconstructing object from ${recovered}/${k + m} shards ` +
          `(${k + m - recovered} lost) via Reed–Solomon`,
      );
    }

    const dataShards = await rs.reconstructData(slots);

    // Read-repair: now that we can reconstruct, write the lost shards back onto
    // healthy nodes (in distinct failure domains) so redundancy is restored
    // before another failure compounds. Best-effort — never fails the read.
    if (missing.length > 0) {
      try {
        await this.repairMissingShards(holder, manifest, dataShards, missing);
      } catch (err) {
        logger.error(
          `[PocketFabric] Read-repair failed for ${holder.id}:`,
          err,
        );
      }
    }

    return Buffer.concat(dataShards).subarray(0, manifest.storedSize);
  }

  /**
   * Rebuild the given missing erasure shards from the reconstructed data shards
   * and re-place each on a healthy node, preferring failure domains the
   * surviving shards do not already occupy. Updates the chunk index and the
   * object's manifest shard refs, then persists the manifest. Shared by
   * read-repair (T004) and the background scrubber (T005).
   */
  private async repairMissingShards(
    holder: ManifestHolder,
    manifest: ObjectManifest,
    dataShards: Buffer[],
    missing: ErasureShardRef[],
  ): Promise<void> {
    const { shards } = manifest.erasure!;
    // Re-encoding the reconstructed data shards deterministically reproduces the
    // full k+m shard set (data shards are already shardSize-aligned), so every
    // rebuilt shard is byte-identical to the original.
    const all = (
      await new ReedSolomon(manifest.erasure!.k, manifest.erasure!.m).encode(
        Buffer.concat(dataShards),
      )
    ).shards;

    const survivingNodeIds = [
      ...new Set(
        shards
          .filter((r) => !missing.some((mm) => mm.index === r.index))
          .map((r) => r.nodeId),
      ),
    ];
    const excludeNodeIds = [...survivingNodeIds];
    const occupiedDomains = await this.domainsForNodes(survivingNodeIds);

    let changed = false;
    for (const ref of missing) {
      const shard = all[ref.index]!;
      const newNodeId = await this.placement.pickReplacementNode({
        sizeBytes: shard.length,
        excludeNodeIds,
        occupiedDomains,
      });
      if (!newNodeId) {
        logger.warn(
          `[PocketFabric] No healthy node to re-place shard ${ref.chunkId}; ` +
            `redundancy still degraded`,
        );
        continue;
      }
      const checksum = sha256(shard);
      await this.withChunkLock(ref.chunkId, async () => {
        const store = this.chunkStoreFactory(newNodeId);
        const exists = await store.hasChunk(ref.chunkId).catch(() => false);
        if (!exists) {
          await store.putChunk(ref.chunkId, shard);
          await this.nodeRegistry.addUsedBytes(newNodeId, shard.length);
        }
        await this.chunkIndex.updateChunkLocation({
          id: ref.chunkId,
          objectId: "",
          nodeIds: [newNodeId],
          sizeBytes: shard.length,
          checksum,
        });
      });
      ref.nodeId = newNodeId; // mutate manifest shard ref in place
      excludeNodeIds.push(newNodeId);
      const n = await this.nodeRegistry.getNode(newNodeId);
      if (n && !occupiedDomains.includes(n.failureDomain)) {
        occupiedDomains.push(n.failureDomain);
      }
      changed = true;
      logger.info(
        `[PocketFabric] Repaired shard ${ref.chunkId} → node ${newNodeId} ` +
          `(holder ${holder.id})`,
      );
    }

    if (changed) {
      await holder.persistManifest(manifest);
    }
  }

  /** Distinct failure domains currently hosting the given nodes. */
  private async domainsForNodes(nodeIds: NodeId[]): Promise<string[]> {
    const domains = new Set<string>();
    for (const id of nodeIds) {
      const n = await this.nodeRegistry.getNode(id);
      if (n) domains.add(n.failureDomain);
    }
    return [...domains];
  }

  /**
   * Verify and, if needed, repair a single object's shards. Erasure-coded
   * objects are checked shard-by-shard (presence + checksum); any missing or
   * corrupt shard is rebuilt via Reed–Solomon and re-placed, provided ≥ k shards
   * survive. Returns a per-object scrub result.
   */
  async scrubObject(object: FabricObject): Promise<{
    checked: number;
    repaired: number;
    unrecoverable: boolean;
  }> {
    // Segmented objects hold no erasure data of their own — scrub each segment
    // independently and aggregate the results.
    if (object.manifest?.storageMode === "segmented") {
      const segments = await this.segmentIndex.getSegmentsByObject(object.id);
      const total = { checked: 0, repaired: 0, unrecoverable: false };
      for (const segment of segments) {
        const r = await this.scrubHolder(this.holderForSegment(segment));
        total.checked += r.checked;
        total.repaired += r.repaired;
        total.unrecoverable = total.unrecoverable || r.unrecoverable;
      }
      return total;
    }

    return this.scrubHolder(this.holderForObject(object));
  }

  /**
   * Verify and, if needed, repair the erasure shards of a single manifest holder
   * (a whole object or one segment). Replicated/legacy holders are a no-op.
   */
  private async scrubHolder(holder: ManifestHolder): Promise<{
    checked: number;
    repaired: number;
    unrecoverable: boolean;
  }> {
    const manifest = holder.manifest;
    if (!manifest?.erasure) {
      return { checked: 0, repaired: 0, unrecoverable: false };
    }

    const { k, m, shards } = manifest.erasure;
    const rs = new ReedSolomon(k, m);
    const slots: (Buffer | null)[] = new Array(k + m).fill(null);
    const missing: ErasureShardRef[] = [];

    // Prefer the authoritative checksum recorded in the chunk index at write
    // time. Deriving it from the chunkId suffix is only a fallback: a legacy id
    // without a ".<index>" suffix has lastIndexOf(".") === -1, which would slice
    // off the last character and falsely flag an intact shard as corrupt.
    const locs = await this.chunkIndex.getManyChunkLocations(
      shards.map((r) => r.chunkId),
    );

    for (const ref of shards) {
      const store = this.chunkStoreFactory(ref.nodeId);
      let buf: Buffer | null = null;
      try {
        buf = await store.getChunk(ref.chunkId);
      } catch {
        buf = null;
      }
      const dot = ref.chunkId.lastIndexOf(".");
      const expected =
        locs.get(ref.chunkId)?.checksum ??
        (dot > 0 ? ref.chunkId.slice(0, dot) : ref.chunkId);
      if (buf && sha256(buf) === expected) {
        slots[ref.index] = buf;
      } else {
        slots[ref.index] = null; // missing or corrupt
        missing.push(ref);
      }
    }

    if (missing.length === 0) {
      return { checked: shards.length, repaired: 0, unrecoverable: false };
    }

    const survivors = slots.filter((s) => s !== null).length;
    if (survivors < k) {
      logger.error(
        `[FabricScrub] Holder ${holder.id} UNRECOVERABLE: only ${survivors}/${k + m} shards intact (need ${k})`,
      );
      return { checked: shards.length, repaired: 0, unrecoverable: true };
    }

    const dataShards = await rs.reconstructData(slots);
    await this.repairMissingShards(holder, manifest, dataShards, missing);
    return {
      checked: shards.length,
      repaired: missing.length,
      unrecoverable: false,
    };
  }

  /**
   * Safely remove a node from service: migrate every chunk it still holds to
   * other healthy nodes (replicated chunks with surviving copies are simply
   * dropped; single-copy chunks are moved), updating the chunk index and any
   * erasure manifests, then mark the node unhealthy. The node is only
   * deactivated if every chunk drained cleanly, so scale-down can never drop the
   * last copy of a chunk.
   */
  async drainNode(
    nodeId: NodeId,
  ): Promise<{ migrated: number; errors: number }> {
    const node = await this.nodeRegistry.getNode(nodeId);
    if (!node) return { migrated: 0, errors: 0 };
    logger.info(`[PocketFabric] Draining node ${nodeId}...`);

    // Map every EC shard chunk → its owning manifest holder + shard ref so a
    // moved shard's manifest pointer can follow it (EC chunk rows carry no
    // objectId). Both whole objects and individual segments can hold shards.
    const allObjects = await this.objectIndex.listAllObjects();
    const shardOwner = new Map<
      ChunkId,
      { holder: ManifestHolder; ref: ErasureShardRef }
    >();
    for (const obj of allObjects) {
      const er = obj.manifest?.erasure;
      if (er) {
        const holder = this.holderForObject(obj);
        for (const ref of er.shards)
          shardOwner.set(ref.chunkId, { holder, ref });
      }
    }
    const allSegments = await this.segmentIndex.listAllSegments();
    for (const seg of allSegments) {
      const er = seg.manifest?.erasure;
      if (er) {
        const holder = this.holderForSegment(seg);
        for (const ref of er.shards)
          shardOwner.set(ref.chunkId, { holder, ref });
      }
    }

    const chunks = await this.chunkIndex.listChunksOnNode(nodeId);
    let migrated = 0;
    let errors = 0;

    for (const chunk of chunks) {
      try {
        await this.withChunkLock(chunk.id, async () => {
          const loc = await this.chunkIndex.getChunkLocation(chunk.id);
          if (!loc || !loc.nodeIds.includes(nodeId)) return;

          // Replicated chunk with other live copies → drop just this replica.
          if (loc.nodeIds.length > 1) {
            const store = this.chunkStoreFactory(nodeId);
            await store.deleteChunk(chunk.id).catch(() => {});
            await this.nodeRegistry.addUsedBytes(nodeId, -loc.sizeBytes);
            await this.chunkIndex.updateChunkLocation({
              ...loc,
              nodeIds: loc.nodeIds.filter((id) => id !== nodeId),
            });
            return;
          }

          // Single copy → must physically move it elsewhere first.
          const owner = shardOwner.get(chunk.id);
          const occupiedDomains = owner
            ? await this.domainsForNodes(
                owner.holder
                  .manifest!.erasure!.shards.filter(
                    (r) => r.chunkId !== chunk.id,
                  )
                  .map((r) => r.nodeId),
              )
            : [];
          const target = await this.placement.pickReplacementNode({
            sizeBytes: loc.sizeBytes,
            excludeNodeIds: [nodeId],
            occupiedDomains,
          });
          if (!target) {
            throw new Error(`no eligible target to drain chunk ${chunk.id}`);
          }

          const fromStore = this.chunkStoreFactory(nodeId);
          const toStore = this.chunkStoreFactory(target);
          const data = await fromStore.getChunk(chunk.id);
          await toStore.putChunk(chunk.id, data);
          await this.chunkIndex.updateChunkLocation({
            ...loc,
            nodeIds: [target],
          });
          await fromStore.deleteChunk(chunk.id).catch(() => {});
          await this.nodeRegistry.addUsedBytes(nodeId, -loc.sizeBytes);
          await this.nodeRegistry.addUsedBytes(target, loc.sizeBytes);

          if (owner) {
            owner.ref.nodeId = target;
            await owner.holder.persistManifest(owner.holder.manifest);
          }
        });
        migrated++;
      } catch (err) {
        logger.error(
          `[PocketFabric] Drain: failed to migrate chunk ${chunk.id}:`,
          err,
        );
        errors++;
      }
    }

    if (errors === 0) {
      await this.nodeRegistry.updateNode(nodeId, { healthy: false });
      logger.info(
        `[PocketFabric] Node ${nodeId} drained (${migrated} chunk(s)) and deactivated`,
      );
    } else {
      logger.warn(
        `[PocketFabric] Node ${nodeId} drain incomplete: ${errors} error(s); left active`,
      );
    }
    return { migrated, errors };
  }

  /**
   * Delete an object and free the physical bytes of any chunk whose LAST
   * reference it held.
   *
   * Chunks are content-addressed and deduped globally (a single chunk may be
   * shared by many objects across different volumes/owners). Each object holds
   * one reference per chunk id it lists; deleting the object releases those
   * references and only frees physical bytes for chunks that drop to zero
   * references. This is authoritative and global, so it can never delete a chunk
   * another volume still depends on.
   */
  async deleteObject(objectId: ObjectId): Promise<void> {
    // Atomically claim (delete) the object row FIRST. Under concurrent deletes
    // of the same object only one caller gets the row back; everyone else gets
    // null and no-ops, so a chunk reference is released exactly once and shared
    // (deduped) chunks can never be double-released / lost.
    const object = await this.objectIndex.deleteObject(objectId);
    if (!object) return;

    // Release chunk references (and free physical bytes for any chunk whose last
    // reference this object held) FIRST. The parent object aggregates every
    // segment's chunk ids, so this is the authoritative cleanup; it must run
    // before segment-row deletion so a DB error dropping segment metadata can
    // never strand storage or leak refcounts.
    for (const chunkId of object.chunkIds) {
      await this.withChunkLock(chunkId, async () => {
        const { deleted, loc } = await this.chunkIndex.releaseChunk(chunkId);
        if (deleted && loc) {
          for (const nodeId of loc.nodeIds) {
            const store = this.chunkStoreFactory(nodeId);
            await store.deleteChunk(chunkId).catch(() => {});
            await this.nodeRegistry.addUsedBytes(nodeId, -loc.sizeBytes);
          }
        }
      });
    }

    // Drop segment metadata rows last (if any). Physical bytes are already freed
    // above; these rows only carry per-segment manifests.
    if (object.manifest?.storageMode === "segmented") {
      await this.segmentIndex.deleteSegmentsByObject(object.id);
    }
  }

  async listObjects(volumeId: VolumeId): Promise<FabricObject[]> {
    return this.objectIndex.listObjects(volumeId);
  }

  /**
   * Durability policy for a write, honest about the current cluster: target
   * Reed–Solomon 4+2, but cap k+m to the number of healthy nodes (and fall back
   * to replication below 3 nodes) so we never claim more redundancy than the
   * fabric physically has.
   */
  async recommendedPolicy(): Promise<PocketPolicy> {
    const nodes = await this.nodeRegistry.listHealthyNodes();
    if (nodes.length < 3) {
      return { compression: true, redundancy: Math.min(nodes.length, 2) || 1 };
    }
    const targetK = 4;
    const targetM = 2;
    const total = Math.min(targetK + targetM, nodes.length);
    const m = Math.max(1, Math.min(targetM, total - 1));
    const k = total - m;
    return { compression: true, erasureCoding: { k, m } };
  }

  /**
   * Recompute every node's `usedBytes` from the chunk index — the single source
   * of truth for what is physically stored. Nodes holding no chunks are reset to
   * zero. This heals any drift in the incremental counters (e.g. from historical
   * accounting bugs) and keeps per-node telemetry truthful.
   */
  async reconcileNodeUsage(): Promise<void> {
    const usage = await this.chunkIndex.getUsageByNode();
    const nodes = await this.nodeRegistry.listAllNodes();
    for (const node of nodes) {
      await this.nodeRegistry.setUsedBytes(node.id, usage.get(node.id) ?? 0);
    }
  }

  /**
   * Rebuild chunk reference counts from the authoritative set of live objects
   * and garbage-collect any orphaned chunks (no remaining references). Run at
   * boot to heal accounting drift and migrate chunk rows created before
   * reference counting existed. Pair with {@link reconcileNodeUsage} afterwards
   * so per-node usage reflects only surviving chunks.
   */
  async reconcileRefCounts(): Promise<void> {
    const objects = await this.objectIndex.listAllObjects();
    const counts = new Map<ChunkId, number>();
    for (const obj of objects) {
      for (const cid of obj.chunkIds) {
        counts.set(cid, (counts.get(cid) ?? 0) + 1);
      }
    }
    const orphans = await this.chunkIndex.reconcileRefCounts(counts);
    for (const loc of orphans) {
      for (const nodeId of loc.nodeIds) {
        await this.chunkStoreFactory(nodeId)
          .deleteChunk(loc.id)
          .catch(() => {});
      }
    }
    if (orphans.length > 0) {
      logger.info(
        `[PocketFabric] Reconciled refcounts — GC'd ${orphans.length} orphan chunk(s)`,
      );
    }
  }

  async getClusterStats(): Promise<{
    nodes: number;
    totalCapacityBytes: number;
    usedBytes: number;
    utilization: number;
  }> {
    const nodes = await this.nodeRegistry.listHealthyNodes();
    const totalCapacityBytes = nodes.reduce((s, n) => s + n.capacityBytes, 0);
    const usedBytes = nodes.reduce((s, n) => s + n.usedBytes, 0);
    return {
      nodes: nodes.length,
      totalCapacityBytes,
      usedBytes,
      utilization: totalCapacityBytes > 0 ? usedBytes / (totalCapacityBytes || 1) : 0,
    };
  }
}
