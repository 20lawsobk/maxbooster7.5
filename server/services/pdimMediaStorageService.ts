// @ts-nocheck
/**
 * PDIM Media Storage Service
 *
 * Central integration layer that routes generated media (beat-sync
 * analysis, music videos) through the PDIM (Pocket Dimension) storage
 * architecture. Synthesized voice files are uploaded directly by their
 * route handler via storageService — see server/routes/socialMedia.ts —
 * since that is a single synchronous upload with no extra metadata cache
 * needed, unlike the richer video-render bookkeeping below.
 *
 * Two PDIM layers used:
 *
 *   Layer 1 — hybridStorageService
 *     Binary file storage with automatic tiering:
 *       'hot'  → local Replit disk (fast, recent files)
 *       'cold' → Pocket Dimension encrypted store (durable, large files)
 *     Includes content-hash deduplication, compression, and per-user
 *     quotas tracked in PostgreSQL (userStorage / userStorageFiles tables).
 *
 *   Layer 2 — pdimClient (Redis-compatible key-value)
 *     Metadata cache for beat analysis results, synthesis manifests,
 *     and video render status — keyed by content hash or job ID.
 *     TTL: 24 hours for analysis results, 48 hours for rendered media metadata.
 *
 * All generated content is attributed to the requesting userId so that
 * the user's content library, quota usage, and PDIM namespace are correct.
 */

import { existsSync } from "fs";
import { readFile as fsReadFile } from "fs/promises";
import { createHash } from "crypto";
import { logger } from "../logger.js";
import { hybridStorageService } from "./hybridStorageService.js";
import { getPdimClient, isPdimConfigured } from "../lib/pdimClient.js";
import type { BeatAnalysis } from "./beatSyncService.js";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const PDIM_KEY_PREFIX = "pdim_media";
const BEAT_CACHE_TTL = 60 * 60 * 24; // 24 hours
const VIDEO_META_TTL = 60 * 60 * 48; // 48 hours

// ── HELPERS ───────────────────────────────────────────────────────────────────
// async — readFileSync would block the event loop for multi-MB audio files
async function fileHash(filePath: string): Promise<string> {
  try {
    const buf = await fsReadFile(filePath);
    return createHash("sha256").update(buf).digest("hex").slice(0, 32);
  } catch {
    return createHash("sha256")
      .update(filePath + Date.now())
      .digest("hex")
      .slice(0, 32);
  }
}

async function pdimSet(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  if (!isPdimConfigured()) return;
  try {
    const client = getPdimClient();
    await (client as unknown as Record<string, unknown>).setex(
      `${PDIM_KEY_PREFIX}:${key}`,
      ttlSeconds,
      value,
    );
  } catch (e) {
    logger.debug(`[PDIM Media] setex skipped: ${(e as Error).message.slice(0, 80)}`);
  }
}

async function pdimGet(key: string): Promise<string | null> {
  if (!isPdimConfigured()) return null;
  try {
    const client = getPdimClient();
    return await (client as unknown as Record<string, unknown>).get(
      `${PDIM_KEY_PREFIX}:${key}`,
    );
  } catch {
    return null;
  }
}

// ── BEAT ANALYSIS CACHE ───────────────────────────────────────────────────────
/**
 * Cache beat analysis result by audio file content hash.
 * Avoids re-running expensive FFmpeg/librosa analysis on the same file.
 */
export async function cacheBeatAnalysis(
  audioPath: string,
  analysis: BeatAnalysis,
): Promise<void> {
  const hash = await fileHash(audioPath);
  await pdimSet(`beat:${hash}`, JSON.stringify(analysis), BEAT_CACHE_TTL);
  logger.debug(`[PDIM Media] Cached beat analysis for ${hash}`);
}

/**
 * Retrieve cached beat analysis for an audio file.
 * Returns null if cache miss or PDIM unavailable.
 */
export async function getCachedBeatAnalysis(
  audioPath: string,
): Promise<BeatAnalysis | null> {
  const hash = await fileHash(audioPath);
  const cached = await pdimGet(`beat:${hash}`);
  if (!cached) return null;
  try {
    const analysis = JSON.parse(cached) as BeatAnalysis;
    logger.info(
      `[PDIM Media] Beat analysis cache HIT for ${hash} (BPM=${analysis.bpm.toFixed(1)})`,
    );
    return analysis;
  } catch {
    return null;
  }
}

// ── MUSIC VIDEO STORAGE ───────────────────────────────────────────────────────
export interface StoredMusicVideo {
  pdimKey: string;
  publicUrl: string;
  filename: string;
  sizeBytes: number;
  compressedSize: number;
  width: number;
  height: number;
  duration: number;
  template: string;
  beatSynced: boolean;
  imageCount: number;
  storedAt: string;
}

/**
 * Upload a generated music video into PDIM for the given user.
 * File is stored under the 'videos' folder in the user's hybrid storage.
 * Full render metadata is persisted to PDIM Redis for fast retrieval.
 */
export async function storeMusicVideo(
  userId: string,
  filePath: string,
  renderResult: Record<string, any>,
): Promise<StoredMusicVideo | null> {
  if (!existsSync(filePath)) {
    logger.warn(`[PDIM Media] storeMusicVideo: path not found: ${filePath}`);
    return null;
  }

  try {
    const buffer = await fsReadFile(filePath);
    const filename =
      filePath?.split("/").pop() || `musicvideo_${Date?.now()}.mp4`;

    const result = await hybridStorageService?.upload(
      userId,
      filename,
      buffer,
      "video/mp4",
      {
        folder: "videos",
        isPublic: false,
        metadata: {
          type: "music_video",
          template: renderResult.template,
          width: renderResult.width,
          height: renderResult.height,
          duration: renderResult.duration,
          beatSynced: renderResult.source?.startsWith("beat_sync"),
          imageCount: renderResult.scenes_rendered,
          capabilities: renderResult.capabilities,
          generatedAt: new Date().toISOString(),
        },
      },
    );

    const publicUrl = await hybridStorageService.getDownloadUrl(
      userId,
      result.key,
    );

    const videoMeta: StoredMusicVideo = {
      pdimKey: result.key,
      publicUrl,
      filename,
      sizeBytes: result.sizeBytes,
      compressedSize: result.compressedSize,
      width: renderResult.width,
      height: renderResult.height,
      duration: renderResult.duration,
      template: renderResult.template,
      beatSynced: !!renderResult?.source?.startsWith("beat_sync"),
      imageCount: renderResult.scenes_rendered || 1,
      storedAt: new Date().toISOString(),
    };

    // Write metadata to PDIM Redis cache indexed by userId + key
    await pdimSet(
      `video:${userId}:${result?.key}`,
      JSON.stringify(videoMeta),
      VIDEO_META_TTL,
    );
    // Also index by filename for quick lookup by public URL
    await pdimSet(
      `video_file:${filename}`,
      JSON.stringify({ userId, pdimKey: result.key }),
      VIDEO_META_TTL,
    );

    logger.info(
      `[PDIM Media] Music video stored → PDIM key=${result.key} tier=${result?.tier} ` +
        `size=${(result.sizeBytes / 1024 / 1024).toFixed(2)}MB → compressed=${(result?.compressedSize / 1024 / 1024).toFixed(2)}MB`,
    );

    return videoMeta;
  } catch (e) {
    logger.warn("[PDIM Media] storeMusicVideo failed:", (e as any)?.message);
    return null;
  }
}
