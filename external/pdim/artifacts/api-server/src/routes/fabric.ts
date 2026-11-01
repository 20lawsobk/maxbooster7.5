/**
 * FABRIC GATEWAY ROUTES
 *
 * An S3-like object gateway backed by the self-contained Pocket Dimension
 * storage fabric (content-addressed chunks, transparent zstd compression,
 * Reed–Solomon erasure coding, multi-node placement).
 *
 *   bucket  ≈  pocket (one per owner+name), with a single "root" volume
 *   object  ≈  fabric object addressed by its key (originalName)
 *
 * Auth: Authorization: Bearer <token>  (token identifies the owner namespace)
 *
 *   POST   /api/fabric/buckets                          create a bucket
 *   GET    /api/fabric/buckets                          list buckets
 *   PUT    /api/fabric/buckets/:bucket/objects/:key     upload object (raw body)
 *   GET    /api/fabric/buckets/:bucket/objects          list objects
 *   GET    /api/fabric/buckets/:bucket/objects/:key     download object (?versionId= pins a version)
 *   DELETE /api/fabric/buckets/:bucket/objects/:key     delete object (?versionId= deletes one version)
 *   GET    /api/fabric/buckets/:bucket/object-versions/:key   list all versions of a key
 *   GET    /api/fabric/status                           fabric activation status
 *   GET    /api/fabric/nodes                            storage node inventory
 *   GET    /api/fabric/capacity                         truthful logical-vs-raw capacity
 */

import { Router, type Request, type Response } from "express";
import express from "express";
import fs from "fs/promises";
import { sql } from "drizzle-orm";
import { db } from "../lib/db.js";
import { fabricObjects, fabricChunks } from "@workspace/db/schema";
import {
  fabricStorage,
  fabricNodeRegistry,
  fabricScrubService,
  startClusterMigration,
  getClusterMigrationState,
} from "../pocket-dimension/fabric/index.js";
import type { PocketPolicy } from "../pocket-dimension/fabric/index.js";
import { logger } from "../logger.js";

const router = Router();

/**
 * Migrate the live cluster's chunk storage to Replit Object Storage. Copies
 * every chunk off the local-disk backends into the cloud bucket (no data loss)
 * and flips each node's backend to replit-object-storage. Idempotent: nodes
 * already on Object Storage are skipped.
 */
router.post("/migrate-backend", (_req: Request, res: Response): void => {
  const r = startClusterMigration();
  res.status(r.started ? 202 : 409).json({
    ok: r.started,
    ...r,
    state: getClusterMigrationState(),
  });
});

router.get("/migrate-backend/status", (_req: Request, res: Response): void => {
  res.json({ ok: true, ...getClusterMigrationState() });
});

const MAX_OBJECT_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB

// Default durability: Reed–Solomon 4+2 (tolerates 2 lost shards) + zstd.
// Falls back gracefully when the cluster has fewer nodes than k+m.
const DEFAULT_POLICY: PocketPolicy = {
  erasureCoding: { k: 4, m: 2 },
  compression: true,
};

// Per owner+bucket serialization for the check-then-create resolve path.
const bucketResolveLocks = new Map<string, Promise<void>>();

function getOwnerId(req: Request): string {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return token || "anonymous";
}

/**
 * Express 5 captures a `*key` wildcard as an array of (already URL-decoded)
 * path segments. Rejoin them into the full object key.
 */
function extractKey(req: Request): string {
  const raw = (req.params as Record<string, unknown>).key;
  if (Array.isArray(raw)) return raw.join("/");
  return String(raw ?? "");
}

/** Resolve (or create) a bucket → its pocket + root volume. */
async function resolveBucket(
  ownerId: string,
  bucketName: string,
  create: boolean,
): Promise<{ pocketId: string; volumeId: string } | null> {
  // Bucket/volume creation is a check-then-create operation. Concurrent uploads
  // to a brand-new bucket would otherwise each see "not found" and create
  // duplicate pockets/volumes, so objects get scattered across duplicates and
  // reads resolve to only one of them. Serialize create paths per
  // owner+bucket so exactly one creation wins; reads need no lock.
  if (!create) return doResolveBucket(ownerId, bucketName, false);

  const key = `${ownerId}::${bucketName}`;
  const prev = bucketResolveLocks.get(key) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(() => doResolveBucket(ownerId, bucketName, true));
  bucketResolveLocks.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  try {
    return await next;
  } finally {
    // Drop the lock entry once this is the tail, to avoid unbounded growth.
    const tail = bucketResolveLocks.get(key);
    if (tail) {
      void tail.then(() => {
        if (bucketResolveLocks.get(key) === tail)
          bucketResolveLocks.delete(key);
      });
    }
  }
}

/**
 * Deterministic resolution: when duplicates exist (e.g. from a prior race),
 * always pick the oldest pocket/volume so reads and writes converge on the
 * same target.
 */
async function doResolveBucket(
  ownerId: string,
  bucketName: string,
  create: boolean,
): Promise<{ pocketId: string; volumeId: string } | null> {
  const pockets = (await fabricStorage.listPockets(ownerId))
    .filter((p) => p.name === bucketName)
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  let pocket = pockets[0];
  if (!pocket) {
    if (!create) return null;
    pocket = await fabricStorage.createPocket(ownerId, bucketName, {});
  }
  const volumes = (await fabricStorage.listVolumes(pocket.id))
    .filter((v) => v.name === "root")
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  let volume = volumes[0];
  if (!volume) {
    if (!create) return null;
    volume = await fabricStorage.createVolume(pocket.id, "root", "general");
  }
  return { pocketId: pocket.id, volumeId: volume.id };
}

/** Effective policy for an upload: cap k+m to the number of healthy nodes. */
async function effectivePolicy(): Promise<PocketPolicy> {
  const nodes = await fabricNodeRegistry.listHealthyNodes();
  const ec = DEFAULT_POLICY.erasureCoding!;
  if (nodes.length < 3) {
    // Too few nodes to gain durability from EC — replicate instead.
    return { compression: true, redundancy: Math.min(nodes.length, 2) || 1 };
  }
  // Keep at least 1 parity; never request more shards than nodes.
  const total = Math.min(ec.k + ec.m, nodes.length);
  const m = Math.max(1, Math.min(ec.m, total - 1));
  const k = total - m;
  return { compression: true, erasureCoding: { k, m } };
}

// ── Bucket management ───────────────────────────────────────────────────────

router.post("/buckets", async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = getOwnerId(req);
    const name = String((req.body as { name?: string })?.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "name required" });
      return;
    }
    const resolved = await resolveBucket(ownerId, name, true);
    res.json({ success: true, bucket: name, ...resolved });
  } catch (err) {
    logger.error("[Fabric] Create bucket error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/buckets", async (req: Request, res: Response) => {
  try {
    const ownerId = getOwnerId(req);
    const pockets = await fabricStorage.listPockets(ownerId);
    res.json({
      buckets: pockets.map((p) => ({
        name: p.name,
        id: p.id,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Object upload (raw binary body) ─────────────────────────────────────────

router.put(
  "/buckets/:bucket/objects/*key",
  express.raw({ type: () => true, limit: MAX_OBJECT_SIZE }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ownerId = getOwnerId(req);
      const bucket = req.params.bucket as string;
      const key = extractKey(req);
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: "Empty or missing request body" });
        return;
      }

      const resolved = await resolveBucket(ownerId, bucket, true);
      if (!resolved) {
        res.status(500).json({ error: "Failed to resolve bucket" });
        return;
      }

      const contentType =
        (req.headers["content-type"] as string) || "application/octet-stream";
      const policy = await effectivePolicy();

      const object = await fabricStorage.storeObject(
        resolved.volumeId,
        key,
        contentType,
        body,
        { policy },
      );

      // Each upload is an immutable version; the object id is the version id.
      res.setHeader("X-Fabric-Version-Id", object.id);
      res.json({
        success: true,
        bucket,
        key,
        objectId: object.id,
        versionId: object.id,
        size: object.sizeBytes,
        contentHash: object.contentHash,
        storage: object.manifest,
      });
    } catch (err) {
      logger.error("[Fabric] Put object error:", err);
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ── Object list ─────────────────────────────────────────────────────────────

router.get(
  "/buckets/:bucket/objects",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ownerId = getOwnerId(req);
      const bucket = req.params.bucket as string;
      const resolved = await resolveBucket(ownerId, bucket, false);
      if (!resolved) {
        res.status(404).json({ error: "Bucket not found" });
        return;
      }
      const objects = await fabricStorage.listObjects(resolved.volumeId);
      res.json({
        bucket,
        objects: objects.map((o) => ({
          key: o.originalName,
          objectId: o.id,
          size: o.sizeBytes,
          contentType: o.contentType,
          storageMode: o.manifest?.storageMode ?? "replicated",
          codec: o.manifest?.codec ?? "raw",
          createdAt: o.createdAt,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ── Object download ─────────────────────────────────────────────────────────

/** Find the most-recent object in a volume matching a key. */
async function findObjectByKey(volumeId: string, key: string) {
  const objects = await fabricStorage.listObjects(volumeId);
  const matches = objects
    .filter((o) => o.originalName === key)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return matches[0] ?? null;
}

/**
 * Resolve a specific object version. Each upload of a key creates a new
 * immutable object row, so the object id IS the version id. We require the key
 * to match too, so a version id can't be used to read across keys.
 */
async function findObjectByVersion(
  volumeId: string,
  key: string,
  versionId: string,
) {
  const objects = await fabricStorage.listObjects(volumeId);
  return (
    objects.find((o) => o.id === versionId && o.originalName === key) ?? null
  );
}

router.get(
  "/buckets/:bucket/objects/*key",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ownerId = getOwnerId(req);
      const bucket = req.params.bucket as string;
      const key = extractKey(req);
      const resolved = await resolveBucket(ownerId, bucket, false);
      if (!resolved) {
        res.status(404).json({ error: "Bucket not found" });
        return;
      }
      // ?versionId=<id> pins a specific historical version (S3 GetObject style);
      // omitted returns the latest.
      const versionId =
        typeof req.query.versionId === "string" ? req.query.versionId : null;
      const object = versionId
        ? await findObjectByVersion(resolved.volumeId, key, versionId)
        : await findObjectByKey(resolved.volumeId, key);
      if (!object) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      const { data } = await fabricStorage.retrieveObject(object.id);
      res.setHeader("Content-Type", object.contentType);
      res.setHeader("Content-Length", data.length);
      res.setHeader("X-Fabric-Version-Id", object.id);
      res.setHeader(
        "X-Fabric-Storage-Mode",
        object.manifest?.storageMode ?? "",
      );
      res.setHeader("X-Fabric-Codec", object.manifest?.codec ?? "");
      res.send(data);
    } catch (err) {
      logger.error("[Fabric] Get object error:", err);
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.delete(
  "/buckets/:bucket/objects/*key",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ownerId = getOwnerId(req);
      const bucket = req.params.bucket as string;
      const key = extractKey(req);
      const resolved = await resolveBucket(ownerId, bucket, false);
      if (!resolved) {
        res.status(404).json({ error: "Bucket not found" });
        return;
      }
      // ?versionId=<id> deletes one specific version; omitted deletes the latest.
      const versionId =
        typeof req.query.versionId === "string" ? req.query.versionId : null;
      const object = versionId
        ? await findObjectByVersion(resolved.volumeId, key, versionId)
        : await findObjectByKey(resolved.volumeId, key);
      if (!object) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      await fabricStorage.deleteObject(object.id);
      res.json({ success: true, bucket, key, versionId: object.id });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ── Object versions ─────────────────────────────────────────────────────────

// List every retained version of a key, newest first. Kept under a distinct
// `object-versions` segment so it never collides with the `/objects/*key`
// wildcard above.
router.get(
  "/buckets/:bucket/object-versions/*key",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ownerId = getOwnerId(req);
      const bucket = req.params.bucket as string;
      const key = extractKey(req);
      const resolved = await resolveBucket(ownerId, bucket, false);
      if (!resolved) {
        res.status(404).json({ error: "Bucket not found" });
        return;
      }
      const objects = await fabricStorage.listObjects(resolved.volumeId);
      const versions = objects
        .filter((o) => o.originalName === key)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((o, i) => ({
          versionId: o.id,
          isLatest: i === 0,
          size: o.sizeBytes,
          contentType: o.contentType,
          contentHash: o.contentHash,
          storageMode: o.manifest?.storageMode ?? "replicated",
          codec: o.manifest?.codec ?? "raw",
          createdAt: o.createdAt,
        }));
      if (versions.length === 0) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      res.json({ bucket, key, versions });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ── Telemetry: status / nodes / capacity ────────────────────────────────────

router.get("/status", async (_req: Request, res: Response) => {
  try {
    const nodes = await fabricNodeRegistry.listAllNodes();
    const healthy = nodes.filter((n) => n.healthy);
    res.json({
      active: nodes.length > 0,
      nodes: nodes.length,
      healthyNodes: healthy.length,
      failureDomains: [...new Set(nodes.map((n) => n.failureDomain))].length,
      defaultDurability: DEFAULT_POLICY.erasureCoding
        ? `Reed–Solomon ${DEFAULT_POLICY.erasureCoding.k}+${DEFAULT_POLICY.erasureCoding.m}`
        : "replication",
      compression: "zstd (transparent, lossless)",
      scrub: fabricScrubService.getStatus(),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/nodes", async (_req: Request, res: Response) => {
  try {
    const nodes = await fabricNodeRegistry.listAllNodes();
    res.json({
      nodes: nodes.map((n) => ({
        id: n.id,
        region: n.region,
        failureDomain: n.failureDomain,
        costTier: n.costTier,
        backendType: n.backendType,
        capacityBytes: n.capacityBytes,
        usedBytes: n.usedBytes,
        healthy: n.healthy,
        lastHeartbeat: n.lastHeartbeat,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/scrub/status", (_req: Request, res: Response) => {
  res.json(fabricScrubService.getStatus());
});

router.post("/scrub", async (_req: Request, res: Response) => {
  try {
    const result = await fabricScrubService.scrub();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/capacity", async (_req: Request, res: Response) => {
  try {
    const nodes = await fabricNodeRegistry.listAllNodes();
    const provisionedCapacityBytes = nodes.reduce(
      (s, n) => s + n.capacityBytes,
      0,
    );

    const [objAgg] = await db
      .select({
        count: sql<number>`count(*)`,
        logical: sql<number>`coalesce(sum(${fabricObjects.sizeBytes}), 0)`,
        // Sum of the compressed payload sizes (post-zstd, pre-erasure/replication)
        // recorded in each object's manifest. Lets us separate the compression win
        // from the erasure/replication overhead below.
        compressed: sql<number>`coalesce(sum((${fabricObjects.manifest} ->> 'storedSize')::bigint), 0)`,
      })
      .from(fabricObjects);

    const [chunkAgg] = await db
      .select({
        count: sql<number>`count(*)`,
        // Physical bytes actually on disk: each content-addressed chunk counted once.
        physical: sql<number>`coalesce(sum(${fabricChunks.sizeBytes}), 0)`,
        // Bytes if every object held its own copy (refCount expanded) — i.e. before
        // dedup collapsed shared chunks. referenced / physical = dedup ratio.
        referenced: sql<number>`coalesce(sum(${fabricChunks.sizeBytes} * ${fabricChunks.refCount}), 0)`,
      })
      .from(fabricChunks);

    const logicalBytes = Number(objAgg?.logical ?? 0);
    const compressedPayloadBytes = Number(objAgg?.compressed ?? 0);
    const fabricStoredBytes = Number(chunkAgg?.physical ?? 0);
    const referencedChunkBytes = Number(chunkAgg?.referenced ?? 0);

    const ratio = (num: number, den: number): number | null =>
      den > 0 ? Number((num / den).toFixed(3)) : null;

    // compressionRatio   logical bytes saved by zstd (≥1 = shrinking).
    // erasureOverhead    physical amplification from parity/replication, isolated
    //                    from dedup (referenced shard bytes ÷ compressed payload):
    //                    ~1.5× for RS 4+2, ~2× for 2× replication.
    // dedupRatio         how much content-addressed sharing saves (≥1 = sharing).
    const compressionRatio = ratio(logicalBytes, compressedPayloadBytes);
    const erasureOverhead = ratio(referencedChunkBytes, compressedPayloadBytes);
    const dedupRatio = ratio(referencedChunkBytes, fabricStoredBytes);

    // The raw backing-volume bound for this deployment: a single volume.
    let rawDiskTotalBytes = 0;
    let rawDiskFreeBytes = 0;
    try {
      const st = await fs.statfs(process.cwd());
      rawDiskTotalBytes = st.blocks * st.bsize;
      rawDiskFreeBytes = st.bavail * st.bsize;
    } catch {
      // statfs unavailable — leave zeros
    }

    res.json({
      logical: {
        objectCount: Number(objAgg?.count ?? 0),
        objectBytes: logicalBytes,
        note: "Sum of original object sizes as seen by callers (pre-compression).",
      },
      fabric: {
        chunkCount: Number(chunkAgg?.count ?? 0),
        storedBytes: fabricStoredBytes,
        spaceEfficiencyRatio:
          fabricStoredBytes > 0
            ? Number((logicalBytes / fabricStoredBytes).toFixed(3))
            : null,
        note: "Actual bytes written across all nodes after compression + erasure-coding + dedup.",
      },
      efficiency: {
        compressedPayloadBytes,
        referencedChunkBytes,
        compressionRatio,
        erasureOverhead,
        dedupRatio,
        note: "compressionRatio = original ÷ compressed (zstd win). erasureOverhead = shard bytes ÷ compressed payload (≈1.5× for RS 4+2, ≈2× for 2× replication). dedupRatio = referenced ÷ unique stored chunk bytes (content-addressed sharing).",
      },
      backingStore: {
        rawTotalBytes: rawDiskTotalBytes,
        rawFreeBytes: rawDiskFreeBytes,
        note: "Raw bytes available on this deployment's backing volume. Capacity scales horizontally as storage nodes are added.",
      },
      provisioned: {
        nodes: nodes.length,
        provisionedCapacityBytes,
        note: "Logical capacity advertised by registered nodes — a provisioning target, not guaranteed raw space on the backing volume.",
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
