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
 * Candidate URL paths to try when downloading a video from MaxCore.
 * Covers every plausible path that MaxCore's backend might serve files from,
 * prioritising /api/* routes which bypass MaxCore's SPA catch-all.
 */
function candidateUrls(rawUrl: string): string[] {
  const absolute = rawUrl.startsWith('http') ? rawUrl : `${MAXCORE_ORIGIN}${rawUrl}`;
  const filename = path.basename(rawUrl.split('?')[0]);
  return [
    absolute,
    // /api/ routes — handled by MaxCore's backend before the SPA catch-all
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
    // Non-/api/ static paths
    `${MAXCORE_ORIGIN}/uploads/${filename}`,
    `${MAXCORE_ORIGIN}/uploads/videos/${filename}`,
    `${MAXCORE_ORIGIN}/videos/${filename}`,
    `${MAXCORE_ORIGIN}/static/${filename}`,
    `${MAXCORE_ORIGIN}/static/videos/${filename}`,
    `${MAXCORE_ORIGIN}/generated/${filename}`,
    `${MAXCORE_ORIGIN}/output/${filename}`,
    `${MAXCORE_ORIGIN}/media/${filename}`,
  ];
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

    for (const url of candidateUrls(rawUrl)) {
      try {
        const response = await fetch(url, {
          headers: maxcoreAuthHeaders(),
          signal:  AbortSignal.timeout(60_000),
        });
        if (!response.ok) {
          logger.debug(`[AdvancedVideoRenderer] Candidate ${url} → HTTP ${response.status}`);
          continue;
        }

        // Buffer the full response so we can inspect it with magic bytes.
        // Content-type alone is unreliable — MaxCore's SPA returns text/html for
        // any unrecognised path with 200 OK.  Magic-byte validation is definitive.
        const buffer = Buffer.from(await response.arrayBuffer());
        const ct = response.headers.get('content-type') ?? 'unknown';

        if (!looksLikeRealVideo(buffer)) {
          logger.debug(`[AdvancedVideoRenderer] Candidate ${url} → not a real video (ct="${ct}", size=${buffer.length} bytes, head="${buffer.slice(0, 40).toString('utf8').replace(/\n/g, '\\n')}")`);
          continue;
        }

        fs.writeFileSync(localPath, buffer);
        logger.info(`[AdvancedVideoRenderer] Video cached from ${url} — ${filename} (${(buffer.length / 1024).toFixed(0)} KB)`);
        maxcoreVideoUrlStore.set(filename, url);
        return `/uploads/videos/${filename}`;
      } catch (err: any) {
        logger.debug(`[AdvancedVideoRenderer] Candidate ${url} fetch failed: ${err.message}`);
      }
    }

    logger.warn(`[AdvancedVideoRenderer] All ${candidateUrls(rawUrl).length} candidates failed for "${filename}" — proxy will stream from MaxCore: ${absoluteForProxy}`);
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

/**
 * Render a video through MaxCore — the only rendering pipeline.
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
        hook:            jobResp.hook  || opts.hook,
        body:            jobResp.body  || opts.body,
        cta:             jobResp.cta   || opts.cta,
        template:        jobResp.template,
        template_name:   jobResp.template_name,
        scenes_rendered: jobResp.scenes_rendered,
        source:          'MaxCoreAI',
        processing_time_ms: Date.now() - startMs,
      };
    }

    // Async response — poll for completion
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
