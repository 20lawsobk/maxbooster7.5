/**
 * Advanced Video Renderer Service
 *
 * MaxCore is the ONLY video renderer. Always running, never down.
 * Transient failures = retry. No local FFmpeg fallback. No Python AI fallback.
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';
import type { VideoGenOptions, VideoGenResult } from './videoGeneratorService.js';
import { MaxCoreAIClient } from './maxcoreClient.js';

const MAXCORE_VIDEO_POLL_INTERVAL_MS = 2000;
const MAXCORE_VIDEO_MAX_ATTEMPTS     = 150;  // 5 minutes max (150 × 2s)
const MAXCORE_SUBMIT_RETRIES         = 3;    // retry the initial job submission this many times
const MAXCORE_SUBMIT_RETRY_DELAY_MS  = 4000;

const MAXCORE_ORIGIN  = (process.env.AI_SERVER_URL || '').replace(/\/+$/, '');
const LOCAL_VIDEO_DIR = path.join(process.cwd(), 'uploads', 'videos');

/**
 * Download a MaxCore-rendered video to local disk so it can be served directly.
 * Returns the local serving URL (/uploads/videos/<filename>) or null on failure.
 */
async function downloadMaxCoreVideo(relativeUrl: string): Promise<string | null> {
  try {
    const absoluteUrl = relativeUrl.startsWith('http')
      ? relativeUrl
      : `${MAXCORE_ORIGIN}${relativeUrl}`;
    const filename  = path.basename(relativeUrl.split('?')[0]);
    const localPath = path.join(LOCAL_VIDEO_DIR, filename);

    if (!fs.existsSync(LOCAL_VIDEO_DIR)) {
      fs.mkdirSync(LOCAL_VIDEO_DIR, { recursive: true });
    }

    const response = await fetch(absoluteUrl);
    if (!response.ok) {
      logger.warn(`[AdvancedVideoRenderer] MaxCore video download HTTP ${response.status}: ${absoluteUrl}`);
      return null;
    }
    const ct = response.headers.get('content-type') ?? '';
    if (!ct.includes('video') && !ct.includes('octet-stream') && !ct.includes('binary')) {
      logger.warn(`[AdvancedVideoRenderer] MaxCore video URL returned non-video content-type (${ct})`);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    logger.info(`[AdvancedVideoRenderer] MaxCore video cached locally: ${filename} (${(buffer.length / 1024).toFixed(0)} KB)`);
    return `/uploads/videos/${filename}`;
  } catch (err: any) {
    logger.warn('[AdvancedVideoRenderer] MaxCore video download failed:', err.message);
    return null;
  }
}

/**
 * Poll MaxCore for an async video job until it is done, errors out, or times out.
 * On timeout, returns null — caller will retry the whole submission.
 */
async function pollMaxCoreVideoJob(jobId: string): Promise<VideoGenResult | null> {
  for (let attempt = 0; attempt < MAXCORE_VIDEO_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, MAXCORE_VIDEO_POLL_INTERVAL_MS));
    try {
      const status = await MaxCoreAIClient.get<any>('/video-job/' + jobId);
      if (!status) continue;

      if (status.status === 'done' && status.url) {
        const localUrl = await downloadMaxCoreVideo(status.url);
        return {
          success: true,
          url: localUrl ?? `${MAXCORE_ORIGIN}${status.url.startsWith('/') ? '' : '/'}${status.url}`,
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
        logger.warn(`[AdvancedVideoRenderer] MaxCore job ${jobId} returned error:`, status.error);
        return null;
      }
    } catch (pollErr: any) {
      logger.warn(`[AdvancedVideoRenderer] MaxCore poll attempt ${attempt + 1} failed (transient):`, pollErr.message);
    }
  }
  logger.warn(`[AdvancedVideoRenderer] MaxCore job ${jobId} timed out after ${MAXCORE_VIDEO_MAX_ATTEMPTS} poll attempts`);
  return null;
}

/**
 * Submit a video generation job to MaxCore and poll for the result.
 * Returns the VideoGenResult on success, or null on failure (caller will retry).
 */
async function submitToMaxCore(opts: VideoGenOptions): Promise<VideoGenResult | null> {
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

  if (!jobResp) return null;

  // Synchronous response — MaxCore rendered instantly and returned a URL directly
  if (jobResp.url) {
    const localUrl = await downloadMaxCoreVideo(jobResp.url);
    return {
      success: true,
      url:            localUrl ?? jobResp.url,
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
      source: 'MaxCoreAI',
    };
  }

  // Async response — MaxCore started a background job; poll for it
  if (jobResp.job_id) {
    return await pollMaxCoreVideoJob(jobResp.job_id);
  }

  return null;
}

/**
 * Render a video through MaxCore — the only rendering pipeline.
 * Retries up to MAXCORE_SUBMIT_RETRIES times on transient failure.
 */
export async function renderVideo(opts: VideoGenOptions): Promise<VideoGenResult> {
  const startMs = Date.now();

  for (let attempt = 1; attempt <= MAXCORE_SUBMIT_RETRIES; attempt++) {
    try {
      logger.info(`[AdvancedVideoRenderer] MaxCore video render — attempt ${attempt}/${MAXCORE_SUBMIT_RETRIES}`);
      const result = await submitToMaxCore(opts);
      if (result) {
        logger.info(`[AdvancedVideoRenderer] MaxCore render complete in ${Date.now() - startMs}ms`);
        return { ...result, processing_time_ms: Date.now() - startMs };
      }
      logger.warn(`[AdvancedVideoRenderer] MaxCore attempt ${attempt} returned no result — retrying`);
    } catch (err: any) {
      logger.warn(`[AdvancedVideoRenderer] MaxCore attempt ${attempt} threw (transient):`, err.message);
    }

    if (attempt < MAXCORE_SUBMIT_RETRIES) {
      await new Promise(r => setTimeout(r, MAXCORE_SUBMIT_RETRY_DELAY_MS));
    }
  }

  const elapsed = Date.now() - startMs;
  logger.error(`[AdvancedVideoRenderer] All ${MAXCORE_SUBMIT_RETRIES} MaxCore attempts failed after ${elapsed}ms`);
  return {
    success: false,
    error: 'MaxCore video render did not complete after retries — service may be processing a heavy queue',
    source: 'MaxCoreAI',
    processing_time_ms: elapsed,
  };
}
