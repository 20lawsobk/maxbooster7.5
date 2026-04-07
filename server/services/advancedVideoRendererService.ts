/**
 * Advanced Video Renderer Service
 *
 * MaxCore is the ONLY video renderer. Always running, never down.
 * No local FFmpeg fallback. No Python AI fallback.
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';
import type { VideoGenOptions, VideoGenResult } from './videoGeneratorService.js';
import { MaxCoreAIClient } from './maxcoreClient.js';

const POLL_INTERVAL_MS  = 2_000;
const POLL_MAX_ATTEMPTS = 150; // 5 min

const MAXCORE_ORIGIN  = (process.env.AI_SERVER_URL || '').replace(/\/+$/, '');
const MC_AI_KEY       = process.env.AI_SERVER_KEY || '';
const LOCAL_VIDEO_DIR = path.join(process.cwd(), 'uploads', 'videos');

/**
 * Maps filename → absolute MaxCore URL for the video-proxy route.
 * Populated when local caching fails so the proxy can still serve the video.
 */
export const maxcoreVideoUrlStore = new Map<string, string>();

function maxcoreAuthHeaders(): Record<string, string> {
  return {
    'X-API-Key':     MC_AI_KEY,
    'Authorization': `Bearer ${MC_AI_KEY}`,
  };
}

/**
 * Returns true if the buffer starts with known video file magic bytes.
 *   MP4 / MOV: bytes 4–7 are the ASCII string 'ftyp'
 *   WebM:      first 4 bytes are 0x1A 0x45 0xDF 0xA3
 *   AVI:       starts with 'RIFF'
 *
 * Also returns true for large binary buffers that don't look like HTML — a
 * real video will always be many megabytes, never 683 bytes of index.html.
 */
function looksLikeRealVideo(buf: Buffer): boolean {
  if (buf.length < 100) return false;

  const isMP4  = buf.slice(4, 8).toString('ascii') === 'ftyp';
  const isWebM = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  const isAVI  = buf.slice(0, 4).toString('ascii') === 'RIFF';

  if (isMP4 || isWebM || isAVI) return true;

  // Reject anything that looks like HTML/text
  const head = buf.slice(0, 200).toString('utf8').toLowerCase();
  if (head.includes('<!doctype') || head.includes('<html') || head.startsWith('{') || head.startsWith('[')) return false;

  // Accept anything large and binary that isn't HTML — real video files are always > 100 KB
  return buf.length > 100_000;
}

/**
 * Extract the MaxCore job UUID from a filename like "video_<uuid>.mp4"
 */
function extractJobUuid(filename: string): string | null {
  const m = filename.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : null;
}

/**
 * Candidate URL paths to try when downloading a video from MaxCore.
 * Ordered: specific API download routes first (bypass SPA), then static paths.
 */
function candidateUrls(rawUrl: string): string[] {
  const absolute = rawUrl.startsWith('http') ? rawUrl : `${MAXCORE_ORIGIN}${rawUrl}`;
  const filename = path.basename(rawUrl.split('?')[0]);
  const uuid = extractJobUuid(filename);

  const urls: string[] = [];

  // Job-ID-based download routes (most likely to work)
  if (uuid) {
    urls.push(
      `${MAXCORE_ORIGIN}/api/video-job/${uuid}/download`,
      `${MAXCORE_ORIGIN}/api/video-job/${uuid}/file`,
      `${MAXCORE_ORIGIN}/api/video-job/${uuid}/video`,
      `${MAXCORE_ORIGIN}/api/download/${uuid}`,
      `${MAXCORE_ORIGIN}/api/video/${uuid}`,
      `${MAXCORE_ORIGIN}/api/video/${uuid}.mp4`,
      `${MAXCORE_ORIGIN}/api/videos/${uuid}`,
      `${MAXCORE_ORIGIN}/api/videos/${uuid}.mp4`,
      `${MAXCORE_ORIGIN}/api/render/${uuid}/download`,
    );
  }

  // Filename-based /api/* routes (bypass SPA catch-all)
  urls.push(
    `${MAXCORE_ORIGIN}/api/uploads/${filename}`,
    `${MAXCORE_ORIGIN}/api/uploads/videos/${filename}`,
    `${MAXCORE_ORIGIN}/api/videos/${filename}`,
    `${MAXCORE_ORIGIN}/api/video/${filename}`,
    `${MAXCORE_ORIGIN}/api/generated/${filename}`,
    `${MAXCORE_ORIGIN}/api/generated/videos/${filename}`,
    `${MAXCORE_ORIGIN}/api/render/${filename}`,
    `${MAXCORE_ORIGIN}/api/output/${filename}`,
    `${MAXCORE_ORIGIN}/api/media/${filename}`,
    `${MAXCORE_ORIGIN}/api/download/${filename}`,
    `${MAXCORE_ORIGIN}/api/stream/${filename}`,
    `${MAXCORE_ORIGIN}/api/files/${filename}`,
    `${MAXCORE_ORIGIN}/api/static/videos/${filename}`,
  );

  // The raw URL from MaxCore + non-/api/ static paths (caught by SPA but worth trying)
  urls.push(
    absolute,
    `${MAXCORE_ORIGIN}/uploads/${filename}`,
    `${MAXCORE_ORIGIN}/uploads/videos/${filename}`,
    `${MAXCORE_ORIGIN}/videos/${filename}`,
    `${MAXCORE_ORIGIN}/static/${filename}`,
    `${MAXCORE_ORIGIN}/static/videos/${filename}`,
    `${MAXCORE_ORIGIN}/generated/${filename}`,
    `${MAXCORE_ORIGIN}/output/${filename}`,
    `${MAXCORE_ORIGIN}/media/${filename}`,
  );

  return urls;
}

/**
 * Attempt to download the rendered video from MaxCore and cache it locally.
 * Always sends auth headers. Tries multiple URL path variants.
 *
 * Returns:
 *   - `/uploads/videos/<filename>`  if local caching succeeds (served from our origin)
 *   - `/api/social/video-proxy/<filename>` as fallback (server-side proxy with auth)
 *
 * The raw MaxCore URL is stored in maxcoreVideoUrlStore so the proxy can use it.
 */
async function cacheVideoLocally(rawUrl: string): Promise<string> {
  const filename = path.basename(rawUrl.split('?')[0]);
  const localPath = path.join(LOCAL_VIDEO_DIR, filename);

  // Log the exact URL MaxCore returned so we can diagnose path issues
  logger.info(`[AdvancedVideoRenderer] cacheVideoLocally — rawUrl from MaxCore: "${rawUrl}"`);

  // Register the raw MaxCore URL for the proxy route regardless of what happens below
  const absoluteForProxy = rawUrl.startsWith('http') ? rawUrl : `${MAXCORE_ORIGIN}${rawUrl}`;
  maxcoreVideoUrlStore.set(filename, absoluteForProxy);

  try {
    if (!fs.existsSync(LOCAL_VIDEO_DIR)) {
      fs.mkdirSync(LOCAL_VIDEO_DIR, { recursive: true });
    }

    const candidates = candidateUrls(rawUrl);
    for (const url of candidates) {
      try {
        const response = await fetch(url, {
          headers: maxcoreAuthHeaders(),
          signal:  AbortSignal.timeout(60_000),
        });
        const ct = response.headers.get('content-type') ?? 'unknown';
        const cl = response.headers.get('content-length') ?? 'unknown';
        if (!response.ok) {
          logger.info(`[AdvancedVideoRenderer] Candidate ${url} → HTTP ${response.status} ct="${ct}"`);
          continue;
        }

        // Buffer the full response so we can inspect it with magic bytes.
        // Content-type alone is unreliable — MaxCore's SPA returns text/html for
        // any unrecognised path with 200 OK.  Magic-byte validation is definitive.
        const buffer = Buffer.from(await response.arrayBuffer());

        if (!looksLikeRealVideo(buffer)) {
          const head = buffer.slice(0, 60).toString('utf8').replace(/[\r\n]/g, ' ');
          logger.info(`[AdvancedVideoRenderer] Candidate ${url} → NOT video (HTTP 200, ct="${ct}", len=${cl}, head="${head}")`);
          continue;
        }

        fs.writeFileSync(localPath, buffer);
        logger.info(`[AdvancedVideoRenderer] Video cached from ${url} — ${filename} (${(buffer.length / 1024).toFixed(0)} KB)`);
        maxcoreVideoUrlStore.set(filename, url);
        return `/uploads/videos/${filename}`;
      } catch (err: any) {
        logger.info(`[AdvancedVideoRenderer] Candidate ${url} fetch error: ${err.message}`);
      }
    }

    logger.warn(`[AdvancedVideoRenderer] All ${candidates.length} candidates failed for "${filename}" — proxy will stream from MaxCore: ${absoluteForProxy}`);
  } catch (err: any) {
    logger.warn(`[AdvancedVideoRenderer] Local cache setup failed: ${err.message}`);
  }

  // Return proxy URL — our server will stream from MaxCore with auth
  return `/api/social/video-proxy/${filename}`;
}

/**
 * Poll MaxCore until the video job finishes, errors, or times out.
 * Uses poll() (not get()) so each attempt is a real HTTP request with no suppression.
 */
async function pollVideoJob(jobId: string): Promise<VideoGenResult | null> {
  logger.info(`[AdvancedVideoRenderer] Polling MaxCore job ${jobId} (max ${POLL_MAX_ATTEMPTS} × ${POLL_INTERVAL_MS / 1000}s)`);

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const status = await MaxCoreAIClient.poll<any>('/video-job/' + jobId);
    if (!status) continue;

    if (status.status === 'done' && status.url) {
      const servedUrl = await cacheVideoLocally(status.url);
      logger.info(`[AdvancedVideoRenderer] Job ${jobId} done after ${attempt + 1} poll(s) — serving: ${servedUrl}`);
      return {
        success:         true,
        url:             servedUrl,
        filename:        status.filename,
        width:           status.width,
        height:          status.height,
        duration:        status.duration,
        hook:            status.hook,
        body:            status.body,
        cta:             status.cta,
        template:        status.template,
        template_name:   status.template_name,
        scenes_rendered: status.scenes_rendered,
        source:          'MaxCoreAI',
      };
    }

    if (status.status === 'error') {
      logger.error(`[AdvancedVideoRenderer] MaxCore job ${jobId} errored: ${status.error}`);
      return null;
    }

    if (attempt % 15 === 14) {
      logger.info(`[AdvancedVideoRenderer] Job ${jobId} still ${status.status ?? 'processing'} (${attempt + 1} polls)`);
    }
  }

  logger.error(`[AdvancedVideoRenderer] Job ${jobId} timed out after ${POLL_MAX_ATTEMPTS} poll attempts`);
  return null;
}

// ── MaxCore content types ─────────────────────────────────────────────────────

interface MaxCoreContent {
  caption:         string;
  hook:            string;
  body:            string;
  cta:             string;
  hashtags:        string[];
  confidence:      number;
  processing_time_ms: number;
}

interface MaxCoreSentiment {
  sentiment:       number;   // 0–1
  label:           string;
  confidence:      number;
  model_summary:   string;
  source:          string;
}

// ── Step 1: generate content intelligence from MaxCore ────────────────────────

async function generateContent(opts: VideoGenOptions): Promise<MaxCoreContent | null> {
  const topic = [
    opts.artist_name ? `${opts.artist_name}` : null,
    opts.topic,
    opts.genre ? `(${opts.genre})` : null,
  ].filter(Boolean).join(' — ');

  logger.info(`[AdvancedVideoRenderer] Calling /api/generate/content for topic: "${topic}"`);

  return MaxCoreAIClient.generate<MaxCoreContent>('/generate/content', {
    topic,
    platform: opts.platform || 'tiktok',
    tone:     opts.tone     || 'energetic',
    goal:     opts.goal     || 'growth',
    genre:    opts.genre    || undefined,
    artist:   opts.artist_name || undefined,
    title:    opts.topic    || undefined,
  });
}

// ── Step 2: sentiment scoring on the hook ─────────────────────────────────────

async function getSentiment(hook: string): Promise<MaxCoreSentiment | null> {
  return MaxCoreAIClient.generate<MaxCoreSentiment>('/analyze/sentiment', {
    text: hook,
  });
}

/**
 * Render a video through MaxCore — two-step intelligence pipeline:
 *   1. /api/generate/content  → AI hook, body, CTA, hashtags
 *   2. /api/generate-video    → job_id
 *   Then poll /api/video-job/<id> until done.
 */
export async function renderVideo(opts: VideoGenOptions): Promise<VideoGenResult> {
  const startMs = Date.now();
  logger.info('[AdvancedVideoRenderer] Starting two-step MaxCore pipeline');

  // ── Step 1: generate content ──────────────────────────────────────────────
  const contentResult = await generateContent(opts);

  const hook = contentResult?.hook     || opts.hook || '';
  const body = contentResult?.body     || opts.body || '';
  const cta  = contentResult?.cta      || opts.cta  || '';
  const hashtags = contentResult?.hashtags || [];
  const contentConfidence = contentResult?.confidence ?? null;

  if (contentResult) {
    logger.info(
      `[AdvancedVideoRenderer] Content generated — hook: "${hook.slice(0, 60)}..." ` +
      `confidence: ${contentConfidence} hashtags: ${hashtags.length}`
    );
  } else {
    logger.warn('[AdvancedVideoRenderer] /api/generate/content returned null — using opts fallbacks');
  }

  // ── Step 2: sentiment + video job (parallel) ──────────────────────────────
  const [sentimentResult, jobResp] = await Promise.all([
    hook ? getSentiment(hook) : Promise.resolve(null),
    MaxCoreAIClient.infer<any>('/generate-video', {
      hook,
      body,
      cta,
      topic:           opts.topic        || hook || body || 'music video',
      platform:        opts.platform     || 'tiktok',
      aspect_ratio:    opts.aspect_ratio,
      template:        opts.template     || 'cinematic_promo',
      duration:        opts.duration     || 10,
      artist_name:     opts.artist_name,
      genre:           opts.genre        || undefined,
      tone:            opts.tone         || 'energetic',
      goal:            opts.goal         || 'growth',
      quality:         opts.quality      || 'cinematic',
      user_audio_path: opts.user_audio_path || undefined,
      voiceover:       !!opts.voiceover,
    }),
  ]);

  if (sentimentResult) {
    logger.info(
      `[AdvancedVideoRenderer] Sentiment: ${sentimentResult.label} ` +
      `(score=${sentimentResult.sentiment.toFixed(2)}, confidence=${sentimentResult.confidence.toFixed(2)})`
    );
  }

  // ── Intelligence metadata to enrich every result ──────────────────────────
  const intelligence = {
    hashtags,
    content_confidence:   contentConfidence,
    sentiment_score:      sentimentResult?.sentiment      ?? null,
    sentiment_label:      sentimentResult?.label          ?? null,
    sentiment_confidence: sentimentResult?.confidence     ?? null,
  };

  if (!jobResp) {
    return {
      success: false,
      error:   'MaxCore did not respond to the video job submission',
      source:  'MaxCoreAI',
      processing_time_ms: Date.now() - startMs,
    };
  }

  // Synchronous response — MaxCore rendered immediately
  if (jobResp.url) {
    const servedUrl = await cacheVideoLocally(jobResp.url);
    logger.info(`[AdvancedVideoRenderer] Synchronous render complete in ${Date.now() - startMs}ms`);
    return {
      success:         true,
      url:             servedUrl,
      filename:        jobResp.filename,
      width:           jobResp.width,
      height:          jobResp.height,
      duration:        jobResp.duration,
      hook:            jobResp.hook  || hook,
      body:            jobResp.body  || body,
      cta:             jobResp.cta   || cta,
      template:        jobResp.template,
      template_name:   jobResp.template_name,
      scenes_rendered: jobResp.scenes_rendered,
      source:          'MaxCoreAI',
      processing_time_ms: Date.now() - startMs,
      ...intelligence,
    } as any;
  }

  // Async response — poll for completion
  if (jobResp.job_id) {
    const result = await pollVideoJob(jobResp.job_id);
    if (result) {
      return {
        ...result,
        hook:  result.hook  || hook,
        body:  result.body  || body,
        cta:   result.cta   || cta,
        processing_time_ms: Date.now() - startMs,
        ...intelligence,
      } as any;
    }
    return {
      success: false,
      error:   `MaxCore job ${jobResp.job_id} did not complete within the polling window`,
      source:  'MaxCoreAI',
      processing_time_ms: Date.now() - startMs,
    };
  }

  logger.error('[AdvancedVideoRenderer] MaxCore response missing both url and job_id:', jobResp);
  return {
    success: false,
    error:   'MaxCore returned an unexpected response format',
    source:  'MaxCoreAI',
    processing_time_ms: Date.now() - startMs,
  };
}
