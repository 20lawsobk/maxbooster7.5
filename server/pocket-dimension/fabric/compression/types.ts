export type CompressionProfile =
  | 'lossless-max-dedup'
  | 'media-lossy'
  | 'semantic-archive';

export type ContentClass =
  | 'video'
  | 'audio'
  | 'image'
  | 'text'
  | 'json'
  | 'log'
  | 'metrics'
  | 'binary'
  | 'archive'
  | 'unknown';

export interface StoreOptions {
  profile?: CompressionProfile;
  contentType?: string;
  sizeHintBytes?: number;
  versionOf?: string;
  dimensionHint?: string;
  allowLossy?: boolean;
}

export interface CompressionResult {
  data: Buffer;
  profile: CompressionProfile;
  contentClass: ContentClass;
  originalBytes: number;
  compressedBytes: number;
  ratio: number;
  codec: string;
  isDelta: boolean;
  deltaBaseId?: string;
  dictId?: string;
  metadata: Record<string, any>;
}

export interface CdcChunk {
  data: Buffer;
  hash: string;
  offset: number;
  length: number;
}

export interface DeltaOp {
  type: 'copy' | 'insert';
  srcOffset?: number;
  length: number;
  data?: Buffer;
}

export interface VersionEntry {
  objectId: string;
  contentHash: string;
  sizeBytes: number;
  createdAt: Date;
  deltaBaseId?: string;
  isDelta: boolean;
}
