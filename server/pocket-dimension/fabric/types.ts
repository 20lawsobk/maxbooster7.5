export type PocketId = string;
export type VolumeId = string;
export type ObjectId = string;
export type ChunkId = string;
export type NodeId = string;
export type CostTier = 'premium' | 'standard' | 'archive';
export type BackendType = 'local' | 'replit' | 's3' | 'gcs' | 'minio' | 'pocket-dimension';
export type VolumeType = 'objects' | 'logs' | 'blobs';

export interface PocketPolicy {
  redundancy: number;
  regionAffinity?: string[];
  costTier?: CostTier;
  retentionDays?: number;
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

export interface FabricStorageNode {
  id: NodeId;
  region: string;
  costTier: CostTier;
  backendType: BackendType;
  backendConfig: Record<string, any>;
  capacityBytes: number;
  usedBytes: number;
  healthy: boolean;
  lastHeartbeat: Date;
}

export interface FabricObject {
  id: ObjectId;
  volumeId: VolumeId;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  chunkIds: ChunkId[];
  contentHash: string;
  createdAt: Date;
}

export interface FabricChunkLocation {
  id: ChunkId;
  objectId: ObjectId;
  nodeIds: NodeId[];
  sizeBytes: number;
  checksum: string;
  createdAt: Date;
}

export interface PlacementDecision {
  chunkId: ChunkId;
  nodeIds: NodeId[];
}

export interface FabricStats {
  pockets: number;
  volumes: number;
  objects: number;
  chunks: number;
  nodes: { total: number; healthy: number };
  capacityBytes: number;
  usedBytes: number;
  utilizationPercent: number;
}
