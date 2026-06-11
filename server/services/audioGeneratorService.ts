/**
 * Audio Generator Service — Local FFmpeg-based audio production
 *
 * Produces standalone .mp3 files using:
 *   - Genre-calibrated procedural music bed (bass + beat + pad via aevalsrc)
 *   - Optional TTS voiceover (espeak-ng → espeak → FFmpeg flite → music-bed-only)
 *
 * Output is saved to uploads/audio/ and served at /uploads/audio/<filename>
 */

import { execFile, execFileSync } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import fsPromises from "fs/promises";
import { randomBytes } from "crypto";
import path from "path";
import os from "os";
import { logger } from "../logger.js";

const execFileAsync = promisify(execFile);

function resolveFFmpegPath(): string {
  if (process?.env.FFMPEG_PATH) return process?.env.FFMPEG_PATH;
  try {
    const p = execFileSync("/bin/sh", ["-c", "which ffmpeg"], { timeout: 3000 })
      .toString()
      .trim();
    if (p) return p;
  } catch {
    /* intentional: shell which-lookup fails → falls through to hardcoded candidates */
  }
  const candidates = [
    "/run/current-system/sw/bin/ffmpeg",
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/nix/var/nix/profiles/default/bin/ffmpeg",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "ffmpeg";
}

const FFMPEG = resolveFFmpegPath();
const AUDIO_DIR = path?.join(process?.cwd(), "uploads", "audio");

interface AudioProfile {
  bass: string;
  beat: string;
  pad: string;
}

const AUDIO_PROFILES: Record<string, AudioProfile> = {
  "hip-hop": {
    bass: "0.22*sin(2*PI*55*t)+0.14*sin(2*PI*110*t)+0.07*sin(2*PI*165*t)+0.04*sin(2*PI*220*t)",
    beat: "0.40*abs(sin(PI*1.5*t))^8*sin(2*PI*55*t)+0.12*abs(sin(PI*3.0*t))^10*sin(2*PI*220*t)",
    pad: "0.05*sin(2*PI*261.63*t)+0.04*sin(2*PI*311.13*t)+0.04*sin(2*PI*392.00*t)+0.03*sin(2*PI*523.25*t)",
  },
  trap: {
    bass: "0.28*sin(2*PI*41.2*t)+0.18*sin(2*PI*82.4*t)+0.08*sin(2*PI*123.6*t)+0.04*sin(2*PI*164.8*t)",
    beat: "0.50*abs(sin(PI*1.167*t))^10*sin(2*PI*41.2*t)+0.08*abs(sin(PI*7.0*t))^14*(sin(2*PI*6000*t)+sin(2*PI*6273*t))",
    pad: "0.04*sin(2*PI*220*t)+0.03*sin(2*PI*261.63*t)+0.025*sin(2*PI*329.63*t)",
  },
  "r&b": {
    bass: "0.18*sin(2*PI*110*t)+0.12*sin(2*PI*138.59*t)+0.09*sin(2*PI*164.81*t)+0.06*sin(2*PI*220*t)+0.04*sin(2*PI*277.18*t)",
    beat: "0.30*abs(sin(PI*1.333*t))^6*sin(2*PI*110*t)+0.08*abs(sin(PI*2.667*t))^8*sin(2*PI*330*t)",
    pad: "0.06*sin(2*PI*220*t)+0.05*sin(2*PI*261.63*t)+0.04*sin(2*PI*329.63*t)+0.04*sin(2*PI*440*t)",
  },
  pop: {
    bass: "0.18*sin(2*PI*65.41*t)+0.12*sin(2*PI*130.81*t)+0.07*sin(2*PI*196*t)+0.04*sin(2*PI*261.63*t)",
    beat: "0.38*abs(sin(PI*2.0*t))^8*sin(2*PI*65.41*t)+0.10*abs(sin(PI*4.0*t))^10*sin(2*PI*392*t)",
    pad: "0.07*sin(2*PI*261.63*t)+0.06*sin(2*PI*329.63*t)+0.06*sin(2*PI*392*t)+0.04*sin(2*PI*523.25*t)+0.03*sin(2*PI*659.26*t)",
  },
  electronic: {
    bass: "0.24*sin(2*PI*55*t)+0.16*sin(2*PI*110*t)+0.10*sin(2*PI*165*t)+0.06*sin(2*PI*220*t)+0.03*sin(2*PI*275*t)",
    beat: "0.50*abs(sin(PI*2.133*t))^10*sin(2*PI*55*t)+0.12*abs(sin(PI*2.133*t))^12*(sin(2*PI*440*t)+sin(2*PI*443*t))",
    pad: "0.05*(sin(2*PI*440*t)+sin(2*PI*441.5*t))+0.04*(sin(2*PI*523.25*t)+sin(2*PI*524.8*t))+0.03*sin(2*PI*659.26*t)",
  },
  afrobeats: {
    bass: "0.20*sin(2*PI*110*t)+0.14*sin(2*PI*146.83*t)+0.10*sin(2*PI*164.81*t)+0.06*sin(2*PI*220*t)",
    beat: "0.35*abs(sin(PI*1.583*t))^7*sin(2*PI*110*t)+0.12*abs(sin(PI*3.167*t))^8*sin(2*PI*349.23*t)",
    pad: "0.06*sin(2*PI*220*t)+0.05*sin(2*PI*261.63*t)+0.04*sin(2*PI*329.63*t)+0.04*sin(2*PI*440*t)",
  },
  rock: {
    bass: "0.22*sin(2*PI*82.41*t)+0.15*sin(2*PI*164.81*t)+0.09*sin(2*PI*247.22*t)+0.06*sin(2*PI*329.63*t)+0.04*sin(2*PI*412.04*t)",
    beat: "0.45*abs(sin(PI*2.0*t))^8*sin(2*PI*82.41*t)+0.12*abs(sin(PI*4.0*t))^10*(sin(2*PI*440*t)+sin(2*PI*880*t))*0.5",
    pad: "0.05*(sin(2*PI*329.63*t)+sin(2*PI*493.88*t)+sin(2*PI*659.26*t))",
  },
  jazz: {
    bass: "0.15*sin(2*PI*73.42*t)+0.11*sin(2*PI*110*t)+0.08*sin(2*PI*146.83*t)+0.06*sin(2*PI*220*t)",
    beat: "0.25*abs(sin(PI*2.0*t))^5*sin(2*PI*73.42*t)+0.08*abs(sin(PI*3.0*t))^6*sin(2*PI*349.23*t)",
    pad: "0.05*sin(2*PI*220*t)+0.04*sin(2*PI*261.63*t)+0.04*sin(2*PI*311.13*t)+0.04*sin(2*PI*392*t)+0.03*sin(2*PI*466.16*t)",
  },
  default: {
    bass: "0.18*sin(2*PI*110*t)+0.12*sin(2*PI*138.59*t)+0.08*sin(2*PI*164.81*t)+0.05*sin(2*PI*220*t)",
    beat: "0.32*abs(sin(PI*1.667*t))^7*sin(2*PI*110*t)+0.09*abs(sin(PI*3.333*t))^8*sin(2*PI*330*t)",
    pad: "0.05*sin(2*PI*220*t)+0.04*sin(2*PI*261.63*t)+0.04*sin(2*PI*329.63*t)+0.03*sin(2*PI*440*t)",
  },
};

export interface AudioGenOptions {
  genre?: string;
  duration?: number;
  text?: string;
  topic?: string;
  artistName?: string;
}

export interface AudioGenResult {
  success: boolean;
  url?: string;
  filename?: string;
  durationSec?: number;
  error?: string;
}

async function tryGenerateTTS(
  text: string,
  maxDur: number,
): Promise<string | null> {
  const outPath = path?.join(
    os?.tmpdir(),
    `tts_${randomBytes(4).toString("hex")}.wav`,
  );
  const clean = text
    .replace(/['"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  const espeakArgs = [
    "-v",
    "en",
    "-s",
    "150",
    "-p",
    "45",
    "-a",
    "160",
    "-w",
    outPath,
    clean,
  ];

  for (const bin of ["espeak-ng", "espeak"]) {
    try {
      await execFileAsync(bin, espeakArgs, { timeout: 12_000 });
      if (
        await fsPromises
          .access(outPath)
          .then(() => true)
          .catch(() => false)
      ) {
        logger.info(`[AudioGen] TTS via ${bin} — ${clean.length} chars`);
        return outPath;
      }
    } catch {
      /* intentional: TTS engine attempt failed → tries next engine in loop */
    }
  }

  const fliteText = clean.slice(0, 200).replace(/'/g, "");
  try {
    await execFileAsync(
      FFMPEG,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `flite=text='${fliteText}':voice=kal`,
        "-t",
        String(maxDur),
        "-ar",
        "44100",
        "-ac",
        "2",
        outPath,
      ],
      { timeout: 20_000 },
    );
    if (
      await fsPromises
        .access(outPath)
        .then(() => true)
        .catch(() => false)
    ) {
      logger.info("[AudioGen] TTS via FFmpeg flite");
      return outPath;
    }
  } catch {
    /* intentional: flite TTS attempt failed → caller logs warning and returns null */
  }

  logger.warn("[AudioGen] All TTS engines unavailable — music-bed only");
  return null;
}

export async function generateAudio(
  opts: AudioGenOptions = {},
): Promise<AudioGenResult> {
  await fsPromises.mkdir(AUDIO_DIR, { recursive: true });

  const genre = (opts.genre || "default").toLowerCase().replace(/[\s/]/g, "-");
  const profile = AUDIO_PROFILES[genre] || AUDIO_PROFILES["default"];
  const duration = Math.min(Math.max(opts.duration ?? 30, 5), 120);

  const filename = `audio_${randomBytes(6).toString("hex")}.mp3`;
  const outputPath = path.join(AUDIO_DIR, filename);

  const src1 = `aevalsrc=${profile.bass}|${profile.bass}:sample_rate=44100:channel_layout=stereo`;
  const src2 = `aevalsrc=${profile.beat}|${profile.beat}:sample_rate=44100:channel_layout=stereo`;
  const src3 = `aevalsrc=${profile.pad}|${profile.pad}:sample_rate=44100:channel_layout=stereo`;

  const fadeDur = Math.min(1.5, duration * 0.08).toFixed(2);
  const fadeOut = Math.max(0, duration - parseFloat(fadeDur)).toFixed(2);

  const ttsText = [opts.text, opts.topic, opts.artistName]
    .filter(Boolean)
    .join(". ");
  const voPath = ttsText ? await tryGenerateTTS(ttsText, duration) : null;

  const inputs: string[] = [
    "-f",
    "lavfi",
    "-i",
    src1,
    "-f",
    "lavfi",
    "-i",
    src2,
    "-f",
    "lavfi",
    "-i",
    src3,
  ];
  if (voPath) inputs.push("-i", voPath);

  const buildFilter = (withVoice: boolean): string => {
    const bed = [
      `[0:a][1:a][2:a]amix=inputs=3:normalize=0:weights=1.2 0.9 0.5[bed]`,
      `[bed]volume=0.9,afade=t=in:st=0:d=${fadeDur},afade=t=out:st=${fadeOut}:d=${fadeDur}[bedq]`,
    ];
    if (withVoice) {
      return [
        ...bed,
        `[3:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.1,afade=t=in:st=0:d=0.3[vo]`,
        `[vo][bedq]amix=inputs=2:normalize=0:weights=1.0 0.28[afinal]`,
      ].join(";");
    }
    return [...bed, `[bedq]volume=1.0[afinal]`].join(";");
  };

  const build = (withVoice: boolean) => [
    "-y",
    ...inputs,
    "-filter_complex",
    buildFilter(withVoice),
    "-map",
    "[afinal]",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    "-t",
    String(duration),
    outputPath,
  ];

  try {
    await execFileAsync(FFMPEG, build(!!voPath), { timeout: 60_000 });
  } catch (err) {
    if (voPath) {
      logger.warn(
        "[AudioGen] First attempt failed (possibly bad TTS file), retrying music-bed only",
      );
      try {
        await fsPromises.unlink(voPath);
      } catch {
        /* intentional: temp voiceover cleanup */
      }
      await execFileAsync(FFMPEG, build(false), { timeout: 60_000 });
    } else {
      throw err;
    }
  }

  if (voPath) {
    try {
      await fsPromises.unlink(voPath);
    } catch {
      /* intentional: temp voiceover cleanup */
    }
  }

  if (
    !(await fsPromises
      .access(outputPath)
      .then(() => true)
      .catch(() => false))
  ) {
    return { success: false, error: "FFmpeg produced no output file" };
  }

  logger?.info(
    `[AudioGen] ✅ ${filename} — ${genre} | ${duration}s | TTS: ${!!voPath}`,
  );
  return {
    success: true,
    url: `/uploads/audio/${filename}`,
    filename,
    durationSec: duration,
  };
}
