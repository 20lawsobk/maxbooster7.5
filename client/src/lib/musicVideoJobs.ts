import {
  pollVideoJobUntilDone,
  TerminalJobError,
  type VideoJobPollingOptions,
  type VideoJobResponse,
} from "./videoJobPolling";

export interface MusicVideoJobResponse extends VideoJobResponse {
  videoUrl?: string;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  result?: Record<string, unknown>;
}

export function musicVideoJobPath(jobId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(jobId)) {
    throw new Error("Invalid music video job id");
  }
  return `/api/social/music-video-job/${encodeURIComponent(jobId)}`;
}

/** Preserve the server record while presenting one playable-file contract. */
export function normalizeMusicVideoJob(input: unknown): MusicVideoJobResponse {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid music video job response");
  }
  const data = input as MusicVideoJobResponse;
  const result = data.result && typeof data.result === "object" && !Array.isArray(data.result)
    ? data.result : {};
  const text = (...values: unknown[]) => values.find(
    (value): value is string => typeof value === "string" && !!value.trim(),
  );
  const status = data.status === "done" ? "completed" : data.status === "error" ? "failed" : data.status;
  const url = text(data.videoUrl, data.url, data.video_url, result.url, result.video_url);
  if (url && !/^\/(?!\/)|^https?:\/\//i.test(url)) {
    throw new TerminalJobError("failed", "Music video response did not contain a playable file URL");
  }
  if (status === "completed" && !url) {
    throw new TerminalJobError("failed", "Music video completed without a playable video URL");
  }
  return {
    ...data,
    status,
    url,
    thumbnail_url: text(data.thumbnailUrl, data.thumbnail_url, result.thumbnail_url),
  };
}

export async function fetchMusicVideoJobStatus(
  jobId: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal;
    onStatus?: (status: MusicVideoJobResponse) => void } = {},
): Promise<Response> {
  const timeout = AbortSignal.timeout(15_000);
  const response = await (options.fetchImpl ?? fetch)(musicVideoJobPath(jobId), {
    credentials: "include",
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  const data = await response.json().catch(() => null);
  if ([401, 403, 404, 410].includes(response.status)) {
    return new Response(JSON.stringify({ status: "failed",
      error: data?.error || `Music video status unavailable (${response.status})`,
    }), { status: response.status });
  }
  const normalized = normalizeMusicVideoJob(data);
  if (response.ok) options.onStatus?.(normalized);
  return new Response(JSON.stringify(normalized), {
    status: response.status,
  });
}

export function pollMusicVideoJobUntilDone(
  jobId: string,
  options: Omit<VideoJobPollingOptions, "fetchStatus"> & {
    fetchImpl?: typeof fetch; signal?: AbortSignal;
    onStatus?: (status: MusicVideoJobResponse) => void;
  } = {},
) {
  return pollVideoJobUntilDone<MusicVideoJobResponse>(jobId, {
    intervalMs: 3_000,
    maxAttempts: 300,
    ...options,
    isCancelled: () => !!options.signal?.aborted || !!options.isCancelled?.(),
    fetchStatus: id => fetchMusicVideoJobStatus(id, options),
  });
}
