import { Router, Request, Response } from "express";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { syncWeightsNow } from "../services/maxcoreSync.js";
import {
  MaxCoreControlError,
  maxCoreControlTransport,
} from "../services/maxcoreControlTransport.js";

const router = Router();

const TRAIN_TIMEOUT = 60_000;
const LONG_TIMEOUT = 3_600_000;

async function proxyToAI(
  endpoint: string,
  method: "GET" | "POST",
  body?: unknown,
  timeoutMs = TRAIN_TIMEOUT,
): Promise<{ ok: boolean; data: unknown; status: number }> {
  try {
    const data = await maxCoreControlTransport.request(endpoint, {
      method,
      body,
      timeoutMs,
    });
    return { ok: true, data, status: 200 };
  } catch (err: unknown) {
    const status = err instanceof MaxCoreControlError ? err.status : 503;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      data: { error: "MaxCore unavailable", message },
      status,
    };
  }
}

export function toTrainingStatusDto(data: unknown): Record<string, unknown> {
  const state =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : {};
  return {
    ...state,
    status: state.status ?? state.state ?? "error",
    phase: state.phase ?? 0,
    phase_name: state.phase_name ?? "",
    step: state.step ?? 0,
    loss: state.loss ?? state.current_loss ?? null,
    loss_history: state.loss_history ?? [],
    total_samples: state.total_samples ?? 0,
    session_count: state.session_count ?? state.sessions_done ?? 0,
    start_time: state.start_time ?? state.started_at ?? null,
    elapsed_sec: state.elapsed_sec ?? state.elapsed_seconds ?? 0,
    error: state.error ?? null,
    weights_path: state.weights_path ?? null,
    last_save: state.last_save ?? null,
    dataset_stats: state.dataset_stats ?? {},
  };
}

export function toDatasetDto(data: unknown): Record<string, unknown> {
  const source =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : {};
  const rows = Array.isArray(source.datasets)
    ? (source.datasets as Array<Record<string, unknown>>)
    : [];
  const byId = Object.fromEntries(rows.map((row) => [String(row.id), row]));
  const samples = (id: string) => Number(byId[id]?.samples ?? 0);
  const diskGb = Object.fromEntries(
    rows.map((row) => [String(row.id), Number(row.size_gb ?? 0)]),
  );
  return {
    success: true,
    stats: {
      hmdb51_clips: samples("hmdb51"),
      ucf101_clips: samples("ucf101"),
      musiccaps_captions: samples("musiccaps"),
      audiocaps_captions: samples("audiocaps"),
      fma_tracks: samples("fma"),
      has_video_data:
        samples("hmdb51") > 0 || samples("ucf101") > 0,
      has_prompt_data:
        samples("musiccaps") > 0 || samples("audiocaps") > 0,
      total_video_clips: samples("hmdb51") + samples("ucf101"),
      total_text_items:
        samples("musiccaps") +
        samples("audiocaps") +
        samples("social_posts") +
        samples("ad_creatives") +
        samples("lyrics"),
    },
    disk_gb: diskGb,
    total_gb: Number(source.total_disk_gb ?? 0),
    datasets: rows,
    curriculum_phases: source.curriculum_phases ?? [],
    storage_session: source.storage_session ?? null,
  };
}

export function toScheduleDto(
  trainingData: unknown,
  continuousData: unknown,
  datasetData: unknown,
): Record<string, unknown> {
  const training = toTrainingStatusDto(trainingData);
  const continuous =
    continuousData && typeof continuousData === "object"
      ? (continuousData as Record<string, unknown>)
      : {};
  const datasets =
    datasetData && typeof datasetData === "object"
      ? (datasetData as Record<string, unknown>)
      : {};
  return {
    success: true,
    schedule: datasets.curriculum_phases ?? [],
    current_status: {
      ...continuous,
      status: continuous.status ?? training.status,
      current_phase:
        continuous.current_phase ?? training.phase ?? 0,
      phase_name:
        continuous.phase_name ?? training.phase_name ?? "",
      progress_pct: continuous.progress_pct ?? 0,
      current_day: continuous.current_day ?? 0,
    },
    training,
    continuous,
  };
}

router.post("/start", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const epochs = Number(body.epochs ?? body.n_sessions ?? 3);
    const learningRate = Number(body.learning_rate ?? 5e-4);
    const batchSize = Number(body.batch_size ?? 8);
    if (
      !Number.isInteger(epochs) ||
      epochs < 1 ||
      epochs > 20 ||
      !Number.isFinite(learningRate) ||
      learningRate <= 0 ||
      !Number.isInteger(batchSize) ||
      batchSize < 8 ||
      batchSize > 512 ||
      (body.max_batches != null &&
        (!Number.isInteger(Number(body.max_batches)) ||
          Number(body.max_batches) < 1))
    ) {
      return res.status(400).json({ error: "Invalid MaxCore training parameters" });
    }
    const result = await proxyToAI("/training/start-from-storage", "POST", {
      epochs,
      learning_rate: learningRate,
      batch_size: batchSize,
      max_batches:
        body.max_batches == null ? undefined : Number(body.max_batches),
      save_checkpoint: body.save_checkpoint ?? true,
    }, LONG_TIMEOUT);
    res.status(result?.ok ? 200 : result?.status).json(result?.data);
  } catch (err) {
    logger.warn({ err: err }, "[Training] /start error:");
    res.status(500).json({ error: "Failed to start training" });
  }
});

router.post("/stop", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await proxyToAI("/training/stop", "POST");
    res.status(result?.ok ? 200 : result?.status).json(result?.data);
  } catch (err) {
    logger.warn({ err: err }, "[Training] /stop error:");
    res.status(500).json({ error: "Failed to stop training" });
  }
});

router.get("/status", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await proxyToAI("/training/status", "GET");
    res
      .status(result?.ok ? 200 : result?.status)
      .json(result.ok ? toTrainingStatusDto(result.data) : result.data);
  } catch (err) {
    logger.warn({ err: err }, "[Training] /status error:");
    res.status(500).json({ error: "Failed to get training status" });
  }
});

router.post("/session", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const result = await proxyToAI(
      "/training/schedule",
      "POST",
      body,
      LONG_TIMEOUT,
    );
    res.status(result?.ok ? 200 : result?.status).json(result?.data);
  } catch (err) {
    logger.warn({ err: err }, "[Training] /session error:");
    res.status(500).json({ error: "Failed to run training session" });
  }
});

router.get("/datasets", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await proxyToAI("/training/datasets", "GET");
    res
      .status(result?.ok ? 200 : result?.status)
      .json(result.ok ? toDatasetDto(result.data) : result.data);
  } catch (err) {
    logger.warn({ err: err }, "[Training] /datasets error:");
    res.status(500).json({ error: "Failed to get dataset stats" });
  }
});

router.get("/schedule", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [status, continuous, datasets] = await Promise.all([
      proxyToAI("/training/status", "GET"),
      proxyToAI("/training/continuous/status", "GET"),
      proxyToAI("/training/datasets", "GET"),
    ]);
    const result = !status.ok
      ? status
      : !continuous.ok
        ? continuous
        : !datasets.ok
          ? datasets
        : {
            ok: true,
            status: 200,
            data: toScheduleDto(
              status.data,
              continuous.data,
              datasets.data,
            ),
          };
    res.status(result?.ok ? 200 : result?.status).json(result?.data);
  } catch (err) {
    logger.warn({ err: err }, "[Training] /schedule error:");
    res.status(500).json({ error: "Failed to get training schedule" });
  }
});

// POST /api/training/internal/session-complete
// Called by the Diffusion Gateway after each training session completes.
// Triggers an immediate weight pull from MaxCore + calibration, rather than
// waiting up to 10 minutes for the periodic sync timer to fire.
// Protected by BOOSTERSTATE_SECRET bearer token (CSRF-exempt via csrf?.ts).
const _INTERNAL_SECRET_HOOK = process.env.BOOSTERSTATE_SECRET || "";
router.post(
  "/internal/session-complete",
  async (req: Request, res: Response) => {
    const auth = (req.headers["authorization"] as string | undefined) ?? "";
    const token = auth?.startsWith("Bearer ") ? auth?.slice(7) : "";
    if (!_INTERNAL_SECRET_HOOK || token !== _INTERNAL_SECRET_HOOK) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { session_label, simulated_years, total_sessions } = req.body ?? {};
    logger.info(
      { session_label, simulated_years, total_sessions },
      "[Training] Internal session-complete hook — triggering immediate weight sync",
    );
    syncWeightsNow().catch((err) =>
      logger.warn({ err: err instanceof Error ? err?.message : String(err) }, "[Training] Post-session weight sync error:",
      ),
    );
    return res.json({ ok: true, sync: "triggered" });
  },
);

export default router;
