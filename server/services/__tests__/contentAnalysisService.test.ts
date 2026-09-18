import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ContentAnalysisService,
  ContentAnalysisUpstreamError,
  maxcoreAnalysisTransport,
  normalizeOwnedAudioAsset,
  validateAnalysisEnvelope,
} from "../contentAnalysisService.js";
import { getMaxcoreOrigin } from "../maxcoreConnector.js";

const envelope = {
  schema_version: 1 as const,
  source: "maxcore_native_analysis" as const,
  kind: "image" as const,
  method: "pixel_statistics",
  analysis: {
    width: 1200,
    height: 630,
    channels: ["red", "green", "blue"],
  },
  limitations: ["No semantic object prediction is performed."],
};

describe("ContentAnalysisService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the exact native payload with the trusted owner out of body", async () => {
    let call: unknown[] = [];
    const service = new ContentAnalysisService(async (...args) => {
      call = args;
      return envelope;
    });

    await expect(
      service.analyzeImage("https://cdn.example/cover.png", "owner-1"),
    ).resolves.toEqual(envelope);
    expect(call).toEqual([
      "image",
      { url: "https://cdn.example/cover.png" },
      "owner-1",
    ]);
  });

  it("rejects missing trusted ownership before transport", async () => {
    let called = false;
    const service = new ContentAnalysisService(async () => {
      called = true;
      return envelope;
    });
    await expect(
      service.analyzeImage("https://cdn.example/cover.png", " "),
    ).rejects.toThrow(/trusted actor id/i);
    expect(called).toBe(false);
  });

  it("rejects fabricated, mismatched, and non-finite analysis envelopes", () => {
    expect(() =>
      validateAnalysisEnvelope({ ...envelope, kind: "video" }, "image"),
    ).toThrow(/invalid envelope/i);
    expect(() =>
      validateAnalysisEnvelope(
        { ...envelope, analysis: { confidence: Number.NaN } },
        "image",
      ),
    ).toThrow(/invalid envelope/i);
    expect(() =>
      validateAnalysisEnvelope(
        { ...envelope, source: "local_predictions" },
        "image",
      ),
    ).toThrow(/invalid envelope/i);
  });

  it("uses bearer-only generation auth and a trusted owner header", async () => {
    let request: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        request = init;
        return new Response(JSON.stringify(envelope), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await expect(
      maxcoreAnalysisTransport(
        "image",
        { url: "https://cdn.example/cover.png" },
        "owner-1",
      ),
    ).resolves.toEqual(envelope);
    const headers = request?.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer /);
    expect(headers["X-MaxCore-User-Id"]).toBe("owner-1");
    expect(headers["X-API-Key"]).toBeUndefined();
    expect(request?.body).toBe(
      JSON.stringify({ url: "https://cdn.example/cover.png" }),
    );
  });

  it("preserves safe validation statuses and masks internal upstream failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 422 })),
    );
    await expect(
      maxcoreAnalysisTransport("text", { text: "hello" }, "owner-1"),
    ).rejects.toMatchObject<Partial<ContentAnalysisUpstreamError>>({
      status: 422,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    await expect(
      maxcoreAnalysisTransport("text", { text: "hello" }, "owner-1"),
    ).rejects.toMatchObject<Partial<ContentAnalysisUpstreamError>>({
      status: 503,
    });
  });

  it("accepts only opaque owner-scoped MaxCore audio assets", () => {
    const owned =
      "/uploads/audio-inputs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1234abcd.mp3";
    expect(normalizeOwnedAudioAsset(owned)).toBe(owned);
    expect(normalizeOwnedAudioAsset(`${getMaxcoreOrigin()}${owned}`)).toBe(owned);
    expect(normalizeOwnedAudioAsset(`${getMaxcoreOrigin()}${owned}?download=1`)).toBeNull();
    expect(normalizeOwnedAudioAsset("https://example.com/track.mp3")).toBeNull();
    expect(normalizeOwnedAudioAsset("/tmp/private.wav")).toBeNull();
    expect(normalizeOwnedAudioAsset(`${owned}/../../private.wav`)).toBeNull();
  });
});