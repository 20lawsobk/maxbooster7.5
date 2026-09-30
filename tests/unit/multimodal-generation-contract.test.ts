/**
 * Focused contracts for the multimodal service boundary. Network behavior is
 * owned by safeUrlFetch; these checks lock in URL normalization and the stable
 * shape consumed after MaxCore /analyze.
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  normalizeMaxcoreAnalyzeResponse,
  normalizeMultimodalUrl,
} from "../../server/services/multimodalGenerationService.js";
import {
  validatePlanAssets,
  validateStepAssets,
} from "../../server/services/multimodalGenerationContract.js";
import type {
  GeneratedAsset,
  TaskPlan,
  TaskStep,
} from "@shared/types/multimodalGeneration.js";

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

describe("multimodal MaxCore transport contract", () => {
  it("uses the shared client for POSTs and fails fast on terminal audio-job statuses", async () => {
    const source = await readFile(
      "server/services/multimodalGenerationService.ts",
      "utf8",
    );

    expect(source).toMatch(/MaxCoreAIClient\.generate<unknown>\s*\(/);
    expect(source).toContain("timeoutMs,");
    expect(source).not.toMatch(
      /fetch\(`\$\{MAXCORE_URL\}\$\{path\}`/,
    );
    expect(source).toContain("[401, 403, 404].includes(pollRes.status)");
  });
});

const twoSlotStep: TaskStep = {
  id: "step_text",
  type: "generate",
  worker: "text",
  inputFrom: "normalizedInput",
  params: {
    slots: [
      { id: "instagram_post", platform: "instagram" },
      { id: "tiktok_post", platform: "tiktok" },
    ],
  },
};

function generatedText(
  id: string,
  slotId: string,
  platform: string,
  payload = "Generated copy",
): GeneratedAsset {
  return {
    id,
    modality: "text",
    payload,
    slotId,
    platform: platform as GeneratedAsset["platform"],
  };
}

describe("multimodal generation output contract", () => {
  it("accepts one complete asset for every planned slot", () => {
    const validated = validateStepAssets(twoSlotStep, [
      generatedText("asset-1", "instagram_post", "instagram"),
      generatedText("asset-2", "tiktok_post", "tiktok"),
    ]);

    expect(validated).toHaveLength(2);
  });

  it("rejects partial slot output", () => {
    expect(() =>
      validateStepAssets(twoSlotStep, [
        generatedText("asset-1", "instagram_post", "instagram"),
      ]),
    ).toThrow();
  });

  it("rejects an asset assigned to the wrong platform", () => {
    expect(() =>
      validateStepAssets(twoSlotStep, [
        generatedText("asset-1", "instagram_post", "tiktok"),
        generatedText("asset-2", "tiktok_post", "tiktok"),
      ]),
    ).toThrow();
  });

  it("rejects empty payloads and modality mismatches", () => {
    expect(() =>
      validateStepAssets(twoSlotStep, [
        generatedText("asset-1", "instagram_post", "instagram", " "),
        generatedText("asset-2", "tiktok_post", "tiktok"),
      ]),
    ).toThrow();
    expect(() =>
      validateStepAssets(twoSlotStep, [
        {
          ...generatedText("asset-1", "instagram_post", "instagram"),
          modality: "image",
        },
        generatedText("asset-2", "tiktok_post", "tiktok"),
      ]),
    ).toThrow();
  });

  it("rejects a plan if any planned step has no output", () => {
    const imageStep: TaskStep = {
      ...twoSlotStep,
      id: "step_image",
      worker: "image",
    };
    const plan: TaskPlan = {
      requestId: "request-1",
      steps: [twoSlotStep, imageStep],
    };
    const textAssets = [
      generatedText("asset-1", "instagram_post", "instagram"),
      generatedText("asset-2", "tiktok_post", "tiktok"),
    ];

    expect(() =>
      validatePlanAssets(plan, new Map([["step_text", textAssets]])),
    ).toThrow();
  });
});