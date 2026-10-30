import { describe, expect, it } from "vitest";
import {
  beatAudioInputs,
  beatAudioObservation,
} from "../../server/services/beatAudioContext.js";

describe("beat audio MaxCore contract", () => {
  it("preserves explicit caller preferences without inventing omitted fields", () => {
    const input = beatAudioInputs({ genre: "drill", key: "F minor" });

    expect(input).toEqual({
      genre: "drill",
      requestedKey: "F minor",
      hooks: [],
      productionStyles: [],
    });
    expect(input).not.toHaveProperty("mood");
    expect(input).not.toHaveProperty("tempo");
    expect(input).not.toHaveProperty("confidence");
  });

  it("does not turn awareness prose into production metadata", () => {
    const observed = beatAudioObservation({
      awareness: "UNTRUSTED observations mentioning trap, dark and 140 BPM",
      caption: "A dark drill beat at 140 BPM",
    });

    expect(observed).not.toHaveProperty("genre");
    expect(observed).not.toHaveProperty("mood");
    expect(observed).not.toHaveProperty("tempo");
    expect(observed).not.toHaveProperty("musicalKey");
  });

  it("records only structured metadata actually returned by MaxCore", () => {
    const observed = beatAudioObservation({
      metadata: {
        genre: "drill",
        mood: "dark",
        bpm: 140,
        key: "F minor",
      },
      snapshot_id: "snapshot-1",
      provenance: { source: "model-response" },
    });

    expect(observed).toMatchObject({
      genre: "drill",
      mood: "dark",
      tempo: 140,
      musicalKey: "F minor",
      snapshot_id: "snapshot-1",
      provenance: { source: "model-response" },
    });
    expect(observed).not.toHaveProperty("confidence");
    expect(observed).not.toHaveProperty("hooks");
    expect(observed).not.toHaveProperty("productionStyles");
  });
});