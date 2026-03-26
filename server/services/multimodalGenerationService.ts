import { randomUUID } from 'crypto';
import { logger } from '../logger.js';
import { generateVideo as generateVideoFFmpeg } from './videoGeneratorService.js';
import { sharpImageService } from './sharpImageService.js';
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

// Strip any trailing /api so the base is always the root, then append /api.
// This means AI_SERVER_URL can be set to either the root or the /api form and both work.
const _MAXCORE_BASE = (process.env.AI_SERVER_URL || 'https://secure-ai-forge.replit.app').replace(/\/api\/?$/, '');
const MAXCORE_URL = `${_MAXCORE_BASE}/api`;
const MAXCORE_KEY = process.env.AI_SERVER_KEY || '';

async function maxcorePost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${MAXCORE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(MAXCORE_KEY ? {
        'Authorization': `Bearer ${MAXCORE_KEY}`,
        'X-API-Key': MAXCORE_KEY,
      } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MaxCore ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    const text = await res.text().catch(() => '');
    throw new Error(`MaxCore ${path} returned non-JSON (${ct || 'no content-type'}): ${text.slice(0, 200)}`);
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

function buildLocalTextAssets(
  rawSlots: any[],
  inputs: any,
  req: GenerationRequest,
): GeneratedAsset[] {
  const normalized = inputs?.normalized ?? {};
  const summary: string = typeof normalized.summary === 'string'
    ? normalized.summary
    : (typeof req.input?.payload === 'string' ? req.input.payload.slice(0, 280) : '');
  const hook: string = normalized.hook ?? (summary.slice(0, 100) || req.intent || 'New music out now');
  const body: string = normalized.body ?? (summary || hook);
  const cta:  string = normalized.cta  ?? 'Stream now 🎵';
  const artist: string = normalized.artistName ?? '';

  const TEMPLATES: Record<string, (h: string, b: string, c: string, a: string) => string> = {
    instagram:       (h, b, c, a) => `${h}\n\n${b}\n\n${c}${a ? ` | ${a}` : ''}\n\n#music #newmusic #artist #hiphop`,
    tiktok:          (h, _b, c)   => `${h} 🎵 ${c}`,
    twitter:         (h, _b, c)   => `${h} ${c}`,
    threads:         (h, b, c)    => `${h}\n\n${c}${b ? `\n${b}` : ''}`,
    facebook:        (h, b, c, a) => `${h}\n\n${b}\n\n${c}${a ? `\n\n— ${a}` : ''}`,
    youtube:         (h, b, c)    => `${h}\n\n${b}\n\n${c}\n\nSubscribe for more 🔔`,
    linkedin:        (h, b, c, a) => `${a ? `${a} | ` : ''}${h}\n\n${b}\n\n${c}`,
    google_business: (h, b, c)    => `${h}\n\n${b}\n\n${c}`,
  };

  return rawSlots.map((slot: any) => {
    const platform = (slot.platform ?? req.platforms[0]) as Platform;
    const rules = platform ? getRules(platform) : null;
    const tplFn = TEMPLATES[platform] ?? TEMPLATES.instagram;
    let payload = tplFn(hook, body, cta, artist);
    if (rules) payload = enforceTextLength(payload, rules.text);
    const enriched = rules
      ? enrichTextAssetMetadata(payload, platform, rules, { platformRules: rules.text })
      : {};
    return {
      id: randomUUID(),
      modality: 'text' as OutputModality,
      payload,
      platform,
      slotId:  slot.id,
      purpose: slot.purpose ?? 'Post copy',
      metadata: { ...enriched, source: 'local' },
    };
  });
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
      if (outputs.length === 0) return buildLocalTextAssets(rawSlots, inputs, req);

      return outputs.map((o: any) => {
        const rules = o.platform ? getRules(o.platform as Platform) : null;
        let payload: string = o.text || o.content || '';
        if (rules) payload = enforceTextLength(payload, rules.text);
        const enriched = rules
          ? enrichTextAssetMetadata(payload, o.platform, rules, { ...(o.meta ?? {}), platformRules: rules.text })
          : { ...(o.meta ?? {}), platformRules: null };
        return {
          id: randomUUID(),
          modality: 'text' as OutputModality,
          payload,
          platform: o.platform as Platform | undefined,
          slotId: o.slotId,
          purpose: o.purpose,
          metadata: enriched,
        };
      });
    } catch (err) {
      logger.warn('[MultimodalGen] MaxCore /generate/text unavailable, using local fallback:', err instanceof Error ? err.message : String(err));
      return buildLocalTextAssets(rawSlots, inputs, req);
    }
  },
};

const PLATFORM_OPTIMAL_TIMES: Record<string, string> = {
  instagram:      '6–9 PM local',
  facebook:       '1–4 PM local',
  tiktok:         '7–9 PM local',
  youtube:        '2–4 PM EST',
  linkedin:       '10 AM–12 PM local',
  threads:        '9 AM or 8 PM local',
  google_business:'9–11 AM local',
};

function enrichTextAssetMetadata(
  payload: string,
  platform: string,
  rules: PlatformRules,
  existingMeta: Record<string, any> = {},
): Record<string, any> {
  const hashtagRegex = /#[\w\u0080-\uFFFF]+/g;
  const extractedHashtags: string[] = payload.match(hashtagRegex) ?? [];
  const cleanText = payload.replace(hashtagRegex, '').trim();

  const emojiRegex = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu;
  const emojiCount = (payload.match(emojiRegex) ?? []).length;
  const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
  const charCount = payload.length;
  const charLimit = rules.text.maxCharCount ?? null;

  let hook: string | undefined = existingMeta.hook;
  let body: string | undefined = existingMeta.body;
  let cta: string | undefined  = existingMeta.cta;

  if (!hook && !body && !cta && cleanText) {
    const paragraphs = cleanText.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    if (paragraphs.length >= 3) {
      hook = paragraphs[0];
      cta  = paragraphs[paragraphs.length - 1];
      body = paragraphs.slice(1, -1).join('\n\n');
    } else if (paragraphs.length === 2) {
      hook = paragraphs[0];
      body = paragraphs[1];
    } else {
      const sentences = cleanText.split(/(?<=[.!?])\s+/);
      if (sentences.length >= 2) {
        hook = sentences[0];
        body = sentences.slice(1).join(' ');
      }
    }
    if (body) {
      const ctaKw = /\b(subscribe|follow|check out|stream now|listen now|tap|click|link in bio|watch|download|buy|shop|join|sign up|get it|available now|out now)\b/i;
      const lines = body.split('\n');
      const ctaIdx = lines.map((l, i) => ({ l, i })).filter(({ l }) => ctaKw.test(l)).pop()?.i ?? -1;
      if (ctaIdx > 0) {
        cta  = lines.slice(ctaIdx).join('\n').trim();
        body = lines.slice(0, ctaIdx).join('\n').trim();
      }
    }
  }

  let score = 50;
  if (emojiCount >= 1 && emojiCount <= 5) score += 10;
  if (extractedHashtags.length > 0 && extractedHashtags.length <= 10) score += 10;
  if (wordCount >= 15 && wordCount <= 60) score += 10;
  if (hook) score += 10;
  if (cta)  score += 10;
  score = Math.min(100, score);

  const suggestions: string[] = [];
  if (emojiCount === 0) suggestions.push('Add 1–3 emojis to increase engagement');
  if (extractedHashtags.length === 0) suggestions.push('Include relevant hashtags');
  if (charLimit && charCount > charLimit * 0.9) suggestions.push('Near character limit — consider trimming');
  if (!cta) suggestions.push('Add a clear call-to-action');
  if (wordCount < 10) suggestions.push('Expand content for better reach');

  const positive = /\b(amazing|excited|love|great|best|awesome|happy|proud|thrilled|celebrate|new|launch|drop|release)\b/i;
  const negative = /\b(struggle|hard|difficult|bad|fail|problem|issue|concern)\b/i;
  const sentimentLabel = positive.test(payload) ? 'positive' : negative.test(payload) ? 'negative' : 'neutral';

  return {
    ...existingMeta,
    hook: hook ?? existingMeta.hook,
    body: body ?? existingMeta.body,
    cta:  cta  ?? existingMeta.cta,
    hashtags:      existingMeta.hashtags ?? (extractedHashtags.length > 0 ? extractedHashtags : undefined),
    charCount,
    charLimit,
    wordCount,
    emojiCount,
    engagementScore: score,
    sentimentLabel,
    suggestions,
    optimalPostTime: existingMeta.optimalPostTime ?? PLATFORM_OPTIMAL_TIMES[platform] ?? '6 PM local',
  };
}

const imageWorker = {
  async run(step: TaskStep, inputs: any, req: GenerationRequest): Promise<GeneratedAsset[]> {
    const slots = step.params?.slots || [];
    const slotsWithRules = slots.map((slot: any) => ({
      ...slot,
      platformRules: getRules(slot.platform as Platform)?.image ?? null,
    }));

    const mapOutputs = (outputs: any[]) => outputs.map((o: any) => ({
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
      if (outputs.length > 0) return mapOutputs(outputs);
    } catch (err) {
      logger.warn('[MultimodalGen] MaxCore /generate/image unavailable, using local fallback:', err instanceof Error ? err.message : String(err));
    }

    // Local fallback: Sharp-based image generation
    const normalized = inputs?.normalized ?? {};
    const prompt = normalized.summary ?? req.input?.payload ?? req.intent ?? 'music artist promotional image';
    const platform = (step.params?.platform ?? req.platforms[0]) as Platform;
    const rules = getRules(platform);
    try {
      const img = await sharpImageService.generateImage({
        prompt: String(prompt).slice(0, 200),
        platform,
        tone: (req.constraints as any)?.tone ?? 'creative',
      });
      return [{
        id: randomUUID(),
        modality: 'image' as OutputModality,
        payload: img.publicUrl,
        platform,
        metadata: {
          aspectRatio: step.params?.recommendedAspectRatio ?? rules.image.aspectRatios?.[0],
          platformRules: rules.image,
          source: 'local-sharp',
        },
      }];
    } catch (sharpErr) {
      logger.warn('[MultimodalGen] Sharp image fallback also failed:', sharpErr instanceof Error ? sharpErr.message : String(sharpErr));
      return [];
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
      if (outputs.length > 0) {
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
      }
    } catch (err) {
      logger.warn('[MultimodalGen] MaxCore /generate/audio unavailable — no local audio fallback available:', err instanceof Error ? err.message : String(err));
    }
    // No local audio generation available; return empty (video worker handles audio via FFmpeg)
    return [];
  },
};

const videoWorker = {
  async run(step: TaskStep, inputs: any, req: GenerationRequest): Promise<GeneratedAsset[]> {
    const platform = step.params?.platform as Platform | undefined;
    const videoRules = platform ? getRules(platform).video : null;

    // MaxCore does not expose a /generate/video endpoint — use the local
    // FFmpeg-based generator instead.
    const normalized = inputs?.normalized ?? {};
    const summary: string = typeof normalized.summary === 'string' ? normalized.summary : '';
    const genre: string = normalized.genre ?? req.constraints?.genre ?? 'default';

    const result = await generateVideoFFmpeg({
      topic:        summary.slice(0, 120) || req.intent || 'new music',
      platform:     platform ?? (req.platforms[0] as any) ?? 'tiktok',
      duration:     videoRules?.maxDurationSec ? Math.min(videoRules.maxDurationSec, 30) : 15,
      aspect_ratio: videoRules?.aspectRatios?.[0] ?? '9:16',
      tone:         req.constraints?.tone ?? 'energetic',
      goal:         req.constraints?.goal ?? 'growth',
      quality:      'cinematic',
      genre,
      artist_name:  normalized.artistName,
      hook:         normalized.hook,
      body:         normalized.body,
      cta:          normalized.cta,
    });

    if (!result.success || !result.url) {
      throw new Error(result.error ?? 'Local video generation failed');
    }

    return [{
      id: randomUUID(),
      modality: 'video' as OutputModality,
      payload: result.url,
      platform,
      metadata: {
        aspectRatio: videoRules?.aspectRatios?.[0],
        maxDurationSec: videoRules?.maxDurationSec,
        requiresHook: videoRules?.requiresHook,
        platformRules: videoRules,
        source: 'ffmpeg',
        genre,
      },
    }];
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
