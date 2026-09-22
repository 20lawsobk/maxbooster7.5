import { db } from "../db";
import { analytics, projects, studioTracks, audioClips, pluginInstances } from "@shared/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import archiver from "archiver";
import ffmpeg from "fluent-ffmpeg";
import { hybridStorageService } from "./hybridStorageService";
import { exportRepository, type DurableExportJob } from "./genericExportRepository";
import { logger } from "../logger";

export function csvCell(value: unknown): string {
  let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function clipFilter(clip: { startTime: number | null; duration: number | null; gain: number | null; fadeIn: number | null; fadeOut: number | null }, index: number): string {
  const duration = clip.duration;
  if (!duration || !Number.isFinite(duration) || duration <= 0 || (clip.startTime ?? 0) < 0) throw new Error("Invalid audio clip timing");
  const filters = [`atrim=duration=${duration}`, "asetpts=PTS-STARTPTS", `volume=${clip.gain ?? 1}`];
  if (clip.fadeIn) filters.push(`afade=t=in:st=0:d=${Math.min(clip.fadeIn, duration)}`);
  if (clip.fadeOut) filters.push(`afade=t=out:st=${Math.max(0, duration - clip.fadeOut)}:d=${Math.min(clip.fadeOut, duration)}`);
  filters.push(`adelay=${Math.round((clip.startTime ?? 0) * 1000)}:all=1`);
  return `[${index}:a]${filters.join(",")}[clip${index}]`;
}

async function renderAudio(job: DurableExportJob, dir: string): Promise<{ bytes: Buffer; mime: string; extension: string }> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, job.projectId!), eq(projects.userId, job.userId)),
  });
  if (!project) throw new Error("Project not found");
  let tracks = await db.query.studioTracks.findMany({ where: eq(studioTracks.projectId, project.id) });
  const selected: string[] = job.settings.selectedTracks ?? job.settings.tracks?.map((t: { id: string }) => t.id) ?? [];
  if (selected.some((id) => !tracks.some((track) => track.id === id))) throw new Error("Track not found in project");
  if (selected.length) tracks = tracks.filter((track) => selected.includes(track.id));
  const anySolo = tracks.some((track) => track.isSolo);
  tracks = tracks.filter((track) => !track.isMuted && (!anySolo || track.isSolo));
  if (!tracks.length) throw new Error("No audible tracks selected");
  if (tracks.length > 128) throw new Error("Export exceeds the 128-track execution limit");
  const allClips = await db.query.audioClips.findMany({ where: eq(audioClips.projectId, project.id) });
  const plugins = await db.query.pluginInstances.findMany({ where: eq(pluginInstances.projectId, project.id) });
  if (job.settings.includeEffects !== false && plugins.some((plugin) => !plugin.isBypassed)) {
    throw new Error("Active plugin chains require the studio DSP renderer; disable effects for a dry export");
  }
  const files: string[] = [];
  const sampleRate = job.settings.sampleRate ?? job.settings.quality?.sampleRate ?? 48000;
  const bitDepth = job.settings.bitDepth ?? job.settings.quality?.bitDepth ?? 24;
  const format = job.settings.format ?? job.format;
  const codecs: Record<string, string> = { wav: bitDepth === 32 ? "pcm_f32le" : `pcm_s${bitDepth}le`, flac: "flac", mp3: "libmp3lame", aac: "aac", ogg: "libvorbis", aiff: `pcm_s${bitDepth}be` };
  if (!codecs[format]) throw new Error("Unsupported audio codec");
  async function encode(output: string, sources: string[], filters: string[], out: string, intermediate = false) {
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg();
      for (const source of sources) command = command.input(source);
      const timer = setTimeout(() => { command.kill("SIGKILL"); reject(new Error("Audio rendering exceeded execution limit")); }, 10 * 60_000);
      command.complexFilter(filters, out).audioCodec(intermediate ? "pcm_f32le" : codecs[format]).audioFrequency(sampleRate).audioChannels(2);
      if (!intermediate && format === "flac") command.outputOptions("-sample_fmt", bitDepth === 16 ? "s16" : "s32", "-bits_per_raw_sample", String(bitDepth));
      if (!intermediate && ["mp3", "aac", "ogg"].includes(format)) command.audioBitrate(job.settings.bitrate ?? 320);
      command.on("error", (err) => { clearTimeout(timer); reject(err); })
        .on("end", () => { clearTimeout(timer); resolve(); }).save(output);
    });
  }
  for (const track of tracks) {
    if ((await exportRepository.get(job.id, job.userId))?.status !== "processing") throw new Error("Export cancelled or interrupted");
    if (track.trackType !== "audio") {
      throw new Error("Instrument and effect-chain rendering requires the studio DSP renderer; export dry audio tracks only");
    }
    const clips = allClips.filter((clip) => clip.trackId === track.id && !clip.hiddenInTimeline);
    if (!clips.length) throw new Error(`Track ${track.name} has no audio clips`);
    if (clips.length > 256) throw new Error("Track exceeds the 256-clip execution limit");
    const sources: { localPath: string; cleanup: () => Promise<void> }[] = [];
    try {
      for (const clip of clips) {
        if (!clip.audioUrl || clip.warpSettings || clip.isComped) throw new Error("Warped/comped or missing source requires studio DSP rendering");
        // Never feed user-controlled remote URLs or local paths to ffmpeg.
        // PDIM enforces the source's user/public grant before materialization.
        const key = decodeURIComponent(clip.audioUrl.replace(/^\/api\/storage\/file\//, ""));
        const bytes = await hybridStorageService.read(job.userId, key);
        const localPath = path.join(dir, `source-${sources.length}`);
        await writeFile(localPath, bytes);
        sources.push({ localPath, cleanup: () => rm(localPath, { force: true }) });
      }
      const filters = clips.map(clipFilter);
      const pan = job.settings.preserveVolumePan === false ? 0 : track.pan ?? 0;
      const volume = job.settings.preserveVolumePan === false ? 1 : track.volume ?? 1;
      filters.push(`${clips.map((_, i) => `[clip${i}]`).join("")}amix=inputs=${clips.length}:normalize=0:duration=longest,volume=${volume},aformat=channel_layouts=stereo,pan=stereo|c0=${Math.min(1, 1 - pan)}*c0|c1=${Math.min(1, 1 + pan)}*c1[out]`);
      const stem = job.type === "stems";
      if (stem && job.settings.normalize) filters[filters.length - 1] = filters[filters.length - 1].replace("[out]", ",loudnorm=I=-14:TP=-1:LRA=11[out]");
      const safeName = track.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
      const output = path.join(dir, `${safeName}_${files.length + 1}.${stem ? (format === "aac" ? "m4a" : format) : "wav"}`);
      await encode(output, sources.map((source) => source.localPath), filters, "out", !stem);
      files.push(output);
    } finally { await Promise.all(sources.map((source) => source.cleanup())); }
  }
  if (job.type === "stems") {
    const output = path.join(dir, "stems.zip");
    await new Promise<void>((resolve, reject) => {
      const archive = archiver("zip", { zlib: { level: 6 } });
      const stream = createWriteStream(output);
      stream.on("close", resolve).on("error", reject); archive.on("error", reject); archive.pipe(stream);
      files.forEach((file, index) => archive.file(file, { name: job.settings.namingConvention === "numbered" ? `${String(index + 1).padStart(2, "0")}_${path.basename(file)}` : path.basename(file) }));
      void archive.finalize();
    });
    return { bytes: await readFile(output), mime: "application/zip", extension: "zip" };
  }
  const output = path.join(dir, `mix.${format === "aac" ? "m4a" : format}`);
  const normalize = job.settings.normalize ? ",loudnorm=I=-14:TP=-1:LRA=11" : "";
  await encode(output, files, [`${files.map((_, i) => `[${i}:a]`).join("")}amix=inputs=${files.length}:normalize=0:duration=longest${normalize}[out]`], "out");
  return { bytes: await readFile(output), mime: ({ wav: "audio/wav", mp3: "audio/mpeg", flac: "audio/flac", aac: "audio/mp4", ogg: "audio/ogg", aiff: "audio/aiff" } as Record<string, string>)[format], extension: format === "aac" ? "m4a" : format };
}

export async function runGenericExport(id: string, userId: string): Promise<void> {
  const job = await exportRepository.transition(id, ["queued"], { status: "processing", progress: 10 });
  if (!job || job.userId !== userId) return;
  let dir: string | undefined;
  try {
    let result: { bytes: Buffer; mime: string; extension: string };
    if (job.type === "data") {
      const range = job.settings.dateRange;
      const rows = await db.select().from(analytics).where(and(eq(analytics.userId, userId),
        range?.start ? gte(analytics.date, new Date(range.start)) : undefined,
        range?.end ? lte(analytics.date, new Date(range.end)) : undefined));
      const records = rows.map(({ date, streams, revenue, totalListeners, followers, platform }) => ({ date, streams, revenue, totalListeners, followers, platform }));
      const columns = ["date", "streams", "revenue", "totalListeners", "followers", "platform"] as const;
      const content = job.format === "json" ? JSON.stringify(records, null, 2) :
        [columns.map(csvCell).join(","), ...records.map((row) => columns.map((key) => csvCell(row[key] instanceof Date ? (row[key] as Date).toISOString() : row[key])).join(","))].join("\r\n");
      result = { bytes: Buffer.from(content), mime: job.format === "json" ? "application/json" : "text/csv; charset=utf-8", extension: job.format };
    } else {
      dir = await mkdtemp(path.join(tmpdir(), "generic-export-"));
      result = await renderAudio(job, dir);
    }
    if ((await exportRepository.get(id, userId))?.status !== "processing") return;
    const filename = `${job.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120)}.${result.extension}`;
    const stored = await hybridStorageService.upload(userId, filename, result.bytes, result.mime, { folder: "exports", isPublic: false });
    const verified = await hybridStorageService.read(userId, stored.key);
    const checksum = createHash("sha256").update(result.bytes).digest("hex");
    if (createHash("sha256").update(verified).digest("hex") !== checksum) throw new Error("Stored artifact verification failed");
    const committed = await exportRepository.transition(id, ["processing"], {
      status: "complete", progress: 100, completedAt: new Date(),
      artifact: { key: stored.key, size: verified.length, checksum, mime: result.mime, filename },
    });
    if (!committed) await hybridStorageService.delete(userId, stored.key);
  } catch (error) {
    await exportRepository.transition(id, ["processing"], { status: "failed", error: error instanceof Error ? error.message : "Export failed" });
  } finally { if (dir) await rm(dir, { recursive: true, force: true }); }
}

export function dispatchGenericExport(id: string, userId: string): void {
  void runGenericExport(id, userId).catch((err) => logger.error({ err, id }, "Generic export worker failed"));
}