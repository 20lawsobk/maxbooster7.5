import { AIUnavailableError } from "../lib/aiSource.js";
import { trustedMaxcoreOwner } from "../lib/maxcoreOwnerContext.js";
import { MaxCoreAIClient } from "./maxcoreClient.js";
import { MaxCoreControlError } from "./maxcoreControlTransport.js";

export interface MaxCoreAudioJob {
  job_id?: string;
  status?: string;
  url?: string;
  audioUrl?: string;
  audio_url?: string;
  audio_data?: string;
  wav_b64?: string;
  audio_b64?: string;
  result?: MaxCoreAudioJob;
  [key: string]: unknown;
}

export function maxcoreAudioSource(job: MaxCoreAudioJob): string | undefined {
  const nested = job.result && typeof job.result === "object" ? job.result : {};
  return [job.audioUrl, job.audio_url, job.url, nested.audioUrl, nested.audio_url, nested.url]
    .find(value => typeof value === "string" && value.length > 0);
}

export function maxcoreAudioBytes(job: MaxCoreAudioJob): string | undefined {
  const nested = job.result && typeof job.result === "object" ? job.result : {};
  return [job.audio_data, job.wav_b64, job.audio_b64, nested.audio_data, nested.wav_b64, nested.audio_b64]
    .find(value => typeof value === "string" && value.length > 0);
}

/** Resolve the actual async audio contract without losing its trusted owner. */
export async function resolveMaxCoreAudioJob<T extends MaxCoreAudioJob>(
  submitted: T,
  ownerId?: string,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    poll?: typeof MaxCoreAIClient.poll;
  } = {},
): Promise<T> {
  const owner = trustedMaxcoreOwner(ownerId);
  if (!owner) throw new AIUnavailableError("audio generation requires an authenticated owner");
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 600_000;
  const intervalMs = options.intervalMs ?? 5_000;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const poll = options.poll ?? MaxCoreAIClient.poll;
  const deadline = now() + timeoutMs;
  const jobId = submitted.job_id;
  let current = submitted;
  for (;;) {
    const status = typeof current.status === "string" ? current.status.toLowerCase() : "";
    if (["failed", "error", "cancelled", "canceled", "timed_out", "timeout", "expired"].includes(status)) {
      throw new AIUnavailableError(`audio generation ${status}`);
    }
    if (maxcoreAudioSource(current) || maxcoreAudioBytes(current)) return current;
    if (["done", "completed", "succeeded"].includes(status)) {
      throw new AIUnavailableError("completed audio job returned no artifact");
    }
    if (typeof jobId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(jobId)) {
      throw new AIUnavailableError("audio generation returned no valid job reference");
    }
    if (now() >= deadline) throw new AIUnavailableError("audio generation exceeded its completion deadline");
    let result: T | null = null;
    try {
      result = await poll<T>(`/api/audio-job/${encodeURIComponent(jobId)}`, owner,
        Math.min(30_000, Math.max(1, deadline - now())), true);
    } catch (error) {
      // Authentication/ownership/not-found failures are terminal. Network and
      // dependency failures may recover within the same bounded job budget.
      if (!(error instanceof MaxCoreControlError) || error.status < 500) {
        throw new AIUnavailableError("audio generation job is unavailable or access was denied");
      }
    }
    if (result) current = { ...submitted, ...result };
    else current = submitted;
    const nextStatus = typeof current.status === "string" ? current.status.toLowerCase() : "";
    if (maxcoreAudioSource(current) || maxcoreAudioBytes(current) ||
        ["failed", "error", "cancelled", "canceled", "timed_out", "timeout", "expired",
          "done", "completed", "succeeded"].includes(nextStatus)) continue;
    if (now() >= deadline) throw new AIUnavailableError("audio generation exceeded its completion deadline");
    await sleep(Math.min(intervalMs, deadline - now()));
  }
}
