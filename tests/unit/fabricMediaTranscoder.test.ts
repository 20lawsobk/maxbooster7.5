import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { MediaTranscoder, classifyContentType } from "../../server/pocket-dimension/fabric/compression/MediaTranscoder";

const run = promisify(execFile);
let fixtures: string;
let audio: Buffer;
let video: Buffer;
const marker = `fabric-injection-proof-${randomUUID()}`;
const temporaryDirectories: string[] = [];

beforeAll(async () => {
  fixtures = await fs.mkdtemp(path.join(os.tmpdir(), "fabric-test-"));
  await run("ffmpeg", ["-nostdin", "-loglevel", "error", "-f", "lavfi",
    "-i", "anullsrc=r=48000:cl=mono", "-t", "60", "-c:a", "pcm_s16le",
    path.join(fixtures, "audio.wav")], { shell: false });
  await run("ffmpeg", ["-nostdin", "-loglevel", "error", "-f", "lavfi",
    "-i", "color=c=black:s=32x32:r=1", "-t", "1", "-c:v", "libx264",
    path.join(fixtures, "video.mp4")], { shell: false });
  audio = await fs.readFile(path.join(fixtures, "audio.wav"));
  video = await fs.readFile(path.join(fixtures, "video.mp4"));
  const mkdtemp = fs.mkdtemp.bind(fs);
  vi.spyOn(fs, "mkdtemp").mockImplementation(async (...args) => {
    const directory = await mkdtemp(...args);
    temporaryDirectories.push(directory as string);
    return directory;
  });
});

afterEach(async () => {
  expect(await fs.access(marker).then(() => true, () => false)).toBe(false);
  for (const directory of temporaryDirectories.splice(0)) {
    expect(await fs.access(directory).then(() => true, () => false)).toBe(false);
  }
});

afterAll(async () => {
  vi.restoreAllMocks();
  if (fixtures) await fs.rm(fixtures, { recursive: true, force: true });
  await fs.rm(marker, { force: true });
});

const filenames = [
  `beat.$(touch ${marker})`,
  `beat.\`touch ${marker}\``,
  `beat."; touch ${marker}; #`,
  "a normal Unicode café track.WAV",
  "../nested/name.with.multiple.dots",
  "no-extension",
];

for (const kind of ["audio", "video"] as const) {
  it.each(filenames)(`${kind}: safely transcodes filename %s using real FFmpeg`, async (name) => {
    const data = kind === "audio" ? audio : video;
    if (kind === "audio") expect(data.length).toBeGreaterThan(5 * 1024 * 1024);
    expect(classifyContentType(kind === "audio" ? "audio/wav" : "video/mp4", name)).toBe(kind);
    const result = await new MediaTranscoder().transcode(data, kind, name);
    expect(result).not.toBeNull();
    expect(result!.codec).toBe(kind === "audio" ? "opus@64k" : "h264+aac");
    expect(result!.originalBytes).toBe(data.length);
    expect(result!.data.length).toBeGreaterThan(0);
  });

  it(`${kind}: direct entry point ignores untrusted suffixes`, async () => {
    const transcoder = new MediaTranscoder();
    const suffix = `.$(touch ${marker})/../../untrusted`;
    const result = kind === "audio"
      ? await transcoder.transcodeAudio(audio, suffix)
      : await transcoder.transcodeVideo(video, suffix);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it(`${kind}: malformed media cleans up and preserves the existing null result`, async () => {
    const result = await new MediaTranscoder().transcode(
      Buffer.alloc(5 * 1024 * 1024, 1), kind, `beat.$(touch ${marker})`,
    );
    expect(result).toBeNull();
  });
}