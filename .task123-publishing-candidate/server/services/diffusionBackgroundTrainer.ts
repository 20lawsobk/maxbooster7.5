/**
 * MaxCore continuous-training control boundary.
 *
 * Diffusion training is owned by MaxCore. This module intentionally contains
 * no local process, model, weight, or fallback path; it only adapts the legacy
 * MaxBooster status contract to MaxCore's live continuous-training API.
 */
import { logger } from "../logger.js";
import {
  getMaxcoreGenerationKey,
  getMaxcoreOrigin,
} from "./maxcoreConnector.js";
import { AIUnavailableError } from "../lib/aiSource.js";

interface BgStatus {
  running: boolean;
  paused: boolean;
  session: number;
  currentTier: string;
  startedAt: number | null;
  lastLoss: number | null;
  totalSessions: number;
  totalSteps: number;
  replayBuffer: number;
  pid: number | null;
  logTail: string[];
}

const state: BgStatus = {
  running: false,
  paused: false,
  session: 0,
  currentTier: "maxcore",
  startedAt: null,
  lastLoss: null,
  totalSessions: 0,
  totalSteps: 0,
  replayBuffer: 0,
  pid: null,
  logTail: [],
};

function connection(): { origin: string; key: string } {
  const origin = getMaxcoreOrigin();
  const key = getMaxcoreGenerationKey();
  if (!origin || !key) {
    throw new AIUnavailableError("MaxCore continuous training");
  }
  return { origin: origin.replace(/\/+$/, ""), key };
}

async function request(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<Record<string, unknown>> {
  const { origin, key } = connection();
  let response: Response;
  try {
    response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new AIUnavailableError(
      `MaxCore continuous training: ${(error as Error).message}`,
    );
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AIUnavailableError(
      `MaxCore continuous training returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new AIUnavailableError(
      "MaxCore continuous training returned a non-JSON response",
    );
  }
  return (await response.json()) as Record<string, unknown>;
}

function applyRemoteStatus(remote: Record<string, unknown>): void {
  const status = String(remote.status ?? "").toLowerCase();
  state.running =
    remote.running === true ||
    ["running", "training", "active", "started"].includes(status);
  state.paused = status === "paused";
  state.session =
    typeof remote.cycle === "number"
      ? remote.cycle
      : typeof remote.session === "number"
        ? remote.session
        : state.session;
  state.totalSessions =
    typeof remote.total_cycles === "number"
      ? remote.total_cycles
      : typeof remote.total_sessions === "number"
        ? remote.total_sessions
        : state.totalSessions;
  state.totalSteps =
    typeof remote.total_steps === "number"
      ? remote.total_steps
      : state.totalSteps;
  state.lastLoss =
    typeof remote.last_loss === "number" ? remote.last_loss : state.lastLoss;
  state.startedAt =
    state.running && state.startedAt === null ? Date.now() : state.startedAt;
  if (!state.running) state.startedAt = null;
}

/** Start MaxCore's real continuous trainer. Fails explicitly when unavailable. */
export async function startBackgroundTraining(): Promise<void> {
  const remote = await request("/training/continuous/start", "POST", {
    interval_minutes: 60,
    phases: [],
    epochs_per_phase: 1,
    pull_every_n_cycles: 2,
  });
  applyRemoteStatus({ ...remote, running: remote.running ?? true });
  logger.info("[DiffBG] MaxCore continuous training start accepted");
}

/** Request a remote stop. Kept void for the legacy route contract. */
export function stopBackgroundTraining(): void {
  state.paused = true;
  void request("/training/continuous/stop", "POST")
    .then((remote) => {
      applyRemoteStatus({ ...remote, running: false });
      state.paused = false;
      logger.info("[DiffBG] MaxCore continuous training stopped");
    })
    .catch((error) => {
      state.paused = false;
      logger.warn({ err: error }, "[DiffBG] MaxCore stop request failed");
    });
}

/** MaxCore owns its worker lifecycle, so force-stop maps to the same API. */
export function forceStopBackgroundTraining(): void {
  stopBackgroundTraining();
}

export function isBackgroundTraining(): boolean {
  return state.running;
}

export function getBackgroundStatus(): BgStatus & { eta: string } {
  return {
    ...state,
    eta: state.running ? "managed by MaxCore" : "not running",
  };
}

/** Refresh the legacy status cache from MaxCore for callers that need freshness. */
export async function refreshBackgroundStatus(): Promise<
  BgStatus & { eta: string }
> {
  const remote = await request("/training/continuous/status", "GET");
  applyRemoteStatus(remote);
  return getBackgroundStatus();
}