export type NodeId = string;
export type PocketId = string;
export type VolumeId = string;
export type ObjectId = string;
export type ChunkId = string;

export type CostTier = "hot" | "standard" | "archive";
export type BackendType =
  | "pocket-dimension"
  | "replit-object-storage"
  | "local-fs";
export type VolumeType = "general" | "audio" | "video" | "image" | "document";

export interface FabricStorageNode {
  id: NodeId;
  region: string;
  costTier: CostTier;
  backendType: BackendType;
  backendConfig: Record<string, unknown>;
  /** Rack/host/zone this node belongs to; placement spreads shards across these. */
  failureDomain: string;
  capacityBytes: number;
  usedBytes: number;
  healthy: boolean;
  lastHeartbeat: Date;
  createdAt?: Date;
}

export interface PocketPolicy {
  redundancy?: number;
  regionAffinity?: string[];
  costTier?: CostTier;
  maxSizeBytes?: number;
  /** When set, objects are erasure-coded (k data + m parity) instead of replicated. */
  erasureCoding?: { k: number; m: number };
  /** Enable transparent zstd compression of the object payload (default true). */
  compression?: boolean;
}

export type StorageMode = "replicated" | "erasure-coded" | "segmented";

export interface ErasureShardRef {
  chunkId: ChunkId;
  index: number;
  kind: "data" | "parity";
  nodeId: NodeId;
}

export interface ErasurePlan {
  k: number;
  m: number;
  shardSize: number;
  shards: ErasureShardRef[];
}

/** A reference from a parent object's manifest to one of its segments. */
export interface SegmentRef {
  segmentId: string;
  index: number;
  /** Byte offset of this segment within the reassembled object. */
  byteOffset: number;
  /** Original (decoded) size of this segment in bytes. */
  originalSize: number;
}

/**
 * Describes exactly how an object's bytes were transformed and laid out, so a
 * read can losslessly reverse it (decompress, reassemble, or RS-reconstruct).
 *
 * For "segmented" objects the bytes live in ordered child segments (see
 * `segments`); each segment carries its own manifest describing its codec and
 * replicated/erasure-coded layout.
 */
export interface ObjectManifest {
  storageMode: StorageMode;
  /** "zstd" or "raw". */
  codec: string;
  /** Size of the original (decoded) object in bytes. */
  originalSize: number;
  /** Size of the compressed payload that was chunked/erasure-coded. */
  storedSize: number;
  erasure?: ErasurePlan;
  /** Present only when storageMode === "segmented": ordered segment refs. */
  segments?: SegmentRef[];
}

/** One stored segment of a large object. */
export interface FabricSegment {
  id: string;
  objectId: ObjectId;
  segmentIndex: number;
  byteOffset: number;
  originalSize: number;
  chunkIds: ChunkId[];
  contentHash: string;
  manifest: ObjectManifest;
  createdAt: Date;
}

export interface FabricPocket {
  id: PocketId;
  ownerId: string;
  name: string;
  policy: PocketPolicy;
  createdAt: Date;
  updatedAt: Date;
}

export interface FabricVolume {
  id: VolumeId;
  pocketId: PocketId;
  name: string;
  type: VolumeType;
  createdAt: Date;
}

export interface FabricObject {
  id: ObjectId;
  volumeId: VolumeId;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  chunkIds: ChunkId[];
  contentHash: string;
  manifest?: ObjectManifest;
  createdAt: Date;
}

export interface FabricChunkLocation {
  id: ChunkId;
  objectId: ObjectId;
  nodeIds: NodeId[];
  sizeBytes: number;
  checksum: string;
  refCount: number;
  createdAt: Date;
}
