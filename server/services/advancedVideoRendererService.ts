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

import { logger } from '../logger.js';
import { pythonAIService } from './pythonAIService.js';
import { generateVideo as generateVideoFFmpeg, type VideoGenOptions, type VideoGenResult } from './videoGeneratorService.js';
import { MaxCoreAIClient } from './unifiedAIController.js';

const MAXCORE_VIDEO_POLL_INTERVAL_MS = 2000;
const MAXCORE_VIDEO_MAX_ATTEMPTS     = 90;   // 3 minutes max
const PYTHON_AI_POLL_INTERVAL_MS     = 2000;
const PYTHON_AI_MAX_ATTEMPTS         = 90;

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
        return {
          success: true,
          url: status.url,
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
export async function renderVideo(opts: VideoGenOptions): Promise<VideoGenResult> {
  const startMs = Date.now();

  // ── Stage 1: MaxCore video renderer ─────────────────────────────────────────
  if (await MaxCoreAIClient.isAvailable()) {
    try {
      logger.info('[AdvancedVideoRenderer] Stage 1 — MaxCore video renderer starting');
      const jobResp = await MaxCoreAIClient.infer<any>('/generate-video', {
        hook:         opts.hook || '',
        body:         opts.body || '',
        cta:          opts.cta  || '',
        topic:        opts.topic,
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
          logger.info(`[AdvancedVideoRenderer] Stage 1 complete (MaxCore) in ${Date.now() - startMs}ms`);
          return { ...result, processing_time_ms: Date.now() - startMs };
        }
      } else if (jobResp?.url) {
        // Synchronous response (MaxCore returned URL directly)
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

  // ── Stage 2: Python AI renderer ──────────────────────────────────────────────
  const pyAvailable = await pythonAIService.isAvailable();
  if (pyAvailable) {
    try {
      logger.info('[AdvancedVideoRenderer] Stage 2 — Python AI renderer starting');
      const jobResult = await pythonAIService.startVideoJob({
        hook:         opts.hook || '',
        body:         opts.body || '',
        cta:          opts.cta  || '',
        topic:        opts.topic,
        platform:     opts.platform     || 'tiktok',
        aspect_ratio: opts.aspect_ratio,
        template:     opts.template     || 'cinematic_promo',
        duration:     opts.duration     || 10,
        artist_name:  opts.artist_name,
        genre:        opts.genre,
        tone:         opts.tone         || 'energetic',
        goal:         opts.goal         || 'growth',
        quality:      opts.quality      || 'cinematic',
        user_audio_path: opts.user_audio_path,
        voiceover:    opts.voiceover,
      });

      if (jobResult.success && jobResult.data?.job_id) {
        const result = await pollPythonAIVideoJob(jobResult.data.job_id);
        if (result) {
          logger.info(`[AdvancedVideoRenderer] Stage 2 complete (PythonAI) in ${Date.now() - startMs}ms`);
          return { ...result, processing_time_ms: Date.now() - startMs };
        }
      }
    } catch (pyErr: any) {
      logger.warn('[AdvancedVideoRenderer] Stage 2 (PythonAI) failed, moving to Stage 3:', pyErr.message);
    }
  }

  // ── Stage 3: FFmpeg renderer ─────────────────────────────────────────────────
  logger.info('[AdvancedVideoRenderer] Stage 3 — FFmpeg renderer starting');
  const ffmpegResult = await generateVideoFFmpeg(opts);
  return {
    ...ffmpegResult,
    source: 'FFmpegRenderer',
    processing_time_ms: Date.now() - startMs,
  };
}
