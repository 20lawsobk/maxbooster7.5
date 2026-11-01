import { describe, it, expect } from "vitest";
import { IntelligentMasteringEngine } from "../../shared/ml/audio/IntelligentMasteringEngine.js";

/**
 * Regression test for the 2026-10-02 K-weighting fix: the previous
 * applyKWeighting used a mis-derived recurrence that resonated ~+51 dB at
 * Nyquist, so calculateLUFS exploded on full-bandwidth audio and every
 * downstream LUFS value (issue detection, loudness normalization, reference
 * matching) was meaningless. A 1 kHz sine at 0.5 amplitude must measure
 * near its true loudness (~-9 LUFS), not hundreds of dB positive.
 */
function stereoSine(freqHz: number, amplitude: number, seconds: number, sr = 44100) {
  const frames = Math.floor(seconds * sr);
  const data = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const v = amplitude * Math.sin((2 * Math.PI * freqHz * i) / sr);
    data[i * 2] = v;
    data[i * 2 + 1] = v;
  }
  return data;
}

describe("IntelligentMasteringEngine LUFS", () => {
  it("measures a 1 kHz sine near its true loudness", () => {
    const engine = new IntelligentMasteringEngine(44100);
    const analysis = engine.analyzeForMastering(stereoSine(1000, 0.5, 2), 44100);
    // Dual-mono 0.5-amplitude sine: BS.1770 sums per-channel mean squares,
    // so 2x(0.5/sqrt(2))^2 -> -0.691 + 10*log10(0.25) ~= -6.7 LUFS.
    // K-weighting is ~flat at 1 kHz. The pre-fix filter measured +hundreds.
    expect(analysis.currentLUFS).toBeGreaterThan(-10);
    expect(analysis.currentLUFS).toBeLessThan(-4);
  });

  it("tracks a 6 dB level change by ~6 LU", () => {
    const engine = new IntelligentMasteringEngine(44100);
    const loud = engine.analyzeForMastering(stereoSine(1000, 0.5, 2), 44100);
    const quiet = engine.analyzeForMastering(stereoSine(1000, 0.25, 2), 44100);
    const delta = loud.currentLUFS - quiet.currentLUFS;
    expect(delta).toBeGreaterThan(4);
    expect(delta).toBeLessThan(8);
  });

  it("reports zero stereo width for dual-mono", () => {
    const engine = new IntelligentMasteringEngine(44100);
    const analysis = engine.analyzeForMastering(stereoSine(440, 0.4, 2), 44100);
    expect(analysis.stereoWidth).toBeCloseTo(0, 3);
  });

  it("follows the K-weighting curve across frequency", () => {
    const engine = new IntelligentMasteringEngine(44100);
    const at = (hz: number) =>
      engine.analyzeForMastering(stereoSine(hz, 0.5, 2), 44100).currentLUFS;
    const low = at(40); // RLB high-pass rejects sub-bass
    const mid = at(1000);
    const high = at(12000); // pre-filter shelf boosts highs ~+4 dB
    expect(mid - low).toBeGreaterThan(4);
    expect(high - mid).toBeGreaterThan(2);
    expect(high - mid).toBeLessThan(7);
  });
});
