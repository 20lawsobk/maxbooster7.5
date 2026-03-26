import { randomUUID } from 'crypto';
import { logger } from '../logger.js';
import {
  type GenerationRequest,
  type GeneratedAsset,
  type TaskStep,
  type TaskPlan,
  type MultimodalPackage,
  type Platform,
  type OutputModality,
  PACK_DEFINITIONS,
} from '@shared/types/multimodalGeneration.js';

const MAXCORE_URL = process.env.AI_SERVER_URL || 'https://secure-ai-forge.replit.app';
const MAXCORE_KEY = process.env.AI_SERVER_KEY || '';

async function maxcorePost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${MAXCORE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(MAXCORE_KEY ? { Authorization: `Bearer ${MAXCORE_KEY}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MaxCore ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function safeExtractJson(raw: string): any {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : raw;
  const braceStart = candidate.indexOf('{');
  const braceEnd = candidate.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd !== -1) {
    try {
      return JSON.parse(candidate.slice(braceStart, braceEnd + 1));
    } catch { }
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Could not parse JSON from MaxCore response');
  }
}

function validateTaskPlan(raw: any, requestId: string): TaskPlan {
  if (!raw || !Array.isArray(raw.steps)) {
    throw new Error('TaskPlan missing steps array');
  }
  const steps: TaskStep[] = raw.steps.map((s: any, i: number) => ({
    id: s.id || `step_${i}`,
    type: s.type === 'analyze' ? 'analyze' : 'generate',
    worker: ['text', 'image', 'audio', 'video'].includes(s.worker) ? s.worker : 'text',
    inputFrom: s.inputFrom || 'normalizedInput',
    params: s.params || {},
  }));
  return { requestId, steps };
}

async function normalizeInput(req: GenerationRequest): Promise<any> {
  try {
    return await maxcorePost('/analyze', {
      modality: req.input.modality,
      payload: req.input.payload,
      artistProfileId: req.artistProfileId,
      platforms: req.platforms,
      intent: req.intent,
      metadata: req.input.metadata,
    });
  } catch (err) {
    logger.warn('[MultimodalGen] MaxCore /analyze unavailable, using local fallback:', err);
    return {
      summary: req.input.payload,
      modality: req.input.modality,
      platforms: req.platforms,
      intent: req.intent,
      metadata: req.input.metadata || {},
    };
  }
}

async function planTasks(
  normalized: any,
  req: GenerationRequest,
): Promise<TaskPlan> {
  const packSpec = req.packId ? PACK_DEFINITIONS[req.packId] ?? null : null;

  try {
    const raw = await maxcorePost('/generate/text', {
      mode: 'planner',
      system: `
        You are a content orchestration planner for music artists.
        You receive normalized content, target platforms, and an optional packSpec.
        Output ONLY a JSON TaskPlan with this exact shape:
        {
          "steps": [
            { "id": "step_1", "type": "generate", "worker": "text", "inputFrom": "normalizedInput", "params": {} }
          ]
        }
        Create one step per output modality group (text assets, then image assets).
        Reuse the same normalizedInput analysis for all steps.
      `,
      input: { normalized, request: req, packSpec },
    });
    const text = typeof raw === 'string' ? raw : (raw.text || raw.content || JSON.stringify(raw));
    const planJson = safeExtractJson(text);
    return validateTaskPlan(planJson, req.id);
  } catch (err) {
    logger.warn('[MultimodalGen] MaxCore planner failed, building default plan:', err);
    return buildDefaultPlan(req);
  }
}

function buildDefaultPlan(req: GenerationRequest): TaskPlan {
  const packSpec = req.packId ? PACK_DEFINITIONS[req.packId] ?? null : null;
  const steps: TaskStep[] = [];

  if (packSpec) {
    const textSlots = packSpec.filter(s => s.modality === 'text');
    const imageSlots = packSpec.filter(s => s.modality === 'image');

    if (textSlots.length > 0) {
      steps.push({
        id: 'step_text',
        type: 'generate',
        worker: 'text',
        inputFrom: 'normalizedInput',
        params: { slots: textSlots },
      });
    }
    if (imageSlots.length > 0) {
      steps.push({
        id: 'step_image',
        type: 'generate',
        worker: 'image',
        inputFrom: 'normalizedInput',
        params: { slots: imageSlots },
      });
    }
  } else {
    for (const platform of req.platforms) {
      steps.push({
        id: `step_text_${platform}`,
        type: 'generate',
        worker: 'text',
        inputFrom: 'normalizedInput',
        params: { platform },
      });
    }
  }

  if (steps.length === 0) {
    steps.push({
      id: 'step_text_default',
      type: 'generate',
      worker: 'text',
      inputFrom: 'normalizedInput',
      params: {},
    });
  }

  return { requestId: req.id, steps };
}

const textWorker = {
  async run(step: TaskStep, inputs: any, req: GenerationRequest): Promise<GeneratedAsset[]> {
    const packSpec = req.packId ? PACK_DEFINITIONS[req.packId] ?? null : null;
    const slots = step.params?.slots || (step.params?.platform
      ? [{ id: `${step.params.platform}_post`, platform: step.params.platform, modality: 'text', purpose: 'Post copy' }]
      : packSpec?.filter(s => s.modality === 'text') || [{ id: 'post', platform: req.platforms[0], modality: 'text', purpose: 'Post copy' }]);

    try {
      const result = await maxcorePost('/generate/text', {
        mode: 'content',
        step,
        inputs,
        slots,
        constraints: req.constraints,
        artistProfileId: req.artistProfileId,
        intent: req.intent,
      });

      const outputs = Array.isArray(result.outputs) ? result.outputs : [];
      if (outputs.length > 0) {
        return outputs.map((o: any) => ({
          id: randomUUID(),
          modality: 'text' as OutputModality,
          payload: o.text || o.content || '',
          platform: o.platform as Platform | undefined,
          slotId: o.slotId,
          purpose: o.purpose,
          metadata: o.meta ?? {},
        }));
      }
    } catch (err) {
      logger.warn('[MultimodalGen] MaxCore text worker failed, using fallback:', err);
    }

    return localTextFallback(slots, inputs, req);
  },
};

function localTextFallback(
  slots: Array<{ id: string; platform: any; modality: string; purpose: string }>,
  inputs: any,
  req: GenerationRequest,
): GeneratedAsset[] {
  const summary: string = inputs?.normalized?.summary || inputs?.summary || req.input.payload || '';
  const intent = req.intent || 'announcement';
  const styleTags = req.constraints?.styleTags?.join(', ') || '';

  const platformTemplates: Record<string, (s: string) => string> = {
    facebook: (s) => `🎵 ${s}\n\nShare this with someone who needs to hear it! #NewMusic #MusicRelease`,
    instagram: (s) => `${s} ✨\n\n#NewMusic #MusicArtist #NewRelease`,
    threads: (s) => `Just dropped: ${s} — go check it out!`,
    tiktok: (s) => `POV: You just discovered your new favorite track 🎧\n${s}`,
    youtube: (s) => `${s}\n\n🎬 Subscribe for more music, behind-the-scenes, and exclusive content.\n\n#YouTube #Music #NewRelease`,
    google_business: (s) => `New release: ${s}. Available now on all major streaming platforms!`,
    linkedin: (s) => `Excited to share my latest work: ${s}. This project represents months of creative work and artistic growth. #Music #CreativeIndustry`,
  };

  return slots.map(slot => {
    const platformFn = platformTemplates[slot.platform] || ((s: string) => s);
    return {
      id: randomUUID(),
      modality: 'text' as OutputModality,
      payload: platformFn(summary),
      platform: slot.platform as Platform,
      slotId: slot.id,
      purpose: slot.purpose,
      metadata: { source: 'local_fallback', intent, styleTags },
    };
  });
}

const imageWorker = {
  async run(step: TaskStep, inputs: any, req: GenerationRequest): Promise<GeneratedAsset[]> {
    const slots = step.params?.slots || [];
    try {
      const result = await maxcorePost('/generate/image', {
        step,
        inputs,
        slots,
        constraints: req.constraints,
        artistProfileId: req.artistProfileId,
        intent: req.intent,
      });

      const outputs = Array.isArray(result.outputs) ? result.outputs : [];
      return outputs.map((o: any) => ({
        id: randomUUID(),
        modality: 'image' as OutputModality,
        payload: o.url || o.src || '',
        platform: o.platform as Platform | undefined,
        slotId: o.slotId,
        purpose: o.purpose,
        metadata: o.meta ?? {},
      }));
    } catch (err) {
      logger.warn('[MultimodalGen] MaxCore image worker failed:', err);
      return slots.map((slot: any) => ({
        id: randomUUID(),
        modality: 'image' as OutputModality,
        payload: '',
        platform: slot.platform as Platform,
        slotId: slot.id,
        purpose: slot.purpose,
        metadata: { source: 'local_fallback', note: 'image_generation_unavailable' },
      }));
    }
  },
};

const audioWorker = {
  async run(step: TaskStep, inputs: any, req: GenerationRequest): Promise<GeneratedAsset[]> {
    try {
      const result = await maxcorePost('/generate/audio', { step, inputs, constraints: req.constraints });
      const outputs = Array.isArray(result.outputs) ? result.outputs : [];
      return outputs.map((o: any) => ({
        id: randomUUID(),
        modality: 'audio' as OutputModality,
        payload: o.url || '',
        platform: o.platform as Platform | undefined,
        slotId: o.slotId,
        metadata: o.meta ?? {},
      }));
    } catch (err) {
      logger.warn('[MultimodalGen] MaxCore audio worker failed:', err);
      return [];
    }
  },
};

const videoWorker = {
  async run(step: TaskStep, inputs: any, req: GenerationRequest): Promise<GeneratedAsset[]> {
    try {
      const result = await maxcorePost('/generate/video', { step, inputs, constraints: req.constraints });
      const outputs = Array.isArray(result.outputs) ? result.outputs : [];
      return outputs.map((o: any) => ({
        id: randomUUID(),
        modality: 'video' as OutputModality,
        payload: o.url || '',
        platform: o.platform as Platform | undefined,
        slotId: o.slotId,
        metadata: o.meta ?? {},
      }));
    } catch (err) {
      logger.warn('[MultimodalGen] MaxCore video worker failed:', err);
      return [];
    }
  },
};

const workers = {
  text: textWorker,
  image: imageWorker,
  audio: audioWorker,
  video: videoWorker,
};

export async function handleGeneration(req: GenerationRequest): Promise<MultimodalPackage> {
  logger.info(`[MultimodalGen] Starting generation: id=${req.id}, pack=${req.packId ?? 'none'}, platforms=${req.platforms.join(',')}`);

  const normalized = await normalizeInput(req);
  const plan = await planTasks(normalized, req);

  const stepOutputs = new Map<string, GeneratedAsset[]>();

  for (const step of plan.steps) {
    const worker = workers[step.worker];
    if (!worker) {
      logger.warn(`[MultimodalGen] Unknown worker: ${step.worker}`);
      continue;
    }

    const inputs =
      step.inputFrom === 'normalizedInput'
        ? { normalized }
        : {
            normalized,
            stepAssets: (Array.isArray(step.inputFrom) ? step.inputFrom : [step.inputFrom])
              .flatMap(id => stepOutputs.get(id) ?? []),
          };

    const assets = await worker.run(step, inputs, req);
    stepOutputs.set(step.id, assets);
    logger.info(`[MultimodalGen] Step ${step.id} (${step.worker}) → ${assets.length} asset(s)`);
  }

  const allAssets = Array.from(stepOutputs.values()).flat();

  logger.info(`[MultimodalGen] Done: id=${req.id}, total_assets=${allAssets.length}`);

  return {
    requestId: req.id,
    assets: allAssets,
    plan,
    generatedAt: new Date().toISOString(),
  };
}
