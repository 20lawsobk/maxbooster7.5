/**
 * Focused contracts for the multimodal service boundary. Network behavior is
 * owned by safeUrlFetch; these checks lock in URL normalization and the stable
 * shape consumed after MaxCore /analyze.
 */
import { describe, expect, it } from "vitest";
import {
  normalizeMaxcoreAnalyzeResponse,
  normalizeMultimodalUrl,
} from "../../server/services/multimodalGenerationService.js";

describe("multimodal generation URL contract", () => {
  it("normalizes URL paths while preserving Spotify URI inputs", () => {
    expect(normalizeMultimodalUrl(" https://example.com/a/../release ")).toBe(
      "https://example.com/release",
    );
    expect(normalizeMultimodalUrl("spotify:track:3n3Ppam7vgaVa1iaRUc9Lp")).toBe(
      "spotify:track:3n3Ppam7vgaVa1iaRUc9Lp",
    );
  });

  it.each([
    "http://127.0.0.1:9878/api/health",
    "https://user:password@example.com/private",
  ])("rejects unsafe URL input %s", (url) => {
    expect(() => normalizeMultimodalUrl(url)).toThrow();
  });
});

describe("MaxCore /analyze response contract", () => {
  it("unwraps supported response envelopes for the planner", () => {
    const semantic = { topic: "release", intent: "promote" };
    expect(
      normalizeMaxcoreAnalyzeResponse({
        data: { normalized: { semantic, modality: "text" } },
        processing_time_ms: 3,
      }),
    ).toEqual({ semantic, modality: "text" });
  });

  it("keeps the deployed flat response unchanged", () => {
    const response = {
      modality: "url",
      payload_summary: "Content from URL: https://example.com",
      semantic: { topic: "release" },
    };
    expect(normalizeMaxcoreAnalyzeResponse(response)).toBe(response);
  });

  it("rejects a malformed response instead of passing it to workers", () => {
    expect(() => normalizeMaxcoreAnalyzeResponse(null)).toThrow(
      /invalid response/i,
    );
    expect(() => normalizeMaxcoreAnalyzeResponse([])).toThrow(
      /invalid response/i,
    );
  });
});