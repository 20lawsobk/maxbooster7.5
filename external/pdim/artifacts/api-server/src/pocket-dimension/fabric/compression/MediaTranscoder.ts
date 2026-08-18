import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";
import type { ContentClass } from "./types.js";

const execAsync = promisify(exec);

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
  const ct = contentType.toLowerCase();
  const ext = path.extname(name).toLowerCase();

  if (
    VIDEO_MIMES.has(ct) ||
    [".mp4", ".webm", ".avi", ".mov", ".mkv"].includes(ext)
  )
    return "video";
  if (
    AUDIO_MIMES.has(ct) ||
    [".mp3", ".ogg", ".wav", ".flac", ".aac", ".opus"].includes(ext)
  )
    return "audio";
  if (
    IMAGE_MIMES.has(ct) ||
    [".jpg", ".jpeg", ".png", ".gif", ".tiff", ".webp", ".avif"].includes(ext)
  )
    return "image";
  if (ct === "application/json" || ext === ".json") return "json";
  if (
    ct.startsWith("text/") ||
    [".txt", ".md", ".csv", ".xml", ".yaml", ".yml"].includes(ext)
  )
    return "text";
  if ([".log", ".out", ".err"].includes(ext) || name.includes(".log"))
    return "log";
  if ([".zip", ".tar", ".gz", ".bz2", ".xz", ".7z"].includes(ext))
    return "archive";
  if (ct.includes("metrics") || ext === ".prom") return "metrics";
  return "binary";
}

export class MediaTranscoder {
  private ffmpegAvailable: boolean | null = null;
  private sharpAvailable: boolean | null = null;

  async transcodeVideo(
    data: Buffer,
    inputExt = ".mp4",
  ): Promise<TranscodeResult> {
    await this.checkFfmpeg();
    const tmp = path.join(os.tmpdir(), randomBytes(8).toString("hex"));
    const inFile = `${tmp}${inputExt}`;
    const outFile = `${tmp}_out.mp4`;

    try {
      await fs.writeFile(inFile, data);
      await execAsync(
        `ffmpeg -y -i "${inFile}" -c:v libx264 -crf 28 -preset fast -c:a aac -b:a 96k -movflags +faststart "${outFile}" 2>/dev/null`,
      );
      const out = await fs.readFile(outFile);
      return {
        data: out,
        codec: "h264+aac",
        originalBytes: data.length,
        transcodedBytes: out.length,
        ratio: data.length / (out.length || 1),
      };
    } finally {
      await fs.rm(inFile, { force: true });
      await fs.rm(outFile, { force: true });
    }
  }

  async transcodeAudio(
    data: Buffer,
    inputExt = ".wav",
  ): Promise<TranscodeResult> {
    await this.checkFfmpeg();
    const tmp = path.join(os.tmpdir(), randomBytes(8).toString("hex"));
    const inFile = `${tmp}${inputExt}`;
    const outFile = `${tmp}_out.opus`;

    try {
      await fs.writeFile(inFile, data);
      await execAsync(
        `ffmpeg -y -i "${inFile}" -c:a libopus -b:a 64k "${outFile}" 2>/dev/null`,
      );
      const out = await fs.readFile(outFile);
      return {
        data: out,
        codec: "opus@64k",
        originalBytes: data.length,
        transcodedBytes: out.length,
        ratio: data.length / (out.length || 1),
      };
    } finally {
      await fs.rm(inFile, { force: true });
      await fs.rm(outFile, { force: true });
    }
  }

  async transcodeImage(data: Buffer): Promise<TranscodeResult> {
    let sharp: any;
    try {
      // @ts-ignore — optional dependency
      sharp = (await import("sharp")).default;
    } catch {
      // sharp not installed — return passthrough
      return {
        data,
        codec: "passthrough",
        originalBytes: data.length,
        transcodedBytes: data.length,
        ratio: 1,
      };
    }
    const out = await sharp(data)
      .webp({ quality: 72, effort: 6, smartSubsample: true })
      .toBuffer();

    return {
      data: out,
      codec: "webp@q72",
      originalBytes: data.length,
      transcodedBytes: out.length,
      ratio: data.length / (out.length || 1),
    };
  }

  async transcode(
    data: Buffer,
    contentClass: ContentClass,
    originalName: string,
  ): Promise<TranscodeResult | null> {
    const ext =
      path.extname(originalName).toLowerCase() || this.classToExt(contentClass);

    try {
      if (contentClass === "video") return await this.transcodeVideo(data, ext);
      if (contentClass === "audio") return await this.transcodeAudio(data, ext);
      if (contentClass === "image") return await this.transcodeImage(data);
    } catch {
      return null;
    }

    return null;
  }

  private classToExt(c: ContentClass): string {
    if (c === "video") return ".mp4";
    if (c === "audio") return ".wav";
    if (c === "image") return ".png";
    return ".bin";
  }

  private async checkFfmpeg(): Promise<void> {
    if (this.ffmpegAvailable === false) throw new Error("ffmpeg not available");
    if (this.ffmpegAvailable === null) {
      try {
        await execAsync("ffmpeg -version 2>/dev/null");
        this.ffmpegAvailable = true;
      } catch {
        this.ffmpegAvailable = false;
        throw new Error("ffmpeg not available");
      }
    }
  }
}

export const mediaTranscoder = new MediaTranscoder();
