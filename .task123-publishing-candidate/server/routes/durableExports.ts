import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { exportRepository, type DurableExportJob } from "../services/genericExportRepository";
import { dispatchGenericExport, cancelGenericExport } from "../services/genericExportRenderer";
import { audioContract } from "../services/exportAudioContract";
import { artifactExpired } from "../services/exportArtifactExpiry";
import { hybridStorageService } from "../services/hybridStorageService";
import { createHash } from "node:crypto";
import { db } from "../db";
import { projects } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "../logger";

const router = Router();
const audio = z.object({
  format: z.enum(["wav", "mp3", "flac", "aiff", "ogg", "aac"]),
  sampleRate: z.number().int().min(8000).max(192000).optional(),
  bitDepth: z.union([z.literal(16), z.literal(24), z.literal(32)]).optional(),
  bitrate: z.number().min(64).max(320).optional(),
  fileName: z.string().min(1).max(255).optional(),
  exportType: z.enum(["mixdown", "stems", "tracks"]).optional(),
  selectedTracks: z.array(z.string()).max(128).optional(),
  tracks: z.array(z.object({ id: z.string(), name: z.string().optional() })).max(128).optional(),
  includeEffects: z.boolean().optional(), preserveVolumePan: z.boolean().optional(),
  normalize: z.boolean().optional(), dither: z.boolean().optional(),
  addEffectTail: z.boolean().optional(), bundleAsZip: z.boolean().optional(),
  namingConvention: z.enum(["track-name", "numbered", "custom"]).optional(),
  quality: z.object({ sampleRate: z.number().int().min(8000).max(192000), bitDepth: z.union([z.literal(16), z.literal(24), z.literal(32)]) }).optional(),
}).strict();
const data = z.object({
  format: z.enum(["json", "csv"]).default("csv"),
  category: z.literal("analytics").default("analytics"),
  dateRange: z.object({ start: z.string().datetime(), end: z.string().datetime() }).nullable().optional(),
  includeCharts: z.literal(false).optional(), anonymize: z.boolean().optional(),
  compress: z.literal(false).optional(),
}).strict();

function view(job: DurableExportJob, history = false) {
  return {
    ...job, status: history && job.status === "complete" ? "completed" : job.status,
    type: history && job.type === "data" ? "analytics" : job.type,
    startTime: job.createdAt, createdAt: job.createdAt, completedTime: job.completedAt,
    fileSize: job.artifact?.size, stage: job.status,
    downloadUrl: job.status === "complete" && !artifactExpired(job.artifact) ? `/api/export/download/${job.id}` : undefined,
    expired: artifactExpired(job.artifact),
    canRetry: job.status === "failed", artifact: undefined, userId: undefined,
  };
}
const handler = (fn: (req: any, res: any) => Promise<any>) => async (req: any, res: any) => {
  try { await fn(req, res); } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Unsupported or invalid export options", details: error.issues });
    logger.error({ err: error }, "Durable export request failed");
    res.status(500).json({ error: "Export storage or processing unavailable" });
  }
};
router.post(["/audio/:projectId", "/audio/:projectId/stems"], requireAuth, handler(async (req, res) => {
  const settings = audio.parse(req.body);
  try { audioContract(settings); } catch (error) { return res.status(422).json({ error: (error as Error).message }); }
  const project = await db.query.projects.findFirst({ where: and(eq(projects.id, req.params.projectId), eq(projects.userId, req.user.id)) });
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (settings.dither || settings.bundleAsZip === false || settings.namingConvention === "custom") return res.status(422).json({ error: "Dither, custom naming and unbundled stem delivery are not supported by this renderer" });
  const stems = req.path.endsWith("/stems") || ["stems", "tracks"].includes(settings.exportType ?? "");
  const job = await exportRepository.create({ userId: req.user.id, name: settings.fileName ?? project.title,
    type: stems ? "stems" : "audio", format: stems ? "zip" : settings.format, projectId: project.id, settings });
  dispatchGenericExport(job.id, job.userId);
  res.status(202).json({ success: true, jobId: job.id, exportId: job.id, status: "queued" });
}));
router.post(["/data", "/analytics"], requireAuth, handler(async (req, res) => {
  const settings = data.parse(req.body);
  if (settings.dateRange && new Date(settings.dateRange.start) > new Date(settings.dateRange.end)) return res.status(400).json({ error: "Invalid date range" });
  const job = await exportRepository.create({ userId: req.user.id, name: "Analytics Export", type: "data", format: settings.format, projectId: null, settings });
  dispatchGenericExport(job.id, job.userId);
  res.status(202).json({ success: true, jobId: job.id, exportId: job.id, status: "queued" });
}));
router.get(["/jobs/:jobId", "/status/:jobId"], requireAuth, handler(async (req, res) => {
  await exportRepository.recover(req.user.id);
  const job = await exportRepository.get(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: "Export not found" });
  // Queued jobs survive a process exit before dispatch. Atomic claim prevents duplicate workers.
  if (job.status === "queued") dispatchGenericExport(job.id, job.userId);
  res.json(view(job));
}));
router.get(["/jobs", "/history"], requireAuth, handler(async (req, res) => {
  await exportRepository.recover(req.user.id);
  let jobs = await exportRepository.list(req.user.id);
  for (const job of jobs) if (job.status === "queued") dispatchGenericExport(job.id, job.userId);
  const history = req.path === "/history";
  if (history) {
    jobs = jobs.filter((job) => ["complete", "failed", "cancelled"].includes(job.status));
    if (req.query.type && req.query.type !== "all") jobs = jobs.filter((job) => (job.type === "data" ? "analytics" : job.type) === req.query.type);
    if (req.query.status && req.query.status !== "all") jobs = jobs.filter((job) => (job.status === "complete" ? "completed" : job.status) === req.query.status);
  }
  const offset = Math.min(100_000, Math.max(0, Number(req.query.offset) || 0));
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 50));
  res.json(jobs.slice(offset, offset + limit).map((job) => view(job, history)));
}));
router.post("/jobs/:jobId/:action", requireAuth, handler(async (req, res) => {
  const job = await exportRepository.get(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: "Export not found" });
  if (req.params.action === "cancel") {
    const cancelled = await exportRepository.transition(job.id, ["queued", "processing"], { status: "cancelled" }, req.user.id);
    if (cancelled) cancelGenericExport(job.id, req.user.id);
    return res.status(cancelled ? 200 : 409).json({ success: !!cancelled });
  }
  if (req.params.action === "retry" && job.status === "failed") {
    // A new immutable attempt ID fences the interrupted worker from the retry.
    const retry = await exportRepository.create({ userId: job.userId, name: job.name, type: job.type, format: job.format, projectId: job.projectId, settings: job.settings });
    dispatchGenericExport(retry.id, retry.userId);
    return res.status(202).json({ success: true, jobId: retry.id });
  }
  res.status(409).json({ error: "Invalid export action or state" });
}));
router.get(["/download/:jobId", "/download/zip/:jobId"], requireAuth, handler(async (req, res) => {
  const job = await exportRepository.get(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: "Export not found" });
  if (job.status !== "complete" || !job.artifact) return res.status(409).json({ error: "Export is not ready" });
  if (artifactExpired(job.artifact)) return res.status(410).json({ error: "Export artifact expired" });
  const bytes = await hybridStorageService.read(req.user.id, job.artifact.key);
  if (bytes.length !== job.artifact.size || createHash("sha256").update(bytes).digest("hex") !== job.artifact.checksum) throw new Error("Export artifact integrity check failed");
  res.set({ "Content-Type": job.artifact.mime, "Content-Length": String(bytes.length),
    "Content-Disposition": `attachment; filename="${job.artifact.filename}"`, "Cache-Control": "private, no-store" }).send(bytes);
}));
router.delete("/history/:id", requireAuth, handler(async (req, res) => {
  const job = await exportRepository.get(req.params.id, req.user.id);
  if (!job) return res.status(404).json({ error: "Export not found" });
  if (["queued", "processing"].includes(job.status)) return res.status(409).json({ error: "Cancel the active export first" });
  if (job.artifact) await hybridStorageService.delete(req.user.id, job.artifact.key);
  await exportRepository.transition(job.id, [job.status], { status: "deleted", artifact: null }, req.user.id);
  res.json({ success: true });
}));
export default router;