/**
 * Advanced Video Renderer Service
 *
 * Dedicated rendering pipeline for the advanced AI content generation stack.
 * All video generation that originates from MaxCore / Python AI content should
 * render through this service — never through the legacy template renderer directly.
 *
 * Priority chain (matches the content generation priority chain):
 *   Stage 1 — MaxCore video renderer  (/generate/video on secure-ai-forge)
 *   Stage 2 — Python AI renderer      (pythonAIService.startVideoJob)
 *   Stage 3 — FFmpeg renderer         (videoGeneratorService.generateVideo)
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';
import { pythonAIService } from './pythonAIService.js';
import { generateVideo as generateVideoFFmpeg, type VideoGenOptions, type VideoGenResult } from './videoGeneratorService.js';
import { MaxCoreAIClient } from './unifiedAIController.js';

const MAXCORE_VIDEO_POLL_INTERVAL_MS = 2000;
const MAXCORE_VIDEO_MAX_ATTEMPTS     = 90;   // 3 minutes max
const PYTHON_AI_POLL_INTERVAL_MS     = 2000;
const PYTHON_AI_MAX_ATTEMPTS         = 90;

const MAXCORE_ORIGIN = (process.env.AI_SERVER_URL || '').replace(/\/+$/, '');
const LOCAL_VIDEO_DIR = path.join(process.cwd(), 'uploads', 'videos');

/**
 * Fetch a MaxCore video from its relative URL and save it locally.
 * Returns the local serving URL (/uploads/videos/<filename>) or null on failure.
 */
async function downloadMaxCoreVideo(relativeUrl: string): Promise<string | null> {
  try {
    const absoluteUrl = relativeUrl.startsWith('http')
      ? relativeUrl
      : `${MAXCORE_ORIGIN}${relativeUrl}`;
    const filename = path.basename(relativeUrl.split('?')[0]);
    const localPath = path.join(LOCAL_VIDEO_DIR, filename);

    if (!fs.existsSync(LOCAL_VIDEO_DIR)) {
      fs.mkdirSync(LOCAL_VIDEO_DIR, { recursive: true });
    }

    const response = await fetch(absoluteUrl);
    if (!response.ok) {
      logger.warn(`[AdvancedVideoRenderer] Failed to download MaxCore video (${response.status}): ${absoluteUrl}`);
      return null;
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('video') && !contentType.includes('octet-stream') && !contentType.includes('binary')) {
      logger.warn(`[AdvancedVideoRenderer] MaxCore video URL returned non-video content-type (${contentType}) — skipping download`);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    logger.info(`[AdvancedVideoRenderer] MaxCore video saved locally: ${filename} (${(buffer.length / 1024).toFixed(0)} KB)`);
    return `/uploads/videos/${filename}`;
  } catch (err: any) {
    logger.warn('[AdvancedVideoRenderer] MaxCore video download failed:', err.message);
    return null;
  }
}

/**
 * Poll MaxCore for a video job until done / error / timeout.
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
          filename: status.filename,
          width: status.width,
          height: status.height,
          duration: status.duration,
          hook: status.hook,
          body: status.body,
          cta: status.cta,
          template: status.template,
          template_name: status.template_name,
          scenes_rendered: status.scenes_rendered,
          source: 'MaxCoreAI',
        };
      }
      if (status.status === 'error') {
        logger.warn(`[AdvancedVideoRenderer] MaxCore job ${jobId} returned error:`, status.error);
        return null;
      }
    } catch (pollErr: any) {
      logger.warn(`[AdvancedVideoRenderer] MaxCore poll attempt ${attempt + 1} failed:`, pollErr.message);
    }
  }
  logger.warn(`[AdvancedVideoRenderer] MaxCore job ${jobId} timed out after ${MAXCORE_VIDEO_MAX_ATTEMPTS} attempts`);
  return null;
}

/**
 * Poll Python AI for a video job until done / error / timeout.
 */
async function pollPythonAIVideoJob(pyJobId: string): Promise<VideoGenResult | null> {
  for (let attempt = 0; attempt < PYTHON_AI_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, PYTHON_AI_POLL_INTERVAL_MS));
    const statusResult = await pythonAIService.getVideoJobStatus(pyJobId);
    if (statusResult.success && statusResult.data) {
      const d = statusResult.data;
      if (d.status === 'done' && d.success && d.url) {
        return {
          success: true,
          url: d.url,
          filename: d.filename,
          width: d.width,
          height: d.height,
          duration: d.duration,
          hook: d.hook,
          body: d.body,
          cta: d.cta,
          template: d.template,
          template_name: d.template_name,
          scenes_rendered: d.scenes_rendered,
          source: 'PythonAIRenderer',
        };
      }
      if (d.status === 'error') {
        logger.warn(`[AdvancedVideoRenderer] Python AI job ${pyJobId} returned error:`, d.error);
        return null;
      }
    }
  }
  logger.warn(`[AdvancedVideoRenderer] Python AI job ${pyJobId} timed out`);
  return null;
}

/**
 * Render a video through the full advanced AI rendering pipeline.
 * Callers that already generated the video script (hook/body/cta) via
 * unifiedAIController should pass those fields so the renderer uses them.
 *
 * Returns a VideoGenResult with `source` indicating which stage succeeded.
 */
export async function renderVideo(inputOpts: VideoGenOptions): Promise<VideoGenResult> {
  let opts = inputOpts;
  let maxcoreScriptUsed = false;
  const startMs = Date.now();

  // ── Stage 1: MaxCore video renderer ─────────────────────────────────────────
  if (await MaxCoreAIClient.isAvailable()) {
    try {
      logger.info('[AdvancedVideoRenderer] Stage 1 — MaxCore video renderer starting');
      const jobResp = await MaxCoreAIClient.infer<any>('/generate-video', {
        hook:         opts.hook || '',
        body:         opts.body || '',
        cta:          opts.cta  || '',
        topic:        opts.topic || opts.hook || opts.body || 'music video',
        platform:     opts.platform     || 'tiktok',
        aspect_ratio: opts.aspect_ratio,
        template:     opts.template     || 'cinematic_promo',
        duration:     opts.duration     || 10,
        artist_name:  opts.artist_name,
        genre:        opts.genre        || undefined,
        tone:         opts.tone         || 'energetic',
        goal:         opts.goal         || 'growth',
        quality:      opts.quality      || 'cinematic',
        user_audio_path: opts.user_audio_path || undefined,
        voiceover:    !!opts.voiceover,
      });

      if (jobResp?.job_id) {
        const result = await pollMaxCoreVideoJob(jobResp.job_id);
        if (result) {
          if (result.url && result.url.startsWith('/uploads/videos/')) {
            // Video downloaded and stored locally — serve it directly
            logger.info(`[AdvancedVideoRenderer] Stage 1 complete (MaxCore local) in ${Date.now() - startMs}ms`);
            return { ...result, source: 'MaxCoreAI', processing_time_ms: Date.now() - startMs };
          }
          // MaxCore generated the AI script but the file isn't accessible.
          // Enrich opts with MaxCore's content only where opts lacks it — never
          // replace already-good content from the caller's text generation step.
          logger.info('[AdvancedVideoRenderer] MaxCore script retrieved — routing to local renderer with AI content');
          if (result.hook && !opts.hook) opts = { ...opts, hook: result.hook };
          if (result.body && !opts.body) opts = { ...opts, body: result.body };
          if (result.cta  && !opts.cta)  opts = { ...opts, cta:  result.cta  };
          if (result.template_name) opts = { ...opts, template: result.template_name };
          maxcoreScriptUsed = true;
        }
      } else if (jobResp?.url && jobResp.url.startsWith('/uploads/videos/')) {
        // Synchronous response with local URL
        logger.info(`[AdvancedVideoRenderer] Stage 1 complete (MaxCore sync) in ${Date.now() - startMs}ms`);
        return {
          success: true,
          url: jobResp.url,
          filename: jobResp.filename,
          source: 'MaxCoreAI',
          processing_time_ms: Date.now() - startMs,
        };
      }
    } catch (mcErr: any) {
      logger.warn('[AdvancedVideoRenderer] Stage 1 (MaxCore) failed, moving to Stage 2:', mcErr.message);
    }
  }

  // ── Stage 2 (skipped): Python AI renderer removed — MaxCore is the only AI source ──

  // ── Stage 2: FFmpeg renderer (MaxCore local pipeline) ─────────────────────────
  logger.info(`[AdvancedVideoRenderer] Stage 2 — FFmpeg renderer starting (MaxCore local${maxcoreScriptUsed ? ' + AI script' : ''})`);
  const ffmpegResult = await generateVideoFFmpeg(opts);
  return {
    ...ffmpegResult,
    source: 'MaxCoreAI',
    hook: opts.hook || ffmpegResult.hook,
    body: opts.body || ffmpegResult.body,
    cta:  opts.cta  || ffmpegResult.cta,
    processing_time_ms: Date.now() - startMs,
  };
}
