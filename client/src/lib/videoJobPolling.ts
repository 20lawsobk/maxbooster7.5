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
  fetchStatus: (jobId: string) => Promise<Response>;
  sleep?: (milliseconds: number) => Promise<void>;
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
  "not_found",
]);

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

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
  }: VideoJobPollingOptions,
): Promise<T & { success: true; url: string }> {
  let consecutiveErrors = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(intervalMs);
    if (isCancelled()) throw new Error("Cancelled");

    try {
      const response = await fetchStatus(jobId);
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
      if (
        (data.status === "done" || data.status === "completed") &&
        videoUrl
      ) {
        return { ...data, success: true, url: videoUrl };
      }

      onProgress?.(Math.round(((attempt + 1) * intervalMs) / 1_000));
    } catch (error) {
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
      await sleep(1_000 * consecutiveErrors);
    }
  }

  throw new Error("Video generation timed out. Please try again.");
}