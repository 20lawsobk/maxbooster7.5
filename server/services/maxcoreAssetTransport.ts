import path from "path";
import { readFile, realpath, stat } from "fs/promises";
import { AIUnavailableError } from "../lib/aiSource.js";
import {
  getMaxcoreGenerationKey,
  getMaxcoreOriginOrDefault,
} from "./maxcoreConnector.js";
import { resolveAudioUrlToLocalFile } from "./audioSourceResolver.js";

const MAX_BYTES = 100 * 1024 * 1024;
const OWNED_AUDIO_PATH =
  /^\/uploads\/audio-inputs\/[a-f0-9]{64}\/[a-f0-9-]+\.(?:wav|mp3|flac|ogg|opus|webm|m4a|aac|aiff)$/i;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".webm": "audio/webm",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".aac": "audio/aac",
  ".aiff": "audio/aiff",
  ".aif": "audio/aiff",
};

function existingMaxCoreAsset(source: string): string | null {
  if (OWNED_AUDIO_PATH.test(source)) return source;
  try {
    const origin = new URL(getMaxcoreOriginOrDefault());
    const candidate = new URL(source);
    return candidate.origin === origin.origin && OWNED_AUDIO_PATH.test(candidate.pathname)
      ? candidate.pathname
      : null;
  } catch {
    return null;
  }
}

/**
 * Resolve an application-owned audio URL/key to bytes and transfer it into
 * MaxCore's owner-scoped uploads. Temporary resolver files are always cleaned.
 */
export async function ensureMaxCoreAudioAsset(
  audioSource: string,
  userId: string,
): Promise<string> {
  if (!audioSource) throw new AIUnavailableError("MaxCore audio transfer (source required)");
  if (!userId) throw new AIUnavailableError("MaxCore audio transfer (owner required)");
  const existing = existingMaxCoreAsset(audioSource);
  if (existing) return existing;

  const resolved = await resolveAudioUrlToLocalFile(audioSource).catch((error) => {
    throw new AIUnavailableError(
      `MaxCore audio transfer: ${(error as Error).message}`,
    );
  });
  return uploadResolvedAudio(resolved, userId);
}

/**
 * Transfer a Multer-owned audio upload from the private temporary upload
 * directory. This accepts only a direct, real file created under
 * uploads/media_temp; arbitrary server filesystem paths are rejected.
 */
export async function ensureMaxCoreMediaTempUpload(
  localPath: string,
  userId: string,
): Promise<string> {
  if (!localPath) throw new AIUnavailableError("MaxCore audio transfer (source required)");
  if (!userId) throw new AIUnavailableError("MaxCore audio transfer (owner required)");

  let trustedRoot: string;
  let trustedFile: string;
  try {
    [trustedRoot, trustedFile] = await Promise.all([
      realpath(path.resolve(process.cwd(), "uploads", "media_temp")),
      realpath(localPath),
    ]);
  } catch {
    throw new AIUnavailableError("MaxCore audio transfer (temporary upload unavailable)");
  }

  const relativePath = path.relative(trustedRoot, trustedFile);
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath) ||
    relativePath.includes(path.sep) ||
    !/^media_[a-f0-9]{16}\.[a-z0-9]+$/i.test(relativePath)
  ) {
    throw new AIUnavailableError("MaxCore audio transfer (invalid temporary upload)");
  }

  const fileStat = await stat(trustedFile).catch(() => null);
  if (!fileStat?.isFile()) {
    throw new AIUnavailableError("MaxCore audio transfer (temporary upload unavailable)");
  }

  return uploadResolvedAudio(
    { localPath: trustedFile, cleanup: async () => {} },
    userId,
  );
}

async function uploadResolvedAudio(
  resolved: { localPath: string; cleanup: () => Promise<void> },
  userId: string,
): Promise<string> {
  try {
    const size = (await stat(resolved.localPath)).size;
    if (size === 0) throw new AIUnavailableError("MaxCore audio transfer (empty source)");
    if (size > MAX_BYTES) throw new AIUnavailableError("MaxCore audio transfer (source exceeds 100 MiB)");
    const contentType = MIME_BY_EXTENSION[path.extname(resolved.localPath).toLowerCase()];
    if (!contentType) {
      throw new AIUnavailableError("MaxCore audio transfer (unsupported audio type)");
    }
    const response = await fetch(
      `${getMaxcoreOriginOrDefault()}/api/audio/upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getMaxcoreGenerationKey()}`,
          "X-MaxCore-User-Id": userId,
          "Content-Type": contentType,
          "Content-Length": String(size),
        },
        body: await readFile(resolved.localPath),
        signal: AbortSignal.timeout(120_000),
      },
    ).catch((error) => {
      throw new AIUnavailableError(
        `MaxCore audio transfer: ${(error as Error).message}`,
      );
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AIUnavailableError(
        `MaxCore audio transfer returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`,
      );
    }
    const result = (await response.json().catch(() => null)) as { url?: string } | null;
    if (!result?.url || !OWNED_AUDIO_PATH.test(result.url)) {
      throw new AIUnavailableError("MaxCore audio transfer returned an invalid asset URL");
    }
    return result.url;
  } finally {
    await resolved.cleanup();
  }
}