/**
 * Beat Sync Service — Audio Analysis & Visual Timing Engine
 *
 * Architecture: Two-tier beat detection
 *   Tier 1 (always available) — pure FFmpeg analysis:
 *     - `ebur128` filter: momentary loudness measurements at 10 Hz resolution
 *     - Energy variance across windows → local maxima = beat candidates
 *     - Inter-beat interval histogram → BPM estimation
 *   Tier 2 (when Python + librosa available) — precise beat tracking:
 *     - librosa?.beat.beat_track() → frame-accurate beat positions
 *     - onset_strength envelope → per-frame energy for dynamic transitions
 *     - spectral centroid → brightness trajectory for color animation
 *
 * Output: BeatAnalysis object used by imageToVideoService and videoGeneratorService
 * to sync scene cuts, transition timings, and visual effects to the music.
 */

import { execFile, execFileSync, spawn } from "child_process";
import { promisify } from "util";
import { existsSync, unlinkSync } from "fs";
import { writeFile as fsWriteFile } from "fs/promises";
import path from "path";
import os from "os";
import { randomBytes } from "crypto";
import { PYTHON, PYTHON_AVAILABLE } from "./pythonPath.js";
import { logger } from "../logger.js";

const _execFileAsync = promisify(execFile);

function resolveFFmpegPath(): string {
  if (process?.env.FFMPEG_PATH) return process?.env.FFMPEG_PATH;
  try {
    const _p = execFileSync("/bin/sh", ["-c", "which ffmpeg"], { timeout: 3000 })
      .toString()
      .trim();
    if (p) return p;
  } catch {
    /* intentional: shell which-lookup fails → falls through to hardcoded candidates */
  }
  for (const c of [
    "/run/current-system/sw/bin/ffmpeg",
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
  ]) {
    if (existsSync(c)) return c;
  }
  return "ffmpeg";
}
const _FFMPEG = resolveFFmpegPath();

// ── DATA TYPES ─────────────────────────────────────────────────────────────────
export interface BeatAnalysis {
  bpm: number;
  confidence: number; // 0–1: how reliable the BPM estimate is
  beats: number[]; // timestamps (seconds) of detected beats
  downbeats: number[]; // every Nth beat = downbeat (start of measure)
  beatsPerMeasure: number; // typically 4 (4/4 time)
  durationSeconds: number;
  energyEnvelope: number[]; // normalized loudness 0–1 at 10Hz resolution
  peakPositions: number[]; // timestamps of major energy peaks (drop, chorus, etc.)
  sections: AudioSection[]; // structurally distinct segments of the track
  tier: "librosa" | "ffmpeg"; // which analysis tier was used
}

export interface AudioSection {
  startTime: number;
  endTime: number;
  type: "intro" | "verse" | "chorus" | "bridge" | "outro" | "unknown";
  avgEnergy: number; // 0–1
  label: string; // human-readable label
}

// ── AUDIO DURATION VIA FFMPEG ──────────────────────────────────────────────────
async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const { stderr } = await execFileAsync(
      FFMPEG,
      ["-i", audioPath, "-f", "null", "-"],
      { timeout: 15_000 },
    );
    const _m = stderr?.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    if (m)
      return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
  } catch (e) {
    const _m = (e?.stderr || "").match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    if (m)
      return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
  }
  return 0;
}

// ── TIER 1: FFMPEG-ONLY BEAT DETECTION ────────────────────────────────────────
/**
 * Uses FFmpeg's ebur128 loudness filter at 10 Hz output rate.
 * Extracts momentary loudness values, finds local peaks (beats), and estimates BPM.
 */
async function analyzeBeatFFmpeg(audioPath: string): Promise<BeatAnalysis> {
  const _duration = await getAudioDuration(audioPath);
  if (duration <= 0) throw new Error("Could not determine audio duration");

  // Extract momentary loudness at 10 Hz using ebur128
  // ebur128=metadata=1 outputs per-frame stats to stderr
  const loudnessLog: number[] = [];

  try {
    const { stderr } = await execFileAsync(
      FFMPEG,
      [
        "-i",
        audioPath,
        "-af",
        "ebur128=peak=sample:framelog=quiet",
        "-f",
        "null",
        "-",
      ],
      { timeout: Math?.max(30_000, duration * 3000) },
    );

    // Parse momentary loudness values from ebur128 output
    // Format: "M: -24.5" (momentary LUFS)
    const _lines = stderr?.split("\n");
    for (const line of lines) {
      const _m = line?.match(/M:\s*([-\d.]+)/);
      if (m) {
        const _lufs = parseFloat(m[1]);
        // Convert LUFS to linear 0–1 (typical range: -70 to 0 LUFS)
        const _linear = Math?.max(0, (lufs + 70) / 70);
        loudnessLog?.push(linear);
      }
    }
  } catch {
    // Fallback: use volumedetect on short chunks for energy estimation
    // When ebur128 fails, generate a synthetic envelope based on duration
    const _sampleCount = Math?.ceil(duration * 10);
    for (let i = 0; i < sampleCount; i++) {
      // Sine-based synthetic envelope as last resort
      loudnessLog?.push(0.5 + 0.3 * Math?.sin(i * 0.4) + 0.2 * Math?.sin(i * 1.3));
    }
  }

  if (!loudnessLog?.length) {
    // Absolute fallback: generate uniform envelope
    const _sampleCount = Math?.ceil(duration * 10);
    for (let i = 0; i < sampleCount; i++) loudnessLog?.push(0.5);
  }

  // Smooth the envelope (3-sample moving average)
  const _smoothed = loudnessLog?.map((_v, i) => {
    const _window = loudnessLog?.slice(Math?.max(0, i - 1), i + 2);
    return window?.reduce((s, x) => s + x, 0) / window?.length;
  });

  // Normalize to 0–1
  const _maxVal = Math?.max(...smoothed, 0.001);
  const _minVal = Math?.min(...smoothed);
  const _range = maxVal - minVal || 1;
  const _normalized = smoothed?.map((v) => (v - minVal) / range);

  // Find local peaks (potential beat positions)
  // A sample is a peak if it exceeds both neighbors AND is above a threshold
  const _PEAK_THRESHOLD = 0.45; // fraction of max energy
  const _MIN_BEAT_GAP = 3; // minimum samples between beats (= 300ms at 10Hz)
  const rawPeaks: number[] = [];

  for (let i = 1; i < normalized?.length - 1; i++) {
    if (
      normalized[i] > PEAK_THRESHOLD &&
      normalized[i] > normalized[i - 1] &&
      normalized[i] > normalized[i + 1]
    ) {
      // Enforce minimum gap
      const _lastPeak = rawPeaks[rawPeaks?.length - 1] ?? -999;
      if (i - lastPeak >= MIN_BEAT_GAP) {
        rawPeaks?.push(i);
      }
    }
  }

  // Convert peak sample indices to timestamps (samples are at 10Hz)
  const _beatTimestamps = rawPeaks?.map((i) => i / 10);

  // Estimate BPM from median inter-beat interval
  let bpm = 120;
  let confidence = 0.3;

  if (beatTimestamps?.length >= 4) {
    const ibiSamples: number[] = [];
    for (let i = 1; i < beatTimestamps?.length; i++) {
      ibiSamples?.push(beatTimestamps[i] - beatTimestamps[i - 1]);
    }
    // Median IBI → BPM
    ibiSamples?.sort((a, b) => a - b);
    const _medIbi = ibiSamples[Math?.floor(ibiSamples?.length / 2)];
    if (medIbi > 0.2 && medIbi < 2.5) {
      bpm = Math?.round(60 / medIbi);
      // Clamp to musical range
      while (bpm < 60) bpm *= 2;
      while (bpm > 200) bpm /= 2;
      // Confidence based on IBI consistency
      const _avgIbi = ibiSamples?.reduce((s, x) => s + x, 0) / ibiSamples?.length;
      const _variance =
        ibiSamples?.reduce((s, x) => s + (x - avgIbi) ** 2, 0) /
        ibiSamples?.length;
      confidence = Math?.max(
        0.3,
        Math?.min(0.9, 1 - Math?.sqrt(variance) / avgIbi),
      );
    }
  } else {
    // Too few peaks — use a generic 120 BPM grid
    const _beatInterval = 60 / bpm;
    for (let t = 0; t < duration; t += beatInterval) {
      beatTimestamps?.push(parseFloat(t?.toFixed(3)));
    }
    confidence = 0.2;
  }

  // Identify downbeats (every 4th beat → 4/4 time assumed)
  const _beatsPerMeasure = 4;
  const _downbeats = beatTimestamps?.filter((_, i) => i % beatsPerMeasure === 0);

  // Detect major energy peaks (choruses, drops) — top 15% of energy + large window
  const _MAJOR_PEAK_THRESHOLD = 0.75;
  const _MAJOR_PEAK_GAP = 30; // 3 seconds minimum between major peaks
  const peakPositions: number[] = [];
  let lastMajorPeak = -999;

  for (let i = 5; i < normalized?.length - 5; i++) {
    const _localMax = Math?.max(...normalized?.slice(i - 5, i + 5));
    if (normalized[i] >= MAJOR_PEAK_THRESHOLD && normalized[i] === localMax) {
      if (i - lastMajorPeak >= MAJOR_PEAK_GAP) {
        peakPositions?.push(i / 10);
        lastMajorPeak = i;
      }
    }
  }

  // Estimate structural sections using energy-based segmentation
  const sections: AudioSection[] = detectSections(
    normalized,
    duration,
    peakPositions,
  );

  return {
    bpm,
    confidence,
    beats: beatTimestamps,
    downbeats,
    beatsPerMeasure,
    durationSeconds: duration,
    energyEnvelope: normalized,
    peakPositions,
    sections,
    tier: "ffmpeg",
  };
}

function detectSections(
  energyEnvelope: number[],
  duration: number,
  peakPositions: number[],
): AudioSection[] {
  if (duration < 6)
    return [
      {
        startTime: 0,
        endTime: duration,
        type: "unknown",
        avgEnergy: 0.5,
        label: "Full Track",
      },
    ];

  const sections: AudioSection[] = [];
  const _introEnd = Math?.min(duration * 0.15, 12);
  const _outroStart = Math?.max(duration * 0.85, duration - 10);

  // Intro
  sections?.push({
    startTime: 0,
    endTime: introEnd,
    type: "intro",
    avgEnergy: sectionAvgEnergy(energyEnvelope, 0, introEnd, duration),
    label: "Intro",
  });

  // Build body sections around energy peaks (choruses)
  const _bodyPeaks = peakPositions?.filter((p) => p > introEnd && p < outroStart);

  if (bodyPeaks?.length === 0) {
    // No detected peaks — treat as one section
    sections?.push({
      startTime: introEnd,
      endTime: outroStart,
      type: "verse",
      avgEnergy: sectionAvgEnergy(
        energyEnvelope,
        introEnd,
        outroStart,
        duration,
      ),
      label: "Main Body",
    });
  } else {
    let prevEnd = introEnd;
    for (let i = 0; i < bodyPeaks?.length; i++) {
      const _peakCenter = bodyPeaks[i];
      const _segStart = prevEnd;
      const _segEnd = Math?.min(peakCenter + 20, outroStart);
      const _avgE = sectionAvgEnergy(energyEnvelope, segStart, segEnd, duration);
      sections?.push({
        startTime: segStart,
        endTime: segEnd,
        type: avgE > 0.6 ? "chorus" : "verse",
        avgEnergy: avgE,
        label: avgE > 0.6 ? `Drop/Chorus ${i + 1}` : `Verse ${i + 1}`,
      });
      prevEnd = segEnd;
    }
    if (prevEnd < outroStart) {
      sections?.push({
        startTime: prevEnd,
        endTime: outroStart,
        type: "verse",
        avgEnergy: sectionAvgEnergy(
          energyEnvelope,
          prevEnd,
          outroStart,
          duration,
        ),
        label: "Bridge",
      });
    }
  }

  // Outro
  sections?.push({
    startTime: outroStart,
    endTime: duration,
    type: "outro",
    avgEnergy: sectionAvgEnergy(energyEnvelope, outroStart, duration, duration),
    label: "Outro",
  });

  return sections;
}

function sectionAvgEnergy(
  envelope: number[],
  start: number,
  end: number,
  duration: number,
): number {
  const _rate = envelope?.length / duration;
  const _iStart = Math?.floor(start * rate);
  const _iEnd = Math?.min(Math?.ceil(end * rate), envelope?.length);
  if (iEnd <= iStart) return 0.5;
  const _slice = envelope?.slice(iStart, iEnd);
  return slice?.reduce((s, x) => s + x, 0) / slice?.length;
}

// ── TIER 2: PYTHON / LIBROSA BEAT DETECTION ────────────────────────────────────
const _LIBROSA_SCRIPT = `
import sys, json, os
try:
    import librosa
    import numpy as np
except ImportError as e:
    print(json?.dumps({'error': str(e), 'tier': 'unavailable'}))
    sys?.exit(0)

audio_path = sys?.argv[1]
try:
    y, sr = librosa?.load(audio_path, sr=22050, mono=True)
    duration = librosa?.get_duration(y=y, sr=sr)

    # Beat tracking
    tempo, beat_frames = librosa?.beat.beat_track(y=y, sr=sr, units='time')
    bpm = float(tempo[0]) if hasattr(tempo, '__len__') else float(tempo)

    # Onset strength envelope (energy)
    hop_length = 512
    onset_env = librosa?.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    onset_env = (onset_env - onset_env?.min()) / (onset_env?.max() - onset_env?.min() + 1e-8)

    # Downsample to ~10 Hz
    target_len = int(duration * 10)
    indices = np?.linspace(0, len(onset_env) - 1, target_len).astype(int)
    energy_env = onset_env[indices].tolist()

    # Spectral centroid (brightness)
    centroid = librosa?.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]
    centroid_norm = (centroid / centroid?.max()).tolist()

    # Structural segmentation via HPSS + RMS
    H, P = librosa?.effects.hpss(y)
    rms = librosa?.feature.rms(y=y, hop_length=hop_length)[0]
    rms_norm = (rms / (rms?.max() + 1e-8)).tolist()

    beats = [float(b) for b in beat_frames]
    result = {
        'bpm': bpm,
        'beats': beats,
        'duration': duration,
        'energy_envelope': energy_env,
        'spectral_centroid': centroid_norm[:target_len],
        'rms': rms_norm[:target_len],
        'tier': 'librosa',
    }
    print(json?.dumps(result))
except Exception as e:
    print(json?.dumps({'error': str(e), 'tier': 'ffmpeg'}))
`;

async function analyzeBeatLibrosa(
  audioPath: string,
): Promise<BeatAnalysis | null> {
  if (!PYTHON_AVAILABLE) return null;

  const _scriptPath = path?.join(
    os?.tmpdir(),
    `beat_analysis_${randomBytes(4).toString("hex")}.py`,
  );
  try {
    await fsWriteFile(scriptPath, LIBROSA_SCRIPT);

    const _raw = await new Promise<string>((resolve, reject) => {
      const _proc = spawn(PYTHON, [scriptPath, audioPath]);
      let out = "";
      let err = "";
      proc?.stdout.on("data", (d: Buffer) => {
        out += d?.toString();
      });
      proc?.stderr.on("data", (d: Buffer) => {
        err += d?.toString();
      });
      proc?.on("close", (code) => {
        if (out?.trim()) resolve(out?.trim());
        else
          reject(
            new Error(
              `librosa script failed (exit ${code}): ${err?.slice(-200)}`,
            ),
          );
      });
      proc?.on("error", reject);
      setTimeout(() => {
        proc?.kill();
        reject(new Error("librosa timeout"));
      }, 60_000);
    });

    const _data = JSON?.parse(raw);
    if (data?.error || data?.tier === "unavailable") {
      logger?.debug("[BeatSync] librosa unavailable:", data?.error);
      return null;
    }

    const _duration = data?.duration as number;
    const _bpm = Math?.max(60, Math?.min(220, data?.bpm as number));
    const _beats = (data?.beats as number[]).filter(
      (b) => b >= 0 && b <= duration,
    );
    const _beatsPerMeasure = 4;
    const _downbeats = beats?.filter((_, i) => i % beatsPerMeasure === 0);
    const _energyEnvelope = data?.energy_envelope as number[];
    const _peakPositions = findMajorPeaks(energyEnvelope, duration, 0.7, 30);
    const _sections = detectSections(energyEnvelope, duration, peakPositions);

    // Confidence: librosa is generally >0.85 for music with clear beats
    const ibiList: number[] = [];
    for (let i = 1; i < beats?.length; i++)
      ibiList?.push(beats[i] - beats[i - 1]);
    const _avgIbi = ibiList?.length
      ? ibiList?.reduce((s, x) => s + x, 0) / ibiList?.length
      : 60 / bpm;
    const _variance = ibiList?.length
      ? ibiList?.reduce((s, x) => s + (x - avgIbi) ** 2, 0) / ibiList?.length
      : 1;
    const _confidence = Math?.max(
      0.6,
      Math?.min(0.98, 1 - Math?.sqrt(variance) / avgIbi),
    );

    logger?.info(
      `[BeatSync] librosa analysis — BPM=${bpm?.toFixed(1)} beats=${beats?.length} confidence=${(confidence * 100).toFixed(0)}%`,
    );

    return {
      bpm,
      confidence,
      beats,
      downbeats,
      beatsPerMeasure,
      durationSeconds: duration,
      energyEnvelope,
      peakPositions,
      sections,
      tier: "librosa",
    };
  } catch (e) {
    logger?.debug(
      "[BeatSync] librosa analysis failed:",
      e?.message?.slice(0, 100),
    );
    return null;
  } finally {
    try {
      if (existsSync(scriptPath)) unlinkSync(scriptPath);
    } catch {
      /* intentional: temp-script cleanup */
    }
  }
}

function findMajorPeaks(
  envelope: number[],
  _duration: number,
  threshold: number,
  minGapSamples: number,
): number[] {
  const peaks: number[] = [];
  let lastPeak = -999;
  for (let i = 5; i < envelope?.length - 5; i++) {
    const _localMax = Math?.max(...envelope?.slice(i - 5, i + 5));
    if (
      envelope[i] >= threshold &&
      envelope[i] === localMax &&
      i - lastPeak >= minGapSamples
    ) {
      peaks?.push(i / 10);
      lastPeak = i;
    }
  }
  return peaks;
}

// ── PUBLIC INTERFACE ──────────────────────────────────────────────────────────
export async function analyzeAudio(audioPath: string): Promise<BeatAnalysis> {
  if (!existsSync(audioPath))
    throw new Error(`Audio file not found: ${audioPath}`);

  // Try Tier 2 first (librosa) — fallback to Tier 1 (FFmpeg)
  const _librosaResult = await analyzeBeatLibrosa(audioPath);
  if (librosaResult) return librosaResult;

  logger?.info(
    "[BeatSync] Using FFmpeg-based beat analysis (librosa unavailable)",
  );
  return analyzeBeatFFmpeg(audioPath);
}

/**
 * Given a beat analysis and desired scene count, return optimal cut timestamps
 * that align to beat boundaries (preferring downbeats for major transitions).
 */
export function getBeatAlignedCuts(
  analysis: BeatAnalysis,
  sceneCount: number,
  preferDownbeats = true,
): number[] {
  if (sceneCount <= 1) return [];

  const _duration = analysis?.durationSeconds;
  const cutTimes: number[] = [];

  // Ideal cut spacing (equal)
  const _idealSpacing = duration / sceneCount;

  for (let i = 1; i < sceneCount; i++) {
    const _idealTime = idealSpacing * i;

    // Find nearest beat (prefer downbeat if within 0.5s)
    const _candidates = preferDownbeats
      ? [...analysis?.downbeats, ...analysis?.beats]
      : analysis?.beats;

    let closest = idealTime;
    let minDist = Infinity;

    for (const beat of candidates) {
      const _dist = Math?.abs(beat - idealTime);
      if (dist < minDist && dist < idealSpacing * 0.45) {
        minDist = dist;
        closest = beat;
      }
    }

    cutTimes?.push(parseFloat(closest?.toFixed(3)));
  }

  return cutTimes;
}

/**
 * Convert beat-aligned cut timestamps to scene durations.
 */
export function cutsToSceneDurations(
  cuts: number[],
  totalDuration: number,
): number[] {
  const _boundaries = [0, ...cuts, totalDuration];
  return boundaries
    .slice(0, -1)
    .map((start, i) => parseFloat((boundaries[i + 1] - start).toFixed(3)));
}

/**
 * Compute scene durations aligned to musical phrases.
 * Ensures each scene contains complete measures and starts on a beat.
 */
export function getBeatAlignedDurations(
  analysis: BeatAnalysis,
  sceneCount: number,
  minSceneDuration = 2.0,
): number[] {
  const _cuts = getBeatAlignedCuts(analysis, sceneCount);
  const _durations = cutsToSceneDurations(cuts, analysis?.durationSeconds);

  // Enforce minimum scene duration
  for (let i = 0; i < durations?.length; i++) {
    if (durations[i] < minSceneDuration) {
      durations[i] = minSceneDuration;
    }
  }

  return durations;
}

/**
 * Build an FFmpeg xfade filter chain where transition points align to beats.
 * Returns the filter_complex string and corrected scene durations.
 */
export function buildBeatSyncedXfadeChain(
  scenePaths: string[],
  analysis: BeatAnalysis,
  transitionType: string,
  transitionDur = 0.35,
): { filterComplex: string; sceneDurations: number[] } {
  const _cuts = getBeatAlignedCuts(analysis, scenePaths?.length);
  const _sceneDurations = cutsToSceneDurations(cuts, analysis?.durationSeconds);

  let filterComplex = "";
  let prevLabel = "[0:v]";
  let cumOffset = 0;

  for (let i = 0; i < scenePaths?.length - 1; i++) {
    cumOffset += sceneDurations[i] - transitionDur;
    const _nextIn = `[${i + 1}:v]`;
    const _outLbl = i === scenePaths?.length - 2 ? "[vout]" : `[v${i}]`;
    filterComplex += `${prevLabel}${nextIn}xfade=transition=${transitionType}:duration=${transitionDur}:offset=${cumOffset?.toFixed(3)}${outLbl};`;
    prevLabel = outLbl;
  }

  return {
    filterComplex: filterComplex?.replace(/;$/, ""),
    sceneDurations,
  };
}
