import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { Agent, fetch as undiciFetch } from "undici";
import platformRules from "../platform_rules.json";
import {
  contentAwarenessService,
  type ContentAwarenessContext,
} from "../services/contentAwarenessService.js";
import {
  buildGenerationEnrichment,
  type GenerationEnrichment,
} from "../services/autoPostGenerator.js";
import { MAXCORE_URL, MAXCORE_API_KEY } from "../config/maxcore.js";
import { boundGenerationOwner, modelAuthHeaders } from "../config/model-auth.js";

const router: IRouter = Router();

// ─── Model connection pool ──────────────────────────────────────────────────
// Multimodal generation fans out to several upstream model calls per request
// (analyze + N per-asset generations). Under concurrent load a single asset
// can legitimately sit in-flight for minutes. The bare global `fetch` (undici)
// applies a default 300s headersTimeout, which aborts valid in-flight model
// calls and surfaces as a 500. This pool raises that ceiling well past the
// slowest observed multimodal render so honest, still-working requests are
// never killed mid-flight. Same keep-alive pattern used by model-proxy.ts.
const _modelPool = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connections: 32,
  pipelining: 1,
  headersTimeout: 0,
  bodyTimeout: 0,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type InputModality = "text" | "url" | "image" | "audio" | "video";
type OutputModality = "text" | "image" | "audio" | "video";

type Platform =
  | "facebook"
  | "instagram"
  | "threads"
  | "tiktok"
  | "youtube"
  | "google_business"
  | "linkedin";

type PackId =
  | "singlereleasefull_pack"
  | "announcement_pack"
  | "tourdates_pack"
  | "evergreenbrand_pack";

interface PlatformAssetSpec {
  id: string;
  platform: Platform;
  modality: OutputModality;
  purpose: string;
}

interface GenerationRequest {
  awareness?: unknown;
  extra_context?: unknown;
  id: string;
  userId: string;
  artistProfileId?: string;
  input: {
    modality: InputModality;
    payload: string;
    metadata?: Record<string, unknown>;
  };
  platforms: Platform[];
  packId?: PackId;
  intent?: string;
  constraints?: {
    length?: "short" | "medium" | "long";
    styleTags?: string[];
    language?: string;
  };
}

interface GeneratedAsset {
  id: string;
  modality: OutputModality;
  payload: string;
  platform?: Platform;
  slotId?: string;
  metadata?: Record<string, unknown>;
}

interface TaskStep {
  id: string;
  type: "analyze" | "generate";
  worker: "text" | "image" | "audio" | "video";
  inputFrom: "normalizedInput" | string[];
  params?: Record<string, unknown>;
}

interface TaskPlan {
  requestId: string;
  steps: TaskStep[];
}

interface MultimodalPackage {
  awareness_receipts: Record<string, WorkerAwareness>;
  requestId: string;
  assets: GeneratedAsset[];
  plan: TaskPlan;
}

// ─── Pack Definitions ─────────────────────────────────────────────────────────

const PACK_DEFINITIONS: Record<PackId, PlatformAssetSpec[]> = {
  singlereleasefull_pack: [
    {
      id: "fb_post",
      platform: "facebook",
      modality: "text",
      purpose: "Main FB post copy",
    },
    {
      id: "ig_caption",
      platform: "instagram",
      modality: "text",
      purpose: "IG feed caption",
    },
    {
      id: "threads_post",
      platform: "threads",
      modality: "text",
      purpose: "Threads announcement",
    },
    {
      id: "tt_caption",
      platform: "tiktok",
      modality: "text",
      purpose: "TikTok caption + hashtags",
    },
    {
      id: "yt_description",
      platform: "youtube",
      modality: "text",
      purpose: "YouTube description",
    },
    {
      id: "yt_title",
      platform: "youtube",
      modality: "text",
      purpose: "YouTube title options",
    },
    {
      id: "gb_post",
      platform: "google_business",
      modality: "text",
      purpose: "Google Business update",
    },
    {
      id: "li_post",
      platform: "linkedin",
      modality: "text",
      purpose: "Professional angle post",
    },
    {
      id: "cover_image",
      platform: "instagram",
      modality: "image",
      purpose: "Cover/thumbnail cross-platform",
    },
    {
      id: "story_background",
      platform: "instagram",
      modality: "image",
      purpose: "Story background art",
    },
    {
      id: "tt_voiceover_audio",
      platform: "tiktok",
      modality: "audio",
      purpose: "Voiceover audio for TikTok short",
    },
    {
      id: "yt_voiceover_audio",
      platform: "youtube",
      modality: "audio",
      purpose: "Voiceover for teaser video",
    },
    {
      id: "tt_short_video",
      platform: "tiktok",
      modality: "video",
      purpose: "Vertical short teaser",
    },
    {
      id: "yt_short_video",
      platform: "youtube",
      modality: "video",
      purpose: "YouTube Short teaser",
    },
  ],

  announcement_pack: [
    {
      id: "fb_post",
      platform: "facebook",
      modality: "text",
      purpose: "FB announcement copy",
    },
    {
      id: "ig_caption",
      platform: "instagram",
      modality: "text",
      purpose: "IG announcement caption",
    },
    {
      id: "threads_post",
      platform: "threads",
      modality: "text",
      purpose: "Threads announcement",
    },
    {
      id: "tt_caption",
      platform: "tiktok",
      modality: "text",
      purpose: "TikTok caption",
    },
    {
      id: "yt_description",
      platform: "youtube",
      modality: "text",
      purpose: "YouTube description",
    },
    {
      id: "li_post",
      platform: "linkedin",
      modality: "text",
      purpose: "LinkedIn announcement",
    },
    {
      id: "cover_image",
      platform: "instagram",
      modality: "image",
      purpose: "Announcement visual",
    },
  ],

  tourdates_pack: [
    {
      id: "fb_post",
      platform: "facebook",
      modality: "text",
      purpose: "Tour dates FB post",
    },
    {
      id: "ig_caption",
      platform: "instagram",
      modality: "text",
      purpose: "Tour dates IG caption",
    },
    {
      id: "threads_post",
      platform: "threads",
      modality: "text",
      purpose: "Tour dates Threads post",
    },
    {
      id: "tt_caption",
      platform: "tiktok",
      modality: "text",
      purpose: "TikTok tour hype caption",
    },
    {
      id: "gb_post",
      platform: "google_business",
      modality: "text",
      purpose: "Google Business event post",
    },
    {
      id: "tour_poster",
      platform: "instagram",
      modality: "image",
      purpose: "Tour poster — cross-platform",
    },
    {
      id: "fb_event_image",
      platform: "facebook",
      modality: "image",
      purpose: "Facebook event cover image",
    },
    {
      id: "tt_hype_video",
      platform: "tiktok",
      modality: "video",
      purpose: "Short hype clip for tour",
    },
  ],

  evergreenbrand_pack: [
    {
      id: "fb_post",
      platform: "facebook",
      modality: "text",
      purpose: "Evergreen brand story",
    },
    {
      id: "ig_caption",
      platform: "instagram",
      modality: "text",
      purpose: "Brand aesthetic caption",
    },
    {
      id: "threads_post",
      platform: "threads",
      modality: "text",
      purpose: "Conversational brand post",
    },
    {
      id: "li_post",
      platform: "linkedin",
      modality: "text",
      purpose: "Professional brand statement",
    },
    {
      id: "brand_image",
      platform: "instagram",
      modality: "image",
      purpose: "Brand visual identity",
    },
    {
      id: "yt_thumbnail",
      platform: "youtube",
      modality: "image",
      purpose: "YouTube channel art",
    },
    {
      id: "brand_audio",
      platform: "youtube",
      modality: "audio",
      purpose: "Brand voiceover / intro",
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PlatformRules = typeof platformRules;

function getPlatformRules(
  platform: string,
): PlatformRules[keyof PlatformRules] | null {
  return (
    (platformRules as Record<string, PlatformRules[keyof PlatformRules]>)[
      platform
    ] ?? null
  );
}

function safeExtractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

function validateTaskPlan(raw: unknown, requestId: string): TaskPlan {
  if (
    raw &&
    typeof raw === "object" &&
    "steps" in raw &&
    Array.isArray((raw as TaskPlan).steps)
  ) {
    return raw as TaskPlan;
  }
  return { requestId, steps: [] };
}

async function maxcorePost(path: string, body: unknown): Promise<unknown> {
  const res = await undiciFetch(`${MAXCORE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": MAXCORE_API_KEY,
    },
    body: JSON.stringify(body),
    dispatcher: _modelPool,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw Object.assign(new Error(`maxcore ${path} → ${res.status}: ${err}`), { status: res.status });
  }
  return res.json();
}

async function maxcoreGet(path: string, timeoutMs: number): Promise<unknown> {
  const res = await undiciFetch(`${MAXCORE_URL}${path}`, {
    method: "GET",
    headers: { "X-Api-Key": MAXCORE_API_KEY },
    dispatcher: _modelPool,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw Object.assign(new Error(`maxcore GET ${path} → ${res.status}: ${err}`), { status: res.status });
  }
  return res.json();
}

/**
 * Submit a real audio render job and wait for it to complete.
 * Returns the audio URL when done. Exploits the fast-path: if the POST
 * response already has status:"done" and a url (cache hit), returns
 * immediately without a single poll. Otherwise polls /api/audio-job/:id
 * every 300 ms until terminal status or the synchronous request budget expires.
 */
async function renderAudioJob(
  genre: string,
  duration: number,
  awareness?: WorkerAwareness,
  timeoutMs = 120_000,
): Promise<string | null> {
  type JobResp = Record<string, unknown>;
  const submit = (await maxcorePost("/api/generate/audio", {
    genre,
    duration,
    ...(awareness ?? {}),
  })) as JobResp;

  // Fast-path: cache hit — url is included in the POST response itself.
  if (submit["status"] === "done" && typeof submit["url"] === "string") {
    return submit["url"] as string;
  }

  const jobId = submit["job_id"] as string | undefined;
  if (!jobId) return null;

  // This endpoint is synchronous; do not leave its HTTP request open forever
  // when an asynchronous render is stalled. The upstream job is not cancelled.
  const deadline = Date.now() + timeoutMs;
  const POLL_MS = 300;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const job = (await maxcoreGet(`/api/audio-job/${encodeURIComponent(jobId)}`,
        Math.min(10_000, remaining))) as JobResp;
      if (job["status"] === "done" && typeof job["url"] === "string") {
        return job["url"] as string;
      }
      if (job["status"] === "error" || job["status"] === "cancelled") {
        return null;
      }
    } catch (error) {
      if ((error as { status?: number }).status === 503 ||
          (error as { status?: number }).status === 401 ||
          (error as { status?: number }).status === 403 ||
          (error as { status?: number }).status === 404) throw error;
      // Non-dependency transient polling errors may be retried.
    }
  }
  return null;
}

// ─── Step 1: Normalize input via maxcore /analyze ─────────────────────────────

async function normalizeInput(
  req: GenerationRequest,
  enrichment: GenerationEnrichment,
): Promise<unknown> {
  return maxcorePost("/analyze", {
    modality: req.input.modality,
    payload: req.input.payload,
    artistProfileId: req.artistProfileId,
    platforms: req.platforms,
    intent: req.intent,
    ...(req.awareness !== undefined ? { awareness: req.awareness } : {}),
    ...(req.extra_context !== undefined ? { extra_context: req.extra_context } : {}),
  });
}

// ─── Step 2: Plan tasks via maxcore /generate/text (mode=planner) ─────────────

async function planTasks(
  normalized: unknown,
  req: GenerationRequest,
): Promise<TaskPlan> {
  const packSpec = req.packId ? PACK_DEFINITIONS[req.packId] : null;

  const raw = await maxcorePost("/generate/text", {
    mode: "planner",
    input: {
      normalized,
      request: req,
      packSpec,
    },
  });

  const plan = validateTaskPlan(raw, req.id);

  if (plan.steps.length === 0) {
    throw Object.assign(new Error("MaxCore did not return a generation plan"), { status: 503 });
  }
  return plan;
}

function buildFallbackPlan(
  requestId: string,
  normalized: unknown,
  req: GenerationRequest,
  packSpec: PlatformAssetSpec[],
): TaskPlan {
  const steps: TaskStep[] = [
    {
      id: "analysis_step",
      type: "analyze",
      worker: "text",
      inputFrom: "normalizedInput",
      params: { intent: req.intent ?? "engagement" },
    },
  ];

  const byModality: Record<string, PlatformAssetSpec[]> = {};
  for (const slot of packSpec) {
    (byModality[slot.modality] ??= []).push(slot);
  }

  for (const [modality, slots] of Object.entries(byModality)) {
    steps.push({
      id: `step_${modality}`,
      type: "generate",
      worker: modality as TaskStep["worker"],
      inputFrom: ["analysis_step"],
      params: {
        slots,
        platforms: slots.map((s) => s.platform),
        constraints: req.constraints ?? {},
      },
    });
  }

  return { requestId, steps };
}

// ─── Workers ──────────────────────────────────────────────────────────────────

// The final awareness string sent to MaxCore (enrichment block + live signals).
type WorkerAwareness = Record<string, unknown> | null;

const textWorker = {
  async run(
    step: TaskStep,
    inputs: unknown,
    awareness: WorkerAwareness,
  ): Promise<GeneratedAsset[]> {
    const result = (await maxcorePost("/generate/text", {
      mode: "content",
      step,
      inputs,
      ...(awareness ?? {}),
    })) as {
      outputs: Array<{
        text: string;
        platform: Platform;
        slotId: string;
        meta: Record<string, unknown>;
      }>;
    };

    return (result.outputs ?? []).map((o) => ({
      id: randomUUID(),
      modality: "text" as OutputModality,
      payload: o.text,
      platform: o.platform,
      slotId: o.slotId,
      metadata: { ...o.meta, awareness_receipt: awareness, ...("snapshot_id" in result ? { snapshot_id: result.snapshot_id } : {}) },
    }));
  },
};

const imageWorker = {
  async run(
    step: TaskStep,
    inputs: unknown,
    awareness: WorkerAwareness,
  ): Promise<GeneratedAsset[]> {
    const result = (await maxcorePost("/generate/image", {
      step,
      inputs,
      ...(awareness ?? {}),
    })) as {
      outputs: Array<{
        url: string;
        platform: Platform;
        slotId: string;
        meta: Record<string, unknown>;
      }>;
    };

    return (result.outputs ?? []).map((o) => ({
      id: randomUUID(),
      modality: "image" as OutputModality,
      payload: o.url,
      platform: o.platform,
      slotId: o.slotId,
      metadata: { ...o.meta, awareness_receipt: awareness, ...("snapshot_id" in result ? { snapshot_id: result.snapshot_id } : {}) },
    }));
  },
};

const audioWorker = {
  async run(
    step: TaskStep,
    inputs: unknown,
    awareness: WorkerAwareness,
  ): Promise<GeneratedAsset[]> {
    const params = step.params ?? {};
    const slots = (params["slots"] as Array<{ id: string; platform: string }> | undefined) ?? [];
    const maxDuration = (params["maxDurationSec"] as number | undefined) ?? 30;

    // Derive genre from normalised inputs (semantic.genre) so each slot gets
    // a contextually appropriate track rather than a generic fallback.
    const normalizedInputs =
      inputs != null && typeof inputs === "object"
        ? (inputs as Record<string, unknown>)
        : {};
    const genre =
      (
        (normalizedInputs["semantic"] as Record<string, unknown> | undefined)
          ?.["genre"] as string | undefined
      ) ?? "music";

    if (slots.length === 0) {
      // No per-slot spec — generate one track and return it.
      const url = await renderAudioJob(genre, maxDuration, awareness ?? undefined);
      if (!url) {
        throw new Error(
          `audio generation failed (genre=${genre}, duration=${maxDuration}s): job errored, was cancelled, or exceeded the synchronous wait budget`,
        );
      }
      return [
        {
          id: randomUUID(),
          modality: "audio" as OutputModality,
          payload: url,
          platform: "general" as Platform,
          slotId: "",
          metadata: { genre, duration: maxDuration },
        },
      ];
    }

    // Generate one track per slot in parallel; all fast-path hits resolve
    // simultaneously from the in-process cache (< 100 ms each).
    const settled = await Promise.allSettled(
      slots.map((slot) =>
        renderAudioJob(genre, maxDuration, awareness ?? undefined).then((url) => ({
          url,
          slot,
        })),
      ),
    );

    const successes: Array<{ url: string; slot: { id: string; platform: string } }> = [];
    const failedSlotIds: string[] = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value.url !== null) {
        successes.push(r.value as { url: string; slot: { id: string; platform: string } });
      } else {
        failedSlotIds.push(slots[i]?.id ?? `slot-${i}`);
      }
    });

    // All slots failed → explicit error, never a silent empty success.
    if (successes.length === 0) {
      throw new Error(
        `audio generation failed for all ${slots.length} slots (genre=${genre}): jobs errored or timed out`,
      );
    }
    // Partial failure → surface it loudly in logs and in asset metadata so
    // callers can detect dropped slots instead of assuming full success.
    if (failedSlotIds.length > 0) {
      console.warn(
        `[multimodal] audioWorker partial failure — ${failedSlotIds.length}/${slots.length} slots dropped: ${failedSlotIds.join(", ")}`,
      );
    }

    return successes.map(({ url, slot }) => ({
      id: randomUUID(),
      modality: "audio" as OutputModality,
      payload: url,
      platform: slot.platform as Platform,
      slotId: slot.id,
      metadata: {
        genre,
        duration: maxDuration,
        ...(failedSlotIds.length > 0 ? { partialFailure: true, failedSlots: failedSlotIds } : {}),
      },
    }));
  },
};

const videoWorker = {
  async run(
    step: TaskStep,
    inputs: unknown,
    awareness: WorkerAwareness,
  ): Promise<GeneratedAsset[]> {
    const result = (await maxcorePost("/generate/video", {
      step,
      inputs,
      ...(awareness ?? {}),
    })) as {
      outputs: Array<{
        url: string;
        platform: Platform;
        slotId: string;
        meta: Record<string, unknown>;
      }>;
    };

    return (result.outputs ?? []).map((o) => ({
      id: randomUUID(),
      modality: "video" as OutputModality,
      payload: o.url,
      platform: o.platform,
      slotId: o.slotId,
      metadata: { ...o.meta, awareness_receipt: awareness, ...("snapshot_id" in result ? { snapshot_id: result.snapshot_id } : {}) },
    }));
  },
};

const workers: Record<
  string,
  {
    run: (
      step: TaskStep,
      inputs: unknown,
      awareness: WorkerAwareness,
    ) => Promise<GeneratedAsset[]>;
  }
> = {
  text: textWorker,
  image: imageWorker,
  audio: audioWorker,
  video: videoWorker,
};

// ─── Orchestrator ─────────────────────────────────────────────────────────────

async function handleGeneration(
  req: GenerationRequest,
): Promise<MultimodalPackage> {
  // Assemble generation-time enrichment (artist profile, releases, proven hook
  // patterns, trending) from the platform data layer. Guarded so it never
  // blocks or fails the pipeline; absent data is simply omitted.
  const enrichment = await buildGenerationEnrichment({
    userId: req.userId,
    artistProfileId: req.artistProfileId,
    platforms: req.platforms,
  });

  const normalized = await normalizeInput(req, enrichment);
  const plan = await planTasks(normalized, req);

  // Core supplies required snapshot receipts; failures must abort generation.
  const [textAwareness, imageAwareness, audioAwareness, videoAwareness] =
    await Promise.all([
      contentAwarenessService.getContextForMode("social"),
      contentAwarenessService.getContextForMode("content"),
      contentAwarenessService.getContextForMode("music"),
      contentAwarenessService.getContextForMode("video_script"),
    ]);

  // Merge the enrichment block with live per-modality awareness into a single
  // awareness string per worker. Enrichment leads so artist/release/hook
  // context is the first signal the model conditions on.
  const mergeAwareness = (
    ctx: ContentAwarenessContext | null,
  ): WorkerAwareness => {
    if (!ctx?.snapshot_id) {
      throw Object.assign(new Error("Required awareness receipt missing"), { status: 503 });
    }
    return {
      ...ctx,
      ...(req.awareness !== undefined ? { awareness: req.awareness } : {}),
      ...(req.extra_context !== undefined ? { extra_context: req.extra_context } : {}),
    };
  };

  const awarenessMap: Record<string, WorkerAwareness> = {
    text: mergeAwareness(textAwareness),
    image: mergeAwareness(imageAwareness),
    audio: mergeAwareness(audioAwareness),
    video: mergeAwareness(videoAwareness),
  };

  const stepOutputs = new Map<string, GeneratedAsset[]>();

  // Separate steps into dependency tiers so independent work runs in parallel.
  // A step is "ready" when all its inputFrom dependencies are resolved.
  const pending = plan.steps.filter((s) => s.type !== "analyze");
  const completed = new Set<string>(["normalizedInput"]);
  // Analyze steps are folded into the normalized input and excluded from
  // `pending`; mark their ids resolved so generate steps that declare them in
  // `inputFrom` (e.g. ["analysis_step"]) become ready instead of deadlocking.
  for (const step of plan.steps) {
    if (step.type === "analyze") completed.add(step.id);
  }

  while (pending.length > 0) {
    // Find all steps whose inputs are fully resolved
    const ready = pending.filter((step) => {
      const deps =
        step.inputFrom === "normalizedInput"
          ? []
          : (step.inputFrom as string[]);
      return deps.every((d) => completed.has(d));
    });

    if (ready.length === 0) break; // avoid infinite loop on malformed plans

    // Run all ready steps concurrently
    await Promise.all(
      ready.map(async (step) => {
        const worker = workers[step.worker];
        if (!worker) {
          completed.add(step.id);
          return;
        }

        const inputs =
          step.inputFrom === "normalizedInput"
            ? { normalized }
            : {
                normalized,
                prior: (step.inputFrom as string[]).flatMap(
                  (id) => stepOutputs.get(id) ?? [],
                ),
              };

        const assets = await worker.run(
          step,
          inputs,
          awarenessMap[step.worker] ?? null,
        );
        stepOutputs.set(step.id, assets);
        completed.add(step.id);
      }),
    );

    // Remove completed steps from pending
    for (const step of ready) {
      const idx = pending.indexOf(step);
      if (idx !== -1) pending.splice(idx, 1);
    }
  }

  return {
    requestId: req.id,
    assets: Array.from(stepOutputs.values()).flat(),
    awareness_receipts: awarenessMap,
    plan,
  };
}

// ─── pdim helpers ─────────────────────────────────────────────────────────────

async function fetchCurriculumStyleTags(
  userId: string,
  platforms: Platform[],
): Promise<string[]> {
  try {
    const res = await undiciFetch(
      `${MAXCORE_URL}/storage/curriculum/${encodeURIComponent(userId)}`,
      {
        headers: { "X-Api-Key": MAXCORE_API_KEY },
        dispatcher: _modelPool,
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      top_performers?: Array<{ style_tags?: string[]; platform?: string }>;
    };
    const topPerformers = data.top_performers ?? [];
    const platformSet = new Set(platforms as string[]);
    const relevant = topPerformers.filter(
      (p) => !p.platform || platformSet.has(p.platform),
    );
    const tags = (relevant.length > 0 ? relevant : topPerformers)
      .flatMap((p) => p.style_tags ?? [])
      .filter(Boolean);
    return [...new Set(tags)].slice(0, 8);
  } catch {
    return [];
  }
}

function recordGenerationToFlywheel(
  pkg: MultimodalPackage,
  req: GenerationRequest,
): void {
  const seen = new Set<string>();
  for (const asset of pkg.assets) {
    if (!asset.platform) continue;
    const key = `${asset.platform}:${asset.modality}`;
    if (seen.has(key)) continue;
    seen.add(key);
    undiciFetch(`${MAXCORE_URL}/storage/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": MAXCORE_API_KEY,
      },
      body: JSON.stringify({
        user_id: req.userId,
        platform: asset.platform,
        engagement_rate: 0.5,
        content_type: asset.modality,
        style_tags: [
          ...(req.constraints?.styleTags ?? []),
          req.intent ?? "engagement",
          asset.modality,
        ].filter(Boolean),
      }),
      dispatcher: _modelPool,
    }).catch(() => {});
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/multimodal/packs", (_req: Request, res: Response) => {
  const summary: Record<
    string,
    { slotCount: number; modalities: string[]; platforms: string[] }
  > = {};
  for (const [packId, slots] of Object.entries(PACK_DEFINITIONS)) {
    summary[packId] = {
      slotCount: slots.length,
      modalities: [...new Set(slots.map((s) => s.modality))],
      platforms: [...new Set(slots.map((s) => s.platform))],
    };
  }
  res.json({
    packs: summary,
    packIds: Object.keys(PACK_DEFINITIONS),
    platformRules: Object.keys(platformRules),
  });
});

router.post("/multimodal/generate", async (req: Request, res: Response) => {
  const body = req.body as Partial<GenerationRequest>;
  // This route uses the server's own model credential for all fan-out calls.
  // Therefore only the private gateway's authenticated owner may select the
  // user identity; arbitrary public API credentials cannot impersonate it.
  const owner = modelAuthHeaders(req.headers, req.socket.remoteAddress)?.["X-MaxCore-User-Id"];
  if (!owner || !MAXCORE_API_KEY) {
    res.status(401).json({ error: "Authenticated MaxCore user identity is required" });
    return;
  }
  if (!boundGenerationOwner(req.headers, req.socket.remoteAddress, body?.userId)) {
    res.status(403).json({ error: "Generation userId does not match authenticated identity" });
    return;
  }

  if (
    !body.id ||
    !body.userId ||
    !body.input?.payload ||
    !body.platforms?.length
  ) {
    res.status(400).json({
      error: "Missing required fields: id, userId, input.payload, platforms",
    });
    return;
  }

  const genReq: GenerationRequest = {
    awareness: body.awareness,
    extra_context: body.extra_context,
    id: body.id,
    userId: body.userId,
    artistProfileId: body.artistProfileId,
    input: {
      modality: body.input.modality ?? "text",
      payload: body.input.payload,
      metadata: body.input.metadata,
    },
    platforms: body.platforms,
    packId: body.packId,
    intent: body.intent,
    constraints: body.constraints,
  };

  try {
    const pkg = await handleGeneration(genReq);
    recordGenerationToFlywheel(pkg, genReq);
    res.json(pkg);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status((err as { status?: number }).status === 503 ? 503 : 500).json({ error: "Generation failed", detail: message });
  }
});

export default router;
