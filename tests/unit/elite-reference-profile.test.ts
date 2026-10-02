import { describe, it, expect } from "vitest";
import {
  ELITE_REFERENCE_PROFILE,
  buildMasteringRecommendationPayload,
} from "../../server/services/maxcoreMasteringService.js";
import type { MasteringAnalysis } from "../../shared/ml/audio/IntelligentMasteringEngine.js";

const analysis = {
  spectral: { centroid: 5000 },
  dynamics: { envelope: [1, 2], transients: [3], rms: 0.5 },
  rhythm: { beatPositions: [0.5], onsetStrength: [0.1], bpm: 140 },
  timbre: {},
  currentLUFS: -9,
  currentPeak: -1,
  dynamicRange: 8,
  stereoWidth: 0.5,
  frequencyBalance: {
    sub: 0.1,
    bass: 0.2,
    lowMid: 0.1,
    mid: 0.2,
    highMid: 0.1,
    presence: 0.15,
    brilliance: 0.15,
  },
  issues: [],
  recommendations: [],
} as unknown as MasteringAnalysis;

describe("ELITE_REFERENCE_PROFILE", () => {
  it("has normalized 7-band frequency shares", () => {
    const shares = Object.values(ELITE_REFERENCE_PROFILE.frequencyBalance);
    expect(shares).toHaveLength(7);
    for (const s of shares) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
    const total = shares.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 1);
  });

  it("carries sane production targets", () => {
    const p = ELITE_REFERENCE_PROFILE;
    expect(p.stereoWidth).toBeGreaterThan(0);
    expect(p.stereoWidth).toBeLessThan(1);
    expect(p.dynamicRange).toBeGreaterThan(0);
    expect(p.targetLUFS).toBeGreaterThan(-16);
    expect(p.targetLUFS).toBeLessThan(-4);
    expect(p.truePeakCeilingDbtp).toBe(-1);
    expect(p.lraLu).toBeGreaterThan(0);
    expect(p.measuredFrom).toContain("suno_spec");
  });
});

describe("buildMasteringRecommendationPayload", () => {
  it("attaches the elite reference profile to every payload", () => {
    const payload = buildMasteringRecommendationPayload(analysis, 44100, "hip-hop");
    expect(payload.referenceProfile).toBe(ELITE_REFERENCE_PROFILE);
    expect(payload.genre).toBe("hip-hop");
    expect(payload.sampleRate).toBe(44100);
    expect(payload.currentLUFS).toBe(-9);
  });

  it("still strips waveform-length arrays before sending", () => {
    const payload = buildMasteringRecommendationPayload(analysis, 44100);
    expect(payload.dynamics).not.toHaveProperty("envelope");
    expect(payload.dynamics).not.toHaveProperty("transients");
    expect(payload.rhythm).not.toHaveProperty("beatPositions");
    expect(payload.rhythm).not.toHaveProperty("onsetStrength");
    expect(payload.genre).toBeNull();
  });
});
