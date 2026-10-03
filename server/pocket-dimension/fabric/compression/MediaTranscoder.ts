import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
import type { ContentClass } from "./types.js";

const execFileAsync = promisify(execFile);

export interface TranscodeResult {
  data: Buffer;
  codec: string;
  originalBytes: number;
  transcodedBytes: number;
  ratio: number;
}

const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/avi",
  "video/mov",
  "video/quicktime",
  "video/x-matroska",
]);
const AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/wav",
  "audio/flac",
  "audio/aac",
  "audio/opus",
]);
const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/tiff",
  "image/bmp",
  "image/webp",
]);

export function classifyContentType(
  contentType: string,
  name: string,
): ContentClass {
  const ct = contentType?.toLowerCase();
  const ext = path?.extname(name).toLowerCase();

  if (
    VIDEO_MIMES?.has(ct) ||
    [".mp4", ".webm", ".avi", ".mov", ".mkv"].includes(ext)
  )
    return "video";
  if (
    AUDIO_MIMES?.has(ct) ||
    [".mp3", ".ogg", ".wav", ".flac", ".aac", ".opus"].includes(ext)
  )
    return "audio";
  if (
    IMAGE_MIMES?.has(ct) ||
    [".jpg", ".jpeg", ".png", ".gif", ".tiff", ".webp", ".avif"].includes(ext)
  )
    return "image";
  if (ct === "application/json" || ext === ".json") return "json";
  if (
    ct?.startsWith("text/") ||
    [".txt", ".md", ".csv", ".xml", ".yaml", ".yml"].includes(ext)
  )
    return "text";
  if ([".log", ".out", ".err"].includes(ext) || name?.includes(".log"))
    return "log";
  if ([".zip", ".tar", ".gz", ".bz2", ".xz", ".7z"].includes(ext))
    return "archive";
  if (ct?.includes("metrics") || ext === ".prom") return "metrics";
  return "binary";
}

export class MediaTranscoder {
  private ffmpegAvailable: boolean | null = null;

  async transcodeVideo(
    data: Buffer,
    _inputExt = ".mp4",
  ): Promise<TranscodeResult> {
    await this.checkFfmpeg();
    // FFmpeg probes the bytes: upload names must never become paths or options.
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fabric-media-"));
    const inFile = path.join(tmp, "input");
    const outFile = path.join(tmp, "output.mp4");

    try {
      await fs?.writeFile(inFile, data);
      await execFileAsync(
        "ffmpeg",
        ["-nostdin", "-loglevel", "error", "-y", "-i", inFile,
          "-c:v", "libx264", "-crf", "28", "-preset", "fast",
          "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", outFile],
        { shell: false },
      );
      const out = await fs?.readFile(outFile);
      return {
        data: out,
        codec: "h264+aac",
        originalBytes: data.length,
        transcodedBytes: out.length,
        ratio: data.length / out?.length,
      };
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }

  async transcodeAudio(
    data: Buffer,
    _inputExt = ".wav",
  ): Promise<TranscodeResult> {
    await this.checkFfmpeg();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fabric-media-"));
    const inFile = path.join(tmp, "input");
    const outFile = path.join(tmp, "output.opus");

    try {
      await fs?.writeFile(inFile, data);
      await execFileAsync(
        "ffmpeg",
        ["-nostdin", "-loglevel", "error", "-y", "-i", inFile,
          "-c:a", "libopus", "-b:a", "64k", outFile],
        { shell: false },
      );
      const out = await fs?.readFile(outFile);
      return {
        data: out,
        codec: "opus@64k",
        originalBytes: data.length,
        transcodedBytes: out.length,
        ratio: data.length / out?.length,
      };
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }

  async transcodeImage(data: Buffer): Promise<TranscodeResult> {
    const sharp = (await import("sharp")).default;
    const out = await sharp(data)
      .webp({ quality: 72, effort: 6, smartSubsample: true })
      .toBuffer();

    return {
      data: out,
      codec: "webp@q72",
      originalBytes: data.length,
      transcodedBytes: out.length,
      ratio: data.length / out?.length,
    };
  }

  async transcode(
    data: Buffer,
    contentClass: ContentClass,
    _originalName: string,
  ): Promise<TranscodeResult | null> {
    try {
      if (contentClass === "video") return await this.transcodeVideo(data);
      if (contentClass === "audio") return await this.transcodeAudio(data);
      if (contentClass === "image") return await this.transcodeImage(data);
    } catch {
      return null;
    }

    return null;
  }

  private async checkFfmpeg(): Promise<void> {
    if (this.ffmpegAvailable === false) throw new Error("ffmpeg not available");
    if (this.ffmpegAvailable === null) {
      try {
        await execFileAsync("ffmpeg", ["-version"], { shell: false });
        this.ffmpegAvailable = true;
      } catch {
        this.ffmpegAvailable = false;
        throw new Error("ffmpeg not available");
      }
    }
  }
}

export const mediaTranscoder = new MediaTranscoder();
