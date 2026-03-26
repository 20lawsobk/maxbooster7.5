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
import {
  PLATFORM_RULES,
  getRules,
  enforceTextLength,
  enforceHashtagLimit,
  type PlatformRules,
} from '@shared/config/platformRules.js';

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
  const platformRulesSubset = req.platforms.reduce<Record<string, PlatformRules>>((acc, p) => {
    acc[p] = getRules(p);
    return acc;
  }, {});

  try {
    return await maxcorePost('/analyze', {
      modality: req.input.modality,
      payload: req.input.payload,
      artistProfileId: req.artistProfileId,
      platforms: req.platforms,
      intent: req.intent,
      metadata: req.input.metadata,
      platformRules: platformRulesSubset,
    });
  } catch (err) {
    logger.warn('[MultimodalGen] MaxCore /analyze unavailable, using local fallback:', err);
    return {
      summary: req.input.payload,
      modality: req.input.modality,
      platforms: req.platforms,
      intent: req.intent,
      metadata: req.input.metadata || {},
      platformRules: platformRulesSubset,
    };
  }
}

function buildStepParamsForPlatform(
  platform: Platform,
  modality: 'text' | 'image' | 'audio' | 'video',
  slotId?: string,
  purpose?: string,
): Record<string, any> {
  const rules = getRules(platform);
  const base: Record<string, any> = { platform, slotId, purpose };

  if (modality === 'text') {
    base.maxLength = rules.text.maxLength ?? rules.text.descriptionMax ?? 5000;
    base.recommendedLength = rules.text.recommendedLength;
    base.tone = rules.text.tone;
    base.hashtagsAllowed = rules.text.hashtags?.allowed ?? false;
    base.maxHashtags = rules.text.hashtags?.allowed ? (rules.text.hashtags.max ?? 5) : 0;
    if (platform === 'youtube') {
      base.titleMax = rules.text.titleMax;
      base.descriptionMax = rules.text.descriptionMax;
    }
  } else if (modality === 'image') {
    base.aspectRatios = rules.image.aspectRatios;
    base.recommendedAspectRatio = rules.image.recommended ?? rules.image.aspectRatios[0];
  } else if (modality === 'video') {
    base.aspectRatios = rules.video.aspectRatios;
    base.recommendedAspectRatio = rules.video.aspectRatios[0];
    base.maxDurationSec = rules.video.maxDurationSec;
    base.recommendedDurationSec = rules.video.recommendedDurationSec ?? rules.video.recommendedShortSec;
    base.requiresHook = rules.video.requiresHook ?? false;
  } else if (modality === 'audio') {
    base.voiceover = rules.audio.voiceover;
    base.maxDurationSec = rules.audio.maxDurationSec;
    base.audioStyle = rules.audio.style ?? rules.audio.tone ?? [];
  }

  return base;
}

async function planTasks(normalized: any, req: GenerationRequest): Promise<TaskPlan> {
  const packSpec = req.packId ? PACK_DEFINITIONS[req.packId] ?? null : null;

  const platformRulesForPack = req.platforms.reduce<Record<string, PlatformRules>>((acc, p) => {
    acc[p] = getRules(p);
    return acc;
  }, {});

  try {
    const raw = await maxcorePost('/generate/text', {
      mode: 'planner',
      system: `
        You are a content orchestration planner for music artists.
        You receive normalized content, target platforms, an optional packSpec, and per-platform rules.
        Use the platformRules to set accurate constraints (character limits, aspect ratios, durations, tone, hashtag rules) in each step's params.
        Output ONLY a JSON TaskPlan:
        {
          "steps": [
            {
              "id": "step_1",
              "type": "generate",
              "worker": "text",
              "inputFrom": "normalizedInput",
              "params": {
                "platform": "<platform>",
                "slotId": "<slotId>",
                "maxLength": <n>,
                "recommendedLength": <n>,
                "tone": ["<tone>"],
                "hashtagsAllowed": <bool>,
                "maxHashtags": <n>,
                "aspectRatio": "<ratio>",
                "maxDurationSec": <n>,
                "requiresHook": <bool>
              }
            }
          ]
        }
        Group text assets into one step and image assets into one step.
        For audio/video slots, create individual steps per slot.
      `,
      input: {
        normalized,
        request: req,
        packSpec,
        platformRules: platformRulesForPack,
      },
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
    const audioSlots = packSpec.filter(s => s.modality === 'audio');
    const videoSlots = packSpec.filter(s => s.modality === 'video');

    if (textSlots.length > 0) {
      steps.push({
        id: 'step_text',
        type: 'generate',
        worker: 'text',
        inputFrom: 'normalizedInput',
        params: {
          slots: textSlots.map(slot => ({
            ...slot,
            ...buildStepParamsForPlatform(slot.platform as Platform, 'text', slot.id, slot.purpose),
          })),
        },
      });
    }

    if (imageSlots.length > 0) {
      steps.push({
        id: 'step_image',
        type: 'generate',
        worker: 'image',
        inputFrom: 'normalizedInput',
        params: {
          slots: imageSlots.map(slot => ({
            ...slot,
            ...buildStepParamsForPlatform(slot.platform as Platform, 'image', slot.id, slot.purpose),
          })),
        },
      });
    }

    for (const slot of audioSlots) {
      steps.push({
        id: `step_audio_${slot.id}`,
        type: 'generate',
        worker: 'audio',
        inputFrom: 'normalizedInput',
        params: buildStepParamsForPlatform(slot.platform as Platform, 'audio', slot.id, slot.purpose),
      });
    }

    for (const slot of videoSlots) {
      steps.push({
        id: `step_video_${slot.id}`,
        type: 'generate',
        worker: 'video',
        inputFrom: 'normalizedInput',
        params: buildStepParamsForPlatform(slot.platform as Platform, 'video', slot.id, slot.purpose),
      });
    }
  } else {
    const rawModality = (req.constraints?.outputModality as string) || 'text';
    const outputModality: 'text' | 'image' | 'audio' | 'video' =
      ['text', 'image', 'audio', 'video'].includes(rawModality)
        ? (rawModality as 'text' | 'image' | 'audio' | 'video')
        : 'text';

    if (outputModality === 'image') {
      const imageSlots = req.platforms.map(p => ({
        id: `${p}_image`,
        platform: p,
        modality: 'image',
        purpose: 'Platform image creative',
      }));
      steps.push({
        id: 'step_image',
        type: 'generate',
        worker: 'image',
        inputFrom: 'normalizedInput',
        params: {
          slots: imageSlots.map(slot => ({
            ...slot,
            ...buildStepParamsForPlatform(slot.platform as Platform, 'image', slot.id, slot.purpose),
          })),
        },
      });
    } else if (outputModality === 'audio') {
      for (const platform of req.platforms) {
        steps.push({
          id: `step_audio_${platform}`,
          type: 'generate',
          worker: 'audio',
          inputFrom: 'normalizedInput',
          params: buildStepParamsForPlatform(platform, 'audio', `${platform}_audio`, 'Audio voiceover'),
        });
      }
    } else if (outputModality === 'video') {
      for (const platform of req.platforms) {
        steps.push({
          id: `step_video_${platform}`,
          type: 'generate',
          worker: 'video',
          inputFrom: 'normalizedInput',
          params: buildStepParamsForPlatform(platform, 'video', `${platform}_video`, 'Video content'),
        });
      }
    } else {
      for (const platform of req.platforms) {
        steps.push({
          id: `step_text_${platform}`,
          type: 'generate',
          worker: 'text',
          inputFrom: 'normalizedInput',
          params: buildStepParamsForPlatform(platform, 'text'),
        });
      }
    }
  }

  if (steps.length === 0) {
    steps.push({
      id: 'step_text_default',
      type: 'generate',
      worker: 'text',
      inputFrom: 'normalizedInput',
      params: buildStepParamsForPlatform(req.platforms[0] ?? 'instagram', 'text'),
    });
  }

  return { requestId: req.id, steps };
}

const textWorker = {
  async run(step: TaskStep, inputs: any, req: GenerationRequest): Promise<GeneratedAsset[]> {
    const packSpec = req.packId ? PACK_DEFINITIONS[req.packId] ?? null : null;
    const rawSlots = step.params?.slots || (step.params?.platform
      ? [{ id: `${step.params.platform}_post`, platform: step.params.platform, modality: 'text', purpose: 'Post copy' }]
      : packSpec?.filter(s => s.modality === 'text') || [{ id: 'post', platform: req.platforms[0], modality: 'text', purpose: 'Post copy' }]);

    const slotsWithRules = rawSlots.map((slot: any) => ({
      ...slot,
      platformRules: getRules(slot.platform as Platform)?.text ?? null,
    }));

    try {
      const result = await maxcorePost('/generate/text', {
        mode: 'content',
        step,
        inputs,
        slots: slotsWithRules,
        constraints: req.constraints,
        artistProfileId: req.artistProfileId,
        intent: req.intent,
        platformRules: Object.fromEntries(
          req.platforms.map(p => [p, getRules(p).text])
        ),
      });

      const outputs = Array.isArray(result.outputs) ? result.outputs : [];
      if (outputs.length > 0) {
        return outputs.map((o: any) => {
          const rules = o.platform ? getRules(o.platform as Platform) : null;
          let payload: string = o.text || o.content || '';
          if (rules) payload = enforceTextLength(payload, rules.text);

          return {
            id: randomUUID(),
            modality: 'text' as OutputModality,
            payload,
            platform: o.platform as Platform | undefined,
            slotId: o.slotId,
            purpose: o.purpose,
            metadata: {
              ...(o.meta ?? {}),
              platformRules: rules?.text ?? null,
            },
          };
        });
      }
    } catch (err) {
      logger.warn('[MultimodalGen] MaxCore text worker failed, using fallback:', err);
    }

    return localTextFallback(rawSlots, inputs, req);
  },
};

function localTextFallback(
  slots: Array<{ id: string; platform: any; modality: string; purpose: string }>,
  inputs: any,
  req: GenerationRequest,
): GeneratedAsset[] {
  const summary: string = inputs?.normalized?.summary || inputs?.summary || req.input.payload || '';
  const intent = req.intent || 'announcement';

  const platformTemplates: Record<string, (s: string, rules: PlatformRules) => string> = {
    facebook: (s, r) => {
      const maxTags = r.text.hashtags?.max ?? 3;
      const tags = Array(Math.min(maxTags, 2)).fill(0).map((_, i) => ['#NewMusic', '#MusicRelease'][i]).join(' ');
      return `🎵 ${s}\n\nShare this with someone who needs to hear it! ${tags}`;
    },
    instagram: (s, r) => {
      const maxTags = r.text.hashtags?.max ?? 8;
      const allTags = ['#NewMusic', '#MusicArtist', '#NewRelease', '#MusicProducer', '#IndieArtist', '#MusicLover', '#NowPlaying', '#StreamNow'];
      return `${s} ✨\n\n${allTags.slice(0, maxTags).join(' ')}`;
    },
    threads: (s) => `Just dropped: ${s} — go check it out!`,
    tiktok: (s, r) => {
      const maxTags = r.text.hashtags?.max ?? 5;
      const tags = ['#NewMusic', '#MusicTikTok', '#FYP', '#MusicRelease', '#Viral'].slice(0, maxTags).join(' ');
      return `POV: You just discovered your new favorite track 🎧\n${s}\n\n${tags}`;
    },
    youtube: (s) => `${s}\n\n🎬 Subscribe for more music, behind-the-scenes, and exclusive content.\n\n#YouTube #Music #NewRelease`,
    google_business: (s) => `New release: ${s}. Available now on all major streaming platforms!`,
    linkedin: (s, r) => {
      const maxTags = r.text.hashtags?.max ?? 5;
      const tags = ['#Music', '#CreativeIndustry', '#MusicBusiness', '#NewRelease', '#Artist'].slice(0, maxTags).join(' ');
      return `Excited to share my latest work: ${s}. This project represents months of creative work and artistic growth. ${tags}`;
    },
  };

  return slots.map(slot => {
    const rules = getRules(slot.platform as Platform);
    const templateFn = platformTemplates[slot.platform] || ((s: string) => s);
    let payload = templateFn(summary, rules);

    payload = enforceTextLength(payload, rules.text);

    return {
      id: randomUUID(),
      modality: 'text' as OutputModality,
      payload,
      platform: slot.platform as Platform,
      slotId: slot.id,
      purpose: slot.purpose,
      metadata: {
        source: 'local_fallback',
        intent,
        platformRules: rules.text,
      },
    };
  });
}

const imageWorker = {
  async run(step: TaskStep, inputs: any, req: GenerationRequest): Promise<GeneratedAsset[]> {
    const slots = step.params?.slots || [];
    const slotsWithRules = slots.map((slot: any) => ({
      ...slot,
      platformRules: getRules(slot.platform as Platform)?.image ?? null,
    }));

    try {
      const result = await maxcorePost('/generate/image', {
        step,
        inputs,
        slots: slotsWithRules,
        constraints: req.constraints,
        artistProfileId: req.artistProfileId,
        intent: req.intent,
        platformRules: Object.fromEntries(
          req.platforms.map(p => [p, getRules(p).image])
        ),
      });

      const outputs = Array.isArray(result.outputs) ? result.outputs : [];
      return outputs.map((o: any) => ({
        id: randomUUID(),
        modality: 'image' as OutputModality,
        payload: o.url || o.src || '',
        platform: o.platform as Platform | undefined,
        slotId: o.slotId,
        purpose: o.purpose,
        metadata: {
          ...(o.meta ?? {}),
          aspectRatio: o.aspectRatio ?? step.params?.recommendedAspectRatio,
          platformRules: o.platform ? getRules(o.platform as Platform).image : null,
        },
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
        metadata: {
          source: 'local_fallback',
          note: 'image_generation_unavailable',
          platformRules: getRules(slot.platform as Platform).image,
        },
      }));
    }
  },
};

const audioWorker = {
  async run(step: TaskStep, inputs: any, req: GenerationRequest): Promise<GeneratedAsset[]> {
    const platform = step.params?.platform as Platform | undefined;
    const audioRules = platform ? getRules(platform).audio : null;

    try {
      const result = await maxcorePost('/generate/audio', {
        step,
        inputs,
        constraints: req.constraints,
        artistProfileId: req.artistProfileId,
        intent: req.intent,
        platformRules: audioRules,
      });
      const outputs = Array.isArray(result.outputs) ? result.outputs : [];
      return outputs.map((o: any) => ({
        id: randomUUID(),
        modality: 'audio' as OutputModality,
        payload: o.url || '',
        platform: o.platform as Platform | undefined,
        slotId: o.slotId,
        metadata: {
          ...(o.meta ?? {}),
          maxDurationSec: audioRules?.maxDurationSec,
          platformRules: audioRules,
        },
      }));
    } catch (err) {
      logger.warn('[MultimodalGen] MaxCore audio worker failed:', err);
      return [];
    }
  },
};

const videoWorker = {
  async run(step: TaskStep, inputs: any, req: GenerationRequest): Promise<GeneratedAsset[]> {
    const platform = step.params?.platform as Platform | undefined;
    const videoRules = platform ? getRules(platform).video : null;

    try {
      const result = await maxcorePost('/generate/video', {
        step,
        inputs,
        constraints: req.constraints,
        artistProfileId: req.artistProfileId,
        intent: req.intent,
        platformRules: videoRules,
      });
      const outputs = Array.isArray(result.outputs) ? result.outputs : [];
      return outputs.map((o: any) => ({
        id: randomUUID(),
        modality: 'video' as OutputModality,
        payload: o.url || '',
        platform: o.platform as Platform | undefined,
        slotId: o.slotId,
        metadata: {
          ...(o.meta ?? {}),
          aspectRatio: o.aspectRatio ?? videoRules?.aspectRatios[0],
          maxDurationSec: videoRules?.maxDurationSec,
          requiresHook: videoRules?.requiresHook,
          platformRules: videoRules,
        },
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

export { PLATFORM_RULES };
