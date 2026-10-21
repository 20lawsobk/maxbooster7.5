import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db.js", () => ({ db: {} }));
vi.mock("../../server/services/storageService.js", () => ({ storageService: {} }));

const {
  resolveRenderSources,
  MixdownSourceUnavailableError,
  sliceStereoRange,
  normalizeToPeak,
} = await import("../../server/services/studioRenderService");

describe("mixdown source integrity", () => {
  it("fails the render with every unresolved clip instead of skipping them", async () => {
    const clips = [
      { id: "a", audioUrl: "/api/storage/file/a.wav" },
      { id: "b", audioUrl: "/api/storage/file/missing.wav" },
      { id: "c", audioUrl: null },
    ];
    const resolver = vi.fn(async (url: string) => {
      if (url.includes("missing")) throw new Error("object not found");
      return "/srv/a.wav";
    });
    const failure = await resolveRenderSources(clips, "user-1", resolver).catch((e) => e);
    expect(failure).toBeInstanceOf(MixdownSourceUnavailableError);
    expect(failure.unresolvedClipIds).toEqual(["b", "c"]);
    expect(failure.message).toMatch(/2 audible clip/);
    expect(failure.message).toMatch(/object not found/);
  });

  it("returns every clip when all resolve", async () => {
    const clips = [{ id: "a", audioUrl: "x" }, { id: "b", audioUrl: "y" }];
    const resolved = await resolveRenderSources(clips, "u", async (url) => `/srv/${url}`);
    expect(resolved.map((r) => r.localPath)).toEqual(["/srv/x", "/srv/y"]);
  });
});

describe("bounce range and normalization", () => {
  it("slices exactly the requested range and pads beyond the mix with silence", () => {
    const sr = 4;
    const pcm = new Float32Array([1, 1, 2, 2, 3, 3, 4, 4]); // 4 stereo frames = 1s
    expect(Array.from(sliceStereoRange(pcm, sr, 0.5, 1.5))).toEqual([3, 3, 4, 4, 0, 0, 0, 0]);
    expect(() => sliceStereoRange(pcm, sr, 1, 1)).toThrow(/Invalid render range/);
  });

  it("peak-normalizes to -1 dBFS and leaves silence untouched", () => {
    const out = normalizeToPeak(new Float32Array([0.25, -0.5]));
    expect(Math.max(...Array.from(out).map(Math.abs))).toBeCloseTo(Math.pow(10, -1 / 20), 6);
    const silent = new Float32Array([0, 0]);
    expect(normalizeToPeak(silent)).toBe(silent);
  });
});
