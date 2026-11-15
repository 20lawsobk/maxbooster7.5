import { waitForMediaJobPoll, withMediaJobDeadline } from "./mediaJobTransport";

export interface VideoJobResponse {
  status?: string;
  success?: boolean;
  url?: string;
  video_url?: string;
  error?: string;
  message?: string;
}

export class TerminalJobError extends Error {
  constructor(
    readonly status: string,
    message: string,
  ) {
    super(message);
    this.name = "TerminalJobError";
  }
}

export interface VideoJobPollingOptions {
  fetchStatus: (jobId: string, signal?: AbortSignal) => Promise<Response>;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  maxElapsedMs?: number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  isCancelled?: () => boolean;
  onProgress?: (elapsedSeconds: number) => void;
  intervalMs?: number;
  maxAttempts?: number;
  maxConsecutiveErrors?: number;
}

const TERMINAL_STATUSES = new Set([
  "error",
  "failed",
  "cancelled",
  "canceled",
  "timed_out",
  "timeout",
  "not_found",
]);

const defaultSleep = waitForMediaJobPoll;

/** Keep the request deadline active through the complete status body. */
export async function readVideoJobStatus<T extends VideoJobResponse = VideoJobResponse>(
  jobId: string,
  options: Pick<VideoJobPollingOptions, "fetchStatus" | "signal" | "requestTimeoutMs">,
): Promise<{ response: Response; data: T }> {
  return withMediaJobDeadline(async requestSignal => {
    const response = await options.fetchStatus(jobId, requestSignal);
    const text = await response.text();
    let data: T;
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Unexpected response from server");
      }
      data = parsed as T;
    } catch {
      throw new Error("Unexpected response from server");
    }
    return { response, data };
  }, { signal: options.signal, timeoutMs: options.requestTimeoutMs ?? 15_000,
    timeoutMessage: "Video status request timed out" });
}

export async function pollVideoJobUntilDone<T extends VideoJobResponse>(
  jobId: string,
  {
    fetchStatus,
    sleep = defaultSleep,
    isCancelled = () => false,
    onProgress,
    intervalMs = 2_000,
    maxAttempts = 210,
    maxConsecutiveErrors = 5,
    signal,
    requestTimeoutMs = 15_000,
    maxElapsedMs = Math.max(requestTimeoutMs, maxAttempts * intervalMs),
  }: VideoJobPollingOptions,
): Promise<T & { success: true; url: string }> {
  if (signal?.aborted || isCancelled()) throw new DOMException("Cancelled", "AbortError");
  try {
    return await withMediaJobDeadline(async pollSignal => {
      let consecutiveErrors = 0;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await sleep(intervalMs, pollSignal);
        if (isCancelled()) throw new Error("Cancelled");

        try {
          const { response, data } = await readVideoJobStatus<T>(jobId, {
            fetchStatus, signal: pollSignal, requestTimeoutMs,
          });

          if ([401, 403, 404, 410].includes(response.status)) {
            throw new TerminalJobError("unavailable", data.error || "Video job is no longer available");
          }

          if (TERMINAL_STATUSES.has(data.status || "")) {
            throw new TerminalJobError(
              data.status!,
              data.error || data.message || `Video generation ${data.status}`,
            );
          }
          if (!response.ok) {
            throw new Error(
              data.error || data.message || `Job polling failed (${response.status})`,
            );
          }

          consecutiveErrors = 0;
          const videoUrl = data.url || data.video_url;
          if (data.status === "done" || data.status === "completed") {
            if (!videoUrl || !/^\/(?!\/)|^https?:\/\//i.test(videoUrl)) {
              throw new TerminalJobError("failed", "Video completed without a playable file URL");
            }
            return { ...data, success: true, url: videoUrl };
          }

          onProgress?.(Math.round(((attempt + 1) * intervalMs) / 1_000));
        } catch (error) {
          if (pollSignal.aborted) throw pollSignal.reason;
          if (
            error instanceof TerminalJobError ||
            (error instanceof Error && error.message === "Cancelled")
          ) {
            throw error;
          }

          consecutiveErrors++;
          if (consecutiveErrors >= maxConsecutiveErrors) {
            throw new Error(
              "Network error during video generation. Please check your connection.",
            );
          }
          await sleep(1_000 * consecutiveErrors, pollSignal);
        }
      }

      throw new Error("Video generation timed out. Please try again.");
    }, { signal, timeoutMs: maxElapsedMs, timeoutMessage: "Video generation timed out. Please try again." });
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    throw error;
  }
}
