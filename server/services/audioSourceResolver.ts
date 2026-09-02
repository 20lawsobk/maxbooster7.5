// @ts-nocheck
/**
 * Shared resolver that turns any of the audioUrl forms used across the studio
 * subsystem (render, warp, transient detection) into a local file on disk so
 * ffmpeg-based processing can operate on it uniformly.
 *
 * Recognized forms:
 *   - `/api/storage/file/<encoded key>` — the app's own storage-serving route
 *   - `/uploads/...`, `/samples/...`, `/attached_assets/...` — local static paths
 *   - `http://` / `https://` — remote URL, fetched
 *   - anything else — treated as a bare storage key (legacy clips that stored
 *     the raw key instead of a URL)
 *
 * Every branch either returns a real local path or throws a descriptive
 * error — callers must treat a failure as a real failure, not a clip to
 * silently skip, except where a caller has an intentional, documented
 * lenient-skip policy (e.g. mixdown skipping one unresolvable clip among many).
 */
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import { randomUUID } from "crypto";
import { storageService } from "./storageService.js";
import { logger } from "../logger.js";

export interface ResolvedAudioSource {
  /** Absolute local path to the audio bytes. */
  localPath: string;
  /** Call after use. No-ops for paths that are already permanently on local disk. */
  cleanup: () => Promise<void>;
}

const NOOP_CLEANUP = async () => {};

async function writeToTemp(buf: Buffer, hint: string): Promise<string> {
  const ext = path.extname(hint.split("?")[0]) || ".wav";
  const tmp = path.join(os.tmpdir(), `audio_src_${randomUUID()}${ext}`);
  await fsPromises.writeFile(tmp, buf);
  return tmp;
}

export async function resolveAudioUrlToLocalFile(
  audioUrl: string,
): Promise<ResolvedAudioSource> {
  if (!audioUrl) {
    throw new Error("resolveAudioUrlToLocalFile: empty audioUrl");
  }

  // The app's own storage-serving route: /api/storage/file/<encoded key>
  const storageRouteMatch = audioUrl.match(/^\/api\/storage\/file\/(.+)$/);
  if (storageRouteMatch) {
    const key = decodeURIComponent(storageRouteMatch[1]);
    const buf = await storageService.downloadFile(key);
    const localPath = await writeToTemp(buf, key);
    return {
      localPath,
      cleanup: () => fsPromises.unlink(localPath).catch(() => {}),
    };
  }

  // Local static paths served directly by the app
  if (
    audioUrl.startsWith("/uploads/") ||
    audioUrl.startsWith("/samples/") ||
    audioUrl.startsWith("/attached_assets/")
  ) {
    const rel = audioUrl.replace(/^\//, "");
    const candidates = [
      path.resolve(".", rel),
      path.resolve(
        ".",
        rel.startsWith("uploads/") ? rel : path.join("client/public", rel),
      ),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return { localPath: candidate, cleanup: NOOP_CLEANUP };
      }
    }
    throw new Error(
      `resolveAudioUrlToLocalFile: local file not found for ${audioUrl}`,
    );
  }

  // Remote URL
  if (audioUrl.startsWith("http://") || audioUrl.startsWith("https://")) {
    const resp = await fetch(audioUrl);
    if (!resp.ok) {
      throw new Error(
        `resolveAudioUrlToLocalFile: fetch failed (${resp.status}) for ${audioUrl}`,
      );
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const localPath = await writeToTemp(buf, audioUrl);
    return {
      localPath,
      cleanup: () => fsPromises.unlink(localPath).catch(() => {}),
    };
  }

  // Fallback: bare storage key (legacy rows that stored the key directly)
  try {
    const buf = await storageService.downloadFile(audioUrl);
    const localPath = await writeToTemp(buf, audioUrl);
    return {
      localPath,
      cleanup: () => fsPromises.unlink(localPath).catch(() => {}),
    };
  } catch (err) {
    logger.warn(
      { err, audioUrl },
      "[audioSourceResolver] failed to resolve audio source",
    );
    throw new Error(`resolveAudioUrlToLocalFile: could not resolve "${audioUrl}"`);
  }
}
