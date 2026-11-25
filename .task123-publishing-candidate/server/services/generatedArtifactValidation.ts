import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Probe actual bytes, not a renderer's specification or claimed duration. */
export async function validateGeneratedArtifact(bytes: Buffer, kind: string) {
  if (!["audio", "video", "image"].includes(kind) || bytes.length < 32) {
    throw new Error("Invalid generated media kind or empty artifact");
  }
  const directory = await mkdtemp(join(tmpdir(), "generated-verify-"));
  try {
    const file = join(directory, "artifact");
    await writeFile(file, bytes);
    const { stdout } = await exec("ffprobe", [
      "-v", "error", "-show_streams", "-show_format", "-of", "json", file,
    ], { timeout: 20000, maxBuffer: 1024 * 1024 });
    const probe = JSON.parse(stdout);
    const stream = probe.streams?.find((s: { codec_type: string }) =>
      s.codec_type === (kind === "audio" ? "audio" : "video"));
    if (!stream) throw new Error("Generated artifact has no required media stream");
    const duration = Number(stream.duration ?? probe.format?.duration);
    if (kind !== "image" && (!Number.isFinite(duration) || duration <= 0)) {
      throw new Error("Generated artifact has no actual duration");
    }
    await exec("ffmpeg", ["-v", "error", "-xerror", "-i", file,
      "-map", kind === "audio" ? "0:a:0" : "0:v:0", "-f", "null", "-"],
    { timeout: 90000, maxBuffer: 1024 * 1024 });
    return { duration: Number.isFinite(duration) ? duration : null,
      width: stream.width ?? null, height: stream.height ?? null,
      codec: stream.codec_name, sample_rate: stream.sample_rate ? Number(stream.sample_rate) : null };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}