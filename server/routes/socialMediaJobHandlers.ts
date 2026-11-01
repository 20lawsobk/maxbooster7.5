import type { Request, Response } from "express";
import type { SocialMediaJobRepository } from "../services/socialMediaJobRepository.js";
import { mediaJobAssetUrl } from "../services/socialMediaJobRepository.js";
import { cleanupMediaUploadFiles } from "../services/mediaUploadCleanup.js";

/** Validation runs after multipart middleware, so every rejected scene request
 * must release its already-staged uploads before returning the client error. */
export async function rejectInvalidMusicVideoSceneRequest(req: Request, res: Response,
  supportedPlatforms: readonly string[]): Promise<boolean> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.ai_generate_scenes !== "true") return false;
  const direction = [body.topic, body.hook, body.body];
  let error: string | undefined;
  if (!direction.some((value) => typeof value === "string" && value.trim().length > 0)) {
    error = "A video topic, hook, or body is required";
  } else if (direction.some((value) => typeof value === "string" && /^https?:\/\//i.test(value.trim()))) {
    error = "URL topics are not supported here; use the URL analysis workflow";
  } else if (!supportedPlatforms.includes(typeof body.platform === "string" ? body.platform.trim() : "")) {
    error = "A supported platform is required for video generation";
  } else if (!(req.files as Record<string, Express.Multer.File[]> | undefined)?.audio?.[0]) {
    error = "An audio file is required for music video generation";
  }
  if (!error) return false;
  await cleanupMediaUploadFiles(req);
  res.status(400).json({ success: false, error });
  return true;
}

/** Shared handlers are mounted by socialMedia.ts after its authentication gate. */
export function createVideoJobPollHandler(repository: SocialMediaJobRepository) {
  return async (req: Request, res: Response) => {
    try {
      if (!req.user?.id) return res.status(401).json({ success: false, message: "Authentication required" });
      const job = await repository.get("video", String(req.params.jobId), req.user.id);
      if (!job) return res.status(404).json({ success: false, status: "error", message: "Job not found. Please generate a new video." });
      if (job.status === "processing") return res.json({ status: "processing", progress: 50 });
      if (job.status === "done" && job.result) {
        const result = job.result;
        const url = mediaJobAssetUrl(result);
        if (!url) return res.status(500).json({ status: "error", error: "Video was generated but no file URL was returned. Please try again." });
        return res.json({ ...result, status: "completed", url, video_url: url,
          thumbnail_url: result.thumbnail_url ?? result.thumbnailUrl ?? null, metadata: result.metadata ?? {} });
      }
      const error = job.error || "Video generation failed";
      return res.status(500).json({ status: "error", error, message: error });
    } catch {
      return res.status(503).json({ success: false, status: "error", message: "Job status is temporarily unavailable" });
    }
  };
}

export function createMusicVideoJobPollHandler(repository: SocialMediaJobRepository) {
  return async (req: Request, res: Response) => {
    try {
      if (!req.user?.id) return res.status(401).json({ success: false, error: "Authentication required" });
      const job = await repository.get("music-video", String(req.params.jobId), req.user.id);
      if (!job) return res.status(404).json({ success: false, error: "Job not found or expired" });
      if (job.status === "processing") return res.json({ success: true, status: "processing", message: "Music video is being rendered…" });
      if (job.status === "error") return res.json({ success: false, status: "failed", error: job.error });
      const videoUrl = mediaJobAssetUrl(job.result);
      if (!videoUrl) return res.json({ success: false, status: "failed", error: "Video was generated but no file URL was returned. Please try again." });
      return res.json({ success: true, status: "completed", videoUrl,
        thumbnailUrl: job.result?.thumbnail_url ?? job.result?.thumbnailUrl ?? null, result: job.result });
    } catch {
      return res.status(503).json({ success: false, error: "Job status is temporarily unavailable" });
    }
  };
}
