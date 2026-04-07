/**
 * Advanced Video Renderer Service
 *
 * MaxCore is the ONLY video renderer. Always running, never down.
 * No local FFmpeg fallback. No Python AI fallback.
 * On a network blip the MaxCore client's own retry handles it.
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';
import type { VideoGenOptions, VideoGenResult } from './videoGeneratorService.js';
import { MaxCoreAIClient } from './maxcoreClient.js';

// Poll every 2 s for up to 5 minutes (150 attempts).
// Uses MaxCoreAIClient.poll() which has a 15 s per-call timeout and
// never suppresses the endpoint — so every slot is a real HTTP request.
const POLL_INTERVAL_MS   = 2_000;
const POLL_MAX_ATTEMPTS  = 150;

const MAXCORE_ORIGIN  = (process.env.AI_SERVER_URL || '').replace(/\/+$/, '');
const LOCAL_VIDEO_DIR = path.join(process.cwd(), 'uploads', 'videos');

/**
 * Download the rendered video from MaxCore and cache it locally so the client
 * can stream it from our own origin.  If the download fails for any reason,
 * returns the MaxCore-hosted URL as a transparent fallback — the video is still
 * accessible, just served from MaxCore directly.
 */
async function cacheVideoLocally(relativeUrl: string): Promise<string> {
  const absoluteUrl = relativeUrl.startsWith('http')
    ? relativeUrl
    : `${MAXCORE_ORIGIN}${relativeUrl}`;

  // Always return a usable URL even if local caching fails.
  const fallbackUrl = absoluteUrl;

  try {
    if (!fs.existsSync(LOCAL_VIDEO_DIR)) {
      fs.mkdirSync(LOCAL_VIDEO_DIR, { recursive: true });
    }

    const filename  = path.basename(relativeUrl.split('?')[0]);
    const localPath = path.join(LOCAL_VIDEO_DIR, filename);

    const response = await fetch(absoluteUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      logger.warn(`[AdvancedVideoRenderer] MaxCore video download HTTP ${response.status} — serving from MaxCore origin`);
      return fallbackUrl;
    }

    const ct = response.headers.get('content-type') ?? '';
    if (!ct.includes('video') && !ct.includes('octet-stream') && !ct.includes('binary')) {
      logger.warn(`[AdvancedVideoRenderer] Unexpected content-type "${ct}" — serving from MaxCore origin`);
      return fallbackUrl;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    logger.info(`[AdvancedVideoRenderer] Video cached locally: ${filename} (${(buffer.length / 1024).toFixed(0)} KB)`);
    return `/uploads/videos/${filename}`;
  } catch (err: any) {
    logger.warn(`[AdvancedVideoRenderer] Local cache failed — serving from MaxCore origin: ${err.message}`);
    return fallbackUrl;
  }
}

/**
 * Poll MaxCore until the video job is done, returned an error status, or the
 * window expires.  Uses poll() (not get()) so each slot is a live HTTP call
 * with no endpoint suppression.
 */
async function pollVideoJob(jobId: string): Promise<VideoGenResult | null> {
  logger.info(`[AdvancedVideoRenderer] Polling MaxCore job ${jobId} (max ${POLL_MAX_ATTEMPTS} attempts × ${POLL_INTERVAL_MS / 1000}s)`);

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const status = await MaxCoreAIClient.poll<any>('/video-job/' + jobId);
    if (!status) continue; // transient network blip — keep polling

    if (status.status === 'done' && status.url) {
      const servedUrl = await cacheVideoLocally(status.url);
      logger.info(`[AdvancedVideoRenderer] Job ${jobId} done after ${attempt + 1} poll(s) — url: ${servedUrl}`);
      return {
        success:        true,
        url:            servedUrl,
        filename:       status.filename,
        width:          status.width,
        height:         status.height,
        duration:       status.duration,
        hook:           status.hook,
        body:           status.body,
        cta:            status.cta,
        template:       status.template,
        template_name:  status.template_name,
        scenes_rendered: status.scenes_rendered,
        source: 'MaxCoreAI',
      };
    }

    if (status.status === 'error') {
      logger.error(`[AdvancedVideoRenderer] MaxCore job ${jobId} failed: ${status.error}`);
      return null;
    }

    // status is 'queued' or 'processing' — keep polling
    if (attempt % 15 === 14) {
      logger.info(`[AdvancedVideoRenderer] Job ${jobId} still ${status.status ?? 'processing'} (${attempt + 1} polls elapsed)`);
    }
  }

  logger.error(`[AdvancedVideoRenderer] Job ${jobId} timed out after ${POLL_MAX_ATTEMPTS} poll attempts`);
  return null;
}

/**
 * Render a video through MaxCore.
 * The client submits the job and polls — no local FFmpeg, no Python AI.
 */
export async function renderVideo(opts: VideoGenOptions): Promise<VideoGenResult> {
  const startMs = Date.now();
  logger.info('[AdvancedVideoRenderer] Submitting video job to MaxCore');

  try {
    const jobResp = await MaxCoreAIClient.infer<any>('/generate-video', {
      hook:            opts.hook         || '',
      body:            opts.body         || '',
      cta:             opts.cta          || '',
      topic:           opts.topic        || opts.hook || opts.body || 'music video',
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
    });

    if (!jobResp) {
      return {
        success: false,
        error:   'MaxCore did not respond to the video job submission',
        source:  'MaxCoreAI',
        processing_time_ms: Date.now() - startMs,
      };
    }

    // ── Synchronous response — MaxCore rendered immediately ──────────────────
    if (jobResp.url) {
      const servedUrl = await cacheVideoLocally(jobResp.url);
      logger.info(`[AdvancedVideoRenderer] Synchronous render complete in ${Date.now() - startMs}ms`);
      return {
        success:        true,
        url:            servedUrl,
        filename:       jobResp.filename,
        width:          jobResp.width,
        height:         jobResp.height,
        duration:       jobResp.duration,
        hook:           jobResp.hook  || opts.hook,
        body:           jobResp.body  || opts.body,
        cta:            jobResp.cta   || opts.cta,
        template:       jobResp.template,
        template_name:  jobResp.template_name,
        scenes_rendered: jobResp.scenes_rendered,
        source:         'MaxCoreAI',
        processing_time_ms: Date.now() - startMs,
      };
    }

    // ── Async response — poll for job completion ──────────────────────────────
    if (jobResp.job_id) {
      const result = await pollVideoJob(jobResp.job_id);
      if (result) {
        return { ...result, processing_time_ms: Date.now() - startMs };
      }
      return {
        success: false,
        error:   `MaxCore job ${jobResp.job_id} did not complete within the polling window`,
        source:  'MaxCoreAI',
        processing_time_ms: Date.now() - startMs,
      };
    }

    // Unexpected response shape
    logger.error('[AdvancedVideoRenderer] MaxCore response missing both url and job_id:', jobResp);
    return {
      success: false,
      error:   'MaxCore returned an unexpected response format',
      source:  'MaxCoreAI',
      processing_time_ms: Date.now() - startMs,
    };
  } catch (err: any) {
    logger.error('[AdvancedVideoRenderer] Unexpected error during render:', err.message);
    return {
      success: false,
      error:   err.message || 'Unexpected error during MaxCore video render',
      source:  'MaxCoreAI',
      processing_time_ms: Date.now() - startMs,
    };
  }
}
