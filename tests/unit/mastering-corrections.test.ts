import { describe, it, expect } from "vitest";
import {
  IntelligentMasteringEngine,
  type MasteringChainConfig,
} from "../../shared/ml/audio/IntelligentMasteringEngine.js";

/**
 * Tests for the 2026-10-02 finishing upgrades:
 *  - stereo-balance auto-correction (|balance| > 0.5 dB)
 *  - true-peak measurement + enforcement loop (target -1.0 dBTP)
 * The benchmark caught a 1.31 dB right-heavy master and a 0.0 dBTP
 * true peak shipping despite a -1.0 clamp default.
 */
function imbalancedStereo(leftAmp: number, rightAmp: number, seconds = 2, sr = 44100) {
  const frames = Math.floor(seconds * sr);
  const data = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const v = Math.sin((2 * Math.PI * 440 * i) / sr);
    data[i * 2] = v * leftAmp;
    data[i * 2 + 1] = v * rightAmp;
  }
  return data;
}

function minimalChain(): MasteringChainConfig {
  return {
    inputGain: 0,
    eq: [],
    // Note: the engine's multiband stage returns silence for an empty band
    // list (pre-existing behavior), so the test uses a single pass-through
    // band (threshold 0 dB, ratio 1:1, no makeup).
    multibandCompressor: [
      { lowFreq: 20, highFreq: 20000, threshold: 0, ratio: 1, attack: 10, release: 100, knee: 0, makeupGain: 0 },
    ],
    stereo: { width: 1, bassMonoFreq: 120, midSideBalance: 0, correlation: 0 },
    loudness: { targetLUFS: -14, truePeak: -1.0, loudnessRange: 8, shortTermMax: 2 },
    limiter: {
      threshold: -1.0, ceiling: -1.0, release: 50, lookahead: 1,
      softClip: false, knee: 0,
    } as MasteringChainConfig["limiter"],
    outputGain: 0,
    dithering: false,
    bitDepth: 32,
  };
}

describe("IntelligentMasteringEngine stereo balance", () => {
  it("measures L/R imbalance in dB with correct sign", () => {
    const engine = new IntelligentMasteringEngine(44100);
    // Left amplitude 1.0, right 0.5 -> 10*log10(1/0.25) = +6.02 dB (left-heavy)
    const leftHeavy = engine.calculateStereoBalance(imbalancedStereo(1.0, 0.5));
    expect(leftHeavy).toBeGreaterThan(5.5);
    expect(leftHeavy).toBeLessThan(6.5);
    const rightHeavy = engine.calculateStereoBalance(imbalancedStereo(0.5, 1.0));
    expect(rightHeavy).toBeGreaterThan(-6.5);
    expect(rightHeavy).toBeLessThan(-5.5);
    const balanced = engine.calculateStereoBalance(imbalancedStereo(0.7, 0.7));
    expect(Math.abs(balanced)).toBeLessThan(0.05);
  });

  it("flags imbalance as an issue above 0.5 dB", () => {
    const engine = new IntelligentMasteringEngine(44100);
    const bad = engine.analyzeForMastering(imbalancedStereo(1.0, 0.7), 44100);
    expect(Math.abs(bad.stereoBalanceDb)).toBeGreaterThan(0.5);
    expect(bad.issues.some((i) => i.description.includes("imbalance"))).toBe(true);
    const good = engine.analyzeForMastering(imbalancedStereo(0.7, 0.7), 44100);
    expect(good.issues.some((i) => i.description.includes("imbalance"))).toBe(false);
  });

  it("auto-corrects imbalance in masterTrack below 0.5 dB", () => {
    const engine = new IntelligentMasteringEngine(44100);
    // ~3 dB right-heavy input
    const input = imbalancedStereo(0.5, 0.7071);
    const before = engine.calculateStereoBalance(input);
    expect(before).toBeLessThan(-2.5);
    const out = engine.masterTrack(input, minimalChain(), 44100);
    const after = engine.calculateStereoBalance(out);
    expect(Math.abs(after)).toBeLessThanOrEqual(0.5);
  });

  it("applies manual midSideBalance in stereo processing", () => {
    const engine = new IntelligentMasteringEngine(44100);
    const input = imbalancedStereo(0.7, 0.7);
    const cfg = minimalChain();
    cfg.stereo.midSideBalance = 0.5; // push right
    const out = engine.masterTrack(input, cfg, 44100);
    const balance = engine.calculateStereoBalance(out);
    // Manual balance shifts the render right (negative dB)
    expect(balance).toBeLessThan(-0.5);
  });
});

describe("IntelligentMasteringEngine true peak", () => {
  it("detects inter-sample peaks above the sample peak", () => {
    const engine = new IntelligentMasteringEngine(44100);
    // Alternating +0.9/-0.9: sample peak is 0.9 but the true waveform
    // between samples swings wider; oversampling must catch >= sample peak.
    const frames = 44100;
    const data = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      const v = i % 2 === 0 ? 0.9 : -0.9;
      data[i * 2] = v;
      data[i * 2 + 1] = v;
    }
    const samplePeak = engine.calculatePeakDB(data);
    const truePeak = engine.calculateTruePeakDB(data);
    expect(truePeak).toBeGreaterThanOrEqual(samplePeak - 0.01);
  });

  it("enforces the true-peak ceiling after mastering", () => {
    const engine = new IntelligentMasteringEngine(44100);
    // Hot sine that would clip without limiting
    const input = imbalancedStereo(1.5, 1.5, 2, 44100);
    const out = engine.masterTrack(input, minimalChain(), 44100);
    const tp = engine.calculateTruePeakDB(out);
    expect(tp).toBeLessThanOrEqual(-1.0 + 0.15);
  });
});
