import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  bigint,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ============================================================================
// USER STORAGE
// ============================================================================

export const userStorage = pgTable("user_storage", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  storagePrefix: text("storage_prefix").notNull(),
  totalBytes: bigint("total_bytes", { mode: "number" }).notNull().default(0),
  compressedBytes: bigint("compressed_bytes", { mode: "number" })
    .notNull()
    .default(0),
  fileCount: integer("file_count").notNull().default(0),
  quotaBytes: bigint("quota_bytes", { mode: "number" })
    .notNull()
    .default(5368709120),
  isActive: boolean("is_active").notNull().default(true),
  encryptionKeyHash: text("encryption_key_hash"),
  lastAccessedAt: timestamp("last_accessed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserStorageSchema = createInsertSchema(userStorage).omit({
  id: true,
});
export type InsertUserStorage = z.infer<typeof insertUserStorageSchema>;
export type UserStorage = typeof userStorage.$inferSelect;

export const userStorageFiles = pgTable("user_storage_files", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  storageId: integer("storage_id").notNull(),
  fileName: text("file_name").notNull(),
  fileKey: text("file_key").notNull().unique(),
  mimeType: text("mime_type"),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
  compressedSize: bigint("compressed_size", { mode: "number" })
    .notNull()
    .default(0),
  contentHash: text("content_hash"),
  folder: text("folder").notNull().default("uploads"),
  isPublic: boolean("is_public").notNull().default(false),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserStorageFilesSchema = createInsertSchema(
  userStorageFiles,
).omit({ id: true });
export type InsertUserStorageFile = z.infer<
  typeof insertUserStorageFilesSchema
>;
export type UserStorageFile = typeof userStorageFiles.$inferSelect;

// ============================================================================
// FABRIC STORAGE INFRASTRUCTURE
// ============================================================================

export const fabricStorageNodes = pgTable("fabric_storage_nodes", {
  id: text("id").primaryKey(),
  region: text("region").notNull(),
  costTier: text("cost_tier").notNull().default("standard"),
  backendType: text("backend_type").notNull().default("pocket-dimension"),
  backendConfig: jsonb("backend_config").notNull().default({}),
  // Failure domain (rack/host/zone) this node belongs to. Cross-domain placement
  // spreads an object's shards across distinct domains so a single domain loss
  // never takes more than one shard of a stripe. Real isolation only materializes
  // once nodes run on separate hosts; the model makes durability honest regardless.
  failureDomain: text("failure_domain").notNull().default("default"),
  capacityBytes: bigint("capacity_bytes", { mode: "number" }).notNull(),
  usedBytes: bigint("used_bytes", { mode: "number" }).notNull().default(0),
  healthy: boolean("healthy").notNull().default(true),
  lastHeartbeat: timestamp("last_heartbeat").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFabricStorageNodeSchema =
  createInsertSchema(fabricStorageNodes);
export type InsertFabricStorageNode = z.infer<
  typeof insertFabricStorageNodeSchema
>;
export type FabricStorageNode = typeof fabricStorageNodes.$inferSelect;

export const fabricPockets = pgTable("fabric_pockets", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  policy: jsonb("policy").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFabricPocketSchema = createInsertSchema(fabricPockets);
export type InsertFabricPocket = z.infer<typeof insertFabricPocketSchema>;
export type FabricPocket = typeof fabricPockets.$inferSelect;

export const fabricVolumes = pgTable("fabric_volumes", {
  id: text("id").primaryKey(),
  pocketId: text("pocket_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("general"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFabricVolumeSchema = createInsertSchema(fabricVolumes);
export type InsertFabricVolume = z.infer<typeof insertFabricVolumeSchema>;
export type FabricVolume = typeof fabricVolumes.$inferSelect;

export const fabricObjects = pgTable(
  "fabric_objects",
  {
    id: text("id").primaryKey(),
    volumeId: text("volume_id").notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    chunkIds: jsonb("chunk_ids").notNull().default([]),
    contentHash: text("content_hash").notNull(),
    manifest: jsonb("manifest").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // listObjects(volumeId) and getObjectByName(volumeId, originalName) are
    // request-path lookups; without this they full-scan fabric_objects.
    index("fabric_objects_volume_idx").on(t.volumeId),
    index("fabric_objects_volume_name_idx").on(t.volumeId, t.originalName),
  ],
);

export const insertFabricObjectSchema = createInsertSchema(fabricObjects);
export type InsertFabricObject = z.infer<typeof insertFabricObjectSchema>;
export type FabricObject = typeof fabricObjects.$inferSelect;

export const fabricChunks = pgTable(
  "fabric_chunks",
  {
    id: text("id").primaryKey(),
    objectId: text("object_id").notNull(),
    nodeIds: jsonb("node_ids").notNull().default([]),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksum: text("checksum").notNull(),
    // Number of live object references to this content-addressed chunk. Physical
    // bytes are only freed (and node usage decremented) when this reaches zero, so
    // deduped chunks shared across volumes/owners survive until the last reference.
    refCount: integer("ref_count").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // getChunksByObject(objectId) is on the delete/repair path; index it so it
    // never full-scans the chunk table.
    index("fabric_chunks_object_idx").on(t.objectId),
    // GIN index over the node_ids JSONB array powers "which chunks live on node X"
    // (drain/scrub) via a `@>` containment query instead of a full table scan.
    index("fabric_chunks_node_ids_gin_idx").using("gin", t.nodeIds),
  ],
);

export const insertFabricChunkSchema = createInsertSchema(fabricChunks);
export type InsertFabricChunk = z.infer<typeof insertFabricChunkSchema>;
export type FabricChunk = typeof fabricChunks.$inferSelect;

// Large objects are split into ordered segments (64–256 MB each). Each segment
// is independently compressed and chunked/erasure-coded, and carries its own
// manifest so it can be retrieved and repaired on its own. The parent object's
// chunkIds still aggregates every segment's chunk ids, so refcount GC,
// reconciliation, and deletion operate unchanged on the object row.
export const fabricSegments = pgTable(
  "fabric_segments",
  {
    id: text("id").primaryKey(),
    objectId: text("object_id").notNull(),
    // Position of this segment within the object (0-based, contiguous).
    segmentIndex: integer("segment_index").notNull(),
    // Byte offset of this segment's first byte in the reassembled object.
    byteOffset: bigint("byte_offset", { mode: "number" }).notNull(),
    // Size of this segment's original (decoded) bytes.
    originalSize: bigint("original_size", { mode: "number" }).notNull(),
    chunkIds: jsonb("chunk_ids").notNull().default([]),
    contentHash: text("content_hash").notNull(),
    manifest: jsonb("manifest").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Segments are always fetched (and deleted) by their owning object, ordered
    // by segmentIndex; index the lookup so it never full-scans.
    index("fabric_segments_object_idx").on(t.objectId, t.segmentIndex),
  ],
);

export const insertFabricSegmentSchema = createInsertSchema(fabricSegments);
export type InsertFabricSegment = z.infer<typeof insertFabricSegmentSchema>;
export type FabricSegment = typeof fabricSegments.$inferSelect;

// ============================================================================
// REDIS-LIKE INSTANCES
// ============================================================================

export const redisInstances = pgTable("redis_instances", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  token: text("token").notNull().unique(),
  pocketId: text("pocket_id").notNull(),
  maxKeys: integer("max_keys").notNull().default(0),
  keyCount: integer("key_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
});

export const insertRedisInstanceSchema = createInsertSchema(
  redisInstances,
).omit({ id: true });
export type InsertRedisInstance = z.infer<typeof insertRedisInstanceSchema>;
export type RedisInstance = typeof redisInstances.$inferSelect;

// ============================================================================
// DATASET DISCOVERY & DOWNLOADS
// ============================================================================

export const discoveredDatasets = pgTable("discovered_datasets", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull().unique(),
  source: text("source").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  downloadUrl: text("download_url"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  category: text("category").notNull().default("music"),
  tags: jsonb("tags").notNull().default([]),
  license: text("license"),
  author: text("author"),
  likes: integer("likes").default(0),
  downloads: integer("downloads").default(0),
  isDownloaded: boolean("is_downloaded").notNull().default(false),
  isQueued: boolean("is_queued").notNull().default(false),
  discoveredAt: timestamp("discovered_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
});

export const datasetDownloads = pgTable("dataset_downloads", {
  id: serial("id").primaryKey(),
  datasetId: integer("dataset_id").notNull(),
  status: text("status").notNull().default("pending"),
  pdimKey: text("pdim_key"),
  sizeBytes: bigint("size_bytes", { mode: "number" }).default(0),
  downloadedBytes: bigint("downloaded_bytes", { mode: "number" }).default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================================

export { userStorage as default };
